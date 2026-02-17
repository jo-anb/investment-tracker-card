# GitHub Workflows & Configuration

This directory contains GitHub-specific configurations and documentation.

## Files

- **workflows/**: GitHub Actions workflow definitions
  - `release.yml`: Automated semantic release workflow
  - `validate.yml`: HACS validation workflow
- **GITHUB_APP_SETUP.md**: Instructions for setting up a GitHub App for semantic releases
- **CODEOWNERS**: Code ownership definitions
- **FUNDING.yml**: Sponsorship/funding information
- **dependabot.yml**: Dependabot configuration for dependency updates

## Semantic Release Setup

The release workflow uses a GitHub App for authentication instead of the default `GITHUB_TOKEN`. This provides better integration and allows the release process to trigger other workflows.

**To set up or update the GitHub App**, see [GITHUB_APP_SETUP.md](./GITHUB_APP_SETUP.md).
