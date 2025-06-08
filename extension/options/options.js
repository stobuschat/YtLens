/**
 * SPDX license identifier: MPL-2.0
 *
 * YtLens - A browser extension for customizing YouTube recommendations
 * Copyright 2025 Sebastian Tobuschat
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * @fileoverview Options page script for YouTube Filter extension.
 * Handles user settings, filter rule management (CRUD), import/export, and UI interactions.
 */

document.addEventListener('DOMContentLoaded', () => {
  /**
   * Manages the state and interactions of the options page.
   */
  class OptionsManager {
    // --- DOM Element References ---
    elements = {
      // General Settings
      debugModeCheckbox: document.getElementById('debugMode'),
      dryrunCheckbox: document.getElementById('dryrun'),
      useBlacklistCheckbox: document.getElementById('useBlacklist'),
      useWhitelistCheckbox: document.getElementById('useWhitelist'),
      useStrictBlockingCheckbox: document.getElementById('useStrictBlocking'),
      optionsForm: document.getElementById('options-form'),
      loadPresetButton: document.getElementById('loadPreset'),
      exportAllSettingsBtn: document.getElementById('exportAllSettings'),
      importAllSettingsBtn: document.getElementById('importAllSettings'),

      // Synchronized Video Filtering
      filterSynchronizedVideosCheckbox: document.getElementById('filterSynchronizedVideos'),
      synchronizedOptionsSection: document.getElementById('synchronizedOptionsSection'),
      synchronizedVideoActionRadios: document.querySelectorAll('input[name="synchronizedVideoAction"]'),

      // Language Settings
      youtubeLanguageSelect: document.getElementById('youtubeLanguage'),
      customPatternsSection: document.getElementById('customPatternsSection'),
      customNotInterestedInput: document.getElementById('customNotInterestedPattern'),
      customDontRecommendInput: document.getElementById('customDontRecommendPattern'),
      // Tabs
      tabs: document.querySelectorAll('.tab'),
      tabContents: document.querySelectorAll('.tab-content'),
      // Modal
      modal: document.getElementById('rule-modal'),
      closeModalBtn: document.querySelector('.close-modal'),
      ruleForm: document.getElementById('rule-form'),
      cancelRuleBtn: document.getElementById('cancel-rule'),
      modalTitle: document.getElementById('modal-title'),
      ruleListTypeInput: document.getElementById('rule-list-type'),
      ruleIndexInput: document.getElementById('rule-index'),
      notInterestedOptionDiv: document.getElementById('not-interested-option'),
      // Rule Form Fields
      ruleNameInput: document.getElementById('rule-name'),
      rulePatternInput: document.getElementById('rule-pattern'),
      ruleKeywordsInput: document.getElementById('rule-keywords'),
      ruleChannelsInput: document.getElementById('rule-channels'),
      ruleEnabledCheckbox: document.getElementById('rule-enabled'),
      ruleTitleCheckbox: document.getElementById('rule-title'),
      ruleDescriptionCheckbox: document.getElementById('rule-description'),
      ruleChannelCheckbox: document.getElementById('rule-channel'),
      ruleNotInterestedCheckbox: document.getElementById('rule-not-interested'),
      // Rule Tables
      blacklistTableBody: document.querySelector('#blacklist-rules tbody'),
      whitelistTableBody: document.querySelector('#whitelist-rules tbody'),
      // Add/Import/Export Buttons
      addBlacklistRuleBtn: document.getElementById('add-blacklist-rule'),
      addWhitelistRuleBtn: document.getElementById('add-whitelist-rule'),
      importBlacklistBtn: document.getElementById('import-blacklist'),
      exportBlacklistBtn: document.getElementById('export-blacklist'),
      importWhitelistBtn: document.getElementById('import-whitelist'),
      exportWhitelistBtn: document.getElementById('export-whitelist'),
    };

    // --- State ---
    state = {
      blacklistRules: [],
      whitelistRules: [],
      settings: {
        debugMode: false,
        dryrun: true,
        useBlacklist: true,
        useWhitelist: false,
        useStrictBlocking: false,
        filterSynchronizedVideos: false,
        synchronizedVideoAction: 'hide',
        youtubeLanguage: '',
        customNotInterestedPattern: '',
        customDontRecommendPattern: '',
      },
    };

    // --- Constants ---
    STORAGE_KEYS = [
      'debugMode',
      'dryrun',
      'useBlacklist',
      'useWhitelist',
      'useStrictBlocking',
      'filterSynchronizedVideos',
      'synchronizedVideoAction',
      'blacklist',
      'whitelist',
      'youtubeLanguage',
      'customNotInterestedPattern',
      'customDontRecommendPattern',
    ];

    constructor() {
      this._bindMethods();
      this._addEventListeners();
      this._loadOptions();
    }

    /**
     * Binds class methods to the instance to maintain 'this' context.
     * @private
     */
    _bindMethods() {
      this._handleTabClick = this._handleTabClick.bind(this);
      this._handleModalClose = this._handleModalClose.bind(this);
      this._handleOutsideModalClick = this._handleOutsideModalClick.bind(this);
      this._handleRuleFormSubmit = this._handleRuleFormSubmit.bind(this);
      this._handleOptionsFormSubmit = this._handleOptionsFormSubmit.bind(this);
      this._handleLoadPreset = this._handleLoadPreset.bind(this);
      this._handleLanguageChange = this._handleLanguageChange.bind(this);
      this._handleSynchronizedFilterChange = this._handleSynchronizedFilterChange.bind(this);
      this.openRuleModal = this.openRuleModal.bind(this);
      this.importRules = this.importRules.bind(this);
      this.exportRules = this.exportRules.bind(this);
      this.exportAllSettings = this.exportAllSettings.bind(this);
      this.importAllSettings = this.importAllSettings.bind(this);
    }

    /**
     * Attaches event listeners to DOM elements.
     * @private
     */
    _addEventListeners() {
      // Tabs
      this.elements.tabs.forEach(tab => tab.addEventListener('click', this._handleTabClick));

      // Modal
      this.elements.closeModalBtn.addEventListener('click', this._handleModalClose);
      this.elements.cancelRuleBtn.addEventListener('click', this._handleModalClose);
      window.addEventListener('click', this._handleOutsideModalClick);
      this.elements.ruleForm.addEventListener('submit', this._handleRuleFormSubmit);

      // Forms
      this.elements.optionsForm.addEventListener('submit', this._handleOptionsFormSubmit);

      // Buttons
      this.elements.loadPresetButton.addEventListener('click', this._handleLoadPreset);
      this.elements.addBlacklistRuleBtn.addEventListener('click', () => this.openRuleModal('blacklist'));
      this.elements.addWhitelistRuleBtn.addEventListener('click', () => this.openRuleModal('whitelist'));
      this.elements.importBlacklistBtn.addEventListener('click', () => this.importRules('blacklist'));
      this.elements.exportBlacklistBtn.addEventListener('click', () => this.exportRules('blacklist'));
      this.elements.importWhitelistBtn.addEventListener('click', () => this.importRules('whitelist'));
      this.elements.exportWhitelistBtn.addEventListener('click', () => this.exportRules('whitelist'));
      this.elements.exportAllSettingsBtn.addEventListener('click', this.exportAllSettings);
      this.elements.importAllSettingsBtn.addEventListener('click', this.importAllSettings);

      // Language Settings
      this.elements.youtubeLanguageSelect.addEventListener('change', this._handleLanguageChange);

      // Synchronized Video Filtering
      this.elements.filterSynchronizedVideosCheckbox.addEventListener('change', this._handleSynchronizedFilterChange);
    }

    // --- Event Handlers ---

    _handleTabClick(event) {
      const clickedTab = event.currentTarget;
      // Remove active class from all tabs and contents
      this.elements.tabs.forEach(t => t.classList.remove('active'));
      this.elements.tabContents.forEach(c => c.classList.remove('active'));

      // Add active class to clicked tab and corresponding content
      clickedTab.classList.add('active');
      document.getElementById(`${clickedTab.dataset.tab}-tab`).classList.add('active');
    }

    _handleModalClose() {
      this.elements.modal.style.display = 'none';
    }

    _handleOutsideModalClick(event) {
      if (event.target === this.elements.modal) {
        this._handleModalClose();
      }
    }

    _handleRuleFormSubmit(event) {
      event.preventDefault();
      this._saveRule();
    }

    _handleOptionsFormSubmit(event) {
      event.preventDefault();
      this._saveOptions();
    }

    async _handleLoadPreset() {
      try {
        const response = await fetch(chrome.runtime.getURL('config/preset.json'));
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const presetConfig = await response.json();

        // Validate preset structure (basic)
        if (typeof presetConfig !== 'object' || presetConfig === null) {
          throw new Error('Invalid preset format: Not an object.');
        }

        this.state.blacklistRules = this._parseAndValidateRules(presetConfig.blacklist || []);
        this.state.whitelistRules = this._parseAndValidateRules(presetConfig.whitelist || []);

        this._renderRulesTable('blacklist');
        this._renderRulesTable('whitelist');

        alert('Preset loaded successfully');
      } catch (error) {
        console.error('Failed to load preset:', error);
        alert(`Failed to load preset: ${error.message}`);
      }
    }

    _handleLanguageChange() {
      const isCustom = this.elements.youtubeLanguageSelect.value === 'custom';
      this.elements.customPatternsSection.style.display = isCustom ? 'block' : 'none';
    }

    _handleSynchronizedFilterChange() {
      const isEnabled = this.elements.filterSynchronizedVideosCheckbox.checked;
      this.elements.synchronizedOptionsSection.style.display = isEnabled ? 'block' : 'none';
    }

    // --- Data Loading and Saving ---

    /**
     * Loads options and rules from storage.
     * @private
     */
    async _loadOptions() {
      try {
        const data = await this._getStorageData(this.STORAGE_KEYS);

        // Load general settings
        this.state.settings.debugMode = data.debugMode ?? false;
        this.state.settings.dryrun = data.dryrun ?? false;
        this.state.settings.useBlacklist = data.useBlacklist ?? true;
        this.state.settings.useWhitelist = data.useWhitelist ?? false;
        this.state.settings.useStrictBlocking = data.useStrictBlocking ?? false;

        // Load synchronized video filtering settings
        this.state.settings.filterSynchronizedVideos = data.filterSynchronizedVideos ?? false;
        this.state.settings.synchronizedVideoAction = data.synchronizedVideoAction ?? 'hide';

        // Load language settings
        this.state.settings.youtubeLanguage = data.youtubeLanguage || '';
        this.state.settings.customNotInterestedPattern = data.customNotInterestedPattern || '';
        this.state.settings.customDontRecommendPattern = data.customDontRecommendPattern || '';

        // Load rules
        this.state.blacklistRules = this._parseAndValidateRules(data.blacklist);
        this.state.whitelistRules = this._parseAndValidateRules(data.whitelist);

        this._updateUIFromState();
      } catch (error) {
        console.error('Error loading options:', error);
        alert('Failed to load options. Using defaults.');
        // Update UI with default state if loading fails
        this._updateUIFromState();
      }
    }

    /**
     * Saves the current options and rules to storage.
     * @private
     */
    async _saveOptions() {
      // Get selected synchronized video action
      let synchronizedVideoAction = 'hide';
      for (const radio of this.elements.synchronizedVideoActionRadios) {
        if (radio.checked) {
          synchronizedVideoAction = radio.value;
          break;
        }
      }

      const settingsToSave = {
        debugMode: this.elements.debugModeCheckbox.checked,
        dryrun: this.elements.dryrunCheckbox.checked,
        useBlacklist: this.elements.useBlacklistCheckbox.checked,
        useWhitelist: this.elements.useWhitelistCheckbox.checked,
        useStrictBlocking: this.elements.useStrictBlockingCheckbox.checked,
        filterSynchronizedVideos: this.elements.filterSynchronizedVideosCheckbox.checked,
        synchronizedVideoAction: synchronizedVideoAction,
        youtubeLanguage: this.elements.youtubeLanguageSelect.value,
        customNotInterestedPattern: this.elements.customNotInterestedInput.value.trim(),
        customDontRecommendPattern: this.elements.customDontRecommendInput.value.trim(),
      };

      try {
        await this._setStorageData({
          ...settingsToSave,
          blacklist: this.state.blacklistRules,
          whitelist: this.state.whitelistRules,
        });
        // Update local state after successful save
        this.state.settings = { ...this.state.settings, ...settingsToSave };
        alert('Options saved successfully');
      } catch (error) {
        console.error('Error saving options:', error);
        alert(`Failed to save options: ${error.message}`);
      }
    }

    /**
     * Updates the UI elements based on the current state.
     * @private
     */
    _updateUIFromState() {
      // Update checkboxes
      this.elements.debugModeCheckbox.checked = this.state.settings.debugMode;
      this.elements.dryrunCheckbox.checked = this.state.settings.dryrun;
      this.elements.useBlacklistCheckbox.checked = this.state.settings.useBlacklist;
      this.elements.useWhitelistCheckbox.checked = this.state.settings.useWhitelist;
      this.elements.useStrictBlockingCheckbox.checked = this.state.settings.useStrictBlocking;

      // Update synchronized video filtering settings
      this.elements.filterSynchronizedVideosCheckbox.checked = this.state.settings.filterSynchronizedVideos;

      // Set the correct radio button for synchronized video action
      for (const radio of this.elements.synchronizedVideoActionRadios) {
        if (radio.value === this.state.settings.synchronizedVideoAction) {
          radio.checked = true;
          break;
        }
      }

      // Show/hide synchronized options section
      this._handleSynchronizedFilterChange();

      // Update language settings
      this.elements.youtubeLanguageSelect.value = this.state.settings.youtubeLanguage;
      this.elements.customNotInterestedInput.value = this.state.settings.customNotInterestedPattern;
      this.elements.customDontRecommendInput.value = this.state.settings.customDontRecommendPattern;
      this._handleLanguageChange(); // Ensure custom section visibility is correct

      // Render rule tables
      this._renderRulesTable('blacklist');
      this._renderRulesTable('whitelist');
    }

    // --- Rule Management ---

    /**
     * Parses and validates raw rule data.
     * @param {Array<any>} rawRules - Array of rules from storage or import.
     * @returns {Array<object>} A validated list of rule objects.
     * @private
     */
    _parseAndValidateRules(rawRules) {
      if (!Array.isArray(rawRules)) {
        console.warn('Invalid rules format: Expected an array, received:', rawRules);
        return [];
      }
      return rawRules
        .map((rule, index) => {
          if (typeof rule !== 'object' || rule === null) {
            console.warn(`Invalid rule at index ${index}: Not an object.`, rule);
            return null;
          }
          // Basic structure validation (add more checks as needed)
          if (typeof rule.name !== 'string' || typeof rule.enabled !== 'boolean') {
            // Allow missing name/enabled for backward compatibility or flexibility?
            // Let's enforce enabled, allow missing name for now.
            if (typeof rule.enabled === 'undefined') {rule.enabled = true;} // Default to enabled
            if (typeof rule.name === 'undefined') {rule.name = `Rule ${index + 1}`;} // Default name
          }
          // Ensure keywords/channels are arrays if present
          if (rule.keywords && !Array.isArray(rule.keywords)) {rule.keywords = [];}
          if (rule.channels && !Array.isArray(rule.channels)) {rule.channels = [];}

          return {
            name: rule.name || `Rule ${index + 1}`,
            pattern: rule.pattern || '',
            keywords: Array.isArray(rule.keywords) ? rule.keywords.map(String) : [],
            channels: Array.isArray(rule.channels) ? rule.channels.map(String) : [],
            enabled: rule.enabled !== false, // Default true
            onTitle: rule.onTitle !== false, // Default true
            onDescription: rule.onDescription !== false, // Default true
            onChannelName: rule.onChannelName !== false, // Default true
            markNotInterested: rule.markNotInterested !== false, // Default true (relevant for blacklist)
          };
        })
        .filter(rule => rule !== null);
    }

    /**
     * Renders the rules table for a given list type.
     * @param {'blacklist' | 'whitelist'} listType - The type of list to render.
     * @private
     */
    _renderRulesTable(listType) {
      const rules = listType === 'blacklist' ? this.state.blacklistRules : this.state.whitelistRules;
      const tableBody = listType === 'blacklist' ? this.elements.blacklistTableBody : this.elements.whitelistTableBody;

      tableBody.innerHTML = ''; // Clear existing rows

      if (rules.length === 0) {
        const columnCount = listType === 'blacklist' ? 9 : 8;
        tableBody.innerHTML = `<tr><td colspan="${columnCount}">No rules defined. Click "Add New Rule" to create one.</td></tr>`;
        return;
      }

      rules.forEach((rule, index) => {
        const row = this._createRuleRow(listType, rule, index);
        tableBody.appendChild(row);
      });
    }

    /**
     * Creates a table row element for a single rule.
     * @param {'blacklist' | 'whitelist'} listType - The type of list.
     * @param {object} rule - The rule object.
     * @param {number} index - The index of the rule in its list.
     * @returns {HTMLTableRowElement} The created table row.
     * @private
     */
    _createRuleRow(listType, rule, index) {
      const row = document.createElement('tr');

      // Helper to create a cell with a checkbox
      const createCheckboxCell = (checked, changeHandler) => {
        const cell = document.createElement('td');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        checkbox.addEventListener('change', changeHandler);
        cell.appendChild(checkbox);
        return cell;
      };

      // Enabled Checkbox
      row.appendChild(
        createCheckboxCell(rule.enabled, e => {
          rule.enabled = e.target.checked;
          // No immediate save, saved with main form
        })
      );

      // Name
      const nameCell = document.createElement('td');
      nameCell.textContent = rule.name || '';
      row.appendChild(nameCell);

      // Pattern
      const patternCell = document.createElement('td');
      patternCell.title = rule.pattern || '';
      patternCell.textContent = this._truncateText(rule.pattern || '', 20);
      row.appendChild(patternCell);

      // Keywords
      const keywordsCell = document.createElement('td');
      this._renderKeywordsCell(keywordsCell, rule.keywords);
      row.appendChild(keywordsCell);

      // Target Fields Checkboxes
      row.appendChild(createCheckboxCell(rule.onTitle, e => (rule.onTitle = e.target.checked)));
      row.appendChild(createCheckboxCell(rule.onDescription, e => (rule.onDescription = e.target.checked)));
      row.appendChild(createCheckboxCell(rule.onChannelName, e => (rule.onChannelName = e.target.checked)));

      // "Not Interested" Checkbox (Blacklist only)
      if (listType === 'blacklist') {
        row.appendChild(createCheckboxCell(rule.markNotInterested, e => (rule.markNotInterested = e.target.checked)));
      }

      // Actions Cell
      const actionsCell = document.createElement('td');
      const editBtn = document.createElement('button');
      editBtn.innerHTML = '<span class="edit-btn">✏️ Edit</span>';
      editBtn.className = 'action-btn';
      editBtn.addEventListener('click', () => this.openRuleModal(listType, index));

      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '<span class="delete-btn">🗑️ Delete</span>';
      deleteBtn.className = 'action-btn';
      deleteBtn.addEventListener('click', () => this._deleteRule(listType, index));

      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(deleteBtn);
      row.appendChild(actionsCell);

      return row;
    }

    /**
     * Populates the content of the keywords table cell.
     * @param {HTMLTableCellElement} cell - The cell element to populate.
     * @param {string[]} keywords - The array of keywords.
     * @private
     */
    _renderKeywordsCell(cell, keywords) {
      cell.innerHTML = ''; // Clear previous content
      if (!keywords || keywords.length === 0) {return;}

      const MAX_VISIBLE_KEYWORDS = 3;
      keywords.slice(0, MAX_VISIBLE_KEYWORDS).forEach(keyword => {
        const tag = document.createElement('span');
        tag.className = 'keyword-tag';
        tag.textContent = keyword;
        cell.appendChild(tag);
      });

      if (keywords.length > MAX_VISIBLE_KEYWORDS) {
        const moreTag = document.createElement('span');
        moreTag.className = 'keyword-tag';
        moreTag.textContent = `+${keywords.length - MAX_VISIBLE_KEYWORDS}`;
        moreTag.title = keywords.slice(MAX_VISIBLE_KEYWORDS).join(', ');
        cell.appendChild(moreTag);
      }
    }

    /**
     * Opens the rule editing/creation modal.
     * @param {'blacklist' | 'whitelist'} listType - The type of list.
     * @param {number} [ruleIndex] - The index of the rule to edit (undefined for new rule).
     */
    openRuleModal(listType, ruleIndex) {
      const isEditing = ruleIndex !== undefined;
      this.elements.ruleListTypeInput.value = listType;
      this.elements.ruleIndexInput.value = isEditing ? ruleIndex : '';
      this.elements.modalTitle.textContent = isEditing ? 'Edit Rule' : 'Add New Rule';

      // Toggle visibility of "Mark Not Interested" option
      this.elements.notInterestedOptionDiv.style.display = listType === 'blacklist' ? 'inline-block' : 'none';

      // Populate form if editing, otherwise reset
      if (isEditing) {
        const rule =
          listType === 'blacklist' ? this.state.blacklistRules[ruleIndex] : this.state.whitelistRules[ruleIndex];
        this.elements.ruleNameInput.value = rule.name || '';
        this.elements.rulePatternInput.value = rule.pattern || '';
        this.elements.ruleKeywordsInput.value = rule.keywords?.join(', ') || '';
        this.elements.ruleChannelsInput.value = rule.channels?.join(', ') || '';
        this.elements.ruleEnabledCheckbox.checked = rule.enabled;
        this.elements.ruleTitleCheckbox.checked = rule.onTitle;
        this.elements.ruleDescriptionCheckbox.checked = rule.onDescription;
        this.elements.ruleChannelCheckbox.checked = rule.onChannelName;
        if (listType === 'blacklist') {
          this.elements.ruleNotInterestedCheckbox.checked = rule.markNotInterested;
        }
      } else {
        this.elements.ruleForm.reset();
        // Set defaults for new rule
        this.elements.ruleEnabledCheckbox.checked = true;
        this.elements.ruleTitleCheckbox.checked = true;
        this.elements.ruleDescriptionCheckbox.checked = true;
        this.elements.ruleChannelCheckbox.checked = true;
        if (listType === 'blacklist') {
          this.elements.ruleNotInterestedCheckbox.checked = true;
        }
      }

      this.elements.modal.style.display = 'block';
      this.elements.ruleNameInput.focus(); // Focus the first field
    }

    /**
     * Saves the rule from the modal form to the state.
     * @private
     */
    _saveRule() {
      const listType = this.elements.ruleListTypeInput.value;
      const ruleIndex = this.elements.ruleIndexInput.value;
      const isNewRule = ruleIndex === '';

      // Basic validation
      const ruleName = this.elements.ruleNameInput.value.trim();
      if (!ruleName) {
        alert('Rule name cannot be empty.');
        this.elements.ruleNameInput.focus();
        return;
      }

      const pattern = this.elements.rulePatternInput.value.trim();
      const keywords = this.elements.ruleKeywordsInput.value
        .split(',')
        .map(k => k.trim())
        .filter(k => k);
      const channels = this.elements.ruleChannelsInput.value
        .split(',')
        .map(c => c.trim())
        .filter(c => c);

      if (!pattern && keywords.length === 0 && channels.length === 0) {
        alert('A rule must have at least a pattern, keywords, or channels defined.');
        this.elements.rulePatternInput.focus();
        return;
      }

      // Validate Regex pattern if provided
      if (pattern) {
        try {
          new RegExp(pattern);
        } catch (e) {
          alert(`Invalid Regular Expression pattern: ${e.message}`);
          this.elements.rulePatternInput.focus();
          return;
        }
      }

      const rule = {
        name: ruleName,
        pattern: pattern,
        keywords: keywords,
        channels: channels,
        enabled: this.elements.ruleEnabledCheckbox.checked,
        onTitle: this.elements.ruleTitleCheckbox.checked,
        onDescription: this.elements.ruleDescriptionCheckbox.checked,
        onChannelName: this.elements.ruleChannelCheckbox.checked,
        markNotInterested: listType === 'blacklist' ? this.elements.ruleNotInterestedCheckbox.checked : false, // Not applicable for whitelist
      };

      if (isNewRule) {
        if (listType === 'blacklist') {
          this.state.blacklistRules.push(rule);
        } else {
          this.state.whitelistRules.push(rule);
        }
      } else {
        if (listType === 'blacklist') {
          this.state.blacklistRules[ruleIndex] = rule;
        } else {
          this.state.whitelistRules[ruleIndex] = rule;
        }
      }

      this._renderRulesTable(listType);
      this._handleModalClose();
      // Rely on main save button
    }

    /**
     * Deletes a rule from the state.
     * @param {'blacklist' | 'whitelist'} listType - The type of list.
     * @param {number} index - The index of the rule to delete.
     * @private
     */
    _deleteRule(listType, index) {
      if (confirm('Are you sure you want to delete this rule?')) {
        if (listType === 'blacklist') {
          this.state.blacklistRules.splice(index, 1);
        } else {
          this.state.whitelistRules.splice(index, 1);
        }
        this._renderRulesTable(listType);
        // Rely on main save button
      }
    }

    // --- Import / Export ---

    /**
     * Handles importing rules from a JSON file.
     * @param {'blacklist' | 'whitelist'} listType - The type of list to import into.
     */
    importRules(listType) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';

      input.onchange = event => {
        const file = event.target.files[0];
        if (!file) {return;}

        const reader = new FileReader();
        reader.onload = e => {
          try {
            const importedData = JSON.parse(e.target.result);
            const validatedRules = this._parseAndValidateRules(importedData);

            if (listType === 'blacklist') {
              this.state.blacklistRules = validatedRules;
            } else {
              this.state.whitelistRules = validatedRules;
            }
            this._renderRulesTable(listType);
            alert(
              `Successfully imported ${validatedRules.length} rules into ${listType}. Remember to save your options.`
            );
          } catch (error) {
            console.error('Failed to import rules:', error);
            alert(`Import failed: ${error.message}`);
          }
        };
        reader.onerror = e => {
          console.error('File reading error:', e);
          alert('Failed to read the selected file.');
        };
        reader.readAsText(file);
      };

      input.click();
    }

    /**
     * Handles exporting rules to a JSON file.
     * @param {'blacklist' | 'whitelist'} listType - The type of list to export.
     */
    exportRules(listType) {
      const rules = listType === 'blacklist' ? this.state.blacklistRules : this.state.whitelistRules;
      if (rules.length === 0) {
        alert(`The ${listType} is empty. Nothing to export.`);
        return;
      }

      const dataStr = JSON.stringify(rules, null, 2); // Pretty print JSON
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const exportLink = document.createElement('a');
      exportLink.href = url;
      exportLink.download = `${listType}_rules_${new Date().toISOString().split('T')[0]}.json`; // Add date to filename
      document.body.appendChild(exportLink); // Required for Firefox
      exportLink.click();

      // Clean up
      document.body.removeChild(exportLink);
      URL.revokeObjectURL(url);
    }

    /**
     * Exports all settings (both rules and configuration) to a JSON file.
     */
    exportAllSettings() {
      const allSettings = {
        blacklist: this.state.blacklistRules,
        whitelist: this.state.whitelistRules,
        settings: this.state.settings,
      };

      const dataStr = JSON.stringify(allSettings, null, 2); // Pretty print JSON
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const exportLink = document.createElement('a');
      exportLink.href = url;
      exportLink.download = `ytlens_settings_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(exportLink); // Required for Firefox
      exportLink.click();

      // Clean up
      document.body.removeChild(exportLink);
      URL.revokeObjectURL(url);
    }

    /**
     * Imports all settings (both rules and configuration) from a JSON file.
     */
    importAllSettings() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';

      input.onchange = event => {
        const file = event.target.files[0];
        if (!file) {return;}

        const reader = new FileReader();
        reader.onload = e => {
          try {
            const importedData = JSON.parse(e.target.result);

            // Validate basic structure
            if (!importedData || typeof importedData !== 'object') {
              throw new Error('Invalid settings format: Not an object.');
            }

            // Import rules if present
            if (importedData.blacklist) {
              this.state.blacklistRules = this._parseAndValidateRules(importedData.blacklist);
            }
            if (importedData.whitelist) {
              this.state.whitelistRules = this._parseAndValidateRules(importedData.whitelist);
            }

            // Import settings if present
            if (importedData.settings && typeof importedData.settings === 'object') {
              this.state.settings = {
                ...this.state.settings, // Keep defaults for any missing settings
                ...importedData.settings, // Override with imported settings
              };
            }

            // Update UI to reflect new state
            this._updateUIFromState();

            alert("Settings imported successfully. Click 'Save Options' to apply.");
          } catch (error) {
            console.error('Failed to import settings:', error);
            alert(`Import failed: ${error.message}`);
          }
        };
        reader.onerror = e => {
          console.error('File reading error:', e);
          alert('Failed to read the selected file.');
        };
        reader.readAsText(file);
      };

      input.click();
    }

    // --- Utility Methods ---

    /**
     * Truncates text to a maximum length, adding ellipsis if needed.
     * @param {string} text - The text to truncate.
     * @param {number} maxLength - The maximum allowed length.
     * @returns {string} The truncated text.
     * @private
     */
    _truncateText(text, maxLength) {
      if (!text) {return '';}
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    /**
     * Retrieves data from chrome.storage.local wrapped in a Promise.
     * @param {string|string[]} keys - Storage key(s) to retrieve.
     * @returns {Promise<Object>} Resolves with the retrieved data.
     * @private
     */
    _getStorageData(keys) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.error('Error: chrome.storage.local API is not available.');
        return Promise.resolve({}); // Return empty object to avoid breaking caller
      }
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, data => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(data || {}); // Ensure we always resolve with an object
          }
        });
      });
    }

    /**
     * Sets data in chrome.storage.local wrapped in a Promise.
     * @param {Object} data - An object containing items to set.
     * @returns {Promise<void>} Resolves when the data is set.
     * @private
     */
    _setStorageData(data) {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        console.error('Error: chrome.storage.local API is not available.');
        return Promise.reject(new Error('Storage API not available.'));
      }
      return new Promise((resolve, reject) => {
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
    }
  }

  // --- Initialize the Options Manager ---
  new OptionsManager();
});
