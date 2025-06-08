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
 * @fileoverview Popup script for the YtLens filter extension.
 * Controls UI and messaging to the content script.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  const filterStatusElement = document.getElementById('filter-status');
  const toggleDryrunSwitch = document.getElementById('toggle-dryrun');
  const toggleActiveButton = document.getElementById('toggle-active');
  const openOptionsButton = document.getElementById('open-options');
  const filterCountsElement = document.getElementById('filter-counts');

  let currentStatus = {
    isActive: true,
    dryrun: true,
    useBlacklist: true,
    useWhitelist: false,
  };

  // Function to query active YouTube tab
  async function getActiveYouTubeTab() {
    try {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
        url: ['*://*.youtube.com/*'],
      });

      return tabs[0] || null;
    } catch (error) {
      console.error('Error getting active tab:', error);
      return null;
    }
  }

  // Function to get extension status
  async function getFilterStatus() {
    const tab = await getActiveYouTubeTab();

    if (!tab) {
      filterStatusElement.textContent = 'Not on YouTube';
      filterStatusElement.className = 'status-indicator status-inactive';
      disableControls(true);
      return null;
    }

    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        action: 'getStatus',
      });

      return response;
    } catch (error) {
      console.log('Could not connect to YouTube page:', error);
      filterStatusElement.textContent = 'Not Connected';
      filterStatusElement.className = 'status-indicator status-inactive';
      disableControls(true);
      return null;
    }
  }

  // Function to disable controls when not on YouTube
  function disableControls(disabled) {
    toggleDryrunSwitch.disabled = disabled;
    toggleActiveButton.disabled = disabled;
    if (disabled) {
      toggleActiveButton.classList.remove('button-primary');
    } else {
      toggleActiveButton.classList.add('button-primary');
    }
  }

  // Function to update UI based on status
  function updateUI(status) {
    if (!status) {return;}

    currentStatus = status;

    // Update dry run toggle
    toggleDryrunSwitch.checked = status.dryrun;

    // Update status label
    if (status.isActive) {
      if (status.dryrun) {
        filterStatusElement.textContent = 'Monitoring';
        filterStatusElement.className = 'status-indicator status-dryrun';
        toggleActiveButton.textContent = 'Pause Filter';
      } else {
        filterStatusElement.textContent = 'Active';
        filterStatusElement.className = 'status-indicator status-active';
        toggleActiveButton.textContent = 'Pause Filter';
      }
    } else {
      filterStatusElement.textContent = 'Paused';
      filterStatusElement.className = 'status-indicator status-inactive';
      toggleActiveButton.textContent = 'Resume Filter';
    }

    // Update filter counts
    let countText = '';
    if (status.useBlacklist && status.useWhitelist) {
      countText = 'Using both blacklist & whitelist';
    } else if (status.useBlacklist) {
      countText = 'Using blacklist only';
    } else if (status.useWhitelist) {
      countText = 'Using whitelist only';
    } else {
      countText = 'No filters active';
    }

    filterCountsElement.textContent = countText;
  }

  // Function to toggle dry run mode
  async function toggleDryRun(event) {
    const tab = await getActiveYouTubeTab();
    if (!tab) {return;}

    try {
      await browser.tabs.sendMessage(tab.id, {
        action: 'updateDryRun',
        value: event.target.checked,
      });

      // Update storage to persist setting
      await browser.storage.local.set({ dryrun: event.target.checked });

      // Refresh status after change
      const newStatus = await getFilterStatus();
      updateUI(newStatus);
    } catch (error) {
      console.error('Error toggling dry run mode:', error);
    }
  }

  // Function to toggle filter active state
  async function toggleActiveState() {
    const tab = await getActiveYouTubeTab();
    if (!tab) {return;}

    try {
      await browser.tabs.sendMessage(tab.id, {
        action: 'toggleActive',
        value: !currentStatus.isActive,
      });

      // Refresh status after change
      const newStatus = await getFilterStatus();
      updateUI(newStatus);
    } catch (error) {
      console.error('Error toggling active state:', error);
    }
  }

  // Function to open options page
  function openOptions() {
    browser.runtime.openOptionsPage();
  }

  // Set up event listeners
  toggleDryrunSwitch.addEventListener('change', toggleDryRun);
  toggleActiveButton.addEventListener('click', toggleActiveState);
  openOptionsButton.addEventListener('click', openOptions);

  // Initialize UI
  const initialStatus = await getFilterStatus();
  if (initialStatus) {
    updateUI(initialStatus);
    disableControls(false);
  }
});
