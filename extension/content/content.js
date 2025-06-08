/**
 * SPDX license identifier: MPL-2.0
 *
 * Copyright 2025 Sebastian Tobuschat
 * This file is par of YT Lens - a browser extension for customizing YouTube's recommendations
 *
 * Copyright 2025 Sebastian Tobuschat
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * @fileoverview Content script for YouTube Filter extension.
 * Observes YouTube pages for video elements and filters them based on user-defined rules.
 */

/**
 * Encapsulates the logic for filtering YouTube video content.
 */
class YouTubeContentFilter {
  /**
   * Defines the possible actions to take on a video.
   * @enum {string}
   */
  FILTER_ACTION = {
    ACCEPT: 'accept', // Allow the video.
    HIDE: 'hide', // Hide the video visually.
    BLOCK: 'block', // Hide and potentially interact with YouTube's menu.
  };

  /**
   * Time in milliseconds to wait before processing DOM mutations, batching changes.
   * @const {number}
   */
  MUTATION_DEBOUNCE_MS = 250;

  /**
   * Time in milliseconds to wait for the YouTube menu to appear after clicking the button.
   * @const {number}
   */
  MENU_WAIT_MS = 300;

  /**
   * Maximum number of pending mutations before forcing a filter run.
   * @const {number}
   */
  MAX_PENDING_MUTATIONS = 5;

  /**
   * Attribute added to elements that have been processed by the filter.
   * @const {string}
   */
  FILTERED_ATTRIBUTE = 'data-yt-filter-processed';

  /**
   * CSS selectors for identifying video elements and their components.
   * Grouped for maintainability.
   * TODO: Consider using a more dynamic approach to handle new YouTube layouts or
   *       add to configuration options for user-defined selectors.
   */
  SELECTORS = {
    // Selectors for various video container types across desktop and mobile
    VIDEO_CONTAINERS: [
      // Desktop Grid/List
      '#contents ytd-rich-item-renderer',
      'ytd-video-renderer',
      // Desktop Sidebar/Watch Next
      'ytd-compact-video-renderer',
      // Desktop Playlist
      'ytd-playlist-video-renderer',
      // Mobile Grid/List
      'div#contents ytm-rich-item-renderer',
      'ytm-video-with-context-renderer',
      // Mobile Sidebar/Watch Next
      'ytm-compact-video-renderer',
      // Mobile Playlist
      'ytm-playlist-video-renderer',
    ].join(','), // Combine for efficient querying
    // Selectors for video titles
    TITLE: '#video-title, .title, .ytm-video-title, .media-item-headline',
    // Generic channel name selectors
    CHANNEL: '#channel-name, .ytd-channel-name, .ytm-channel-name, .yt-core-attributed-string',
    // Specific channel name selectors (prioritized for accuracy)
    CHANNEL_DESKTOP: '#text.ytd-channel-name',
    CHANNEL_MOBILE: '.ytm-badge-and-byline-item-byline > .yt-core-attributed-string',
    // Selectors for video descriptions
    DESCRIPTION: '#description-text, .ytm-description',
    // Selectors for the menu button within a video container
    MENU_BUTTON: 'ytd-menu-renderer yt-icon-button, ytm-menu-renderer yt-icon-button',
    // Selectors for items within the opened menu popup
    MENU_ITEMS: 'tp-yt-paper-item, ytm-paper-item',
  };

  /**
   * Localized regex patterns for YouTube's menu buttons.
   * Structure: { langCode: { action: RegExp } }
   */
  buttonPatterns = {
    en: {
      notInterested: /not interested/i,
      dontRecommendChannel: /don't recommend( this)? channel/i,
    },
    de: {
      notInterested: /kein interesse/i,
      dontRecommendChannel: /keine videos von diesem kanal empfehlen/i,
    },
    es: {
      notInterested: /no me interesa/i,
      dontRecommendChannel: /no recomendar( este)? canal/i,
    },
    fr: {
      notInterested: /pas intéressé/i,
      dontRecommendChannel: /ne pas recommander cette chaîne/i,
    },
    it: {
      notInterested: /non mi interessa/i,
      dontRecommendChannel: /non consigliare questo canale/i,
    },
    pt: {
      notInterested: /não tenho interesse|não me interessa/i,
      dontRecommendChannel: /não recomendar( este| esse)? canal/i,
    },
    // Custom patterns loaded from storage override language defaults
    custom: {
      notInterested: null,
      dontRecommendChannel: null,
    },
  };

  // --- State Properties ---
  config = {
    blacklist: [],
    whitelist: [],
    useStrictBlocking: false,
    youtubeLanguage: '', // Default language
    customNotInterestedPattern: null,
    customDontRecommendPattern: null,
  };
  debugMode = false;
  dryrun = true;
  useBlacklist = true;
  useWhitelist = false;
  isTabActive = document.visibilityState === 'visible';
  observer = null; // MutationObserver instance
  activeNotInterestedPattern = null; // Currently active regex for "Not Interested"
  activeStrictBlockingPattern = null; // Currently active regex for "Don't Recommend"
  processedMenuResults = new WeakMap(); // Cache for dry-run menu interaction results
  mutationTimeoutId = null; // Timeout ID for debouncing mutations
  pendingMutationsCount = 0; // Counter for debouncing mutations

  constructor() {
    // Bind methods to ensure 'this' context is correct
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.filterVideos = this.filterVideos.bind(this); // Bind filterVideos
    this._handleMutations = this._handleMutations.bind(this); // Bind mutation handler
  }

  // --- Logging ---

  /**
   * Logs a standard message with a prefix.
   * @param {string} message The message to log.
   * @param {*} [data] Optional data to log alongside the message.
   */
  log(message, data) {
    const PREFIX = '[YT Filter]';
    if (data !== undefined) {
      console.log(`${PREFIX} ${message}`, data);
    } else {
      console.log(`${PREFIX} ${message}`);
    }
  }

  /**
   * Logs a debug message if debug mode is enabled.
   * @param {string} message The debug message.
   * @param {*} [data] Optional data to log.
   */
  debug(message, data) {
    if (!this.debugMode) {return;}
    this.log(`[DEBUG] ${message}`, data);
  }

  // --- Initialization and Configuration ---

  /**
   * Initializes the filter by loading configuration and setting up observers.
   */
  async initialize() {
    await this._loadConfiguration();
    this._prepareFilterPatterns();
    this._setupLanguagePatterns();
    this._setupVisibilityListener();

    // Initial filter run on load
    this._initialFilterRun();

    // Start observing DOM changes
    this.startObserving();
  }

  /**
   * Loads configuration settings from browser storage.
   * @private
   */
  async _loadConfiguration() {
    try {
      const data = await this._getStorageData([
        'debugMode',
        'dryrun',
        'useBlacklist',
        'useWhitelist',
        'blacklist',
        'whitelist',
        'useStrictBlocking',
        'youtubeLanguage',
        'customNotInterestedPattern',
        'customDontRecommendPattern',
        'filterSynchronizedVideos', // Add new options
        'synchronizedVideoAction',
      ]);

      this.debugMode = data.debugMode ?? false;
      this.dryrun = data.dryrun ?? false;
      this.useBlacklist = data.useBlacklist ?? true;
      this.useWhitelist = data.useWhitelist ?? false;
      this.config.useStrictBlocking = data.useStrictBlocking ?? false;
      this.config.youtubeLanguage = data.youtubeLanguage; // Store preference
      this.config.customNotInterestedPattern = data.customNotInterestedPattern;
      this.config.customDontRecommendPattern = data.customDontRecommendPattern;
      this.config.filterSynchronizedVideos = data.filterSynchronizedVideos ?? false;
      this.config.synchronizedVideoAction = data.synchronizedVideoAction ?? 'hide';

      // Load and validate filter lists
      this.config.blacklist = this._parseAndValidateFilterList(data.blacklist);
      this.config.whitelist = this._parseAndValidateFilterList(data.whitelist);

      this.debug('Configuration loaded:', {
        debugMode: this.debugMode,
        dryrun: this.dryrun,
        useBlacklist: this.useBlacklist,
        useWhitelist: this.useWhitelist,
        useStrictBlocking: this.config.useStrictBlocking,
        language: this.config.youtubeLanguage,
        blacklistCount: this.config.blacklist.length,
        whitelistCount: this.config.whitelist.length,
        filterSynchronizedVideos: this.config.filterSynchronizedVideos,
        synchronizedVideoAction: this.config.synchronizedVideoAction,
      });
    } catch (error) {
      this.log('Error loading configuration:', error);
      // Use default config values if loading fails
    }
  }

  /**
   * Parses raw filter list data from storage and validates each item.
   * @param {Array<string|object>|undefined} rawList - The raw list from storage.
   * @returns {Array<object>} A validated list of filter objects.
   * @private
   */
  _parseAndValidateFilterList(rawList) {
    if (!Array.isArray(rawList)) {
      return [];
    }
    return rawList
      .map(item => {
        try {
          const parsedItem = typeof item === 'string' ? JSON.parse(item) : item;
          // Basic validation: check for essential properties
          if (parsedItem && typeof parsedItem === 'object' && 'name' in parsedItem && 'enabled' in parsedItem) {
            // Ensure keywords is an array if present
            if (parsedItem.keywords && !Array.isArray(parsedItem.keywords)) {
              parsedItem.keywords = [];
            }
            return parsedItem;
          }
          this.log('Invalid filter item structure:', item);
          return null;
        } catch (e) {
          this.log('Failed to parse filter item:', item, e);
          return null;
        }
      })
      .filter(item => item !== null); // Remove nulls (invalid items)
  }

  /**
   * Pre-compiles regex patterns for filters and keywords.
   * @private
   */
  _prepareFilterPatterns() {
    const processList = (list, listName) => {
      this.debug(`${listName} list (${list.length} items):`, list);
      list.forEach((item, index) => {
        if (!item.enabled) {
          return;
        }

        // Compile main pattern
        if (item.pattern && typeof item.pattern === 'string') {
          try {
            item.pattern = new RegExp(item.pattern, 'i');
          } catch (e) {
            this.log(`Invalid regex pattern in ${listName} item #${index} ('${item.name}'): ${item.pattern}`, e);
            item.pattern = null; // Invalidate pattern on error
          }
        } else {
          item.pattern = null; // Ensure pattern is null if not a valid string
        }

        // Compile keyword patterns
        if (Array.isArray(item.keywords) && item.keywords.length) {
          item.keywordPatterns = item.keywords
            .map(keyword => {
              if (typeof keyword !== 'string' || keyword.trim() === '') {
                return null;
              }
              try {
                // Create a case-insensitive whole-word match regex
                const escapedKeyword = keyword
                  .trim()
                  .toLowerCase()
                  .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex special chars
                return new RegExp(`\\b${escapedKeyword}\\b`, 'i');
              } catch (e) {
                this.log(`Invalid keyword in ${listName} item #${index} ('${item.name}'): ${keyword}`, e);
                return null;
              }
            })
            .filter(pattern => pattern !== null); // Remove invalid patterns
        } else {
          item.keywordPatterns = []; // Ensure it's an empty array if no keywords
        }
      });
    };

    processList(this.config.blacklist, 'Blacklist');
    processList(this.config.whitelist, 'Whitelist');

    this.debug('Filter patterns prepared:', {
      blacklist: this.config.blacklist,
      whitelist: this.config.whitelist,
    });
  }

  /**
   * Sets up the language patterns based on detection or user preference.
   * @private
   */
  _setupLanguagePatterns() {
    let activeLang = 'en'; // Default

    // 1. Use user preference if valid
    if (this.config.youtubeLanguage && this.buttonPatterns[this.config.youtubeLanguage]) {
      activeLang = this.config.youtubeLanguage;
      this.debug(`Using preferred language: ${activeLang}`);
    } else {
      // 2. Attempt detection from page
      try {
        const htmlLang = document.documentElement.lang;
        const ytLangMeta = document.querySelector('meta[http-equiv="Content-Language"]');
        const detectedLang = (htmlLang || ytLangMeta?.content || '').split('-')[0].toLowerCase();

        if (detectedLang && this.buttonPatterns[detectedLang]) {
          activeLang = detectedLang;
          this.debug(`Detected language: ${activeLang}`);
        } else {
          this.debug(
            `No specific language detected (html='${htmlLang}', meta='${ytLangMeta?.content}'), defaulting to 'en'.`
          );
        }
      } catch (e) {
        this.debug("Error detecting language, defaulting to 'en':", e);
      }
    }

    // Set base patterns from the determined language
    this.activeNotInterestedPattern = this.buttonPatterns[activeLang]?.notInterested;
    this.activeStrictBlockingPattern = this.buttonPatterns[activeLang]?.dontRecommendChannel;

    // 3. Override with custom patterns if provided
    if (this.config.customNotInterestedPattern) {
      try {
        this.activeNotInterestedPattern = new RegExp(this.config.customNotInterestedPattern, 'i');
        this.debug("Using custom 'Not Interested' pattern.");
      } catch (e) {
        this.log("Invalid custom 'Not Interested' pattern:", e);
      }
    }
    if (this.config.customDontRecommendPattern) {
      try {
        this.activeStrictBlockingPattern = new RegExp(this.config.customDontRecommendPattern, 'i');
        this.debug("Using custom 'Don't Recommend' pattern.");
      } catch (e) {
        this.log("Invalid custom 'Don't Recommend' pattern:", e);
      }
    }

    // Ensure patterns are valid RegExp objects or null
    if (!(this.activeNotInterestedPattern instanceof RegExp)) {
      this.activeNotInterestedPattern = null;
    }
    if (!(this.activeStrictBlockingPattern instanceof RegExp)) {
      this.activeStrictBlockingPattern = null;
    }

    this.debug('Active language patterns set:', {
      notInterested: this.activeNotInterestedPattern?.toString(),
      strictBlocking: this.activeStrictBlockingPattern?.toString(),
    });
  }

  /**
   * Sets up the listener for tab visibility changes.
   * @private
   */
  _setupVisibilityListener() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /**
   * Performs an initial filter run when the script loads.
   * Handles cases where the page might already be partially or fully loaded.
   * @private
   */
  _initialFilterRun() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      this.debug('Document already loaded, running initial filter.');
      // Use requestAnimationFrame to ensure layout is stable
      window.requestAnimationFrame(this.filterVideos);
    } else {
      this.debug('Document not fully loaded, adding load listener for initial filter.');
      window.addEventListener(
        'load',
        () => {
          this.debug('Window loaded, running initial filter.');
          window.requestAnimationFrame(this.filterVideos);
        },
        { once: true }
      ); // Ensure listener runs only once
    }
  }

  // --- Core Filtering Logic ---

  /**
   * Extracts relevant data (title, channel, description) from a video element.
   * @param {Element} videoElement The video container element.
   * @returns {object|null} An object with video data or null if data extraction fails.
   */
  extractVideoData(videoElement) {
    try {
      const titleElement = videoElement.querySelector(this.SELECTORS.TITLE);
      const descriptionElement = videoElement.querySelector(this.SELECTORS.DESCRIPTION);

      // Prioritize specific selectors for channel name
      const channelElement =
        videoElement.querySelector(this.SELECTORS.CHANNEL_MOBILE) ||
        videoElement.querySelector(this.SELECTORS.CHANNEL_DESKTOP) ||
        videoElement.querySelector(this.SELECTORS.CHANNEL);

      // Basic check: require at least a title or channel to consider it valid
      if (!titleElement && !channelElement) {
        this.debug('Could not extract title or channel name', videoElement);
        return null;
      }

      return {
        element: videoElement, // Keep reference to the element
        title: titleElement?.textContent?.trim() ?? '',
        channelName: channelElement?.textContent?.trim() ?? '',
        description: descriptionElement?.textContent?.trim() ?? '',
      };
    } catch (error) {
      this.log('Error extracting video data:', error, videoElement);
      return null;
    }
  }

  /**
   * Determines if a video should be blocked based on blacklist and whitelist rules.
   * @param {object} videoData - Extracted data for the video.
   * @returns {boolean} True if the video should be blocked, false otherwise.
   */
  isContentBlocked(videoData) {
    if (!this.useBlacklist && !this.useWhitelist) {
      this.debug('No filter lists enabled, accepting all content.');
      return false; // Accept if no lists are active
    }

    let isBlacklisted = false;
    let isWhitelisted = false;
    let blockingFilterName = null;
    let matchingDetail = null;

    // Check Blacklist
    if (this.useBlacklist && this.config.blacklist.length > 0) {
      for (const filter of this.config.blacklist) {
        if (filter.enabled) {
          const matchInfo = this._checkFilterMatch(videoData, filter);
          if (matchInfo) {
            isBlacklisted = true;
            blockingFilterName = filter.name;
            matchingDetail = matchInfo;
            break; // Stop checking blacklist once a match is found
          }
        }
      }
    } else if (this.useBlacklist) {
      this.debug('Blacklist is enabled but empty.');
    }

    // Check Whitelist (only if not already blacklisted, unless both lists are active)
    // If only whitelist is active, we need to check it regardless.
    // If both are active, a blacklist match takes precedence, but we still check whitelist for logging/potential future logic.
    if (this.useWhitelist && this.config.whitelist.length > 0) {
      // Only proceed if not blacklisted OR if both lists are active (to determine final outcome)
      if (!isBlacklisted || (this.useBlacklist && this.useWhitelist)) {
        for (const filter of this.config.whitelist) {
          if (filter.enabled) {
            if (this._checkFilterMatch(videoData, filter)) {
              isWhitelisted = true;
              // We don't break here if both lists are active,
              // as a blacklist match should still override.
              // If only whitelist is active, we can break.
              if (!this.useBlacklist) {break;}
            }
          }
        }
      }
    } else if (this.useWhitelist) {
      this.debug('Whitelist is enabled but empty.');
    }

    // --- Decision Logic ---
    let blockDecision = false;
    let reason = '';

    if (this.useBlacklist && this.useWhitelist) {
      // Both lists active: Block if blacklisted AND NOT whitelisted.
      blockDecision = isBlacklisted && !isWhitelisted;
      reason = blockDecision
        ? `Blacklisted by "${blockingFilterName}" and not whitelisted.`
        : isBlacklisted
        ? `Blacklisted by "${blockingFilterName}" but also whitelisted.`
        : isWhitelisted
        ? 'Whitelisted.'
        : 'Not on blacklist or whitelist (accepted by default when both active).';
      // Allow if whitelisted (even if blacklisted - whitelist overrides). Block if blacklisted. Allow otherwise.
      if (isWhitelisted) {
        blockDecision = false;
        reason = 'Whitelisted (overrides blacklist if applicable).';
      } else if (isBlacklisted) {
        blockDecision = true;
        reason = `Blacklisted by "${blockingFilterName}" and not whitelisted.`;
      } else {
        // Neither blacklisted nor whitelisted when both lists are active.
        blockDecision = false;
        reason = 'Not on blacklist or whitelist (accepted by default).';
      }
    } else if (this.useBlacklist) {
      // Only Blacklist active: Block if blacklisted.
      blockDecision = isBlacklisted;
      reason = blockDecision ? `Blacklisted by "${blockingFilterName}".` : 'Not on blacklist.';
    } else if (this.useWhitelist) {
      // Only Whitelist active: Block if NOT whitelisted.
      blockDecision = !isWhitelisted;
      reason = blockDecision ? 'Not on whitelist (blocking by default).' : 'Whitelisted.';
    } else {
      // Should not happen due to the initial check, but as a fallback:
      blockDecision = false;
      reason = 'No filter lists active.';
    }

    if (blockDecision) {
      this.debug(`Blocking content: ${reason}`, {
        filter: blockingFilterName,
        matchDetail: matchingDetail,
        video: { title: videoData.title, channel: videoData.channelName },
      });
    } else if (this.debugMode && (isBlacklisted || isWhitelisted)) {
      // Log why it wasn't blocked if it hit a list but wasn't blocked
      this.debug(`Accepting content: ${reason}`, {
        filter: blockingFilterName, // null if only whitelisted
        isBlacklisted,
        isWhitelisted,
        video: { title: videoData.title, channel: videoData.channelName },
      });
    }

    return blockDecision;
  }

  /**
   * Checks if video data matches a specific filter rule (pattern or keywords).
   * @param {object} videoData - Extracted data for the video.
   * @param {object} filter - The filter rule object.
   * @returns {object|null} Details of the match (field, method, value) or null if no match.
   * @private
   */
  _checkFilterMatch(videoData, filter) {
    const { title, channelName, description } = videoData;
    const lowerTitle = title.toLowerCase();
    const lowerChannel = channelName.toLowerCase();
    const lowerDesc = description.toLowerCase();

    const checkField = (fieldValue, lowerFieldValue, fieldName, config) => {
      // Check pattern first
      if (config.pattern && config.pattern.test(fieldValue)) {
        return {
          field: fieldName,
          method: 'pattern',
          value: fieldValue.substring(0, 100) + (fieldValue.length > 100 ? '...' : ''), // Truncate long values
          pattern: config.pattern.toString(),
        };
      }
      // Check keywords
      if (config.keywordPatterns) {
        const matchedPattern = config.keywordPatterns.find(pattern => pattern.test(lowerFieldValue));
        if (matchedPattern) {
          // Extract the original keyword if possible
          return {
            field: fieldName,
            method: 'keyword',
            value: fieldValue.substring(0, 100) + (fieldValue.length > 100 ? '...' : ''),
            pattern: matchedPattern.toString(), // Show the matched keyword pattern
          };
        }
      }
      return null;
    };

    let matchDetail = null;

    if (filter.onTitle) {
      matchDetail = checkField(title, lowerTitle, 'title', {
        pattern: filter.pattern,
        keywordPatterns: filter.keywordPatterns,
      });
      if (matchDetail) {return matchDetail;}
    }

    if (filter.onChannelName) {
      matchDetail = checkField(channelName, lowerChannel, 'channel', {
        pattern: filter.pattern,
        keywordPatterns: filter.keywordPatterns,
      });
      if (matchDetail) {return matchDetail;}
    }

    if (filter.onDescription) {
      matchDetail = checkField(description, lowerDesc, 'description', {
        pattern: filter.pattern,
        keywordPatterns: filter.keywordPatterns,
      });
      if (matchDetail) {return matchDetail;}
    }

    return null; // No match found
  }

  /**
   * Iterates through video elements on the page and applies filtering actions.
   */
  filterVideos() {
    if (!this.isTabActive) {
      this.debug('Filtering skipped: Tab is inactive.');
      return;
    }
    if (!this.config) {
      this.log('Filtering skipped: Configuration not loaded.');
      return;
    }

    const startTime = performance.now();

    const unprocessedVideos = document.querySelectorAll(
      `${this.SELECTORS.VIDEO_CONTAINERS}:not([${this.FILTERED_ATTRIBUTE}])`
    );

    if (unprocessedVideos.length === 0) {
      return;
    }

    this.debug(`Found ${unprocessedVideos.length} new video elements to filter.`);

    let processedCount = 0;
    let blockedCount = 0;

    unprocessedVideos.forEach(videoContainer => {
      videoContainer.setAttribute(this.FILTERED_ATTRIBUTE, 'true');
      processedCount++;

      // Check for synchronized badge first
      if (this.config.filterSynchronizedVideos && this._hasSynchronizedBadge(videoContainer)) {
        this.debug('Video has synchronized badge, applying action:', this.config.synchronizedVideoAction);

        if (this.config.synchronizedVideoAction !== 'nothing') {
          blockedCount++;
          this._applySynchronizedVideoAction(videoContainer);
        }
        return; // Skip regular filtering for synchronized videos
      }

      const videoData = this.extractVideoData(videoContainer);
      if (!videoData) {
        this.debug('Skipping element: Could not extract video data.', videoContainer);
        return;
      }

      if (this.isContentBlocked(videoData)) {
        blockedCount++;
        this._applyBlockingAction(videoContainer);
      }
    });

    const endTime = performance.now();
    if (processedCount > 0) {
      this.debug(
        `Filtering pass complete: ${blockedCount}/${processedCount} new videos blocked (${(endTime - startTime).toFixed(
          1
        )}ms)`
      );
    }
  }

  /**
   * Applies the blocking action to a video element (hiding, dry-run highlighting, menu interaction).
   * @param {Element} videoElement - The video element to block.
   * @private
   */
  _applyBlockingAction(videoElement) {
    if (this.dryrun) {
      this.debug('Dry run: Highlighting blocked video', videoElement);
      videoElement.style.border = '2px solid orange'; // Highlight for dry run
      videoElement.style.opacity = '0.6';
      // Optionally attempt menu interaction in dry run to test selectors
      if (this.config.useStrictBlocking || this.activeNotInterestedPattern) {
        this._interactWithMenu(videoElement, true);
      }
    } else {
      // For non-dry run mode, we need to interact with menu BEFORE hiding the element
      // to prevent menus from detaching and appearing at the top left
      if (this.config.useStrictBlocking || this.activeNotInterestedPattern) {
        // Use an async IIFE to handle the menu interaction and hiding sequence
        (async () => {
          const menuInteractionCompleted = await this._interactWithMenu(videoElement, false);

          // Ensure menus have time to close before hiding the element
          setTimeout(() => {
            // Now hide the element after menu interaction and a brief delay
            videoElement.style.display = 'none';
            videoElement.style.visibility = 'hidden'; // Ensure it's fully hidden
            this.debug('Video element hidden after menu interaction');
          }, 150); // Wait for menu animations to complete
        })();
      } else {
        // No menu interaction needed, hide immediately
        videoElement.style.display = 'none';
        videoElement.style.visibility = 'hidden';
      }
    }
  }

  /**
   * Applies the configured action to synchronized videos
   * @param {Element} videoElement The video element with synchronized badge
   * @private
   */
  _applySynchronizedVideoAction(videoElement) {
    switch (this.config.synchronizedVideoAction) {
      case 'hide':
        if (this.dryrun) {
          this.debug('Dry run: Highlighting synchronized video for hiding', videoElement);
          videoElement.style.border = '2px solid purple';
          videoElement.style.opacity = '0.6';
        } else {
          videoElement.style.display = 'none';
          videoElement.style.visibility = 'hidden';
        }
        break;

      case 'notInterested':
        if (this.dryrun) {
          this.debug("Dry run: Highlighting synchronized video for 'not interested'", videoElement);
          videoElement.style.border = '2px solid magenta';
          videoElement.style.opacity = '0.6';
          this._interactWithMenu(videoElement, true);
        } else {
          // Interact with menu to mark as not interested
          this._interactWithMenu(videoElement, false).then(() => {
            // After successful menu interaction, optionally hide the element
            setTimeout(() => {
              videoElement.style.display = 'none';
              videoElement.style.visibility = 'hidden';
            }, 150);
          });
        }
        break;

      case 'nothing':
      default:
        // Do nothing
        break;
    }
  }

  // --- Menu Interaction ---

  /**
   * Attempts to click "Not Interested" or "Don't Recommend Channel" in the video menu.
   * Handles dry-run mode and caches results for dry runs.
   * @param {Element} videoElement - The video container element.
   * @param {boolean} isDryRun - Indicates if this is a dry run.
   * @returns {Promise<boolean>} Resolves with true if the target button was found (and clicked if not dry run).
   * @private
   */
  async _interactWithMenu(videoElement, isDryRun) {
    // Use cached result in dry run if available
    if (isDryRun && this.processedMenuResults.has(videoElement)) {
      const cachedResult = this.processedMenuResults.get(videoElement);
      this.debug(`Using cached menu interaction result: ${cachedResult}`);
      // Re-apply highlighting based on cached result
      videoElement.style.border = cachedResult ? '2px solid red' : '2px solid blue';
      return cachedResult;
    }

    const menuButton = videoElement.querySelector(this.SELECTORS.MENU_BUTTON);
    if (!menuButton) {
      this.debug('Menu button not found for interaction.', videoElement);
      if (isDryRun) {this.processedMenuResults.set(videoElement, false);}
      return false;
    }

    // Click the menu button to open the popup
    menuButton.click();

    try {
      // Wait briefly for the menu to appear and find the button
      const targetButton = await this._findMenuButton(this.MENU_WAIT_MS);

      const buttonFound = !!targetButton;

      if (isDryRun) {
        this.debug(`Dry run: Menu button search result: ${buttonFound ? 'FOUND' : 'NOT FOUND'}`);
        this.processedMenuResults.set(videoElement, buttonFound);
        // Highlight based on whether the button *would* be clicked
        videoElement.style.border = buttonFound ? '2px solid red' : '2px solid blue';

        // In dry run mode, we need to manually close the menu
        this._closeYoutubeMenu(menuButton);
      } else if (buttonFound) {
        this.debug('Clicking target menu button:', targetButton.textContent?.trim());
        targetButton.click();

        // No need to manually close the menu - YouTube will close it automatically
        // when clicking a menu item like "Not Interested" or "Don't Recommend Channel"
      } else {
        this.debug('Target menu button not found after opening menu.');
        // No button clicked, so we need to manually close the menu
        this._closeYoutubeMenu(menuButton);
      }
      return buttonFound;
    } catch (error) {
      this.log('Error during menu interaction:', error);
      // Make sure to close the menu if there was an error
      this._closeYoutubeMenu(menuButton);
      if (isDryRun) {this.processedMenuResults.set(videoElement, false);}
      return false;
    }
  }

  /**
   * Helper method to ensure YouTube menus are properly closed
   * Uses multiple strategies to make sure the menu disappears
   * @param {Element} menuButton - The menu button that was clicked to open the menu
   * @private
   */
  _closeYoutubeMenu(menuButton) {
    // First try clicking the menu button again to toggle it closed
    if (menuButton) {
      setTimeout(() => {
        this.debug('Attempting to close menu by clicking menu button again');
        menuButton.click();

        // As a fallback, also click on body after a short delay to ensure menu closes
        setTimeout(() => {
          // Use a click on body as fallback, which YouTube uses to dismiss menus
          this.debug('Fallback: Clicking body element to ensure menu closes');
          //document.body.click();

          // Additional fallback: press Escape key which should close menus
          setTimeout(() => {
            this.debug('Extra fallback: Sending Escape key to close any open menus');
            document.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
              })
            );
          }, 50);
        }, 50);
      }, 100);
    } else {
      // Direct body click if no menu button
      document.body.click();
    }
  }

  /**
   * Waits for the menu popup and finds the desired button within it.
   * @param {number} timeoutMs - Maximum time to wait for the button.
   * @returns {Promise<Element|null>} Resolves with the found button element or null.
   * @private
   */
  _findMenuButton(timeoutMs) {
    return new Promise(resolve => {
      const startTime = Date.now();
      const interval = 50; // Check every 50ms

      const check = () => {
        const menuItems = document.querySelectorAll(this.SELECTORS.MENU_ITEMS);
        if (menuItems.length > 0) {
          let targetButton = null;

          // Prioritize strict blocking if enabled and pattern exists
          if (this.config.useStrictBlocking && this.activeStrictBlockingPattern) {
            targetButton = Array.from(menuItems).find(el => this.activeStrictBlockingPattern.test(el.textContent));
          }

          // Fallback to "not interested" if strict blocking not found/disabled or pattern missing
          if (!targetButton && this.activeNotInterestedPattern) {
            targetButton = Array.from(menuItems).find(el => this.activeNotInterestedPattern.test(el.textContent));
          }

          if (targetButton) {
            this.debug('Found target menu button:', targetButton.textContent?.trim());
            resolve(targetButton);
            return;
          }
        }

        // Timeout check
        if (Date.now() - startTime > timeoutMs) {
          this.debug('Timeout waiting for menu button.');
          resolve(null); // Button not found within timeout
          return;
        }

        // Schedule next check
        setTimeout(check, interval);
      };

      // Start the check
      check();
    });
  }

  // --- DOM Observation ---

  /**
   * Starts observing the DOM for changes (e.g., new videos loaded).
   */
  startObserving() {
    if (this.observer) {
      this.debug('Observer already running, disconnecting first.');
      this.observer.disconnect();
    }

    // Ensure tab state is current before starting
    this.isTabActive = document.visibilityState === 'visible';
    this.debug(`Starting observer. Initial tab state: ${this.isTabActive ? 'active' : 'inactive'}`);

    // If tab is initially inactive, don't start observing yet.
    // handleVisibilityChange will start it when the tab becomes active.
    if (!this.isTabActive) {
      this.debug('Observer start deferred: Tab is inactive.');
      return;
    }

    this.observer = new MutationObserver(this._handleMutations);

    this.observer.observe(document.body, {
      childList: true, // Watch for nodes being added or removed.
      subtree: true, // Watch the entire body subtree.
      // No attributeFilter needed - we want to detect *new* elements,
      // not just changes to our own attribute.
    });

    this.debug('DOM Observer started.');
  }

  /**
   * Stops the DOM observer.
   */
  stopObserving() {
    if (this.observer) {
      this.debug('Stopping DOM Observer.');
      this.observer.disconnect();
      this.observer = null;
      // Clear any pending debounced filter calls
      if (this.mutationTimeoutId) {
        clearTimeout(this.mutationTimeoutId);
        this.mutationTimeoutId = null;
      }
      this.pendingMutationsCount = 0;
    }
  }

  /**
   * Handles mutations detected by the MutationObserver.
   * Debounces calls to filterVideos to avoid excessive processing.
   * @param {MutationRecord[]} mutations - The list of mutations.
   * @private
   */
  _handleMutations(mutations) {
    // Quickly check if the tab became inactive since the last check
    if (document.visibilityState !== 'visible') {
      if (this.isTabActive) {
        this.debug('Tab became inactive during mutation handling, pausing observer implicitly.');
        this.isTabActive = false;
        // No need to disconnect observer here, handleVisibilityChange manages it.
      }
      return; // Don't process if tab is not visible
    } else if (!this.isTabActive) {
      // Tab became active again
      this.debug('Tab became active during mutation handling.');
      this.isTabActive = true;
    }

    // Check if any mutation likely added relevant video content
    const hasRelevantChanges = mutations.some(mutation => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Check if any added node *is* or *contains* a video container
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (
              node.matches?.(this.SELECTORS.VIDEO_CONTAINERS) ||
              node.querySelector?.(this.SELECTORS.VIDEO_CONTAINERS)
            ) {
              return true; // Found a relevant addition
            }
          }
        }
      }
      // Consider other mutation types if needed, but childList is primary for new content
      return false;
    });

    if (!hasRelevantChanges) {
      return; // No relevant changes detected
    }

    this.debug('Relevant mutation detected, scheduling filter run.');

    // Debounce the filtering call
    this.pendingMutationsCount++;
    if (this.mutationTimeoutId) {
      clearTimeout(this.mutationTimeoutId);
    }

    if (this.pendingMutationsCount >= this.MAX_PENDING_MUTATIONS) {
      this.debug('Max pending mutations reached, filtering immediately.');
      this.pendingMutationsCount = 0;
      this.mutationTimeoutId = null;
      requestAnimationFrame(this.filterVideos);
    } else {
      this.mutationTimeoutId = setTimeout(() => {
        this.debug('Debounce timer expired, filtering now.');
        this.pendingMutationsCount = 0;
        this.mutationTimeoutId = null;
        requestAnimationFrame(this.filterVideos);
      }, this.MUTATION_DEBOUNCE_MS);
    }
  }

  // --- Event Handlers ---

  /**
   * Handles changes in tab visibility. Pauses/resumes the observer and triggers filtering.
   */
  handleVisibilityChange() {
    const wasActive = this.isTabActive;
    this.isTabActive = document.visibilityState === 'visible';

    this.debug(
      `Tab visibility changed: ${wasActive ? 'active' : 'inactive'} -> ${this.isTabActive ? 'active' : 'inactive'}`
    );

    if (!wasActive && this.isTabActive) {
      // Tab became active
      this.debug('Tab activated. Ensuring observer is running and filtering.');
      // Start observer if it wasn't running (e.g., started inactive)
      if (!this.observer) {
        this.startObserving();
      }
      // Run a filter pass as content might have changed while inactive
      requestAnimationFrame(this.filterVideos);
    } else if (wasActive && !this.isTabActive) {
      // Tab became inactive
      this.debug('Tab deactivated. Observer will pause implicitly.');
      // No need to explicitly stop observer here, _handleMutations checks visibility.
      // Clear any pending debounced calls to save resources
      if (this.mutationTimeoutId) {
        clearTimeout(this.mutationTimeoutId);
        this.mutationTimeoutId = null;
        this.pendingMutationsCount = 0;
        this.debug('Cleared pending mutation timeout due to inactivity.');
      }
    }
  }

  // --- Utility Methods ---

  /**
   * Retrieves data from chrome.storage.local wrapped in a Promise.
   * @param {string|string[]} keys - Storage key(s) to retrieve.
   * @returns {Promise<Object>} Resolves with the retrieved data.
   * @private
   */
  _getStorageData(keys) {
    // Ensure chrome API is available
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      this.log('Error: chrome.storage.local API is not available.');
      return Promise.resolve({}); // Return empty object
    }
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, data => {
        if (chrome.runtime.lastError) {
          this.log('Storage retrieval error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve(data || {}); // Ensure we always resolve with an object
        }
      });
    });
  }

  /**
   * Checks if a video has a synchronized/dubbed badge
   * @param {Element} videoElement The video container element
   * @returns {boolean} True if the video has a synchronized badge
   * @private
   */
  _hasSynchronizedBadge(videoElement) {
    // Look for the synchronized badge with various selectors
    const badgeSelectors = [
      '.badge[aria-label*="Synchronisiert"]',
      '.badge[aria-label*="Dubbed"]',
      'ytd-badge-supported-renderer .badge p',
      'ytd-badge-supported-renderer p',
    ];

    for (const selector of badgeSelectors) {
      try {
        const badges = videoElement.querySelectorAll(selector);
        for (const badge of badges) {
          const badgeText = badge.textContent?.trim().toLowerCase();
          const ariaLabel = badge.getAttribute('aria-label')?.toLowerCase();

          // Check for German and English synchronized/dubbed indicators
          if (
            badgeText === 'synchronisiert' ||
            badgeText === 'dubbed' ||
            ariaLabel?.includes('synchronisiert') ||
            ariaLabel?.includes('dubbed')
          ) {
            this.debug('Found synchronized badge:', badgeText || ariaLabel);
            return true;
          }
        }
      } catch (e) {
        // Selector might not be supported, continue to next
        continue;
      }
    }

    return false;
  }
}

// --- Global Initialization ---

/**
 * Initializes and starts the YouTube Content Filter script.
 * Ensures only one instance runs.
 */
function initYouTubeFilter() {
  // Prevent multiple initializations
  if (window.ytContentFilterInstance) {
    console.log('[YT Filter] Instance already running.');
    return;
  }

  console.log('[YT Filter] Initializing...');
  const filter = new YouTubeContentFilter();
  window.ytContentFilterInstance = filter; // Store instance globally

  // Start the initialization process
  filter.initialize().catch(error => {
    filter.log('Initialization failed:', error);
  });
}

// --- Script Entry Point ---

// Use DOMContentLoaded for earlier initialization if possible,
// fallback to 'load' if necessary.
// The _initialFilterRun method handles waiting for load if needed.
if (document.readyState === 'loading') {
  // Still loading, wait for DOMContentLoaded
  document.addEventListener('DOMContentLoaded', initYouTubeFilter, {
    once: true,
  });
} else {
  // 'interactive' or 'complete', DOM is ready
  initYouTubeFilter();
}

// Add message listener for settings updates from popup/options
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!window.ytContentFilterInstance) {return false;}

  const filter = window.ytContentFilterInstance;

  filter.debug('Message received:', message);

  // Handle different message actions
  switch (message.action) {
    case 'updateDryRun':
      filter.dryrun = message.value;
      filter.debug(`Dry run mode ${message.value ? 'enabled' : 'disabled'}`);
      // Re-filter videos with new setting
      filter.filterVideos();
      break;

    case 'refreshFilters':
      // Re-load configuration and re-filter
      filter
        .initialize()
        .then(() => {
          filter.debug('Filters refreshed via message');
          sendResponse({ success: true });
        })
        .catch(err => {
          filter.log('Failed to refresh filters:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true; // Indicate we'll respond asynchronously

    case 'getStatus':
      // Return current filter status
      sendResponse({
        isActive: !!filter.observer,
        dryrun: filter.dryrun,
        useBlacklist: filter.useBlacklist,
        useWhitelist: filter.useWhitelist,
      });
      break;
  }

  return false; // No async response needed for most messages
});
