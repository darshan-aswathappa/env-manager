import { invoke } from '@tauri-apps/api/core'
import { readTextFile } from '@tauri-apps/plugin-fs'
import type { EnvVar, Project, Environment } from '../types'
import type { ConflictReport, ConflictStrategy, PushSummary, AtomicWriteResult, PushVarsRequest, PushResult } from '../types'

export function shellQuote(val: string): string {
  if (val === '') return "''"
  if (/^[a-zA-Z0-9._\-\/]+$/.test(val)) return val
  return "'" + val.replace(/'/g, "'\\''") + "'"
}

export function serializeVars(vars: EnvVar[]): string {
  return vars
    .filter(v => v.key.trim())
    .map(v => `${v.key}=${shellQuote(v.val)}`)
    .join('\n')
}

// Strips surrounding quotes from .env values (both double-quoted "v" and single-quoted 'v').
// Also unescapes shellQuote's '\'' sequence for literal single quotes.
export function unquoteEnvValue(raw: string): string {
  const v = raw.trim()
  if (v.length < 2) return v
  if (v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (v.startsWith("'") && v.endsWith("'")) {
    return v.slice(1, -1).replace(/'\\''/g, "'")
  }
  return v
}

export function parseEnvContent(content: string, projectId = ''): EnvVar[] {
  const vars: EnvVar[] = []
  for (const line of content.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue
    vars.push({
      id: crypto.randomUUID(),
      key: line.slice(0, eqIndex).trim(),
      val: unquoteEnvValue(line.slice(eqIndex + 1)),
      revealed: false,
      sourceProjectId: projectId,
    })
  }
  return vars
}

export async function readFileContent(path: string): Promise<string> {
  return readTextFile(path)
}

export async function saveProjectEnv(projectId: string, suffix: string, vars: EnvVar[]): Promise<void> {
  const content = serializeVars(vars)
  await invoke('save_project_env', { projectId, suffix, content })
}

export async function loadProjectEnv(projectId: string, suffix: string): Promise<EnvVar[]> {
  const content = await invoke<string>('load_project_env', { projectId, suffix })
  return parseEnvContent(content, projectId)
}

export async function importEnvFromProject(projectPath: string): Promise<EnvVar[]> {
  const content = await invoke<string>('import_env_from_project', { projectPath })
  return parseEnvContent(content)
}

export async function importAllEnvsFromProject(projectPath: string): Promise<Array<{ suffix: string; vars: EnvVar[] }>> {
  const entries = await invoke<Array<[string, string]>>('import_all_envs_from_project', { projectPath })
  return entries.map(([suffix, content]) => ({
    suffix,
    vars: parseEnvContent(content),
  }))
}

export async function deleteProjectEnv(projectId: string, suffix: string): Promise<void> {
  await invoke('delete_project_env', { projectId, suffix })
}

export async function writeEnvSignal(): Promise<void> {
  await invoke('write_env_signal')
}

export async function registerProject(entry: {
  id: string; name: string; path: string; parentId: string | null; activeEnv?: string
}): Promise<void> {
  await invoke('register_project', { entry })
}

export async function unregisterProject(projectId: string): Promise<void> {
  await invoke('unregister_project', { projectId })
}

export async function getAppDataDir(): Promise<string> {
  return invoke<string>('get_app_data_dir')
}

export async function generateShellHook(): Promise<string> {
  return invoke<string>('generate_shell_hook')
}

export async function checkGitignoreStatus(projectPath: string): Promise<import('../types').GitignoreStatus> {
  return invoke<import('../types').GitignoreStatus>('check_gitignore_status', { projectPath })
}

export type ShellIntegrationStatus = 'zsh' | 'bash' | 'both' | 'not_found';

export async function checkShellIntegration(): Promise<ShellIntegrationStatus> {
  return invoke<ShellIntegrationStatus>('check_shell_integration')
}

// ── Push to Stage ─────────────────────────────────────────────

/**
 * Pure function: classifies varsToPush against targetVars.
 * Returns which keys are new, identical (auto-skip), or conflicting.
 */
export function buildConflictReport(
  varsToPush: Array<{ key: string; val: string }>,
  targetVars: EnvVar[]
): ConflictReport {
  const targetMap = new Map<string, string>(targetVars.map(v => [v.key, v.val]))
  const newKeys: string[] = []
  const conflictSame: string[] = []
  const conflictDifferent: ConflictReport['conflictDifferent'] = []

  for (const { key, val } of varsToPush) {
    if (!targetMap.has(key)) {
      newKeys.push(key)
    } else if (targetMap.get(key) === val) {
      conflictSame.push(key)
    } else {
      conflictDifferent.push({ key, sourceVal: val, targetVal: targetMap.get(key)! })
    }
  }

  return { newKeys, conflictSame, conflictDifferent }
}

/**
 * Pure function: merges varsToPush into targetVars using per-key conflict decisions.
 * Returns merged EnvVar array and a summary of what happened.
 * Default strategy for keys not in conflictDecisions is 'overwrite'.
 */
export function mergeVarsForPush(
  varsToPush: Array<{ key: string; val: string }>,
  targetVars: EnvVar[],
  conflictDecisions: Map<string, ConflictStrategy>,
  projectId: string
): { mergedVars: EnvVar[]; summary: PushSummary } {
  const merged = new Map<string, EnvVar>(targetVars.map(v => [v.key, { ...v }]))
  const written: string[] = []
  const skippedConflict: string[] = []
  const skippedNoChange: string[] = []

  for (const { key, val } of varsToPush) {
    if (!merged.has(key)) {
      // New key — always add
      merged.set(key, { id: crypto.randomUUID(), key, val, revealed: false, sourceProjectId: projectId })
      written.push(key)
    } else if (merged.get(key)!.val === val) {
      // Identical value — auto-skip
      skippedNoChange.push(key)
    } else {
      // Different value — check per-key decision, default to 'overwrite'
      const strategy: ConflictStrategy = conflictDecisions.get(key) ?? 'overwrite'
      if (strategy === 'overwrite') {
        merged.set(key, { ...merged.get(key)!, val })
        written.push(key)
      } else {
        // 'skip' — leave target value unchanged
        skippedConflict.push(key)
      }
    }
  }

  return {
    mergedVars: Array.from(merged.values()),
    summary: { written, skippedConflict, skippedNoChange },
  }
}

/**
 * Async: reads target env from disk, builds and returns ConflictReport.
 * Does NOT write anything.
 */
export async function previewPushVarsToStage(
  projectId: string,
  targetSuffix: string,
  varsToPush: Array<{ key: string; val: string }>
): Promise<ConflictReport> {
  const targetVars = await loadProjectEnv(projectId, targetSuffix)
  return buildConflictReport(varsToPush, targetVars)
}

/**
 * Async: merges vars, writes merged content atomically to target via Tauri,
 * re-reads target from disk, returns full PushResult.
 */
export async function pushVarsToStage(request: PushVarsRequest): Promise<PushResult> {
  const { projectId, targetSuffix, varsToPush, conflictDecisions } = request

  const currentTargetVars = await loadProjectEnv(projectId, targetSuffix)
  const { mergedVars, summary } = mergeVarsForPush(varsToPush, currentTargetVars, conflictDecisions, projectId)

  const mergedContent = serializeVars(mergedVars)
  const atomicResult = await invoke<AtomicWriteResult>('push_vars_to_stage', {
    projectId,
    targetSuffix,
    mergedContent,
  })

  const updatedVars = await loadProjectEnv(projectId, targetSuffix)

  return {
    summary,
    snapshot: atomicResult.snapshot,
    targetCreated: atomicResult.targetCreated,
    updatedVars,
  }
}

/**
 * Pure function: returns masked preview for display. If revealed, shows truncated value.
 */
export function valuePreview(val: string, revealed: boolean): string {
  if (!val) return ''
  if (!revealed) return '••••••••'
  return val.length > 24 ? val.slice(0, 24) + '…' : val
}

/**
 * Pure function: immutably updates a project's target environment vars.
 * Returns new Project object. Source env is unchanged.
 */
export function applyPushResultToProject(
  project: Project,
  targetSuffix: string,
  updatedVars: EnvVar[]
): Project {
  const existingIndex = project.environments.findIndex(e => e.suffix === targetSuffix)

  let newEnvironments: Project['environments']
  if (existingIndex === -1) {
    // Target env doesn't exist yet — append a new entry
    newEnvironments = [...project.environments, { suffix: targetSuffix, vars: updatedVars }]
  } else {
    // Replace the target env's vars immutably
    newEnvironments = project.environments.map((env, i) =>
      i === existingIndex ? { ...env, vars: updatedVars } : { ...env }
    )
  }

  return {
    ...project,
    environments: newEnvironments,
    vars: project.activeEnv === targetSuffix ? updatedVars : project.vars,
  }
}

// ── Key Rename Propagation ──────────────────────────────────────

/**
 * Pure function: returns the suffixes of all environments (excluding excludeSuffix)
 * that contain a variable with the given key.
 */
export function findKeyAcrossEnvironments(
  key: string,
  environments: Environment[],
  excludeSuffix: string
): string[] {
  return environments
    .filter(env => env.suffix !== excludeSuffix)
    .filter(env => env.vars.some(v => v.key === key))
    .map(env => env.suffix)
}

/**
 * Pure function: immutably renames oldKey to newKey within a single environment's vars.
 * Preserves id, val, revealed, sourceProjectId for renamed var.
 * Returns same array reference if oldKey is not present.
 */
export function renameKeyInEnvironment(
  oldKey: string,
  newKey: string,
  vars: EnvVar[]
): EnvVar[] {
  return vars.map(v => v.key === oldKey ? { ...v, key: newKey } : v)
}

/**
 * Pure function: applies renameKeyInEnvironment across a specific set of environments.
 * Returns a new environments array. Only environments listed in targetSuffixes are modified.
 * Immutable — does not mutate any input.
 */
export function propagateKeyRenameToEnvironments(
  oldKey: string,
  newKey: string,
  environments: Environment[],
  targetSuffixes: string[]
): Environment[] {
  return environments.map(env =>
    targetSuffixes.includes(env.suffix)
      ? { ...env, vars: renameKeyInEnvironment(oldKey, newKey, env.vars) }
      : env
  )
}
