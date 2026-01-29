# Changelog

All notable changes to the Submodule Manager extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-01-29

### Added
- **Branch Naming Tool**: New intelligent branch creation with auto-formatting
  - Input task title (e.g., "Design and Implement XML Parser Abstraction Class")
  - Auto-converts to kebab-case branch names
  - Optional ticket ID prefix (e.g., ECPT-15474)
  - Live preview of generated branch name

- **Branch Hierarchy Rules**: Enforced branch naming conventions based on base branch
  - From `main`/`master`: Can create `bugfix/`, `release/`, `dev/` branches
  - From `dev`: Can create `feature/` branches
  - From `feature`: Can create `task/` branches
  - Dynamic prefix options update based on selected base branch

- **Base Branch Selection**: Dropdown with available branches
  - Shows all local branches from the repository
  - Current branch selected by default
  - Displays branch type hints

- **Review Step After Branch Creation**: New confirmation modal
  - Shows success/failure status for each submodule
  - Displays the generated branch name
  - Option to push to remote after confirmation

- **Push to Remote**: Integrated push functionality
  - Push newly created branches directly from the review modal
  - Also available in the quick action command palette flow

### Changed
- Release branch prefix changed from `Release/` to lowercase `release/`
  - Example: `release/HexOGen_10.54.0`
- Base branch input changed from text field to dropdown selector
- Quick action "Create Branch" command now follows the same workflow:
  - Step-by-step guided flow with prefix selection
  - Branch hierarchy enforcement
  - Push option after creation

### Branch Naming Conventions
- **bugfix/feature/task**: `{prefix}/{ticket-id}-{kebab-case-title}`
  - Example: `feature/ECPT-15474-design-and-implement-xml-parser`
- **release**: `release/{ProductName}_{version}`
  - Example: `release/HexOGen_10.54.0`
- **dev**: `dev/{kebab-case-name}`
  - Example: `dev/sprint-42`

---

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
