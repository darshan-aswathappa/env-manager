import { describe, it, expect } from 'vitest'
import type { EnvVar, Project, ProjectTreeNode, ProjectRegistry, InheritanceMode } from '../types'

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

  it('Project has parentId and inheritanceMode fields', () => {
    const p: Project = {
      id: 'p1',
      name: 'Test',
      path: '/test',
      parentId: null,
      vars: [],
      inheritanceMode: 'merge-child-wins',
      sortOrder: 0,
    }
    expect(p.parentId).toBeNull()
    expect(p.inheritanceMode).toBe('merge-child-wins')
    expect(p.sortOrder).toBe(0)
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
