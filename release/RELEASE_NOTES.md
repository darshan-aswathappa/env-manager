# .envVault v1.2.0 — Diff Viewer, Import/Export & Project Context Menu

**March 25, 2026**

This release adds an environment diff viewer, multi-format import/export, variable duplication, rename propagation across environments, and a right-click project context menu.

---

## What's new

### Environment Diff Viewer

- Compare any two environments side-by-side in a unified diff view.
- Push individual variables from one environment to another directly from the diff panel.

### Import & Export

- Export variables from any environment in 5 formats: ENV, JSON, YAML, CSV, and Shell.
- Import with conflict resolution — choose to overwrite, skip, or merge on a per-key basis.

### Variable Duplication

- Clone any variable with a single click — key, value, and metadata are copied instantly.

### Rename Propagation

- Renaming a variable key now propagates the change across all environments in the project automatically.

### Project Context Menu

- Right-click any project in the sidebar for quick actions: rename, delete, and create a sub-project.

---

## Upgrading from v1.0.1

No data migration required. All existing projects and environments load without changes.

---

## Known limitations

- **macOS only.** Windows and Linux builds are not yet available.
- **No cloud sync.** All data is local to your machine.
- **No team sharing.** There is no mechanism for sharing secrets across team members.
- **No encryption-at-rest.** Values are stored as plaintext in the Tauri app data directory.

---

## Tech stack

Tauri v2, React 18, TypeScript, Vite, Tailwind CSS v4, Vitest.
