# Story 2: Import & Export (Multi-Format)

> Plan authored with input from UX Researcher, Senior Developer (React/TypeScript), Backend Engineer (Rust/Tauri), and Technical Writer.
> Follows the TDD workflow: Red → Green → Refactor, with 80%+ coverage required.

---

## 1. Requirements Restatement

**Goal:** Allow developers to move environment variable data into and out of envVault using the file formats they already work with — dotenv, JSON, YAML, CSV, and shell export syntax — without ever leaving the app or writing conversion scripts.

**Scope:**

- **Single-environment import** — parse an external file in any supported format, preview the parsed variables alongside the current active environment, resolve conflicts per-key or globally, and commit the result into the active environment's var list.
- **Single-environment export** — serialize the current active environment's vars to any supported format and trigger an OS save dialog to write the file to disk.
- **Multi-environment export** — serialize all environments for a project in a chosen format, bundle them into a ZIP archive, and trigger an OS save dialog.
- **Format auto-detection on import** — identify the incoming format from the file extension first, with content sniffing as a fallback, so the user is never prompted to select a format they already signaled by file name.
- **Import preview** — display a preview table of parsed key/value pairs with conflict status badges before any changes are committed to state. Identical to the mental model established by `PushToStagePanel`.
- **Value masking in export preview** — values in the export preview pane are masked by default; a deliberate "Reveal & Export" toggle unmasks them. This maintains the app's security posture across the entire surface area.

**Out of scope for this story:**

- Importing directly from a URL or remote environment service
- Two-way sync with external files (watch mode)
- Merging imports across multiple environments simultaneously
- Bulk-import from a directory (that is `import_all_envs_from_project`'s job, already implemented)
- Diff-based import merging (use Story 1's DiffViewPanel for post-import review)

---

## 2. User Research Insights

*Source: UX Researcher analysis*

### Mental Model Mapping

Developers carry a strong pre-existing model for "Export" from tools like Postman, Insomnia, and database clients: pick a format, optionally preview, hit save. The key insight is that they expect **format selection to be trivial and reversible** — switching from JSON to YAML should update the preview instantly with no destructive consequences.

For "Import," the dominant mental model is file-drop-or-pick → instant preview → confirm. Developers expect to see what they are about to import before it touches their data. Any dialog that commits data on open (no preview step) will feel hostile.

The conflict resolution model maps cleanly onto what already exists in the `PushToStagePanel` flow. Reusing the `overwrite` / `skip` vocabulary and the per-key toggle pattern removes the need for users to learn new mental models. The only new concept is the import preview table itself, which follows the same key / status badge / value pattern used in the diff view.

### Entry Points

**Import:**
- Primary: **"Import" button** in the `VarList` header area, positioned alongside the existing "Add Variable" affordance. Label: "Import", icon: upload arrow into a box.
- Secondary: **Cmd+I** keyboard shortcut. Guard: a project must be selected.
- Disabled state: button is present but disabled (with tooltip "Select a project first") when no project is active.

**Export:**
- Primary: **"Export" button** in the `VarDetail` toolbar row, positioned alongside the existing "Compare Environments" button added in Story 1. Label: "Export", icon: download arrow out of a box.
- Secondary: **Cmd+E** keyboard shortcut. Guard: a project must be selected and the active environment must have at least one variable.
- Disabled state: button present but disabled (with tooltip "No variables to export") when active env is empty.

**Mutual exclusion:** Import dialog, Export panel, Diff panel, and Push panel are all mutually exclusive. Opening any one closes the others. This is consistent with the existing PushToStagePanel / DiffViewPanel mutual exclusion already enforced in `App.tsx`.

### Format Selection UX

A **segmented control** (pill-style) is preferred over a dropdown for format selection because there are exactly five formats and users benefit from seeing all options at once. Each segment contains a short label only: `ENV`, `JSON`, `YAML`, `CSV`, `Shell`. No icons — the labels are unambiguous at this scope. The segmented control appears in both the Export panel (for format and scope selection) and in the Import dialog step 2 (for manual override after auto-detection).

### Import Flow

The import flow is a **four-step modal dialog**:

1. **Pick file** — Tauri's `open` dialog filtered to relevant extensions. The user sees a centered modal with a single call to action.
2. **Preview** — The file is read and parsed. The user sees a table: key name, import status badge (New / Same / Conflict), source value masked, current value masked. Format can be manually overridden here if auto-detection guessed wrong.
3. **Resolve conflicts** — A conflict resolution UI appears only if conflicting keys exist. Global "Overwrite All" / "Skip All" buttons plus per-key toggles for granular control.
4. **Done** — A success toast shows how many keys were added, overwritten, and skipped. The dialog closes automatically after 1.2s or on manual dismiss.

Steps 2 and 3 can be collapsed into a single view when there are no conflicts (the table shows only "New" and "Same" badges and a single "Import N variables" commit button).

### Export Flow

The export flow is a **slide-in panel from the right**, following the same structural pattern as `PushToStagePanel` and `DiffViewPanel`:

1. Format selector (segmented control, defaults to `ENV`).
2. Scope selector: "Active env only" or "All environments (ZIP)". The ZIP option is clearly labeled as producing a `.zip` archive.
3. A read-only monospace preview pane with values masked by default.
4. A "Reveal values in preview" toggle — deliberate, labeled, not a hover affordance.
5. A "Save" button triggering the OS save dialog.

The preview pane updates instantly when format or scope changes. The reveal toggle only affects the preview; the saved file always contains real values regardless of toggle state (the preview mask is a display-layer concern only).

### Conflict Resolution Model

The existing `ConflictStrategy` type (`'overwrite' | 'skip'`) and `ConflictReport` interface (`newKeys`, `conflictSame`, `conflictDifferent`) from `src/types.ts` are reused directly for import conflict resolution. This is the same model used by `PushToStagePanel` and eliminates any need for new vocabulary or new types at this layer.

`conflictSame` keys (incoming value identical to current value) are auto-skipped silently and shown as "Same" badge in the preview — they do not appear in the conflict resolution step.

`conflictDifferent` keys require a decision: overwrite (replace current value with incoming) or skip (keep current value). Per-key decisions default to `overwrite`.

### Edge Cases

| Condition | Behavior |
|---|---|
| Empty import file | Step 2 preview shows "No variables found in this file." Commit button is disabled. |
| Duplicate keys in source file | Last-write-wins, matching `parseEnvContent` and `computeEnvDiff` behavior. A warning badge is shown in the preview: "N duplicate keys detected — last value used." |
| Unsupported file extension | Format detection falls back to content sniffing. If sniffing also fails, step 2 shows an error: "Could not determine format. Select a format manually." The format override control is highlighted. |
| All keys already present with identical values | All badges are "Same". Commit button shows "Import (0 changes)" and is styled as a secondary action. |
| YAML file with non-string values (numbers, booleans) | All parsed values are coerced to strings. A notice appears below the preview: "N values were coerced to string (YAML non-string types are not supported)." |
| Import into an empty environment | No conflict resolution step. All keys show "New" badge. |
| ZIP save dialog cancelled by user | Silent no-op. No error shown. Panel remains open. |

---

## 3. UI/UX Design Specification

*Source: UX Researcher + Senior Developer collaboration*

### 3.1 Import Dialog

The import dialog is a **centered modal** (not a slide-in panel) to signal "this requires your attention before proceeding." Width: 600px fixed, max-height: 80vh with internal scroll on the preview table.

**Step 1 — File Picker**

The modal renders immediately on Cmd+I or Import button click. The body contains:
- A large file-picker affordance (dashed border zone with "Choose File" button and drag-drop hint)
- Tauri's `open` dialog is triggered immediately when the user clicks "Choose File" or drops a file
- Supported extensions listed below the zone: `.env`, `.json`, `.yaml`, `.yml`, `.csv`, `.sh`
- A "Cancel" button in the footer

**Step 2 — Preview**

After file selection, the modal transitions to step 2 (no full re-render — animate content swap in-place, 200ms fade). Layout:
- Header row: detected format displayed as a read-only badge (e.g., "Detected: JSON"), with a "Change" link that reveals the format override segmented control
- Preview table with columns: **Key** | **Status** | **Incoming Value** | **Current Value**
  - Status badges: green "New" (key does not yet exist), amber "Conflict" (key exists with different value), muted "Same" (key exists with identical value)
  - Values masked as `••••••` by default in both Incoming and Current columns
  - A "Reveal values" toggle above the table affects all rows
  - Long key names truncate with ellipsis; full key shown on hover
- Row count summary: "N variables found (A new, B conflicts, C unchanged)"
- Footer: "Back" and "Next" (or "Import" if no conflicts exist)

**Step 3 — Conflict Resolution**

Only rendered when `conflictDifferent.length > 0`. Layout:
- A banner: "N conflicts found. Choose how to handle each one."
- Global action buttons: "Overwrite All" and "Skip All"
- A table showing only the conflicting keys, each row with a toggle: "Overwrite" (default, highlighted) | "Skip"
- Non-conflicting keys (new and same) are not shown here
- Footer: "Back" and "Import N variables" (count reflects decisions made — skipped keys not counted)

**Step 4 — Done**

After successful commit, the modal content transitions to a success state:
- A check icon and summary: "Imported N variables. A added, B updated, C unchanged."
- This state auto-dismisses after 1.2 seconds; a manual "Done" button is also present
- A success toast fires simultaneously (consistent with Push to Stage pattern)

**Animation:** Step transitions are content fades (200ms, `cubic-bezier(0.16, 1, 0.3, 1)`). The modal backdrop and container do not re-animate between steps — only the inner content.

---

### 3.2 Export Panel

The export panel is a **slide-in drawer from the right**, identical in structure to `PushToStagePanel`. Width: 480px. It renders over a semi-transparent backdrop. Mutual exclusion with all other panels enforced at `App.tsx` level.

**Panel anatomy (top to bottom):**

1. **Header** — "Export Variables", close button (×), keyboard hint "(Cmd+E)"
2. **Format selector** — segmented control: `ENV` | `JSON` | `YAML` | `CSV` | `Shell`. Defaults to `ENV`. Changing format updates the preview pane immediately (synchronous — no Tauri call needed).
3. **Scope selector** — two radio-style options:
   - "Active environment only" (default) — exports `project.activeEnv`
   - "All environments (ZIP)" — exports all suffixes; shows a note: "A `.zip` file containing one file per environment."
4. **Preview pane** — a `<pre>` with monospace font, read-only, scrollable, max-height ~40vh. Values are masked (`••••••`) by default. The preview shows the full serialized output for active env, or the first environment's content with a "…and N more files" note for ZIP scope.
5. **Reveal toggle** — "Show values in preview" checkbox. Toggling updates the preview pane in place. Does not affect what is saved to disk (the save always writes real values).
6. **Save button** — "Save File" for single-env export; "Save ZIP Archive" for all-envs export. Triggers the Tauri save dialog or the `export_envs_to_zip` command respectively. Disabled while any async operation is in progress (loading spinner replaces button label).
7. **Footer note** — "Saved files contain real values regardless of preview masking."

**Animation:** Slides in from right, 220ms, `cubic-bezier(0.16, 1, 0.3, 1)`. Slides out 180ms. Identical timing to DiffViewPanel.

---

### 3.3 Integration into Existing Layout

**VarList header** — "Import" button is added to the right side of the header row, to the left of any sort/filter controls. It matches the visual weight of existing header action buttons (small, icon+label).

**VarDetail toolbar** — "Export" button is added to the existing toolbar row that contains "Compare Environments" (Story 1). Positioned to the right of "Compare Environments". Same visual weight.

**Keyboard shortcuts:**
- `Cmd+I` — open Import dialog. Guard: project selected.
- `Cmd+E` — open Export panel. Guard: project selected, active env has vars.
- `Escape` — close whichever panel/dialog is currently open (consistent with existing escape handling).

---

## 4. Frontend Architecture

*Source: Senior Developer (React/TypeScript) analysis*

### 4.1 New Types — add to `src/types.ts`

**`ExportFormat`** — a union type representing the five supported serialization formats. Drives format selector UI and determines which serializer function is called. Values: `'env' | 'json' | 'yaml' | 'csv' | 'shell'`.

**`ExportScope`** — a union type representing the two export scopes. Values: `'active' | 'all'`. When `'all'`, the export command produces a ZIP.

**`ImportStep`** — a union type representing the four steps of the import dialog. Values: `'pick' | 'preview' | 'conflicts' | 'done'`. Drives which step content the modal renders. Used as discriminated-union state — no boolean flags needed alongside it.

**`ImportPreviewRow`** — represents one row in the import preview table. Fields: `key: string`, `status: 'new' | 'same' | 'conflict'`, `incomingVal: string`, `currentVal: string | null` (null when status is `'new'`). This is a display-layer type — computed from `buildImportConflictReport` output before rendering, not stored in global state.

These four types are the only additions required in `src/types.ts`. All other structures (conflict resolution, var representation) reuse existing types.

---

### 4.2 New Pure Library — `src/lib/envFormats.ts`

This file contains all format-specific parsing and serialization logic. It has **zero Tauri calls**, no side effects, and no React imports. It is a pure transformation library, making it fully unit-testable in isolation.

**Parsers — each takes a raw string and returns `EnvVar[]`:**

- `parseEnvFile(content, projectId?)` — thin wrapper around the existing `parseEnvContent` from `envFile.ts`. Exists here to give all parsers a uniform call signature and to keep `envFormats.ts` self-contained.
- `parseJson(content, projectId?)` — expects a flat JSON object (`{ KEY: value }`). All values are coerced to `string`. Throws a descriptive `FormatParseError` for non-object root values, nested objects, or arrays. Ignores keys with `null` values with a warning collected in the return's `warnings` array.
- `parseYaml(content, projectId?)` — uses the `js-yaml` library. Expects a flat YAML mapping. All scalar values are coerced to string (`String(value)`). Non-scalar values (sequences, nested mappings) are excluded with a warning. Duplicate YAML keys are handled by the library (last value wins in most implementations — document this).
- `parseCsv(content, projectId?)` — uses `papaparse`. Expects a two-column CSV with `key` and `value` headers (case-insensitive). If no headers are detected, assumes column 0 = key and column 1 = value. Skips blank rows. Quoted values are handled by PapaParse's default quoting rules.
- `parseShellExport(content, projectId?)` — handles lines of the form `export KEY=value`, `export KEY='value'`, and `export KEY="value"`. Strips the `export ` prefix then delegates to `parseEnvContent` logic for quote unescaping. Comment lines and blank lines are ignored. Lines without `export ` prefix are silently skipped (they may be shell script logic, not variable assignments).

**Return shape for all parsers:** `{ vars: EnvVar[], warnings: string[] }`. This avoids throw-on-warning behavior and lets the UI surface non-fatal issues (type coercions, skipped keys) without aborting the import. Fatal parse errors (invalid JSON, invalid YAML structure) are thrown as `FormatParseError` instances with a human-readable `.message`.

**Serializers — each takes `EnvVar[]` and returns a string:**

- `serializeDotenv(vars)` — wraps `serializeVars` from `envFile.ts`. Thin wrapper for uniform call signature.
- `serializeJson(vars)` — produces a compact-pretty JSON object (`JSON.stringify(obj, null, 2)`) with keys in original order.
- `serializeYaml(vars)` — uses `js-yaml`'s `dump()` function. Keys are quoted if they contain special YAML characters. Values are always emitted as YAML strings.
- `serializeCsv(vars)` — uses `papaparse`'s `unparse()` with a `["key", "value"]` header row. Values containing commas or quotes are automatically quoted by PapaParse.
- `serializeShellExport(vars)` — identical to `serializeDotenv` but every line is prefixed with `export `. Keys are validated to be valid shell identifiers; invalid keys are skipped with a warning in the return value.

**Return shape for all serializers:** `{ content: string, warnings: string[] }`. Warnings for skipped keys, coerced values, etc.

**Format detection:**

- `detectFormat(filename, content)` — returns `ExportFormat`. Detection priority:
  1. File extension: `.json` → `'json'`, `.yaml` or `.yml` → `'yaml'`, `.csv` → `'csv'`, `.sh` → `'shell'`, `.env` or no extension → `'env'`.
  2. Content sniffing (only if extension is unknown or ambiguous): trim the content and check if it starts with `{` (JSON), `---` or `key: ` pattern (YAML), `export ` (Shell), or comma-separated header row (CSV).
  3. Falls back to `'env'` if no heuristic matches confidently.

**Conflict report builder:**

- `buildImportConflictReport(incoming: EnvVar[], existing: EnvVar[])` — returns a `ConflictReport` (reusing the existing type from `types.ts`). Operates on key-name equality. Existing keys with identical values go into `conflictSame`. Existing keys with different values go into `conflictDifferent`. New keys go into `newKeys`. This function is the bridge between the import parser output and the conflict resolution UI.

---

### 4.3 New Components

**`src/components/Import/ImportDialog.tsx`**

A modal dialog component managing the four-step import flow. This is a self-contained component with all step state held locally. It does not write to `App.tsx` state until the commit step fires the `onImportComplete` callback.

Props:
- `project: Project` — the project whose active environment receives the import
- `onImportComplete: (mergedVars: EnvVar[]) => void` — called with the final merged var list after commit; App.tsx uses this to update `project.vars` and the active environment
- `onClose: () => void` — called on Cancel or after the "Done" step auto-dismisses

Internal state:
- `step: ImportStep` — current step in the flow
- `rawContent: string` — raw file content read via Tauri `open` dialog
- `filename: string` — for extension-based format detection
- `detectedFormat: ExportFormat` — result of `detectFormat(filename, rawContent)`
- `overrideFormat: ExportFormat | null` — user-selected format override (null = use detected)
- `parseResult: { vars: EnvVar[], warnings: string[] } | null` — result of parsing raw content
- `conflictReport: ConflictReport | null` — result of `buildImportConflictReport`
- `perKeyDecisions: Map<string, ConflictStrategy>` — per-key overwrite/skip decisions, initialized from conflict report
- `parseError: string | null` — fatal parse failure message

The effective format used for parsing is `overrideFormat ?? detectedFormat`.

The component does not call `invoke` directly. File reading is delegated to a parent-provided handler or a utility function in `envFile.ts`. The commit step calls `onImportComplete` with the merged `EnvVar[]` array, computed by `mergeVarsForImport` (a pure function in `envFormats.ts`).

**`src/components/Export/ExportPanel.tsx`**

A slide-in drawer component. Structurally mirrors `PushToStagePanel.tsx`.

Props:
- `project: Project` — source of vars and environment list
- `onClose: () => void`
- `onSaveComplete: () => void` — optional callback after successful file save (for success toast)

Internal state:
- `format: ExportFormat` — defaults to `'env'`
- `scope: ExportScope` — defaults to `'active'`
- `revealValues: boolean` — defaults to `false`
- `isSaving: boolean` — true while Tauri save dialog or ZIP command is in flight

The preview pane content is derived via a synchronous call to the appropriate serializer, with values conditionally masked. This is a computed value (`useMemo`), not stored state.

For single-env export, the save flow calls a Tauri `save` dialog plugin from the frontend, writes the serialized content, and fires `onSaveComplete`.

For multi-env (ZIP) export, the save flow calls the new `export_envs_to_zip` Tauri command, receives bytes, triggers a save dialog, and writes the ZIP.

---

### 4.4 App.tsx Additions

**New state:**
- `showImportDialog: boolean` — defaults to `false`
- `showExportPanel: boolean` — defaults to `false`

**New handlers:**
- `handleImportComplete(mergedVars: EnvVar[])` — receives the merged vars from `ImportDialog`, updates the active project's `vars` and the matching entry in `project.environments`, persists via `saveProjectEnv`, fires a success toast
- `handleExportSaveComplete()` — fires a success toast "File saved successfully"

**Keyboard shortcut additions** (inside existing `handleKeyDown` effect):
- `Cmd+I` — if project selected: close all other panels, set `showImportDialog = true`
- `Cmd+E` — if project selected and active env has vars: close all other panels, set `showExportPanel = true`

**Mutual exclusion helper:** Extract a `closeAllPanels()` inline function inside the keyboard handler that sets all four panel flags to `false` before opening the requested one. This is already an implicit pattern for PushToStage and Diff; making it explicit prevents future regressions.

**Render additions:** Import dialog and Export panel are rendered using the same conditional block + backdrop pattern as `PushToStagePanel` and `DiffViewPanel`.

---

### 4.5 New Dependencies

- `js-yaml` (npm) — YAML parse and serialize. Widely used, actively maintained, correct handling of multi-line strings and quoted scalars.
- `papaparse` (npm) — CSV parse and serialize. The most robust CSV library in the JS ecosystem; handles all quoting edge cases.
- Both packages have TypeScript type definitions available via `@types/js-yaml` and `@types/papaparse`.

---

## 5. Backend Architecture (Rust/Tauri)

*Source: Backend Engineer (Rust/Tauri) analysis*

### 5.1 Design Philosophy for This Feature

Format serialization (dotenv, JSON, YAML, CSV, Shell) is kept **entirely in TypeScript** (`envFormats.ts`) for the following reasons:

1. All five formats are text — no binary manipulation required before ZIP.
2. TypeScript parsers are directly unit-testable via Vitest without mocking IPC.
3. The Rust layer already reads/writes raw text strings via `load_project_env` and `save_project_env`; no new serialization primitives are needed.
4. YAML and CSV libraries are more mature and better-tested in the JS/TS ecosystem.

The Rust layer's responsibility is limited to: **ZIP generation** (binary) and **OS file dialogs** (platform-native). Everything else stays in TypeScript.

### 5.2 New Tauri Command: `export_envs_to_zip`

**Purpose:** Accept a set of pre-serialized environment file contents from the frontend and pack them into a ZIP archive in memory, returning the raw bytes to the frontend for the OS save dialog.

**Input struct:**
```
ZipExportRequest {
  files: Vec<ZipFileEntry>
}

ZipFileEntry {
  filename: String    // e.g., ".env", ".env.production", "production.json"
  content: String     // serialized content (already formatted by TypeScript)
}
```

The frontend is responsible for:
1. Iterating over all suffixes in `project.environments`
2. Loading each env's vars from in-memory state (no new disk reads needed)
3. Serializing each env's vars with the chosen format serializer
4. Building the `ZipFileEntry` array
5. Calling `export_envs_to_zip` with that array

**Return value:** `Vec<u8>` — the raw ZIP bytes.

**Implementation notes:**
- Uses the `zip` crate (add to `Cargo.toml` as a dependency under `[dependencies]`)
- Creates a `ZipWriter` backed by a `Cursor<Vec<u8>>`
- For each `ZipFileEntry`, writes a stored (no compression) zip entry with the filename and UTF-8 content bytes. Compression level is not critical for text files of this size; stored mode keeps the implementation simple.
- The function is synchronous and pure from the Tauri async executor's perspective — no file system access, only in-memory ZIP construction.
- Returns the bytes via the normal Tauri return mechanism; the frontend receives them as a `Uint8Array`.

### 5.3 File Save Mechanism

For **single-environment export**, the Tauri `dialog` plugin (`tauri-plugin-dialog`) provides a `save` dialog API callable from the frontend via the plugin's JavaScript bindings. The frontend calls `save({ defaultPath: suggestedFilename, filters: [...] })`, receives the chosen path (or null if cancelled), then calls the existing `save_project_env` command with the serialized content — or, if the save path is outside the app data dir, a new `write_file_to_path` command is needed (see below).

For **multi-environment ZIP export**, the frontend receives raw bytes from `export_envs_to_zip`, then uses the `dialog` plugin to get a save path, then calls a new `write_bytes_to_path` command to write the binary ZIP data to disk.

### 5.4 New Tauri Command: `write_bytes_to_path`

**Purpose:** Write arbitrary bytes to an absolute file path on disk. Used for saving the ZIP archive after the frontend receives raw bytes from `export_envs_to_zip` and the user selects a save path via the dialog.

**Input:** `path: String`, `data: Vec<u8>`

**Return:** `()` on success; Tauri error on failure (permissions, disk full, invalid path).

**Security constraint:** The path must not escape to a sensitive system directory. Validate that the path is not inside `/System`, `/Library`, `/usr/bin`, or similar read-only or privileged directories. Prefer allowing any user-writable path (home directory, desktop, downloads) rather than implementing a restrictive allowlist that breaks legitimate use cases.

### 5.5 New Tauri Command: `write_text_to_path`

**Purpose:** Write a UTF-8 string to an absolute file path. Used for single-environment export when the user picks a save path outside the app data directory.

**Input:** `path: String`, `content: String`

**Return:** `()` on success; Tauri error on failure.

**Why a separate command from `save_project_env`:** The existing `save_project_env` command writes to the app data directory using a sanitized project ID as the filename. It is not suitable for user-chosen paths. Rather than adding optional path override logic to that command (which would change its semantics), a new dedicated command keeps both commands simple and single-purpose.

### 5.6 Cargo.toml Dependency Addition

Add `zip = "2"` under `[dependencies]` in `src-tauri/Cargo.toml`. The `zip` crate is stable, widely used, and has no unsafe code in its core write path. Pin to major version 2 to avoid semver-breaking changes silently.

Verify that `tauri-plugin-dialog` is already in the dependency list; if not, add it and register it in `lib.rs`'s plugin initialization block.

### 5.7 Existing Command Reuse

No changes are needed to any existing Tauri commands. The data flow for multi-env ZIP is:
1. Frontend reads from `project.environments[n].vars` (already in memory — no new Tauri reads needed).
2. Frontend serializes each env's vars using `envFormats.ts` serializers (no Rust involvement).
3. Frontend builds `ZipFileEntry` array and calls `export_envs_to_zip`.
4. Rust packs the ZIP and returns bytes.
5. Frontend triggers save dialog (plugin), receives path.
6. Frontend calls `write_bytes_to_path`.

This uses three Tauri round-trips for the ZIP path: one for ZIP generation, one for dialog (plugin), one for writing. This is acceptable — the user interaction (selecting a save path) is the dominant latency, not the IPC calls.

---

## 6. TDD Test Plan

*Source: Technical Writer + Senior Developer*

All tests follow **Red → Green → Refactor**. Every test listed below must be written before the implementation it tests, must fail on the first run (RED), and must pass after the implementation (GREEN). No implementation file is created before its corresponding test file exists.

---

### 6.1 Unit Tests — `src/test/envFormats.test.ts`

#### `detectFormat`
- Returns `'json'` when filename ends in `.json`
- Returns `'yaml'` when filename ends in `.yaml` or `.yml`
- Returns `'csv'` when filename ends in `.csv`
- Returns `'shell'` when filename ends in `.sh`
- Returns `'env'` when filename ends in `.env`
- Returns `'env'` when filename has no extension
- Falls back to content sniffing when extension is unrecognized: JSON content returns `'json'`
- Falls back to content sniffing: YAML `key: value` content returns `'yaml'`
- Falls back to content sniffing: `export KEY=VAL` content returns `'shell'`
- Falls back to `'env'` when content sniffing is inconclusive

#### `parseJson`
- Parses a valid flat JSON object into the correct `EnvVar[]`
- All values are coerced to string (numbers, booleans become `"true"`, `"42"`)
- An empty JSON object `{}` returns an empty `vars` array with no warnings
- A nested object value is excluded from vars and appears in `warnings`
- An array value at the root returns a `FormatParseError` (thrown)
- Invalid JSON syntax throws a `FormatParseError` with a message containing "Invalid JSON"
- `null` values are excluded from vars and appear in `warnings`

#### `parseYaml`
- Parses a valid flat YAML mapping into `EnvVar[]`
- Multi-line scalar values (block literals) are preserved as strings
- Boolean YAML values (`true`, `false`) are coerced to the string `"true"` / `"false"`
- Numeric YAML values are coerced to string
- Nested mapping values are excluded and appear in `warnings`
- Invalid YAML (malformed indentation) throws a `FormatParseError`

#### `parseCsv`
- Parses a valid two-column CSV with `key,value` headers into `EnvVar[]`
- Parses a CSV without headers using column 0 as key and column 1 as value
- Quoted CSV values (containing commas) are correctly unquoted
- Blank rows are skipped silently
- A row with only one column is skipped with a warning

#### `parseShellExport`
- Parses `export KEY=value` lines into `EnvVar[]`
- Parses `export KEY='value with spaces'` (single-quoted)
- Parses `export KEY="value with spaces"` (double-quoted)
- Strips the `export ` prefix before parsing
- Skips comment lines (`#`)
- Skips blank lines
- Skips lines without `export ` prefix silently (does not error)

#### `parseEnvFile`
- Delegates to existing `parseEnvContent` behavior (round-trip: `serializeVars` → `parseEnvFile` → same keys and values)
- Skips comment lines and blank lines

#### `serializeJson`
- Roundtrip: `parseJson(serializeJson(vars).content)` returns vars with same keys and values
- Output is valid JSON (parseable with `JSON.parse`)
- Keys appear in original order

#### `serializeYaml`
- Roundtrip: `parseYaml(serializeYaml(vars).content)` returns vars with same keys and values
- Keys with special YAML characters are quoted in output

#### `serializeCsv`
- Roundtrip: `parseCsv(serializeCsv(vars).content)` returns vars with same keys and values
- Output contains a `key,value` header row as the first line
- Values containing commas are quoted in output

#### `serializeShellExport`
- Each key-value pair is prefixed with `export ` in output
- Roundtrip: `parseShellExport(serializeShellExport(vars).content)` returns vars with same keys and values

#### `serializeDotenv`
- Roundtrip with `parseEnvFile` (same as existing `serializeVars` roundtrip)

#### `buildImportConflictReport`
- A key in `incoming` that is absent in `existing` appears in `newKeys`
- A key in `incoming` that matches `existing` with the same value appears in `conflictSame`
- A key in `incoming` that matches `existing` with a different value appears in `conflictDifferent`
- `conflictDifferent` entries contain the correct `sourceVal` (incoming) and `targetVal` (existing)
- Works correctly when `existing` is empty (all keys are `newKeys`)
- Works correctly when `incoming` is empty (result has no entries in any category)
- Duplicate keys in `incoming` are deduplicated before comparison (last-write-wins)

---

### 6.2 Component Tests — `src/test/ImportDialog.test.tsx`

#### Rendering — Step 1 (pick)
- Renders step 1 content (file picker zone) when `step` is `'pick'`
- Renders a "Cancel" button that calls `onClose` when clicked
- Does not render the preview table in step 1

#### Step 2 — Preview
- After mock file selection, advances to step 2 and renders the preview table
- Displays the detected format as a badge
- Shows the correct number of rows (one per parsed variable)
- "New" badge appears for keys not in the existing environment
- "Conflict" badge appears for keys that conflict
- "Same" badge appears for keys with identical values
- Values are masked by default (shows `••••••`)
- "Reveal values" toggle unmasks all values in the preview table
- "Change format" control appears and allows selecting a different format
- Changing the format re-parses the content and updates the preview table
- Shows a warning banner when duplicate keys were detected in the source

#### Step 3 — Conflict resolution
- Is skipped entirely when there are no conflicting keys (dialog goes directly to commit)
- Renders only the conflicting keys, not new or same keys
- "Overwrite All" button sets all per-key decisions to `'overwrite'`
- "Skip All" button sets all per-key decisions to `'skip'`
- Individual row toggle changes only that key's decision
- Footer "Import N variables" count updates correctly as skip/overwrite decisions change

#### Commit
- "Import" button calls `invoke` (via `saveProjectEnv`) with the correctly merged var list
- Merged list respects per-key overwrite/skip decisions
- Merged list includes pre-existing keys that were not in the import file
- After successful invoke, transitions to step 4 (done state)

#### Step 4 — Done
- Renders success message with correct counts
- Calls `onClose` after 1.2 seconds (use fake timers)
- "Done" button calls `onClose` immediately

#### Error handling
- Displays error message in step 2 when format parsing throws `FormatParseError`
- "Retry" or "Change Format" button is present in error state

---

### 6.3 Component Tests — `src/test/ExportPanel.test.tsx`

#### Rendering
- Renders with format selector defaulting to `'env'`
- Renders with scope selector defaulting to `'active'`
- Preview pane contains content (not empty) on initial render
- Close button calls `onClose` when clicked

#### Format selector
- Switching format to `'json'` updates preview pane content to valid JSON
- Switching format to `'yaml'` updates preview pane to YAML format
- Switching format to `'csv'` updates preview pane to CSV with header row
- Switching format to `'shell'` updates preview pane with `export ` prefixes
- Switching back to `'env'` restores dotenv format in preview

#### Scope selector
- Selecting "All environments (ZIP)" shows the ZIP note below the scope selector
- Selecting "All environments (ZIP)" updates the Save button label to "Save ZIP Archive"
- Selecting "Active environment only" reverts Save button label to "Save File"

#### Value masking
- Values in preview pane are masked by default (`••••••` visible, real values absent from DOM)
- "Show values in preview" toggle reveals real values in preview pane
- Toggling off re-masks the preview pane
- Masked/unmasked state does not affect what will be saved (verified by checking serialized content)

#### Save flow — single env
- "Save File" button sets `isSaving` to `true` (Save button shows loading state)
- `invoke` is called with correct content and path after OS dialog mock resolves
- `onSaveComplete` is called after successful save
- If OS dialog is cancelled (null path returned), no invoke is made and `isSaving` returns to `false`

#### Save flow — ZIP
- "Save ZIP Archive" button calls `invoke('export_envs_to_zip', ...)` with correct file entries
- After `export_envs_to_zip` resolves, triggers save dialog mock
- Calls `invoke('write_bytes_to_path', ...)` with the bytes and selected path
- `onSaveComplete` fires after successful ZIP write

---

### 6.4 Integration Tests — App-level (extend `src/test/App.test.tsx`)

- `Cmd+I` opens `ImportDialog` when a project is selected
- `Cmd+I` does nothing when no project is selected
- `Cmd+E` opens `ExportPanel` when a project is selected and active env has vars
- `Cmd+E` does nothing when active env has no vars
- Opening ImportDialog while ExportPanel is open closes the ExportPanel
- Opening ExportPanel while DiffViewPanel is open closes the DiffViewPanel
- `Escape` closes ImportDialog when it is open
- `Escape` closes ExportPanel when it is open
- Successful import (mock `onImportComplete`) updates `project.vars` in App state
- Updated vars are reflected in `VarList` after import completes

---

## 7. Implementation Phases

*Source: Senior Developer + Technical Writer*

All phases follow **Red → Green → Refactor**. A phase is not complete until all its tests are green and the build passes. No phase may be skipped.

---

### Phase 0 — Types and Constants

**Goal:** Add the four new type definitions to `src/types.ts`. Zero runtime behavior, zero UI changes.

**Steps:**
1. Add `ExportFormat`, `ExportScope`, `ImportStep`, and `ImportPreviewRow` to `src/types.ts`.
2. Write a type-validation test (using TypeScript `satisfies` operator or `expectTypeOf`) to confirm shapes are correct.
3. Run existing tests — all must remain green.

**Acceptance:** TypeScript compiles. No UI change visible. Existing tests unchanged.

---

### Phase 1 — Pure Format Library (TDD-first)

**Goal:** `src/lib/envFormats.ts` fully implemented and tested. No components, no Tauri calls.

**Steps:**
1. Install `js-yaml`, `@types/js-yaml`, `papaparse`, `@types/papaparse` via npm.
2. Write the complete test file `src/test/envFormats.test.ts` — all tests must be RED before any implementation.
3. Implement `detectFormat`, all five parsers, all five serializers, and `buildImportConflictReport` until all tests are GREEN.
4. Refactor: each parser and serializer should be ≤50 lines. No mutable state. Return `{ vars, warnings }` consistently from parsers. Return `{ content, warnings }` consistently from serializers.

**Coverage target for this phase: 100%** — pure functions with no external dependencies are achievable at full coverage.

---

### Phase 2 — Import Dialog UI

**Goal:** `ImportDialog.tsx` renders and all four steps work correctly, including conflict resolution and commit.

**Steps:**
1. Write `src/test/ImportDialog.test.tsx` — all tests RED.
2. Create `src/components/Import/ImportDialog.tsx` with step state machine, preview table, conflict resolution UI, and commit logic.
3. Wire into `App.tsx`: add `showImportDialog` state, `handleImportComplete` handler, render block with backdrop.
4. Add "Import" button to `VarList` header; wire `onClick` to a new `onOpenImport` prop.
5. Run tests until all GREEN.
6. Refactor: step transitions should be CSS-driven (class swap), not re-renders of different component trees. Keep component under 500 lines — extract `ImportPreviewTable` and `ImportConflictTable` as sub-components in the same file if needed.

---

### Phase 3 — Export Panel UI

**Goal:** `ExportPanel.tsx` renders and all format/scope/reveal/save flows work correctly.

**Steps:**
1. Write `src/test/ExportPanel.test.tsx` — all tests RED.
2. Create `src/components/Export/ExportPanel.tsx` with format selector, scope selector, preview pane, reveal toggle, and save button.
3. Wire into `App.tsx`: add `showExportPanel` state, `handleExportSaveComplete` handler, render block with backdrop.
4. Add "Export" button to `VarDetail` toolbar; wire via a new `onOpenExport` prop.
5. Run tests until all GREEN.
6. Refactor: preview content generation is a single `useMemo` derived from format + scope + revealValues. No intermediate state.

---

### Phase 4 — Rust ZIP Command and File Write Commands

**Goal:** The three new Tauri commands (`export_envs_to_zip`, `write_bytes_to_path`, `write_text_to_path`) are implemented, registered, and callable from the frontend.

**Steps:**
1. Add `zip = "2"` to `src-tauri/Cargo.toml`.
2. Define the `ZipExportRequest` and `ZipFileEntry` structs in `src-tauri/src/lib.rs`.
3. Implement `export_envs_to_zip`, `write_bytes_to_path`, and `write_text_to_path` command handlers.
4. Register all three commands in the `tauri::Builder` `.invoke_handler` call.
5. Verify `tauri-plugin-dialog` is registered (required for OS save dialog from frontend).
6. Run `cd src-tauri && cargo test` — all Rust tests must pass.
7. Run `npm run tauri dev` manually to smoke-test the ZIP download in the actual Tauri runtime (this cannot be covered by Vitest since it requires the OS save dialog).
8. Update `src/test/setup.ts` to add mock implementations for `export_envs_to_zip`, `write_bytes_to_path`, and `write_text_to_path` so that the Phase 3 component tests pass without a running Tauri runtime.

---

### Phase 5 — Keyboard Shortcuts and Toolbar Integration

**Goal:** `Cmd+I` and `Cmd+E` work end-to-end; toolbar buttons are present and correctly wired.

**Steps:**
1. Add `Cmd+I` and `Cmd+E` handlers to the existing `handleKeyDown` effect in `App.tsx`.
2. Implement mutual exclusion via the `closeAllPanels()` helper (close Import, Export, Diff, Push before opening requested panel).
3. Write the App-level integration tests (extend `src/test/App.test.tsx`).
4. Run tests until GREEN.
5. Refactor: `handleKeyDown` should remain ≤60 lines. Extract guard logic into named predicates (`canOpenImport`, `canOpenExport`) defined near the handler.

---

### Phase 6 — Coverage Sweep

**Goal:** All new files meet the 80% coverage floor. The overall test suite passes. Build passes.

**Steps:**
1. Run `npm run test:coverage` and identify any uncovered branches in `ImportDialog.tsx`, `ExportPanel.tsx`, and `envFormats.ts`.
2. Write missing tests for identified gaps — favor testing error states, edge inputs, and cancelled OS dialogs.
3. Verify `envFormats.ts` is at 100%.
4. Run `npm run build` — must pass without TypeScript errors.
5. Run `cd src-tauri && cargo build` — must pass.

---

## 8. Dependencies and Risks

*Source: Senior Developer + Backend Engineer*

### MEDIUM — YAML Non-String Type Coercion

**Risk:** The `js-yaml` library correctly parses YAML according to spec, which means `enabled: true` parses as a boolean `true`, not the string `"true"`. Similarly, `port: 3000` parses as the integer `3000`. If these values are passed to `serializeVars` as-is, they will be stored as `"true"` and `"3000"` in the dotenv format — which may differ from the original YAML intent.

**Mitigation:** `parseYaml` must explicitly coerce all values with `String(value)` before constructing `EnvVar` objects. A warning is appended to the `warnings` array for each coerced value. The import preview surface this warning to the user. This behavior is documented in the feature's user-facing help text.

**Test coverage:** The `parseYaml` tests explicitly cover boolean and numeric YAML values and assert they arrive as strings.

---

### MEDIUM — CSV Format Convention

**Risk:** There is no standard for representing `.env` data as CSV. Different tools use different column orderings, different header names, and different quoting conventions. An exported CSV from envVault may not import correctly into another tool, and a CSV from another tool may not import cleanly into envVault.

**Mitigation:** Adopt and document a specific convention: two columns, `key` as the first column header (case-insensitive on import), `value` as the second. Any CSV with these headers is accepted on import. CSVs without these exact headers fall back to "column 0 = key, column 1 = value" heuristic. This convention is surfaced in the import dialog's format help text. Consider adding a one-line note to the export panel: "CSV exports use `key,value` column format."

**Test coverage:** `parseCsv` tests cover both the with-header and without-header cases.

---

### LOW — ZIP Save Dialog in Tauri v2

**Risk:** The `tauri-plugin-dialog` save dialog API in Tauri v2 may have differences from Tauri v1 in how it returns the selected path (string vs object, null handling). The Tauri v2 plugin API was revised between alpha and stable.

**Mitigation:** Verify the exact return type of the `save()` call from `@tauri-apps/plugin-dialog` against the Tauri v2 documentation before implementing the frontend save flow. Write the frontend code to handle both `string | null` and `{ path: string } | null` return shapes defensively until the runtime behavior is confirmed. Mock the dialog in all component tests so tests are not blocked by this ambiguity.

---

### LOW — Conflict Resolution Complexity

**Risk:** The import conflict resolution model could become complex if per-key decisions are not clearly separated from the "preview" step.

**Mitigation:** Reuse `ConflictStrategy`, `ConflictReport`, and `ConflictDetail` from `types.ts` exactly as they are used in `PushToStagePanel`. The `buildImportConflictReport` function maps directly onto the existing `buildConflictReport` function pattern. Per-key decisions are stored in a `Map<string, ConflictStrategy>` initialized with `'overwrite'` for all conflicting keys, exactly matching the push panel's pattern. No new conflict types are introduced.

---

### LOW — Large Environment Files (>500 Variables)

**Risk:** If a project has more than 500 variables, the import preview table and export preview pane may render slowly or produce a preview string too large for comfortable display.

**Mitigation:**
- Import preview table: virtualize with a windowed list (e.g., `@tanstack/react-virtual`) if row count exceeds a threshold (suggested: 200). Below that threshold, render all rows directly. Add this as a follow-on enhancement if not needed for the initial release; the threshold is high enough that most real-world `.env` files will not hit it.
- Export preview pane: truncate the preview at 100 lines with a note "… and N more lines (full content will be saved)." The save operation always writes the complete content regardless of truncation.
- Both mitigations are defensive — document the threshold decision in the component file as a comment.

---

## 9. Estimated Complexity

*Source: Senior Developer + Backend Engineer*

| Phase | Component | Estimated Lines of Code | Estimated Effort |
|---|---|---|---|
| Phase 0 | `types.ts` additions | ~25 lines | Trivial |
| Phase 1 | `envFormats.ts` | ~300–380 lines | Medium |
| Phase 1 | `envFormats.test.ts` | ~350–400 lines | Medium |
| Phase 2 | `ImportDialog.tsx` | ~350–450 lines | Medium-High |
| Phase 2 | `ImportDialog.test.tsx` | ~280–350 lines | Medium |
| Phase 3 | `ExportPanel.tsx` | ~250–320 lines | Medium |
| Phase 3 | `ExportPanel.test.tsx` | ~220–280 lines | Medium |
| Phase 4 | Rust commands (3 new) | ~120–180 lines | Medium |
| Phase 5 | `App.tsx` additions | ~60–80 lines | Low |
| Phase 6 | Coverage gap tests | ~50–100 lines | Low |

**Total estimated new code:** ~2,000–2,500 lines (implementation + tests combined).

**New files to create:**

| File | Type | Purpose |
|---|---|---|
| `src/types.ts` | Modify | Add `ExportFormat`, `ExportScope`, `ImportStep`, `ImportPreviewRow` |
| `src/lib/envFormats.ts` | Create | All format parsers, serializers, `detectFormat`, `buildImportConflictReport` |
| `src/components/Import/ImportDialog.tsx` | Create | Four-step import modal |
| `src/components/Export/ExportPanel.tsx` | Create | Slide-in export drawer |
| `src/App.tsx` | Modify | Two new panel states, two keyboard shortcuts, two render blocks, mutual exclusion helper |
| `src/components/VarList.tsx` | Modify | Add "Import" button and `onOpenImport` prop |
| `src/components/VarDetail.tsx` | Modify | Add "Export" button and `onOpenExport` prop |
| `src/test/envFormats.test.ts` | Create | Complete unit test suite for `envFormats.ts` |
| `src/test/ImportDialog.test.tsx` | Create | Component test suite for `ImportDialog` |
| `src/test/ExportPanel.test.tsx` | Create | Component test suite for `ExportPanel` |
| `src-tauri/src/lib.rs` | Modify | Three new Tauri commands + struct definitions |
| `src-tauri/Cargo.toml` | Modify | Add `zip` crate dependency |

**Coverage targets:**

| Module | Target |
|---|---|
| `src/lib/envFormats.ts` | 100% — pure functions |
| `src/components/Import/ImportDialog.tsx` | ≥85% |
| `src/components/Export/ExportPanel.tsx` | ≥85% |
| `src/App.tsx` (new code paths only) | ≥80% |

---

## 10. Acceptance Criteria

The story is complete when all of the following are true:

- [ ] `envFormats.ts` has 100% test coverage; all format parsers and serializers have roundtrip tests
- [ ] `detectFormat` correctly identifies all five formats by extension and by content sniffing
- [ ] `buildImportConflictReport` correctly classifies new, same-value, and conflicting keys
- [ ] Import dialog opens on Cmd+I and Import button click; closes on Cancel and Escape
- [ ] Import dialog progresses through all four steps correctly
- [ ] Import conflict resolution respects per-key overwrite/skip decisions
- [ ] Import commit updates `project.vars` and the active environment in App state
- [ ] Import commit persists changes via `saveProjectEnv`
- [ ] Export panel opens on Cmd+E and Export button click; closes on close button and Escape
- [ ] Format selector in Export panel updates preview pane synchronously
- [ ] Scope selector toggles between single-env and ZIP mode correctly
- [ ] Values are masked in preview by default; reveal toggle unmasks preview only
- [ ] Saved file always contains real (unmasked) values regardless of preview toggle state
- [ ] Single-env export calls OS save dialog and writes serialized content to chosen path
- [ ] Multi-env ZIP export calls `export_envs_to_zip`, triggers save dialog, writes ZIP to chosen path
- [ ] Mutual exclusion: opening Import/Export closes Diff and Push panels (and vice versa)
- [ ] YAML non-string values are coerced to string with a visible warning in the import preview
- [ ] Duplicate keys in import source are deduplicated with last-write-wins; warning is shown
- [ ] All edge cases (empty file, unsupported format, cancelled save dialog) handled gracefully
- [ ] All new files are under 500 lines
- [ ] Overall test coverage ≥80% on all modified/created files
- [ ] All existing tests remain green (no regressions)
- [ ] Build passes: `npm run build` and `cd src-tauri && cargo build`
- [ ] Panel animation: 220ms in, 180ms out, `cubic-bezier(0.16, 1, 0.3, 1)`

---

## 11. Definition of Done

- All acceptance criteria above are checked
- `/docs/story-2.md` plan reviewed against implementation — any deviations are documented inline
- No hardcoded values, no mutation of input arrays, no prop-drilled global state
- All new files are under 500 lines (per project file-size rules)
- `js-yaml` and `papaparse` versions are pinned in `package.json`
- PR description references this story plan and lists which phases were completed
