# .envVault

A local-only macOS app for managing `.env` files and secrets across multiple projects.

<!-- Add screenshot here -->
![.envVault screenshot](docs/screenshot.png)

## Features

### Core
- Add project folders from the filesystem — existing `.env` files are auto-imported
- Sub-project support with parent-child hierarchy
- Collapsible project tree in the sidebar
- Create, read, update, and delete environment variables
- Save variables back to the `.env` file on disk
- Search and filter variables within a project

### Security
- Secret values masked by default — toggle reveal per variable
- Clipboard auto-clears after copying a secret (configurable delay)
- Auto-mask after inactivity (configurable timeout)
- Delete confirmation for destructive operations
- Gitignore status indicator per project

### Shell Integration
- Shell hook that auto-loads env vars when you `cd` into a project directory
- Supports zsh, bash, and fish
- Guided onboarding flow that installs and verifies the hook

## Prerequisites

- Node.js 18+
- Rust (latest stable via [rustup](https://rustup.rs))
- Xcode Command Line Tools: `xcode-select --install`

## Getting Started

```bash
git clone https://github.com/your-org/env-manager.git
cd env-manager
npm install
npm run tauri dev
```

## Building for Production

```bash
npm run tauri build
```

The bundled `.app` and `.dmg` are written to `src-tauri/target/release/bundle/`.

## Running Tests

```bash
npm test                 # Run all tests once
npm run test:coverage    # Run tests with coverage report
```

## Architecture Overview

.envVault is a Tauri v2 app. The React/TypeScript frontend handles all UI state, and file system operations — reading, writing, and watching `.env` files — are executed through Rust commands exposed by the Tauri backend. Values are written to the Tauri app data directory on disk; nothing is stored in `localStorage` and no data leaves the machine. The app data directory path is shown in Settings and can be copied to inspect or back up your data.

## Configuration

All settings are accessible from the Settings page.

| Setting | Default | Description |
|---|---|---|
| Default shell | `zsh` | Shell used for hook generation (`zsh`, `bash`, `fish`) |
| Inheritance mode | `merge-child-wins` | How parent and child project vars are combined (see below) |
| Auto-mask timeout | `5` minutes | Minutes of inactivity before values are re-masked (`0` = never) |
| Clipboard clear delay | `30` seconds | Seconds before clipboard is cleared after copying a secret (`0` = off) |
| App data directory | system path | Read-only path to where .envVault stores your data |

Settings also include a danger zone with two actions: reset the onboarding flow, and clear all data (requires typing `RESET` to confirm).

## Inheritance

When a project has a parent project, .envVault determines which variables are visible using the inheritance mode.

### Merge — child wins
Variables from both parent and child are merged. When the same key exists in both, the child's value takes precedence. Use this when a child project needs to override specific parent defaults.

### Merge — parent wins
Variables from both parent and child are merged. When the same key exists in both, the parent's value takes precedence. Use this when a parent project holds authoritative values that children should not override.

### Isolated
Parent variables are ignored entirely. The project only sees its own `.env` file. Use this when a child project is self-contained and should not inherit anything.

## Shell Integration

The shell hook watches directory changes and automatically exports variables from the matching project's `.env` file when you `cd` into a project directory.

To install the hook, complete the onboarding flow (launched on first run, or reset from Settings). The onboarding guides you through adding the hook to your shell config file (`~/.zshrc`, `~/.bashrc`, or `~/.config/fish/config.fish`) and verifies it is active.

To verify the hook is working after installation:

```bash
# Open a new shell session, then cd into a registered project directory
cd /path/to/your/project
echo $YOUR_ENV_VAR     # should print the value from your .env file
```

To remove the hook, delete the lines added by .envVault from your shell config file and open a new shell session.

## Security Model

- Values are stored as plaintext in the Tauri app data directory — there is no encryption at rest.
- No data is sent to any network. The app makes no outbound connections.
- Secret values are masked in the UI by default and must be explicitly revealed.
- The clipboard is cleared automatically after copying a secret (configurable; off by default when set to `0`).
- Values are never written to `localStorage` or any browser-accessible storage.
- Destructive actions (delete, clear all data) require explicit confirmation.

## Known Limitations

- macOS only — Windows and Linux are not supported in v1.0.1.
- No encryption at rest — values are stored as plaintext in the app data directory.
- No cloud sync and no team sharing — all data is local to the machine.
- Single `.env` file per project — `.env.local`, `.env.production`, and similar variants are not supported yet.

## License

MIT
