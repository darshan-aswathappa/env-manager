import { invoke } from '@tauri-apps/api/core'
import type { EnvVar } from '../types'

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

function parseEnvContent(content: string, projectId = ''): EnvVar[] {
  const vars: EnvVar[] = []
  for (const line of content.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue
    vars.push({
      id: crypto.randomUUID(),
      key: line.slice(0, eqIndex).trim(),
      val: line.slice(eqIndex + 1).trim(),
      revealed: false,
      sourceProjectId: projectId,
    })
  }
  return vars
}

export async function saveProjectEnv(projectId: string, vars: EnvVar[]): Promise<void> {
  const content = serializeVars(vars)
  await invoke('save_project_env', { projectId, content })
}

export async function loadProjectEnv(projectId: string): Promise<EnvVar[]> {
  const content = await invoke<string>('load_project_env', { projectId })
  return parseEnvContent(content, projectId)
}

export async function importEnvFromProject(projectPath: string): Promise<EnvVar[]> {
  const content = await invoke<string>('import_env_from_project', { projectPath })
  return parseEnvContent(content)
}

export async function registerProject(entry: {
  id: string; name: string; path: string; parentId: string | null
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
