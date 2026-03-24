import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Sidebar from '../components/Sidebar'
import type { ProjectTreeNode } from '../types'

const makeNode = (id: string, name: string, depth = 0, children: ProjectTreeNode[] = []): ProjectTreeNode => ({
  project: { id, name, path: `/${id}`, parentId: null, vars: [], inheritanceMode: 'merge-child-wins', sortOrder: 0 },
  depth,
  children,
  ancestorChain: [],
})

describe('Sidebar', () => {
  it('renders project names', () => {
    const tree = [makeNode('p1', 'my-api'), makeNode('p2', 'frontend')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} />)
    expect(screen.getByText('my-api')).toBeInTheDocument()
    expect(screen.getByText('frontend')).toBeInTheDocument()
  })

  it('renders children indented under parent', () => {
    const child = makeNode('child', 'auth-service', 1)
    const tree = [makeNode('root', 'main-app', 0, [child])]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} />)
    expect(screen.getByText('main-app')).toBeInTheDocument()
    expect(screen.getByText('auth-service')).toBeInTheDocument()
  })

  it('calls onSelect with project id when clicked', () => {
    const onSelect = vi.fn()
    const tree = [makeNode('p1', 'my-api')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={onSelect} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} />)
    screen.getByText('my-api').closest('[role="button"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).toHaveBeenCalledWith('p1')
  })

  it('shows empty state when no projects', () => {
    render(<Sidebar projectTree={[]} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} />)
    expect(screen.getByText(/No projects yet/i)).toBeInTheDocument()
  })

  it('marks selected project as active', () => {
    const tree = [makeNode('p1', 'selected-proj')]
    render(<Sidebar projectTree={tree} selectedId="p1" onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} />)
    const item = screen.getByText('selected-proj').closest('[role="button"]')
    expect(item?.className).toContain('active')
  })

  it('calls onDelete when remove button is clicked', () => {
    const onDelete = vi.fn()
    const tree = [makeNode('p1', 'my-project')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={vi.fn()} onDelete={onDelete} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} />)
    screen.getByRole('button', { name: /Remove project my-project/i }).click()
    expect(onDelete).toHaveBeenCalledWith('p1')
  })

  it('calls onAddSubProject when sub-project button is clicked', () => {
    const onAddSubProject = vi.fn()
    const tree = [makeNode('p1', 'my-project')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={onAddSubProject} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} />)
    screen.getByRole('button', { name: /Add sub-project under my-project/i }).click()
    expect(onAddSubProject).toHaveBeenCalledWith('p1')
  })

  it('calls onAdd when add project button is clicked', () => {
    const onAdd = vi.fn()
    render(<Sidebar projectTree={[]} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={onAdd} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} />)
    screen.getByRole('button', { name: /Add project folder/i }).click()
    expect(onAdd).toHaveBeenCalled()
  })

  it('calls onSelect with keyboard Space key', () => {
    const onSelect = vi.fn()
    const tree = [makeNode('p1', 'my-api')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={onSelect} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} />)
    const item = screen.getByText('my-api').closest('[role="button"]')!
    fireEvent.keyDown(item, { key: ' ' })
    expect(onSelect).toHaveBeenCalledWith('p1')
  })

  it('calls onSelect with keyboard Enter key', () => {
    const onSelect = vi.fn()
    const tree = [makeNode('p1', 'my-api')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={onSelect} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} />)
    const item = screen.getByText('my-api').closest('[role="button"]')!
    fireEvent.keyDown(item, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('p1')
  })

  it('shows var count correctly for singular', () => {
    const child = makeNode('p1', 'proj', 0)
    const nodeWithVar = {
      ...child,
      project: { ...child.project, vars: [{ id: 'v1', key: 'K', val: 'v', revealed: false, sourceProjectId: 'p1' }] }
    }
    render(<Sidebar projectTree={[nodeWithVar]} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} />)
    expect(screen.getByText('1 var')).toBeInTheDocument()
  })
})
