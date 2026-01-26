# Submodule Manager

A modern VS Code extension for managing Git submodules with a beautiful UI. Create branches, sync versions, and manage pull requests across multiple submodules with ease.

## Features

### Modern Dashboard
- **Visual Overview**: See all your submodules at a glance with status indicators
- **Quick Stats**: Track clean, modified, and problematic submodules
- **Search & Filter**: Quickly find submodules in large projects

### Branch Management
- **Create Branches Across Submodules**: Create a feature branch in multiple submodules simultaneously
- **Checkout**: Switch branches with a visual branch picker
- **Push/Pull**: Sync changes with remote repositories

### Version Synchronization
- **Sync All**: Update all submodules to their configured branches
- **Status Tracking**: See ahead/behind counts for each submodule
- **Stage Changes**: Stage submodule pointer changes in the parent repo

### Pull Request Support
- **Quick PR Creation**: Open GitHub PR creation page directly
- **GitHub Integration**: Configure a token for advanced PR features

## Installation

### From Source
1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Press `F5` in VS Code to launch the extension in development mode

### From VSIX
1. Download the `.vsix` file from releases
2. In VS Code, go to Extensions (`Ctrl+Shift+X`)
3. Click the `...` menu and select "Install from VSIX..."
4. Select the downloaded file

## Usage

### Opening the Manager
- **Command Palette**: `Ctrl+Shift+P` → "Open Submodule Manager"
- **Keyboard Shortcut**: `Ctrl+Shift+G M` (Mac: `Cmd+Shift+G M`)
- **Activity Bar**: Click the Submodule Manager icon in the sidebar

### Creating a Branch Across Submodules
1. Open the Submodule Manager panel
2. Click "Create Branch" button
3. Enter the branch name (e.g., `feature/my-feature`)
4. Enter the base branch (default: `main`)
5. Select which submodules should have the new branch
6. Click "Create Branch"

### Syncing Submodules
1. Open the Submodule Manager panel
2. Click "Sync Versions" or use the sync button on individual submodules
3. All submodules will be updated to their configured remote branches

### Managing Individual Submodules
Each submodule card provides quick actions:
- **Checkout**: Switch to a different branch
- **Pull**: Fetch and merge changes from remote
- **Push**: Push local changes to remote
- **PR**: Open GitHub to create a pull request
- **Open**: Reveal the submodule folder in Explorer
- **Stage**: Stage the submodule pointer change

## Configuration

Access settings via `File > Preferences > Settings` and search for "Submodule Manager".

| Setting | Description | Default |
|---------|-------------|---------|
| `submoduleManager.defaultBranch` | Default branch name for new branches | `main` |
| `submoduleManager.autoFetch` | Auto-fetch when opening panel | `true` |
| `submoduleManager.showNotifications` | Show operation notifications | `true` |
| `submoduleManager.githubToken` | GitHub token for PR operations | `""` |

### GitHub Token Setup
For advanced PR features, create a personal access token:
1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate a new token with `repo` scope
3. Copy the token and paste it in the extension settings

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+G M` | Open Submodule Manager |
| `Ctrl+Shift+G R` | Refresh submodules |

## Requirements

- VS Code 1.74.0 or higher
- Git 2.20.0 or higher
- Node.js (for development)

## Extension Views

### Submodule List
Shows all submodules with:
- Status indicator (clean/modified/uninitialized/detached)
- Current branch
- Ahead/behind remote counts

### Quick Actions
Provides one-click access to common operations:
- Open Manager Panel
- Create Branch
- Sync Versions
- Initialize All
- Update All
- Refresh

## Development

### Building
```bash
npm install
npm run compile
```

### Watching for Changes
```bash
npm run watch
```

### Linting
```bash
npm run lint
```

### Packaging
```bash
npm run package
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) for details.

## Changelog

### 1.0.0
- Initial release
- Modern webview UI with dashboard
- Branch creation across multiple submodules
- Version synchronization
- GitHub PR integration
- Tree view sidebar with quick actions
