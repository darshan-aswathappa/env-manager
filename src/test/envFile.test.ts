import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { saveProjectEnv, loadProjectEnv, importEnvFromProject, shellQuote, serializeVars } from '../lib/envFile'
import type { EnvVar } from '../types'

const mockInvoke = vi.mocked(invoke)

const makeVar = (key: string, val: string): EnvVar => ({
  id: crypto.randomUUID(), key, val, revealed: false, sourceProjectId: 'p1'
})

describe('shellQuote', () => {
  it('returns bare value for simple alphanumeric', () => {
    expect(shellQuote('simple123')).toBe('simple123')
  })
  it('wraps value with spaces in single quotes', () => {
    expect(shellQuote('hello world')).toBe("'hello world'")
  })
  it('escapes single quotes inside value', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'")
  })
  it('wraps value with $ in single quotes', () => {
    expect(shellQuote('$SECRET')).toBe("'$SECRET'")
  })
  it('handles empty string', () => {
    expect(shellQuote('')).toBe("''")
  })
})

describe('serializeVars', () => {
  it('produces KEY=value lines', () => {
    const vars = [makeVar('PORT', '3000'), makeVar('HOST', 'localhost')]
    expect(serializeVars(vars)).toBe('PORT=3000\nHOST=localhost')
  })
  it('skips vars with empty keys', () => {
    const vars = [makeVar('', 'value'), makeVar('KEY', 'val')]
    expect(serializeVars(vars)).toBe('KEY=val')
  })
  it('quotes values with spaces', () => {
    const vars = [makeVar('GREETING', 'hello world')]
    expect(serializeVars(vars)).toBe("GREETING='hello world'")
  })
})

describe('saveProjectEnv', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('calls save_project_env with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined)
    const vars = [makeVar('KEY', 'val')]
    await saveProjectEnv('project-id', vars)
    expect(mockInvoke).toHaveBeenCalledWith('save_project_env', {
      projectId: 'project-id',
      content: 'KEY=val',
    })
  })
})

describe('loadProjectEnv', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('parses KEY=VALUE lines into EnvVar array', async () => {
    mockInvoke.mockResolvedValue('PORT=3000\nHOST=localhost')
    const vars = await loadProjectEnv('project-id')
    expect(vars).toHaveLength(2)
    expect(vars[0].key).toBe('PORT')
    expect(vars[0].val).toBe('3000')
    expect(vars[1].key).toBe('HOST')
    expect(vars[1].val).toBe('localhost')
  })
  it('skips comment lines', async () => {
    mockInvoke.mockResolvedValue('# comment\nKEY=val')
    const vars = await loadProjectEnv('project-id')
    expect(vars).toHaveLength(1)
  })
  it('skips blank lines', async () => {
    mockInvoke.mockResolvedValue('\nKEY=val\n')
    const vars = await loadProjectEnv('project-id')
    expect(vars).toHaveLength(1)
  })
  it('returns empty array when content is empty', async () => {
    mockInvoke.mockResolvedValue('')
    const vars = await loadProjectEnv('project-id')
    expect(vars).toHaveLength(0)
  })
  it('handles values containing = sign', async () => {
    mockInvoke.mockResolvedValue('DATABASE_URL=postgres://user:pass@host/db?ssl=true')
    const vars = await loadProjectEnv('project-id')
    expect(vars[0].val).toBe('postgres://user:pass@host/db?ssl=true')
  })
})

describe('importEnvFromProject', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('calls import_env_from_project and parses result', async () => {
    mockInvoke.mockResolvedValue('KEY=val\nSECRET=abc')
    const vars = await importEnvFromProject('/some/path')
    expect(mockInvoke).toHaveBeenCalledWith('import_env_from_project', { projectPath: '/some/path' })
    expect(vars).toHaveLength(2)
  })
  it('returns empty array when no .env exists', async () => {
    mockInvoke.mockResolvedValue('')
    const vars = await importEnvFromProject('/some/path')
    expect(vars).toHaveLength(0)
  })
})
