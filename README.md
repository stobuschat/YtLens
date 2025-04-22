# YtLens - YouTube Content Filter

## Overview

YtLens is a Firefox extension that allows you to filter YouTube videos based on languages, keywords, and other criteria. It helps you customize your YouTube viewing experience by hiding unwanted content.

## Known Limitations

- "Not Interested" button might be missing in some cases and hence this extension won't work.
  - e.g. when not beeing logged in?

## Features

- **Flexible Filtering Rules**: Filter content using regex patterns or keywords
- **Filtering Modes**:
  - Blacklist - hide videos matching specified patterns
  - Whitelist - show only videos matching specified patterns
  - Combined mode - use both lists with prioritization
- **Filtering Targets**:
  - Video titles
  - Channel names
  - Video descriptions
- **Dry Run Mode**: Highlight filtered videos without hiding them
- **Multiple Language Support**: Built-in patterns for many languages
- **User Interface**:
  - Quick toggle in popup
  - Detailed options page for rule management
  - Dark/Light theme support

## Installation

### Developer Installation (Firefox)

1. Clone the repository:

2. Build the extension:

   ```bash
   web-ext build --overwrite-dest -s extension
   ```

   Or create a `.zip` file of the needed files (e.g. content of extension directory).

3. **Temporary Installation in Firefox**:
   - Open Firefox and navigate to `about:debugging`
   - Click "This Firefox" in the left sidebar
   - Click "Load Temporary Add-on..."
   - Select the `manifest.json` file from the `extension` directory

4. **Installation in Firefox**:
   - Open Firefox and navigate to settings
   - Disable signature verification
     1. Go to `about:config` in Firefox
     2. Set `xpinstall.signatures.required` to `false`
     3. On Android: Configure `chrome://geckoview/content/config.xhtml` with the same setting
   - Activate "Developer Mode" in the Add-ons section
   - Click "Install Add-on From File..."
   - Select the `.zip` file you created in step 2

## Usage

### Basic Usage

1. After installation, click the YtLens icon in the toolbar
2. Use the popup to check status and toggle dry run mode
3. Click "Options" to configure filtering rules

### Configuration

In the options page, you can:

1. **Manage Filter Rules**:
   - Create, edit, or delete blacklist/whitelist rules
   - Configure detection targets (title, description, channel)
   - Set regex patterns and keywords

2. **Global Settings**:
   - Toggle blacklist/whitelist functionality
   - Enable/disable dry run mode for testing
   - Configure YouTube interface language

3. **Import/Export**:
   - Import rules from JSON files
   - Export your rules for backup or sharing

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and commit: `git commit -am 'Add new feature'`
4. Push to the branch: `git push origin feature-name`
5. Create a Pull Request

## License

This project is licensed under the Mozilla Public License (version 2.0, MPL-2.0) - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- Thanks to all contributors who have helped improve YtLens
- Mozilla for providing the WebExtensions API

## Privacy

YtLens operates entirely within your browser. No data is collected or transmitted to external servers.
