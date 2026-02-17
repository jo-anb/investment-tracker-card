# GitHub App Setup for Semantic Release

This guide walks you through creating a GitHub App to use with the semantic-release workflow instead of the default `GITHUB_TOKEN`.

## Why Use a GitHub App?

Using a GitHub App instead of the default `GITHUB_TOKEN` provides several benefits:
- **Triggers Other Workflows**: The default `GITHUB_TOKEN` cannot trigger other workflow runs, but a GitHub App can
- **Fine-Grained Permissions**: More control over what the app can access
- **Higher Rate Limits**: GitHub Apps have higher API rate limits
- **Cross-Repository**: Can be used across multiple repositories in your organization

## Creating the GitHub App

### Step 1: Create a New GitHub App

1. Go to your GitHub account settings:
   - For personal accounts: `Settings` → `Developer settings` → `GitHub Apps` → `New GitHub App`
   - For organizations: `Organization Settings` → `Developer settings` → `GitHub Apps` → `New GitHub App`

2. Fill in the required fields:
   - **GitHub App name**: `semantic-release-bot` (or any unique name)
   - **Homepage URL**: Your repository URL (e.g., `https://github.com/jo-anb/investment-tracker-card`)
   - **Webhook**: Uncheck "Active" (not needed for this use case)

3. Set the required **Repository permissions**:
   - **Contents**: `Read and write` (to push commits and tags)
   - **Metadata**: `Read-only` (automatically set)
   - **Pull requests**: `Read and write` (to comment on PRs)
   - **Issues**: `Read and write` (to comment on issues)

4. Under **Where can this GitHub App be installed?**:
   - Select "Only on this account"

5. Click **Create GitHub App**

### Step 2: Generate a Private Key

1. After creating the app, scroll down to the **Private keys** section
2. Click **Generate a private key**
3. A `.pem` file will be downloaded to your computer
4. **Keep this file secure** - you'll need it in the next step

### Step 3: Install the App on Your Repository

1. Go to the app's settings page
2. Click **Install App** in the left sidebar
3. Click **Install** next to your account/organization
4. Choose **Only select repositories**
5. Select `investment-tracker-card` (or the repository you want to use it with)
6. Click **Install**

### Step 4: Configure Repository Secrets

You need to add two secrets to your repository:

1. Go to your repository: `Settings` → `Secrets and variables` → `Actions` → `New repository secret`

2. Add the **App ID**:
   - Name: `APP_ID`
   - Value: The App ID from your GitHub App settings page (it's a number like `123456`)

3. Add the **Private Key**:
   - Name: `APP_PRIVATE_KEY`
   - Value: The entire contents of the `.pem` file you downloaded earlier
   - Open the file in a text editor and copy everything, including the `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----` lines

## Verifying the Setup

After updating the workflow file (see next section), the semantic-release action will:
1. Use the GitHub App credentials to authenticate
2. Generate a temporary token with the app's permissions
3. Use that token to create releases, update changelogs, and push commits

You can verify it's working by:
1. Making a commit to the `main` branch with a conventional commit message (e.g., `feat: test github app`)
2. Checking the Actions tab to see if the release workflow runs successfully
3. Verifying that a new release is created if the commit triggers one

## Troubleshooting

### "App not installed" Error
- Make sure you installed the GitHub App on your repository (Step 3)
- Verify the App ID is correct in the repository secrets

### "Invalid private key" Error
- Ensure you copied the entire `.pem` file contents, including the header and footer lines
- Make sure there are no extra spaces or line breaks

### Permission Denied Errors
- Check that the GitHub App has the correct repository permissions (Step 1, point 3)
- You may need to adjust permissions in the app settings and reinstall it

## Security Best Practices

1. **Never commit the private key** to your repository
2. **Rotate the private key** periodically by generating a new one in the app settings
3. **Limit app permissions** to only what's needed
4. **Review app activity** regularly in the GitHub App settings
5. **Use repository secrets** (not environment secrets) for better security

## Additional Resources

- [GitHub Apps Documentation](https://docs.github.com/en/apps)
- [Authenticating with a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app)
- [Semantic Release Documentation](https://semantic-release.gitbook.io/)
