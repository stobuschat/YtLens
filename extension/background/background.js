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
 * @fileoverview Background script for the YouTube Filter extension.
 * Handles extension lifecycle events like installation and updates.
 * Can be used for centralized configuration management or message passing in the future.
 */

/**
 * Logs a message with a standard prefix for the background script.
 * @param {string} message The message to log.
 * @param {*} [data] Optional data to log alongside the message.
 */
function log(message, data) {
  const PREFIX = "[YT Filter BG]";
  if (data !== undefined) {
    console.log(`${PREFIX} ${message}`, data);
  } else {
    console.log(`${PREFIX} ${message}`);
  }
}

/**
 * Sets default configuration values in storage if they don't already exist.
 * This runs when the extension is first installed or updated.
 */
async function setDefaultConfiguration() {
  log("Checking default configuration...");
  try {
    const currentConfig = await chrome.storage.local.get([
      "useBlacklist",
      "useWhitelist",
      "blacklist",
      "whitelist",
      "youtubeLanguage",
    ]);

    const defaults = {
      useBlacklist: true,
      useWhitelist: false,
      blacklist: [], // Start with empty lists
      whitelist: [],
      youtubeLanguage: "", // Default auto detect language
      debugMode: false,
      dryrun: true, // Default to dry run mode
      useStrictBlocking: false,
      customNotInterestedPattern: "",
      customDontRecommendPattern: "",
    };

    const configToSet = {};
    let defaultsApplied = false;

    for (const key in defaults) {
      if (currentConfig[key] === undefined) {
        configToSet[key] = defaults[key];
        defaultsApplied = true;
        log(`Setting default value for '${key}':`, defaults[key]);
      }
    }

    if (defaultsApplied) {
      await chrome.storage.local.set(configToSet);
      log("Default configuration applied.");
    } else {
      log("Configuration already exists, no defaults applied.");
    }
  } catch (error) {
    log("Error setting default configuration:", error);
  }
}

/**
 * Listener for the extension's installation or update event.
 */
chrome.runtime.onInstalled.addListener((details) => {
  log(`Extension ${details.reason}. Previous version: ${details.previousVersion}`);

  // Set default configuration on first install or update
  if (details.reason === "install" || details.reason === "update") {
    setDefaultConfiguration();
  }

});

log("Background script loaded.");
