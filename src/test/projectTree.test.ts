import { describe, it, expect } from 'vitest'
import { buildProjectTree, getAncestorChain, computeEffectiveVars } from '../lib/projectTree'
import type { Project, EnvVar } from '../types'

const makeProject = (id: string, path: string, parentId: string | null = null): Project => ({
  id, name: id, path, parentId,
  vars: [], inheritanceMode: 'merge-child-wins', sortOrder: 0,
})

const makeVar = (key: string, val: string, projectId: string): EnvVar => ({
  id: crypto.randomUUID(), key, val, revealed: false, sourceProjectId: projectId,
})

describe('buildProjectTree', () => {
  it('returns root nodes for projects with no parentId', () => {
    const projects = [makeProject('a', '/a'), makeProject('b', '/b')]
    const tree = buildProjectTree(projects)
    expect(tree).toHaveLength(2)
    expect(tree[0].project.id).toBe('a')
    expect(tree[0].depth).toBe(0)
  })

  it('nests children under their parent', () => {
    const projects = [
      makeProject('root', '/root'),
      makeProject('child', '/root/child', 'root'),
    ]
    const tree = buildProjectTree(projects)
    expect(tree).toHaveLength(1)
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].project.id).toBe('child')
    expect(tree[0].children[0].depth).toBe(1)
  })

  it('sets ancestorChain correctly for a child', () => {
    const root = makeProject('root', '/root')
    const child = makeProject('child', '/root/child', 'root')
    const tree = buildProjectTree([root, child])
    const childNode = tree[0].children[0]
    expect(childNode.ancestorChain).toHaveLength(1)
    expect(childNode.ancestorChain[0].id).toBe('root')
  })

  it('handles grandchild depth and ancestorChain', () => {
    const projects = [
      makeProject('root', '/root'),
      makeProject('child', '/root/child', 'root'),
      makeProject('grand', '/root/child/grand', 'child'),
    ]
    const tree = buildProjectTree(projects)
    const grand = tree[0].children[0].children[0]
    expect(grand.depth).toBe(2)
    expect(grand.ancestorChain.map(p => p.id)).toEqual(['root', 'child'])
  })

  it('returns empty array for empty input', () => {
    expect(buildProjectTree([])).toEqual([])
  })

  it('treats orphaned projects as root when parent no longer exists', () => {
    const projects = [makeProject('orphan', '/orphan', 'nonexistent-parent')]
    const tree = buildProjectTree(projects)
    expect(tree).toHaveLength(1)
    expect(tree[0].project.id).toBe('orphan')
    expect(tree[0].depth).toBe(0)
  })
})

describe('getAncestorChain', () => {
  it('returns empty for root project', () => {
    const projects = [makeProject('root', '/root')]
    expect(getAncestorChain('root', projects)).toEqual([])
  })

  it('returns parent chain ordered outermost-first', () => {
    const projects = [
      makeProject('root', '/root'),
      makeProject('child', '/child', 'root'),
      makeProject('grand', '/grand', 'child'),
    ]
    const chain = getAncestorChain('grand', projects)
    expect(chain.map(p => p.id)).toEqual(['root', 'child'])
  })
})

describe('computeEffectiveVars', () => {
  it('returns own vars for isolated project', () => {
    const projects = [
      { ...makeProject('root', '/root'), vars: [makeVar('KEY', 'from-root', 'root')] },
      { ...makeProject('child', '/child', 'root'), vars: [makeVar('KEY', 'from-child', 'child')], inheritanceMode: 'isolated' as const },
    ]
    const result = computeEffectiveVars('child', projects)
    expect(result).toHaveLength(1)
    expect(result[0].val).toBe('from-child')
  })

  it('child wins over parent on conflict (merge-child-wins)', () => {
    const projects = [
      { ...makeProject('root', '/root'), vars: [makeVar('PORT', '8080', 'root'), makeVar('DB', 'prod', 'root')] },
      { ...makeProject('child', '/child', 'root'), vars: [makeVar('PORT', '4000', 'child')], inheritanceMode: 'merge-child-wins' as const },
    ]
    const result = computeEffectiveVars('child', projects)
    const port = result.find(v => v.key === 'PORT')
    const db = result.find(v => v.key === 'DB')
    expect(port?.val).toBe('4000')   // child wins
    expect(db?.val).toBe('prod')     // inherited from parent
  })

  it('parent wins over child on conflict (merge-parent-wins)', () => {
    const projects = [
      { ...makeProject('root', '/root'), vars: [makeVar('PORT', '8080', 'root')] },
      { ...makeProject('child', '/child', 'root'), vars: [makeVar('PORT', '4000', 'child')], inheritanceMode: 'merge-parent-wins' as const },
    ]
    const result = computeEffectiveVars('child', projects)
    const port = result.find(v => v.key === 'PORT')
    expect(port?.val).toBe('8080')   // parent wins
  })

  it('returns empty array for unknown project id', () => {
    const projects = [makeProject('a', '/a')]
    const result = computeEffectiveVars('unknown', projects)
    expect(result).toEqual([])
  })
})
