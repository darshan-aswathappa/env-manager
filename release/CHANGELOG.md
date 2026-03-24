# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-03-24

### Added

- Project folder management with auto-import of existing `.env` files.
- Sub-project support with parent-child hierarchy.
- Collapsible project tree in sidebar.
- Environment variable CRUD operations (create, read, update, delete).
- Save variables to `.env` file on disk via Tauri filesystem API.
- Secret masking enabled by default with per-variable visibility toggle.
- Copy to clipboard with configurable auto-clear timer.
- Gitignore status check per project.
- Shell export snippet generation for zsh, bash, and fish.
- Settings page with default shell selection, inheritance mode (`merge-child-wins`, `parent-wins`, `child-only`), auto-mask timeout, and clipboard auto-clear duration.
- First-run onboarding flow with reset option in settings.
- Delete confirmation dialogs for destructive operations.
- Clear all data option in settings.
- Dashboard statistics overview.
- Test coverage with Vitest.

### Changed

- Renamed application to .envVault (from initial working name).
- Refined UI/UX across sidebar, variable editor, and settings views.
- Improved dashboard statistics display.

### Fixed

- Password/secret visibility toggle not working correctly.

### Security

- Variable values stored in Tauri app data directory, never in localStorage.
- Secret values masked by default in all UI surfaces.
- Clipboard auto-clear to prevent secret leakage.

### Removed

- GitGuardian integration (added and removed during development; not included in release).
