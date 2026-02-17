# Development Guide

This guide is for developers who want to contribute to or modify the Investment Tracker Card.

## Table of Contents
- [Project Structure](#project-structure)
- [Setup](#setup)
- [Building](#building)
- [Development Workflow](#development-workflow)
- [Code Quality](#code-quality)
- [Release Process](#release-process)

## Project Structure

```
investment-tracker-card/
├── src/
│   └── investment-tracker-card.js    # Main card component
├── dist/
│   └── investment-tracker-card.js    # Built and minified output
├── rollup.config.js                  # Build configuration
├── package.json                      # Dependencies and scripts
├── .eslintrc.json                    # Linting rules
└── README.md                         # User documentation
```

## Setup

### Prerequisites
- Node.js 16+ and npm
- Git

### Installation
```bash
# Clone the repository
git clone https://github.com/jo-anb/investment-tracker-card.git
cd investment-tracker-card

# Install dependencies
npm install
```

## Building

### Development Build
```bash
npm run build
```
Creates an unminified `dist/investment-tracker-card.js` for local testing.

### Watch Mode
```bash
npm run watch
```
Automatically rebuilds the card whenever you edit source files. Useful during development.

### Production Build
The production build is generated automatically during the release process.

## Development Workflow

### 1. Make Your Changes
Edit files in the `src/` directory. The main component is `src/investment-tracker-card.js`.

### 2. Test Locally
```bash
npm run build
```
Copy the generated `dist/investment-tracker-card.js` to your Home Assistant `config/www/` directory and reload your Lovelace dashboard.

### 3. Use Watch Mode for Rapid Development
```bash
npm run watch
```
This rebuilds automatically as you make changes, allowing for quick iteration.

### 4. Lint Your Code
```bash
npm run lint
```
Validates your JavaScript against the ESLint rules. Fix any issues before committing.

### 5. Commit and Push
```bash
git add .
git commit -m "Describe your changes"
git push
```

## Code Quality

### ESLint
Code is automatically linted using ESLint (see `.eslintrc.json`). Common rules:
- Proper variable declarations
- Consistent indentation (2 spaces)
- No unused variables
- Semicolons required

To fix linting issues automatically:
```bash
npm run lint -- --fix
```

### Best Practices
- Keep functions focused and single-purpose
- Add meaningful comments for complex logic
- Use descriptive variable names
- Follow existing code style in the codebase

## Release Process

### Semantic Versioning
Releases follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes to the card API or configuration
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes, no API changes

### Publishing a Release
The release process is **automated via CI/CD** using a GitHub App:

1. **Create a Pull Request** with your changes
2. **Merge to main** once reviewed and approved
3. **Semantic Release** automatically:
   - Detects the type of change (major/minor/patch)
   - Updates `package.json` version
   - Generates a CHANGELOG entry
   - Creates a GitHub release
   - Triggers HACS update

**Note**: The release workflow uses a GitHub App for authentication. See [GitHub App Setup](.github/GITHUB_APP_SETUP.md) for configuration details.

### Manual Release (If Needed)
If you need to manually release:

```bash
# Requires GH_TOKEN environment variable with GitHub credentials
npm run release
```

## Architecture Notes

### Card Lifecycle
- **Initialization** – Component registers with Home Assistant, loads configuration
- **Update** – Triggered when Home Assistant state updates (e.g., new asset data)
- **Rendering** – HTML is generated and inserted into the DOM
- **Event Handling** – User interactions (clicks, filters, refreshes) trigger service calls

### Key Methods
- `getCardSize()` – Returns Lovelace grid units the card occupies
- `getDefaultConfig()` – Provides default configuration
- `render()` – Generates and returns the card HTML
- `setConfig()` – Validates and stores card configuration

### State Management
- Card configuration is stored in `this.config`
- Hass (Home Assistant) state is accessed via `this.hass`
- Internal state is stored in instance properties (e.g., `this._selectedAssetEntityId`)

## Troubleshooting Development Issues

### Changes Not Reflecting
1. Ensure the build completed: `npm run build`
2. Clear your browser cache or do a hard reload (Ctrl+Shift+R / Cmd+Shift+R)
3. Verify the file path in Lovelace matches the actual file location

### ESLint Errors
```bash
npm run lint -- --fix
```
Automatically fixes most common issues.

### Module Not Found
Ensure you're running `npm install` after pulling new changes.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and commit (`git commit -am 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Create a Pull Request

Please include a clear description of:
- What problem your changes solve
- How to test the changes
- Any new dependencies you added

## Questions or Need Help?

Open an issue on [GitHub](https://github.com/jo-anb/investment-tracker-card/issues) with:
- Description of the issue or feature request
- Steps to reproduce (for bugs)
- Expected vs. actual behavior
