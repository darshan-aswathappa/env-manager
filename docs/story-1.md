# Story 1: Cross-Environment Diff View

> Plan authored with input from UX Researcher, Software Architect, Backend Engineer, and Technical Writer.
> Follows the TDD workflow: Red → Green → Refactor, with 80%+ coverage required.

---

## 1. Requirements Restatement

**Goal:** Give developers a fast, secure way to visually compare two environments (e.g., `.env` vs `.env.production`) within a project, highlighting structural differences — keys that are missing, added, or have changed values — without exposing secret values by default.

**Scope:**
- Read-only comparison view (no editing in-place)
- Operates on the already-loaded in-memory environment state — no new disk reads required to open the view
- Two lightweight action affordances from the diff panel: copy a revealed value, and push a single missing key to the other env
- Available for any project with at least two environments

**Out of scope for this story:**
- Multi-project cross-project diffing
- Diff export to file/clipboard
- Bulk push from diff (that is `PushToStage`'s job)
- Side-by-side two-pane layout (unified diff only; two-pane is a follow-on story)

---

## 2. User Research Insights

*Source: UX Researcher analysis*

### Mental Model
Developers match this feature to **git diff**, not spreadsheet compare. The three-color grammar is immediately understood:
- **Red** — key missing in right env (or only in left)
- **Green** — key missing in left env (only in right)
- **Amber** — key exists in both, value differs
- **Muted/dim** — key identical in both (hidden by default)

### Entry Points (priority order)
1. **`Cmd+D` keyboard shortcut** — primary, guard on "project selected + ≥2 envs with vars"
2. **Toolbar button** in VarList header area, next to the env switcher — label: "Compare Environments", icon: split-column or diff icon
3. **Mutually exclusive** with PushToStage panel — opening one closes the other

### Env Selection UX
- Two inline dropdowns at the top of the panel: **Left env** (defaults to `activeEnv`) and **Right env** (defaults to next env in suffix order)
- A **swap button** (↔) between the dropdowns to reverse the comparison instantly
- The same env cannot be selected in both dropdowns (disable in opposite dropdown)
- Diff result updates instantly on dropdown change — no confirm step needed (read-only operation)

### Value Security
- **All values masked by default** — keys and diff status are shown, values are hidden
- **"Reveal all" toggle** in panel header (deliberate click, not a keyboard-only shortcut)
- Per-row reveal via the existing eye-icon pattern
- Masked display: `••••••` (existing `valuePreview` helper)
- Values reset to masked when panel closes and reopens

### Filtering
- **Text search** — filters by key name; highlights matches inline
- **Diff status filter pills**: All / Missing in left / Missing in right / Changed / Identical
- **Default filter**: show all statuses except "Identical" (reduces noise on first open)
- Reset button clears all filters

### In-Panel Actions
- **Copy value** — clipboard icon on hover, only active after row is revealed; no modal
- **Push single key** — arrow icon triggers a lightweight tooltip-confirmation popover ("Add `KEY` to `.env.staging`?") then calls `push_vars_to_stage` with just that key

### Empty States
| Condition | Message | Action |
|---|---|---|
| Both envs identical | "These environments are in sync. All N keys are identical." | None |
| One env has no vars | "No variables found in `[env]`." | Link to Push to Stage |
| Project has only one env | "Add another environment to compare." | None |

### Animation Spec
- Slide in from right: 220ms, `cubic-bezier(0.16, 1, 0.3, 1)`
- Slide out: 180ms (exits always faster than entrances)
- No bounce, no glow, no spring overshoot
- Row status colors: CSS variable-driven, no animated color transitions

---

## 3. Technical Architecture

*Source: Software Architect + Backend Engineer analysis*

### 3.1 New Types — add to `src/types.ts`

```
DiffStatus: 'added' | 'removed' | 'modified' | 'unchanged'
  - 'added'    — key exists only in the right env
  - 'removed'  — key exists only in the left env
  - 'modified' — key exists in both, values differ
  - 'unchanged'— key exists in both, values identical

DiffEntry:
  key: string
  status: DiffStatus
  leftVal: string | null    // null when status is 'added'
  rightVal: string | null   // null when status is 'removed'

DiffResult:
  leftSuffix: string
  rightSuffix: string
  entries: DiffEntry[]
  addedCount: number        // pre-computed in computeEnvDiff, never in component
  removedCount: number
  modifiedCount: number
  unchangedCount: number
```

**Why `null` vs empty string on missing values:** Distinguishes "key exists with an empty value" from "key does not exist on this side." Prevents a silent semantic bug where `KEY=` in one env compares as equal to a missing key.

### 3.2 New Pure Library — `src/lib/envDiff.ts`

Single exported function:

```
computeEnvDiff(leftVars: EnvVar[], rightVars: EnvVar[]): DiffResult
```

Algorithm:
1. Build `Map<key, val>` for left and right (last-write-wins to handle duplicate keys)
2. Collect the union of all keys from both maps
3. Classify each key into `DiffStatus`
4. Sort entries: `modified` → `removed` → `added` → `unchanged` (most actionable first)
5. Within each group, sort alphabetically by key name
6. Count each status category
7. Return `DiffResult` — synchronous, no side effects

**Duplicate key handling:** The parser (`parseEnvContent`) uses array-push, so duplicate keys produce duplicate entries. `computeEnvDiff` must deduplicate using last-write-wins (last entry for a given key wins) before building the comparison maps. This matches the behavior of `serializeVars`.

**Key ordering:** Order is irrelevant to diff classification. Compare by key name only, never by array index.

**Value quoting:** `unquoteEnvValue` normalizes quoted values on load, so `SECRET="abc"` and `SECRET=abc` compare as equal — this is the intended semantic diff behavior.

### 3.3 Component Structure — `src/components/DiffView/`

```
src/components/DiffView/
  DiffViewPanel.tsx     — primary panel; contains EnvSelector and DiffRow as internal sub-components
```

**`DiffViewPanel` props:**
```
project: Project
initialLeftSuffix: string    // pass project.activeEnv from App.tsx
onClose: () => void
```

No `onComplete` callback — the panel is read-only and writes nothing to `App.tsx` state (except when single-key push is triggered, which calls `onPushComplete` same as `PushToStagePanel`).

**Internal sub-components (defined in same file):**

- `EnvSelector` — a `<select>` element, receives: available suffixes, current value, label, `onChange`. Stateless. Reused for left and right dropdowns.
- `DiffRow` — renders one `DiffEntry`. Receives: entry, `revealValues: boolean`. Shows status color-coding via CSS class, masked/revealed values, copy button, push-single-key button.

**Internal panel state (all local to `DiffViewPanel`):**
```
leftSuffix: string          // initialized to initialLeftSuffix prop
rightSuffix: string         // initialized to next env in suffix order
revealValues: boolean       // default false
searchQuery: string         // default ''
activeFilter: DiffStatus | 'all'  // default 'all' (but Identical hidden by checkbox)
showIdentical: boolean      // default false
```

The diff result is computed via `useMemo(() => computeEnvDiff(leftVars, rightVars), [leftSuffix, rightSuffix, project])`.

### 3.4 Integration with `App.tsx`

**New state to add (alongside existing `showPushPanel`):**
```
showDiffPanel: boolean
```

**Keyboard shortcut** — add to the existing `handleKeyDown` effect:
```
Cmd+D (macOS) / Ctrl+D: open/toggle diff panel
Guard: project selected AND project.environments with vars >= 2
Mutual exclusion: close push panel before opening diff panel
```

**Render block** — mirror the `PushToStagePanel` backdrop + drawer pattern exactly.

**VarDetail.tsx** — add an "Open Diff" button alongside the existing Push button in the header actions row. Wire via a new `onOpenDiff` prop (same pattern as `onOpenPush`).

### 3.5 Backend / Rust Layer

**No new Tauri commands required.** The diff view reads exclusively from `project.environments[n].vars` — the in-memory state already loaded at app startup by `loadAllVars` in `App.tsx`.

**Optional optimization (defer to follow-on):** A `load_two_project_envs(project_id, suffix_a, suffix_b)` command returning `(String, String)` would reduce IPC round-trips from 2 to 1 and provide a consistent atomic read snapshot. Not needed for correctness; useful if panel-open latency becomes a concern.

**Single-key push from diff:** Uses the existing `push_vars_to_stage` Tauri command (atomic write, returns snapshot for undo). Bulk copy is deferred to `PushToStagePanel`.

**Value masking:** Rust layer always returns raw values. Masking is exclusively a frontend responsibility (`revealValues` state in `DiffViewPanel`).

### 3.6 Shared Utility Extraction

Before implementing the diff panel, extract `valuePreview(v: EnvVar): string` from `PushToStagePanel.tsx` into `src/lib/envFile.ts` (or a new `src/lib/display.ts`). Both panels need this helper.

### 3.7 Files to Create

| File | Type | Purpose |
|---|---|---|
| `src/types.ts` | Modify | Add `DiffStatus`, `DiffEntry`, `DiffResult` |
| `src/lib/envDiff.ts` | Create | `computeEnvDiff` pure function |
| `src/components/DiffView/DiffViewPanel.tsx` | Create | Full diff panel with internal sub-components |
| `src/test/envDiff.test.ts` | Create | Unit tests for `computeEnvDiff` |
| `src/test/DiffViewPanel.test.tsx` | Create | Component tests for `DiffViewPanel` |
| `src/App.tsx` | Modify | Add `showDiffPanel` state, keyboard shortcut, render block |
| `src/components/VarDetail.tsx` | Modify | Add "Open Diff" button and `onOpenDiff` prop |
| `src/lib/envFile.ts` | Modify | Extract `valuePreview` helper (prep for dual-panel use) |

---

## 4. Implementation Phases (TDD Workflow)

All phases follow **Red → Green → Refactor**. Tests are written first and must fail before the implementation is written.

---

### Phase 0 — Preparatory Refactor (no new feature code)

**Goal:** Extract shared utility; add new types; zero new UI.

**Step 0.1 — Extract `valuePreview` utility**
- Write test: `valuePreview` returns `••••` for unrevealed, raw value for revealed
- Move the function from `PushToStagePanel.tsx` into `src/lib/envFile.ts`
- Update `PushToStagePanel.tsx` import
- Run all existing tests — must stay green

**Step 0.2 — Add new types to `src/types.ts`**
- Add `DiffStatus`, `DiffEntry`, `DiffResult` — no runtime behavior, purely type definitions
- Write a type-check-only test file (`src/test/types.test.ts` can assert shape with `satisfies`)

**Acceptance:** All existing tests pass. No UI change visible.

---

### Phase 1 — Pure Diff Logic (no UI)

**Goal:** `src/lib/envDiff.ts` with full test coverage before any component work.

#### Tests to write FIRST (`src/test/envDiff.test.ts`)

```
computeEnvDiff
  ✗ returns empty entries when both envs are empty
  ✗ classifies a key present only in left as 'removed'
  ✗ classifies a key present only in right as 'added'
  ✗ classifies a key with the same value on both sides as 'unchanged'
  ✗ classifies a key with different values as 'modified'
  ✗ sets leftVal to null for 'added' entries
  ✗ sets rightVal to null for 'removed' entries
  ✗ handles a mix of all four statuses in one call
  ✗ correctly counts addedCount, removedCount, modifiedCount, unchangedCount
  ✗ deduplicates duplicate keys using last-write-wins before diffing
  ✗ treats key order as irrelevant — same keys different order = unchanged
  ✗ treats empty string value as distinct from missing key (null vs '')
  ✗ sorts entries: modified first, then removed, then added, then unchanged
  ✗ sorts alphabetically within each status group
  ✗ handles leftVars empty — all right keys are 'added'
  ✗ handles rightVars empty — all left keys are 'removed'
  ✗ returns correct leftSuffix and rightSuffix in result
```

Write all tests. Run them — **all must be RED**.

Then implement `computeEnvDiff` until all are **GREEN**.

Refactor: ensure function is ≤50 lines, no mutation of inputs, no side effects.

**Coverage target for this phase: 100%** (pure function — total coverage is achievable and expected).

---

### Phase 2 — Panel Shell (skeleton UI, no diff rendering)

**Goal:** `DiffViewPanel.tsx` renders and mounts correctly; env dropdowns work; panel opens/closes; keyboard shortcuts registered.

#### Tests to write FIRST (`src/test/DiffViewPanel.test.tsx`)

```
DiffViewPanel rendering
  ✗ renders the panel with two env selector dropdowns
  ✗ defaults left dropdown to initialLeftSuffix prop
  ✗ defaults right dropdown to the next env in suffix order (not same as left)
  ✗ renders a close button
  ✗ calls onClose when close button is clicked
  ✗ calls onClose when Escape key is pressed

EnvSelector dropdowns
  ✗ disables the currently-selected right suffix in the left dropdown
  ✗ disables the currently-selected left suffix in the right dropdown
  ✗ swap button exchanges left and right suffix values
  ✗ changing left dropdown updates the displayed diff (triggers recompute)
  ✗ changing right dropdown updates the displayed diff (triggers recompute)

App.tsx integration
  ✗ Cmd+D opens the diff panel when a project with >= 2 envs is selected
  ✗ Cmd+D does not open the panel when no project is selected
  ✗ Cmd+D closes the diff panel if it is already open (toggle)
  ✗ opening the diff panel closes the push panel if it was open
  ✗ Escape key closes the diff panel from App.tsx level
```

Write all tests. Run them — **all must be RED**.

Implement the panel shell (structure, dropdowns, close/escape handling, App.tsx wiring) until all are **GREEN**.

Refactor: ensure `App.tsx` additions are minimal; panel state stays local.

---

### Phase 3 — Diff Rendering

**Goal:** `DiffViewPanel` renders `DiffRow` components correctly for all four diff statuses; colors, labels, and masked values are correct.

#### Tests to write FIRST (extend `src/test/DiffViewPanel.test.tsx`)

```
DiffRow rendering
  ✗ renders a 'removed' row with red status indicator and key name
  ✗ renders an 'added' row with green status indicator and key name
  ✗ renders a 'modified' row with amber status indicator and key name
  ✗ renders an 'unchanged' row with muted status indicator and key name
  ✗ masks values by default (shows •••• placeholder)
  ✗ shows reveal button on each row
  ✗ "Reveal all" toggle in panel header reveals all row values
  ✗ "Reveal all" toggle when active re-masks all values (toggle off)
  ✗ for 'added' rows: left value column is empty (null)
  ✗ for 'removed' rows: right value column is empty (null)
  ✗ for 'modified' rows: both left and right values are shown when revealed
  ✗ for 'unchanged' rows: both values are identical when revealed

Status summary bar
  ✗ shows correct count of modified, added, removed, unchanged keys
  ✗ counts update when left or right env is changed via dropdown
```

Write all tests. Run them — **all must be RED**.

Implement diff rendering. Run tests until **GREEN**.

Refactor: `DiffRow` receives only what it needs; no prop drilling of the whole project.

---

### Phase 4 — Filtering and Search

**Goal:** Search and status filters work correctly; default hides "unchanged" rows.

#### Tests to write FIRST (extend `src/test/DiffViewPanel.test.tsx`)

```
Search filter
  ✗ search input filters rows to only those matching the key name substring
  ✗ search is case-insensitive
  ✗ matching characters in key names are highlighted (aria-label reflects match)
  ✗ clearing search restores all rows
  ✗ empty search shows all rows (except hidden by status filter)

Status filter pills
  ✗ default state hides 'unchanged' rows, shows all others
  ✗ clicking "Identical" filter pill shows unchanged rows
  ✗ clicking "Missing in left" shows only 'added' rows
  ✗ clicking "Missing in right" shows only 'removed' rows
  ✗ clicking "Changed" shows only 'modified' rows
  ✗ clicking "All" shows all rows (including unchanged)
  ✗ reset clears search and restores default filter state

Empty states
  ✗ shows "These environments are in sync" when all entries are unchanged
  ✗ shows "No variables found" message when selected env has no vars
  ✗ shows "No results" message when search matches no keys (distinct from empty-env state)
```

Write all tests. Run them — **all must be RED**.

Implement filtering logic. Run until **GREEN**.

Refactor: filtering is derived state via `useMemo`; no intermediate state for filtered lists.

---

### Phase 5 — In-Panel Actions

**Goal:** Copy value and single-key push work correctly; copy is gated on reveal; push uses existing `push_vars_to_stage`.

#### Tests to write FIRST (extend `src/test/DiffViewPanel.test.tsx`)

```
Copy value action
  ✗ copy button is not visible when revealValues is false
  ✗ copy button appears after row is revealed
  ✗ clicking copy button writes the value to the clipboard
  ✗ copy button is only shown on rows where at least one value exists (not for the empty side of added/removed)

Single-key push action
  ✗ push arrow button appears on 'added' and 'removed' rows
  ✗ push button does not appear on 'modified' or 'unchanged' rows
  ✗ clicking push button shows a tooltip-style confirmation popover
  ✗ confirmation popover shows which key and which target env will receive the push
  ✗ confirming the push calls push_vars_to_stage with only the single key
  ✗ cancelling the confirmation popover makes no invoke call
  ✗ after successful push the row updates its status (key now exists in both envs)
  ✗ if push_vars_to_stage returns an error, shows an inline error message in the popover
```

Write all tests. Run them — **all must be RED**.

Implement actions (copy, push-single). Mock `invoke` in tests per the existing `setup.ts` pattern.

Run until **GREEN**.

Refactor: push action uses `pushVarsToStage` from `src/lib/envFile.ts`; no new invoke call in the component.

---

### Phase 6 — Keyboard Navigation and Accessibility

**Goal:** Full keyboard navigation, ARIA attributes, and screen-reader-compatible row labels.

#### Tests to write FIRST (extend `src/test/DiffViewPanel.test.tsx`)

```
Keyboard navigation
  ✗ focus moves to the first row when user tabs past the filter controls
  ✗ ArrowDown moves focus to the next row
  ✗ ArrowUp moves focus to the previous row
  ✗ Space on a focused row reveals/masks that row's value
  ✗ Escape closes any open popover (first press)
  ✗ Escape with no popover open closes the panel (second press)
  ✗ Tab order: left-dropdown → right-dropdown → swap button → search → filter pills → list

ARIA
  ✗ diff list has role="list"
  ✗ each row has role="listitem"
  ✗ each row has aria-label describing key name and diff status (e.g., "API_KEY: present in .env, missing in .env.staging")
  ✗ reveal button has aria-label="Reveal value" / "Mask value" based on state
  ✗ diff panel has role="dialog" and aria-label="Compare environments"
  ✗ swap button has aria-label="Swap environments"
```

Write all tests. Run them — **all must be RED**.

Implement keyboard handlers and ARIA attributes.

Run until **GREEN**.

---

### Phase 7 — VarDetail Integration

**Goal:** "Compare Environments" button appears in `VarDetail`; wires to `App.tsx` correctly.

#### Tests to write FIRST (extend `src/test/VarDetail.test.tsx`)

```
VarDetail diff button
  ✗ renders "Compare Environments" button when onOpenDiff prop is provided
  ✗ does not render the button when onOpenDiff is null
  ✗ clicking the button calls onOpenDiff
  ✗ button is positioned alongside the existing Push button
```

Write tests first. Run — **RED**. Implement. Run — **GREEN**.

---

## 5. Test Strategy Summary

### Coverage Targets

| Module | Target |
|---|---|
| `src/lib/envDiff.ts` | 100% — pure function |
| `src/components/DiffView/DiffViewPanel.tsx` | ≥85% |
| `src/App.tsx` (new diff-related code paths) | ≥80% |
| `src/components/VarDetail.tsx` (new diff prop) | ≥80% |

### Test Infrastructure (no changes needed)
- Framework: **Vitest** + **@testing-library/react** + **jsdom**
- Tauri `invoke` mocked globally in `src/test/setup.ts` via `vi.mocked(invoke).mockResolvedValue(...)`
- All new tests follow the existing mock pattern — no test touches the filesystem or Tauri runtime

### Test File Map

| Test file | What it covers |
|---|---|
| `src/test/envDiff.test.ts` | Pure diff algorithm — all cases exhaustively |
| `src/test/DiffViewPanel.test.tsx` | Panel rendering, dropdowns, filtering, actions, keyboard nav, ARIA |
| `src/test/VarDetail.test.tsx` | Diff button integration (extend existing file) |
| `src/test/App.test.tsx` | Cmd+D shortcut, panel mutual exclusion (extend existing file) |

---

## 6. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Stale in-memory env data — diff reflects last-saved state, not on-disk reality if another process edited the file | Medium | Add a subtitle in the panel header: "Reflects last saved state. Save before comparing to include unsaved changes." |
| Duplicate keys in raw env files causing incorrect diff | Medium | `computeEnvDiff` deduplicates with last-write-wins before building comparison maps. Covered by unit tests. |
| Both panels (DiffView + PushToStage) trying to open simultaneously | Low | Mutual exclusion enforced in the `Cmd+D` and `Cmd+Shift+P` handlers in `App.tsx`. Opening one closes the other. |
| Unsaved changes to active env reflected in diff | Low | This is intentional and correct behavior — the diff shows what will be true after save. Document in panel subtitle. |
| `project.environments` not yet populated on first load (race condition) | Low | `loadAllVars` runs on mount. If envs have 0 vars, diff shows all keys as added/removed — valid empty-side behavior, covered by tests. |
| Panel width conflict at small viewport | Low | Both panels are 480px wide right-anchored drawers. Minimum supported window width for Tauri is set at 900px; panels have sufficient room. |

---

## 7. Acceptance Criteria

The story is complete when all of the following are true:

- [ ] `computeEnvDiff` has 100% test coverage; all 17 unit tests pass
- [ ] `DiffViewPanel` renders correctly for all four diff status types
- [ ] Values are masked by default; "Reveal all" toggle and per-row reveal work
- [ ] Left and right env dropdowns default sensibly; swap button works
- [ ] Search filters by key name; status filter pills work; default hides "Identical"
- [ ] All three empty states render correctly with appropriate messaging
- [ ] "Copy value" action works after reveal; is hidden before reveal
- [ ] "Push single key" action calls `push_vars_to_stage` with confirmation popover
- [ ] `Cmd+D` opens/toggles the diff panel; mutual exclusion with push panel works
- [ ] "Compare Environments" button present in `VarDetail` header
- [ ] Full keyboard navigation with `ArrowUp/Down`, `Space`, `Escape`, `Tab`
- [ ] All ARIA roles and labels present; diff panel is accessible to screen readers
- [ ] Overall test coverage ≥80% on all modified/created files
- [ ] All existing tests remain green (no regressions)
- [ ] Build passes (`npm run build`)
- [ ] Panel animation: 220ms in, 180ms out, `cubic-bezier(0.16, 1, 0.3, 1)`
- [ ] No new Tauri commands added (all reads from in-memory state)

---

## 8. Definition of Done

- All acceptance criteria above are checked
- `/docs/story-1.md` plan reviewed against implementation — any deviations are documented
- No hardcoded values, no mutation of input arrays, no prop-drilled global state
- All new files are under 500 lines (per project file size rules)
- PR description references this story plan
