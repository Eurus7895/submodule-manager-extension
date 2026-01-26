# Changelog

All notable changes to the Submodule Manager extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-26

### Added
- Modern webview dashboard with real-time submodule status
- Visual status cards for each submodule showing:
  - Current branch and commit
  - Status (clean, modified, uninitialized, detached, conflict)
  - Ahead/behind remote counts
- Branch creation across multiple submodules simultaneously
- Quick actions for individual submodules:
  - Checkout branch
  - Pull changes
  - Push changes
  - Create pull request (opens GitHub)
  - Open in Explorer
  - Stage submodule changes
- Tree view sidebar with:
  - Collapsible submodule list
  - Quick actions panel
- Version synchronization to configured branches
- Search and filter submodules
- Bulk selection for batch operations
- GitHub PR integration
- Configurable settings:
  - Default branch name
  - Auto-fetch on panel open
  - Notification preferences
  - GitHub token for API access
- Keyboard shortcuts:
  - `Ctrl+Shift+G M` - Open manager panel
  - `Ctrl+Shift+G R` - Refresh submodules
- File system watcher for auto-refresh when .gitmodules changes

### Technical
- TypeScript implementation
- Webview with VS Code theme integration
- CSP-compliant security
- Efficient git operations with proper error handling
