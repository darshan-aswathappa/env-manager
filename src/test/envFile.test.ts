import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  saveProjectEnv,
  loadProjectEnv,
  importEnvFromProject,
  importAllEnvsFromProject,
  deleteProjectEnv,
  registerProject,
  writeEnvSignal,
  parseEnvContent,
  shellQuote,
  serializeVars,
  unquoteEnvValue,
  buildConflictReport,
  mergeVarsForPush,
  previewPushVarsToStage,
  pushVarsToStage,
  applyPushResultToProject,
} from '../lib/envFile'
import type { EnvVar, Project, Environment } from '../types'

const mockInvoke = vi.mocked(invoke)

const makeVar = (key: string, val: string): EnvVar => ({
  id: crypto.randomUUID(), key, val, revealed: false, sourceProjectId: 'p1'
})

describe('unquoteEnvValue', () => {
  it('strips double quotes from .env import format', () => {
    expect(unquoteEnvValue('"https://example.supabase.co"')).toBe('https://example.supabase.co')
  })
  it('strips single quotes from shellQuote output', () => {
    expect(unquoteEnvValue("'http://localhost:8001'")).toBe('http://localhost:8001')
  })
  it('unescapes \\x27 single-quote inside single-quoted value', () => {
    expect(unquoteEnvValue("'it'\\''s'")).toBe("it's")
  })
  it('returns bare value unchanged', () => {
    expect(unquoteEnvValue('simple123')).toBe('simple123')
  })
  it('returns empty string unchanged', () => {
    expect(unquoteEnvValue('')).toBe('')
  })
})

describe('loadProjectEnv round-trip (no double-escaping)', () => {
  it('double-quoted import value survives load→save→load without growing', async () => {
    const { loadProjectEnv } = await import('../lib/envFile')
    const { invoke } = await import('@tauri-apps/api/core')
    const mockInvoke = vi.mocked(invoke)
    mockInvoke.mockResolvedValue('SUPABASE_URL=\'https://example.supabase.co\'')
    const vars = await loadProjectEnv('p', '')
    expect(vars[0].val).toBe('https://example.supabase.co')
  })
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

  it('calls save_project_env with base suffix', async () => {
    mockInvoke.mockResolvedValue(undefined)
    const vars = [makeVar('KEY', 'val')]
    await saveProjectEnv('project-id', '', vars)
    expect(mockInvoke).toHaveBeenCalledWith('save_project_env', {
      projectId: 'project-id',
      suffix: '',
      content: 'KEY=val',
    })
  })

  it('calls save_project_env with local suffix', async () => {
    mockInvoke.mockResolvedValue(undefined)
    const vars = [makeVar('DB', 'localhost')]
    await saveProjectEnv('project-id', 'local', vars)
    expect(mockInvoke).toHaveBeenCalledWith('save_project_env', {
      projectId: 'project-id',
      suffix: 'local',
      content: 'DB=localhost',
    })
  })
})

describe('loadProjectEnv', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('parses KEY=VALUE lines into EnvVar array with base suffix', async () => {
    mockInvoke.mockResolvedValue('PORT=3000\nHOST=localhost')
    const vars = await loadProjectEnv('project-id', '')
    expect(mockInvoke).toHaveBeenCalledWith('load_project_env', {
      projectId: 'project-id',
      suffix: '',
    })
    expect(vars).toHaveLength(2)
    expect(vars[0].key).toBe('PORT')
    expect(vars[0].val).toBe('3000')
    expect(vars[1].key).toBe('HOST')
    expect(vars[1].val).toBe('localhost')
  })
  it('loads with production suffix', async () => {
    mockInvoke.mockResolvedValue('API_KEY=prod-key')
    const vars = await loadProjectEnv('project-id', 'production')
    expect(mockInvoke).toHaveBeenCalledWith('load_project_env', {
      projectId: 'project-id',
      suffix: 'production',
    })
    expect(vars).toHaveLength(1)
    expect(vars[0].key).toBe('API_KEY')
    expect(vars[0].val).toBe('prod-key')
  })
  it('skips comment lines', async () => {
    mockInvoke.mockResolvedValue('# comment\nKEY=val')
    const vars = await loadProjectEnv('project-id', '')
    expect(vars).toHaveLength(1)
  })
  it('skips blank lines', async () => {
    mockInvoke.mockResolvedValue('\nKEY=val\n')
    const vars = await loadProjectEnv('project-id', '')
    expect(vars).toHaveLength(1)
  })
  it('returns empty array when content is empty', async () => {
    mockInvoke.mockResolvedValue('')
    const vars = await loadProjectEnv('project-id', '')
    expect(vars).toHaveLength(0)
  })
  it('handles values containing = sign', async () => {
    mockInvoke.mockResolvedValue('DATABASE_URL=postgres://user:pass@host/db?ssl=true')
    const vars = await loadProjectEnv('project-id', '')
    expect(vars[0].val).toBe('postgres://user:pass@host/db?ssl=true')
  })
  it('skips lines without = sign', async () => {
    mockInvoke.mockResolvedValue('INVALID_LINE_NO_EQUALS\nKEY=val')
    const vars = await loadProjectEnv('project-id', '')
    expect(vars).toHaveLength(1)
    expect(vars[0].key).toBe('KEY')
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

describe('importAllEnvsFromProject', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('returns parsed environments for all suffixes', async () => {
    mockInvoke.mockResolvedValue([
      ['', 'PORT=3000\nHOST=localhost'],
      ['local', 'DB=local-db'],
      ['production', 'DB=prod-db\nAPI_KEY=secret'],
    ])
    const result = await importAllEnvsFromProject('/some/path')
    expect(mockInvoke).toHaveBeenCalledWith('import_all_envs_from_project', { projectPath: '/some/path' })
    expect(result).toHaveLength(3)
    expect(result[0].suffix).toBe('')
    expect(result[0].vars).toHaveLength(2)
    expect(result[0].vars[0].key).toBe('PORT')
    expect(result[1].suffix).toBe('local')
    expect(result[1].vars).toHaveLength(1)
    expect(result[2].suffix).toBe('production')
    expect(result[2].vars).toHaveLength(2)
  })

  it('returns empty array when no envs found', async () => {
    mockInvoke.mockResolvedValue([])
    const result = await importAllEnvsFromProject('/some/path')
    expect(result).toHaveLength(0)
  })
})

describe('deleteProjectEnv', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('calls delete_project_env with correct args', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await deleteProjectEnv('project-id', 'local')
    expect(mockInvoke).toHaveBeenCalledWith('delete_project_env', {
      projectId: 'project-id',
      suffix: 'local',
    })
  })

  it('calls delete_project_env with base suffix', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await deleteProjectEnv('project-id', '')
    expect(mockInvoke).toHaveBeenCalledWith('delete_project_env', {
      projectId: 'project-id',
      suffix: '',
    })
  })
})

describe('registerProject with activeEnv', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('passes activeEnv field to invoke', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await registerProject({
      id: 'p1',
      name: 'My Project',
      path: '/some/path',
      parentId: null,
      activeEnv: 'local',
    })
    expect(mockInvoke).toHaveBeenCalledWith('register_project', {
      entry: {
        id: 'p1',
        name: 'My Project',
        path: '/some/path',
        parentId: null,
        activeEnv: 'local',
      },
    })
  })

  it('works without activeEnv for backward compatibility', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await registerProject({
      id: 'p1',
      name: 'My Project',
      path: '/some/path',
      parentId: null,
    })
    expect(mockInvoke).toHaveBeenCalledWith('register_project', {
      entry: {
        id: 'p1',
        name: 'My Project',
        path: '/some/path',
        parentId: null,
      },
    })
  })
})

describe('writeEnvSignal', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('calls write_env_signal via invoke', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await writeEnvSignal()
    expect(mockInvoke).toHaveBeenCalledWith('write_env_signal')
  })

  it('propagates errors from invoke', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('write failed'))
    await expect(writeEnvSignal()).rejects.toThrow('write failed')
  })
})

describe('parseEnvContent (exported)', () => {
  it('parses content with projectId', () => {
    const vars = parseEnvContent('KEY=val\nSECRET=abc', 'p1')
    expect(vars).toHaveLength(2)
    expect(vars[0].key).toBe('KEY')
    expect(vars[0].val).toBe('val')
    expect(vars[0].sourceProjectId).toBe('p1')
    expect(vars[1].key).toBe('SECRET')
  })

  it('parses content without projectId', () => {
    const vars = parseEnvContent('KEY=val')
    expect(vars).toHaveLength(1)
    expect(vars[0].sourceProjectId).toBe('')
  })
})

// ── Push to Stage Tests ────────────────────────────────────────

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'proj-1',
  name: 'Test Project',
  path: '/tmp/test',
  parentId: null,
  vars: [],
  environments: [],
  activeEnv: '',
  inheritanceMode: 'merge-child-wins',
  sortOrder: 0,
  ...overrides,
})

const makeEnv = (suffix: string, vars: EnvVar[]): Environment => ({ suffix, vars })

describe('buildConflictReport', () => {
  it('classifies all vars as new when target is empty', () => {
    const varsToPush = [
      { key: 'NEW_KEY', val: 'new_val' },
      { key: 'ANOTHER', val: '123' },
    ]
    const report = buildConflictReport(varsToPush, [])
    expect(report.newKeys).toEqual(['NEW_KEY', 'ANOTHER'])
    expect(report.conflictSame).toHaveLength(0)
    expect(report.conflictDifferent).toHaveLength(0)
  })

  it('classifies all vars as conflictSame when values are identical', () => {
    const targetVars = [makeVar('API_KEY', 'secret'), makeVar('PORT', '3000')]
    const varsToPush = [
      { key: 'API_KEY', val: 'secret' },
      { key: 'PORT', val: '3000' },
    ]
    const report = buildConflictReport(varsToPush, targetVars)
    expect(report.newKeys).toHaveLength(0)
    expect(report.conflictSame).toEqual(['API_KEY', 'PORT'])
    expect(report.conflictDifferent).toHaveLength(0)
  })

  it('classifies all vars as conflictDifferent with correct sourceVal and targetVal', () => {
    const targetVars = [makeVar('DB_URL', 'dev-db'), makeVar('LOG_LEVEL', 'debug')]
    const varsToPush = [
      { key: 'DB_URL', val: 'prod-db' },
      { key: 'LOG_LEVEL', val: 'error' },
    ]
    const report = buildConflictReport(varsToPush, targetVars)
    expect(report.newKeys).toHaveLength(0)
    expect(report.conflictSame).toHaveLength(0)
    expect(report.conflictDifferent).toHaveLength(2)
    expect(report.conflictDifferent[0]).toEqual({ key: 'DB_URL', sourceVal: 'prod-db', targetVal: 'dev-db' })
    expect(report.conflictDifferent[1]).toEqual({ key: 'LOG_LEVEL', sourceVal: 'error', targetVal: 'debug' })
  })

  it('handles mixed: some new, some same, some different', () => {
    const targetVars = [makeVar('SAME', 'value'), makeVar('DIFFERENT', 'old')]
    const varsToPush = [
      { key: 'NEW', val: 'fresh' },
      { key: 'SAME', val: 'value' },
      { key: 'DIFFERENT', val: 'new' },
    ]
    const report = buildConflictReport(varsToPush, targetVars)
    expect(report.newKeys).toEqual(['NEW'])
    expect(report.conflictSame).toEqual(['SAME'])
    expect(report.conflictDifferent).toHaveLength(1)
    expect(report.conflictDifferent[0]).toEqual({ key: 'DIFFERENT', sourceVal: 'new', targetVal: 'old' })
  })

  it('returns empty report when varsToPush is empty', () => {
    const targetVars = [makeVar('EXISTING', 'val')]
    const report = buildConflictReport([], targetVars)
    expect(report.newKeys).toHaveLength(0)
    expect(report.conflictSame).toHaveLength(0)
    expect(report.conflictDifferent).toHaveLength(0)
  })
})

describe('mergeVarsForPush', () => {
  it('adds a new key and includes it in summary.written', () => {
    const targetVars = [makeVar('EXISTING', 'val')]
    const varsToPush = [{ key: 'NEW_KEY', val: 'new_val' }]
    const { mergedVars, summary } = mergeVarsForPush(varsToPush, targetVars, new Map(), 'p1')
    const newVar = mergedVars.find(v => v.key === 'NEW_KEY')
    expect(newVar).toBeDefined()
    expect(newVar?.val).toBe('new_val')
    expect(summary.written).toContain('NEW_KEY')
    expect(summary.skippedConflict).toHaveLength(0)
    expect(summary.skippedNoChange).toHaveLength(0)
  })

  it('skips identical key and includes it in summary.skippedNoChange', () => {
    const targetVars = [makeVar('PORT', '3000')]
    const varsToPush = [{ key: 'PORT', val: '3000' }]
    const { mergedVars, summary } = mergeVarsForPush(varsToPush, targetVars, new Map(), 'p1')
    const portVar = mergedVars.find(v => v.key === 'PORT')
    expect(portVar?.val).toBe('3000')
    expect(summary.written).not.toContain('PORT')
    expect(summary.skippedNoChange).toContain('PORT')
  })

  it('replaces a different key with overwrite decision and includes it in summary.written', () => {
    const targetVars = [makeVar('DB_URL', 'dev-db')]
    const varsToPush = [{ key: 'DB_URL', val: 'prod-db' }]
    const decisions = new Map<string, 'overwrite' | 'skip'>([['DB_URL', 'overwrite']])
    const { mergedVars, summary } = mergeVarsForPush(varsToPush, targetVars, decisions, 'p1')
    const dbVar = mergedVars.find(v => v.key === 'DB_URL')
    expect(dbVar?.val).toBe('prod-db')
    expect(summary.written).toContain('DB_URL')
    expect(summary.skippedConflict).not.toContain('DB_URL')
  })

  it('preserves target value with skip decision and includes it in summary.skippedConflict', () => {
    const targetVars = [makeVar('DB_URL', 'dev-db')]
    const varsToPush = [{ key: 'DB_URL', val: 'prod-db' }]
    const decisions = new Map<string, 'overwrite' | 'skip'>([['DB_URL', 'skip']])
    const { mergedVars, summary } = mergeVarsForPush(varsToPush, targetVars, decisions, 'p1')
    const dbVar = mergedVars.find(v => v.key === 'DB_URL')
    expect(dbVar?.val).toBe('dev-db')
    expect(summary.skippedConflict).toContain('DB_URL')
    expect(summary.written).not.toContain('DB_URL')
  })

  it('defaults to overwrite for keys not in conflictDecisions map', () => {
    const targetVars = [makeVar('LOG_LEVEL', 'debug')]
    const varsToPush = [{ key: 'LOG_LEVEL', val: 'error' }]
    const { mergedVars, summary } = mergeVarsForPush(varsToPush, targetVars, new Map(), 'p1')
    const logVar = mergedVars.find(v => v.key === 'LOG_LEVEL')
    expect(logVar?.val).toBe('error')
    expect(summary.written).toContain('LOG_LEVEL')
  })

  it('preserves target keys that are not in varsToPush', () => {
    const targetVars = [makeVar('KEEP', 'kept'), makeVar('ALSO_KEEP', 'also')]
    const varsToPush = [{ key: 'NEW', val: 'fresh' }]
    const { mergedVars } = mergeVarsForPush(varsToPush, targetVars, new Map(), 'p1')
    expect(mergedVars.find(v => v.key === 'KEEP')?.val).toBe('kept')
    expect(mergedVars.find(v => v.key === 'ALSO_KEEP')?.val).toBe('also')
  })

  it('assigns projectId correctly to newly added vars', () => {
    const varsToPush = [{ key: 'BRAND_NEW', val: 'value' }]
    const { mergedVars } = mergeVarsForPush(varsToPush, [], new Map(), 'project-abc')
    const newVar = mergedVars.find(v => v.key === 'BRAND_NEW')
    expect(newVar?.sourceProjectId).toBe('project-abc')
  })
})

describe('previewPushVarsToStage', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('calls load_project_env with correct projectId and targetSuffix', async () => {
    mockInvoke.mockResolvedValue('EXISTING=val')
    await previewPushVarsToStage('proj-1', 'staging', [{ key: 'NEW', val: 'new' }])
    expect(mockInvoke).toHaveBeenCalledWith('load_project_env', {
      projectId: 'proj-1',
      suffix: 'staging',
    })
  })

  it('returns a ConflictReport based on target content', async () => {
    mockInvoke.mockResolvedValue('SAME=value\nDIFF=old')
    const varsToPush = [
      { key: 'NEW', val: 'fresh' },
      { key: 'SAME', val: 'value' },
      { key: 'DIFF', val: 'new' },
    ]
    const report = await previewPushVarsToStage('proj-1', 'staging', varsToPush)
    expect(report.newKeys).toEqual(['NEW'])
    expect(report.conflictSame).toEqual(['SAME'])
    expect(report.conflictDifferent).toHaveLength(1)
    expect(report.conflictDifferent[0].key).toBe('DIFF')
  })

  it('handles empty target — all vars are new', async () => {
    mockInvoke.mockResolvedValue('')
    const varsToPush = [{ key: 'KEY', val: 'val' }]
    const report = await previewPushVarsToStage('proj-1', 'production', varsToPush)
    expect(report.newKeys).toEqual(['KEY'])
    expect(report.conflictSame).toHaveLength(0)
    expect(report.conflictDifferent).toHaveLength(0)
  })
})

describe('pushVarsToStage', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('calls push_vars_to_stage with correct args', async () => {
    // First call: load_project_env (current target vars)
    mockInvoke.mockResolvedValueOnce('EXISTING=old')
    // Second call: push_vars_to_stage (atomic write)
    mockInvoke.mockResolvedValueOnce({ snapshot: null, targetCreated: false })
    // Third call: load_project_env (re-read after push)
    mockInvoke.mockResolvedValueOnce('EXISTING=new\nNEW_KEY=val')

    await pushVarsToStage({
      projectId: 'proj-1',
      sourceSuffix: '',
      targetSuffix: 'staging',
      varsToPush: [{ key: 'EXISTING', val: 'new' }, { key: 'NEW_KEY', val: 'val' }],
      conflictDecisions: new Map(),
    })

    expect(mockInvoke).toHaveBeenCalledWith(
      'push_vars_to_stage',
      expect.objectContaining({ projectId: 'proj-1', targetSuffix: 'staging' })
    )
  })

  it('returns correct PushResult with summary', async () => {
    mockInvoke.mockResolvedValueOnce('')
    mockInvoke.mockResolvedValueOnce({ snapshot: null, targetCreated: true })
    mockInvoke.mockResolvedValueOnce('KEY=val')

    const result = await pushVarsToStage({
      projectId: 'proj-1',
      sourceSuffix: '',
      targetSuffix: 'production',
      varsToPush: [{ key: 'KEY', val: 'val' }],
      conflictDecisions: new Map(),
    })

    expect(result.summary.written).toContain('KEY')
    expect(result.summary.skippedConflict).toHaveLength(0)
    expect(result.summary.skippedNoChange).toHaveLength(0)
    expect(result.updatedVars).toHaveLength(1)
    expect(result.updatedVars[0].key).toBe('KEY')
  })

  it('passes through snapshot from AtomicWriteResult', async () => {
    mockInvoke.mockResolvedValueOnce('OLD=val')
    mockInvoke.mockResolvedValueOnce({ snapshot: 'OLD=val', targetCreated: false })
    mockInvoke.mockResolvedValueOnce('OLD=val\nNEW=x')

    const result = await pushVarsToStage({
      projectId: 'proj-1',
      sourceSuffix: '',
      targetSuffix: 'staging',
      varsToPush: [{ key: 'NEW', val: 'x' }],
      conflictDecisions: new Map(),
    })

    expect(result.snapshot).toBe('OLD=val')
  })

  it('re-reads target after push to populate updatedVars', async () => {
    mockInvoke.mockResolvedValueOnce('')
    mockInvoke.mockResolvedValueOnce({ snapshot: null, targetCreated: true })
    mockInvoke.mockResolvedValueOnce('A=1\nB=2\nC=3')

    const result = await pushVarsToStage({
      projectId: 'proj-1',
      sourceSuffix: '',
      targetSuffix: 'staging',
      varsToPush: [{ key: 'A', val: '1' }],
      conflictDecisions: new Map(),
    })

    expect(result.updatedVars).toHaveLength(3)
    // Verify the re-read used the correct suffix
    expect(mockInvoke).toHaveBeenCalledWith('load_project_env', expect.objectContaining({ suffix: 'staging' }))
  })

  it('passes through targetCreated from AtomicWriteResult', async () => {
    mockInvoke.mockResolvedValueOnce('')
    mockInvoke.mockResolvedValueOnce({ snapshot: null, targetCreated: true })
    mockInvoke.mockResolvedValueOnce('KEY=val')

    const result = await pushVarsToStage({
      projectId: 'proj-1',
      sourceSuffix: '',
      targetSuffix: 'new-env',
      varsToPush: [{ key: 'KEY', val: 'val' }],
      conflictDecisions: new Map(),
    })

    expect(result.targetCreated).toBe(true)
  })
})

describe('applyPushResultToProject', () => {
  it('replaces target environment vars in project.environments', () => {
    const oldVars = [makeVar('OLD', 'val')]
    const newVars = [makeVar('NEW', 'val')]
    const project = makeProject({
      environments: [makeEnv('staging', oldVars)],
      activeEnv: '',
    })
    const updated = applyPushResultToProject(project, 'staging', newVars)
    const stagingEnv = updated.environments.find(e => e.suffix === 'staging')
    expect(stagingEnv?.vars).toEqual(newVars)
  })

  it('does not mutate the original project', () => {
    const oldVars = [makeVar('KEY', 'old')]
    const project = makeProject({ environments: [makeEnv('staging', oldVars)] })
    const newVars = [makeVar('KEY', 'new')]
    applyPushResultToProject(project, 'staging', newVars)
    // original environments should be unchanged
    expect(project.environments[0].vars[0].val).toBe('old')
  })

  it('does not mutate the source environment', () => {
    const sourceVars = [makeVar('SRC', 'src-val')]
    const targetVars = [makeVar('TGT', 'tgt-val')]
    const project = makeProject({
      environments: [makeEnv('', sourceVars), makeEnv('staging', targetVars)],
      activeEnv: '',
    })
    const newTargetVars = [makeVar('TGT', 'updated')]
    const updated = applyPushResultToProject(project, 'staging', newTargetVars)
    const sourceEnv = updated.environments.find(e => e.suffix === '')
    expect(sourceEnv?.vars[0].val).toBe('src-val')
  })

  it('also updates project.vars when activeEnv matches targetSuffix', () => {
    const newVars = [makeVar('ACTIVE', 'new')]
    const project = makeProject({
      environments: [makeEnv('staging', [makeVar('ACTIVE', 'old')])],
      activeEnv: 'staging',
      vars: [makeVar('ACTIVE', 'old')],
    })
    const updated = applyPushResultToProject(project, 'staging', newVars)
    expect(updated.vars).toEqual(newVars)
  })

  it('leaves project.vars unchanged when activeEnv does not match targetSuffix', () => {
    const originalVars = [makeVar('BASE', 'base-val')]
    const project = makeProject({
      environments: [makeEnv('staging', [makeVar('STAGING', 'old')])],
      activeEnv: '',
      vars: originalVars,
    })
    const newStagingVars = [makeVar('STAGING', 'new')]
    const updated = applyPushResultToProject(project, 'staging', newStagingVars)
    expect(updated.vars).toEqual(originalVars)
  })

  it('creates a new Environment entry if targetSuffix is not in environments', () => {
    const project = makeProject({
      environments: [makeEnv('', [makeVar('BASE', 'val')])],
      activeEnv: '',
    })
    const newVars = [makeVar('PROD', 'prod-val')]
    const updated = applyPushResultToProject(project, 'production', newVars)
    const prodEnv = updated.environments.find(e => e.suffix === 'production')
    expect(prodEnv).toBeDefined()
    expect(prodEnv?.vars).toEqual(newVars)
    // Original env must still be present
    expect(updated.environments.find(e => e.suffix === '')).toBeDefined()
  })
})
