import type { Project, ProjectTreeNode, EnvVar } from '../types'

export function buildProjectTree(projects: Project[]): ProjectTreeNode[] {
  const projectIds = new Set(projects.map(p => p.id))

  function buildNode(project: Project, depth: number, ancestorChain: Project[]): ProjectTreeNode {
    const children = projects
      .filter(p => p.parentId === project.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(child => buildNode(child, depth + 1, [...ancestorChain, project]))
    return { project, depth, children, ancestorChain }
  }

  // Treat projects as root if parentId is null OR if parent no longer exists (orphan recovery)
  return projects
    .filter(p => p.parentId === null || !projectIds.has(p.parentId))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(p => buildNode(p, 0, []))
}

export function getAncestorChain(projectId: string, projects: Project[]): Project[] {
  const byId = new Map(projects.map(p => [p.id, p]))
  const chain: Project[] = []
  let current = byId.get(projectId)
  while (current?.parentId) {
    const parent = byId.get(current.parentId)
    if (!parent) break
    chain.unshift(parent)
    current = parent
  }
  return chain
}

export function getActiveVars(project: Project): EnvVar[] {
  return project.environments.find(e => e.suffix === project.activeEnv)?.vars ?? []
}

export function computeEffectiveVars(projectId: string, projects: Project[]): EnvVar[] {
  const byId = new Map(projects.map(p => [p.id, p]))
  const project = byId.get(projectId)
  if (!project) return []

  if (project.inheritanceMode === 'isolated') return [...project.vars]

  const ancestors = getAncestorChain(projectId, projects)
  const layers = ancestors.map(a => byId.get(a.id)!).filter(Boolean)

  if (project.inheritanceMode === 'merge-child-wins') {
    // Load parent layers first, child last — child overrides
    const merged = new Map<string, EnvVar>()
    for (const layer of [...layers, project]) {
      for (const v of layer.vars) merged.set(v.key, v)
    }
    return Array.from(merged.values())
  } else {
    // merge-parent-wins: load child first, parent last — parent overrides
    const merged = new Map<string, EnvVar>()
    for (const layer of [project, ...layers.reverse()]) {
      for (const v of layer.vars) merged.set(v.key, v)
    }
    return Array.from(merged.values())
  }
}
