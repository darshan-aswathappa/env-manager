# .envVault v1.0.0 — Initial Release

**March 24, 2026**

.envVault is a desktop utility for managing `.env` files and secrets across multiple projects. It runs locally on macOS, stores values on disk via Tauri's app data directory, and never touches localStorage or the network.

---

## What's included

### Project Management

- Add project folders from your filesystem. Existing `.env` files are auto-imported on add.
- Sub-project support with parent-child hierarchy and configurable inheritance modes.
- Collapsible project tree in the sidebar for navigating large workspaces.
- Gitignore status indicator per project — see at a glance whether your `.env` is tracked.

### Environment Variables

- Create, read, update, and delete variables per project.
- Save changes back to the `.env` file on disk.
- Secret masking enabled by default. Toggle visibility per variable.
- Copy values to clipboard with an optional auto-clear timer.

### Shell Integration

- Generate shell export snippets for zsh, bash, and fish.
- Default shell is configurable in settings.

### Onboarding

- First-run flow that walks through core concepts: adding projects, managing variables, and understanding inheritance.
- Can be reset from settings at any time.

### Settings

- Default shell selection (zsh, bash, fish).
- Inheritance mode: `merge-child-wins`, `parent-wins`, or `child-only`.
- Auto-mask timeout (minutes).
- Clipboard auto-clear duration (seconds).
- Reset onboarding and clear all data options.

---

## Security model

- Variable values are stored in Tauri's app data directory on disk. They are never written to localStorage or transmitted over the network.
- Values are masked by default in the UI. Revealing a value requires an explicit toggle.
- Delete operations require confirmation.
- There is no encryption-at-rest beyond OS-level file permissions. If your disk is unencrypted, your secrets are unencrypted.

---

## Installation

> Installation instructions will be published with the first distributable build. For now, clone the repository and run `npm run tauri dev`.

---

## Known limitations

- **macOS only.** Windows and Linux builds are not yet available.
- **No cloud sync.** All data is local to your machine.
- **No team sharing.** There is no mechanism for sharing secrets across team members.
- **No encryption-at-rest.** Values are stored as plaintext in the Tauri app data directory.
- **No multi-file support.** Each project manages a single `.env` file. `.env.local`, `.env.production`, etc. are not yet supported.

---

## Tech stack

Tauri v2, React 18, TypeScript, Vite, Tailwind CSS v4, Vitest.
