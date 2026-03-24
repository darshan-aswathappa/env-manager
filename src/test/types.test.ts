import { describe, it, expect } from 'vitest'
import type { EnvVar, Project, ProjectTreeNode, ProjectRegistry, InheritanceMode, Environment } from '../types'
import { ENV_SUFFIXES, envDisplayName } from '../types'

describe('types', () => {
  it('EnvVar has required fields', () => {
    const v: EnvVar = {
      id: '1',
      key: 'MY_KEY',
      val: 'my-val',
      revealed: false,
      sourceProjectId: 'proj-1',
    }
    expect(v.key).toBe('MY_KEY')
    expect(v.sourceProjectId).toBe('proj-1')
  })

  it('Environment has suffix and vars', () => {
    const env: Environment = {
      suffix: 'local',
      vars: [{ id: '1', key: 'K', val: 'V', revealed: false, sourceProjectId: 'p1' }],
    }
    expect(env.suffix).toBe('local')
    expect(env.vars).toHaveLength(1)
  })

  it('Project has environments and activeEnv fields', () => {
    const p: Project = {
      id: 'p1',
      name: 'Test',
      path: '/test',
      parentId: null,
      vars: [],
      environments: [{ suffix: '', vars: [] }],
      activeEnv: '',
      inheritanceMode: 'merge-child-wins',
      sortOrder: 0,
    }
    expect(p.parentId).toBeNull()
    expect(p.inheritanceMode).toBe('merge-child-wins')
    expect(p.sortOrder).toBe(0)
    expect(p.environments).toHaveLength(1)
    expect(p.activeEnv).toBe('')
  })

  it('ENV_SUFFIXES contains the six fixed suffixes', () => {
    expect(ENV_SUFFIXES).toEqual(['', 'local', 'development', 'production', 'testing', 'staging'])
    expect(ENV_SUFFIXES).toHaveLength(6)
  })

  it('envDisplayName maps suffixes to display names', () => {
    expect(envDisplayName('')).toBe('.env')
    expect(envDisplayName('local')).toBe('.env.local')
    expect(envDisplayName('production')).toBe('.env.production')
  })

  it('InheritanceMode allows all three values', () => {
    const modes: InheritanceMode[] = ['merge-child-wins', 'merge-parent-wins', 'isolated']
    expect(modes).toHaveLength(3)
  })

  it('ProjectTreeNode wraps a project with depth and children', () => {
    const project: Project = {
      id: 'root',
      name: 'Root',
      path: '/root',
      parentId: null,
      vars: [],
      environments: [{ suffix: '', vars: [] }],
      activeEnv: '',
      inheritanceMode: 'isolated',
      sortOrder: 0,
    }
    const node: ProjectTreeNode = {
      project,
      depth: 0,
      children: [],
      ancestorChain: [],
    }
    expect(node.depth).toBe(0)
    expect(node.children).toHaveLength(0)
  })

  it('ProjectRegistry is an array of Projects', () => {
    const registry: ProjectRegistry = []
    expect(Array.isArray(registry)).toBe(true)
  })
})
