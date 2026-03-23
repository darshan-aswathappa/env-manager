# Shell Hook Plan — env-manager Option 2

## Overview

Instead of writing `.env` files into project folders, env-manager stores vars in the OS app data directory and injects them into the shell via a hook. Application code is unchanged — it still reads `process.env.KEY` normally. On production (VPS/Docker/systemd), vars are set via the server's native mechanism — zero app code changes required.

---

## What's Agreed

| Decision | Answer |
|---|---|
| Storage location | `~/Library/Application Support/env-manager/` (macOS) / `~/.config/env-manager/` (Linux) |
| One file per project | `{uuid}.env` — own vars only, never merged |
| Project metadata | `registry.json` in that same dir — replaces `localStorage` |
| Shell hook parser | Python3 (avoids `jq` dependency, available on all target platforms) |
| Sub-project inheritance | Child wins by default — sourced last so it overrides parent |
| Hook trigger | `chpwd` on zsh, `PROMPT_COMMAND` on bash |
| No app code changes | App still reads `process.env.KEY` — zero prod impact |

---

## Data Model Changes (`src/types.ts`)

```typescript
export type InheritanceMode = "merge-child-wins" | "merge-parent-wins" | "isolated";

export interface EnvVar {
  id: string;
  key: string;
  val: string;
  revealed: boolean;
  sourceProjectId: string;   // for showing provenance in merged view
}

export interface Project {
  id: string;
  name: string;
  path: string;
  parentId: string | null;              // null = root project
  vars: EnvVar[];
  inheritanceMode: InheritanceMode;     // default: "merge-child-wins"
  sortOrder: number;
}
```

**Why flat array with `parentId` over nested children:** Simpler to update, no recursive JSON, easy to partial-update a single node. Tree shape is computed at render time.

---

## `registry.json` Format

Stored at `{app_data_dir}/registry.json`. Written by the Tauri app, read by the shell hook.

```json
{
  "projects": [
    { "id": "uuid-A", "name": "main-app",     "path": "/projects/main-app",               "parentId": null },
    { "id": "uuid-B", "name": "auth-service", "path": "/projects/main-app/services/auth", "parentId": "uuid-A" },
    { "id": "uuid-C", "name": "api-service",  "path": "/projects/main-app/services/api",  "parentId": "uuid-A" }
  ]
}
```

---

## New Rust Commands (`src-tauri/src/lib.rs`)

7 new commands. 3 legacy commands (`read_file`, `write_file`, `path_exists`) kept during migration then removed.

| Command | Signature | Purpose |
|---|---|---|
| `save_project_env` | `(app, project_id: String, content: String) -> Result<(), String>` | Write `{uuid}.env` to app data dir |
| `load_project_env` | `(app, project_id: String) -> Result<String, String>` | Read `{uuid}.env` from app data dir |
| `register_project` | `(app, entry: RegistryEntry) -> Result<(), String>` | Upsert project into `registry.json` |
| `unregister_project` | `(app, project_id: String) -> Result<(), String>` | Remove from `registry.json` |
| `get_app_data_dir` | `(app) -> Result<String, String>` | Return path string for UI display |
| `generate_shell_hook` | `(app) -> Result<String, String>` | Return full shell snippet with hardcoded `app_data_dir` |
| `import_env_from_project` | `(project_path: String) -> Result<String, String>` | Read-only: import existing `.env` during onboarding |

### `RegistryEntry` struct

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    pub parent_id: Option<String>,
}
```

### Capability additions (`src-tauri/capabilities/default.json`)

```json
"fs:allow-app-read-recursive",
"fs:allow-app-write-recursive"
```

---

## Shell Hook Behavior

The hook fires on every `cd`. It:
1. Calls Python3 to parse `registry.json` and find all registered projects whose path is an ancestor of `$PWD`
2. Sorts matches shallowest-first (parent directories before child directories)
3. Sources parent `.env` first, child `.env` last — child vars override parent on conflict
4. Unsets vars from the previous project when `cd`-ing out

### Inheritance Modes

| Mode | Behavior |
|---|---|
| `merge-child-wins` (default) | Parent sourced first, child last — child overrides on conflict |
| `merge-parent-wins` | Child sourced first, parent last — parent overrides on conflict |
| `isolated` | Only this project's own file sourced — all ancestors skipped |

`inheritanceMode` is set per child project. The child opts in or out — the parent has no control.

### Sub-Project Walkthrough

```
/main-app               → uuid-A  (DB_HOST=main-db,  PORT=8080)
/main-app/services/auth → uuid-B  (JWT_SECRET=abc,   PORT=4001)
```

User `cd`s into `/main-app/services/auth`:
1. Python matches `/main-app` (depth 2) and `/main-app/services/auth` (depth 4)
2. Sorted shallowest first: source `uuid-A.env` → source `uuid-B.env`
3. Result: `DB_HOST=main-db`, `PORT=4001` (child wins), `JWT_SECRET=abc`

User `cd`s back to `/main-app`:
1. Only `/main-app` matches
2. `uuid-B` keys are unset, `uuid-A.env` sourced
3. Result: `DB_HOST=main-db`, `PORT=8080`

### Generated Shell Hook (output of `generate_shell_hook`)

```bash
# ── dotenv-manager shell hook ─────────────────────────────────────────────────
# Auto-generated by dotenv-manager. Paste into ~/.zshrc or ~/.bashrc.

_dotenv_manager_load() {
  local registry="<app_data_dir>/registry.json"
  local data_dir="<app_data_dir>"

  [ -f "$registry" ] || return 0

  local matches=()
  while IFS= read -r line; do
    matches+=("$line")
  done < <(
    python3 - "$registry" "$PWD" <<'PYEOF'
import json, sys
registry_path, cwd = sys.argv[1], sys.argv[2]
with open(registry_path) as f:
    data = json.load(f)
cwd_parts = cwd.rstrip("/").split("/")
matched = []
for p in data.get("projects", []):
    proj_parts = p["path"].rstrip("/").split("/")
    depth = len(proj_parts)
    if cwd_parts[:depth] == proj_parts:
        matched.append((depth, p.get("parentId") or "null", p["id"]))
matched.sort(key=lambda x: x[0])
for depth, parent_id, pid in matched:
    print(f"{depth}:{parent_id}:{pid}")
PYEOF
  )

  [ ${#matches[@]} -eq 0 ] && return 0

  local loaded=()
  for entry in "${matches[@]}"; do
    local rest="${entry#*:}"
    local parent_id="${rest%%:*}"
    local project_id="${rest#*:}"

    if [ "$parent_id" != "null" ]; then
      local parent_file="$data_dir/${parent_id}.env"
      local already=0
      for lid in "${loaded[@]}"; do [ "$lid" = "$parent_id" ] && already=1 && break; done
      if [ $already -eq 0 ] && [ -f "$parent_file" ]; then
        set -a; source "$parent_file"; set +a
        loaded+=("$parent_id")
      fi
    fi

    local env_file="$data_dir/${project_id}.env"
    local already=0
    for lid in "${loaded[@]}"; do [ "$lid" = "$project_id" ] && already=1 && break; done
    if [ $already -eq 0 ] && [ -f "$env_file" ]; then
      set -a; source "$env_file"; set +a
      loaded+=("$project_id")
    fi
  done
}

_dotenv_manager_load
if [[ -n "$ZSH_VERSION" ]]; then
  autoload -Uz add-zsh-hook
  add-zsh-hook chpwd _dotenv_manager_load
elif [[ -n "$BASH_VERSION" ]]; then
  PROMPT_COMMAND="_dotenv_manager_load${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
fi
# ── end dotenv-manager shell hook ─────────────────────────────────────────────
```

---

## Frontend Changes

### `src/lib/envFile.ts`

- `writeEnvFile` → replaced by calling `save_project_env` Tauri command
- `readEnvFile` → replaced by calling `load_project_env` Tauri command
- `checkGitignore` → removed (no longer relevant)
- Add `shellQuote` helper for values with spaces/special chars

```typescript
function shellQuote(val: string): string {
  if (/^[a-zA-Z0-9._\-\/]+$/.test(val)) return val;
  return "'" + val.replace(/'/g, "'\\''") + "'";
}
```

### `src/App.tsx`

- On project add: call `register_project` after user picks a folder
- On project delete: call `unregister_project`
- On save: call `save_project_env` instead of `writeEnvFile`
- On load: call `load_project_env` instead of `readEnvFile`
- `persistProjects`: **never serialize `val` fields** — store key names only; fetch values on demand
- Remove `gitignoreOk` state and `checkGitignore` call

### `src/components/Sidebar.tsx`

- `projects: Project[]` prop → `projectTree: ProjectTreeNode[]`
- Render tree with depth indentation instead of flat list
- Hover on any row shows "Add sub-project" button
- Color tinting: child projects inherit a tinted version of the root project's color

### `src/components/VarDetail.tsx`

- Remove gitignore warning badge
- Add inheritance chain breadcrumb: `main-app → auth-service`
- Add `InheritanceMode` dropdown (only visible for non-root projects)

### `src/components/VarList.tsx` (Phase 5 / V2)

- Toggle: "Own vars" vs "Effective vars (merged)"
- Inherited vars: subtle "from parent" badge
- Shadowed vars: "overrides parent" badge
- Merged view is read-only — edits always go to own vars

---

## Implementation Phases

### Phase 1 — Rust Backend
- Rewrite `src-tauri/src/lib.rs` with 7 new commands, keep 3 legacy
- Update `src-tauri/capabilities/default.json`
- No frontend change, no visible user impact

### Phase 2 — Storage Migration
- Update `src/lib/envFile.ts` to use new commands
- Update `src/App.tsx` to call `register_project` / `unregister_project`
- Move project metadata from `localStorage` → `registry.json`
- Stop serializing `val` in `localStorage`
- Add `shellQuote` for value serialization
- Add onboarding import: detect existing `.env`, offer to import via `import_env_from_project`

### Phase 3 — Shell Integration UI
- Add "Shell Integration" panel (button in sidebar footer)
- Call `generate_shell_hook()`, display copy-paste snippet
- Detect shell via `$SHELL`, label the correct rc file
- Show `get_app_data_dir()` result so user knows where files are stored

### Phase 4 — Sub-Project Sidebar Tree
- Update `Sidebar.tsx` to render `ProjectTreeNode[]` with depth indentation
- Add "Add sub-project" hover button
- Add `InheritanceMode` selector in project settings

### Phase 5 — Merged Var View (V2)
- Dual view toggle in `VarList`
- Provenance badges for inherited and overriding vars

---

## Files to Touch

| File | Change |
|---|---|
| `src/types.ts` | Add `parentId`, `inheritanceMode`, `sortOrder`, `sourceProjectId` |
| `src/lib/envFile.ts` | Replace read/write with new Tauri commands; add `shellQuote` |
| `src/App.tsx` | Wire `register_project`, `unregister_project`; fix `persistProjects` |
| `src/components/Sidebar.tsx` | Tree rendering, sub-project button |
| `src/components/VarDetail.tsx` | Remove gitignore badge; add breadcrumb + inheritance mode |
| `src/components/VarList.tsx` | Merged view toggle (Phase 5) |
| `src-tauri/src/lib.rs` | Full rewrite with 7 new commands |
| `src-tauri/capabilities/default.json` | Add app-data read/write permissions |
