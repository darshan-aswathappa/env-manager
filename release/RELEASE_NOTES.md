# .envVault v1.0.1 — Multi-Environment Support

**March 24, 2026**

This patch release adds support for managing multiple environment files per project — `.env`, `.env.local`, `.env.production`, and any other `.env.*` variant.

---

## What's new

### Multi-Environment Support

- Each project now detects and manages all `.env.*` files (`.env`, `.env.local`, `.env.production`, `.env.staging`, etc.).
- New environment toggle dropdown in the variable detail view lets you switch between environments without leaving the project.
- Variable counts are displayed per environment in the dropdown for quick orientation.
- The Rust backend now reads and writes to the correct `.env.*` file based on the active environment selection.

### UI Improvements

- Sidebar and variable list layout refinements.
- Variable detail view updated to scope variables to the selected environment.

---

## Upgrading from v1.0.0

No data migration required. Existing projects will automatically detect additional `.env.*` files on next load. Your existing `.env` data is untouched.

---

## Known limitations

- **macOS only.** Windows and Linux builds are not yet available.
- **No cloud sync.** All data is local to your machine.
- **No team sharing.** There is no mechanism for sharing secrets across team members.
- **No encryption-at-rest.** Values are stored as plaintext in the Tauri app data directory.

---

## Tech stack

Tauri v2, React 18, TypeScript, Vite, Tailwind CSS v4, Vitest.
