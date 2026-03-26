import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Sidebar from '../components/Sidebar'
import type { ProjectTreeNode } from '../types'

const makeNode = (id: string, name: string, depth = 0, children: ProjectTreeNode[] = []): ProjectTreeNode => ({
  project: { id, name, path: `/${id}`, parentId: null, vars: [], environments: [{ suffix: '', vars: [] }], activeEnv: '', inheritanceMode: 'merge-child-wins', sortOrder: 0 },
  depth,
  children,
  ancestorChain: [],
})

describe('Sidebar', () => {
  it('renders project names', () => {
    const tree = [makeNode('p1', 'my-api'), makeNode('p2', 'frontend')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    expect(screen.getByText('my-api')).toBeInTheDocument()
    expect(screen.getByText('frontend')).toBeInTheDocument()
  })

  it('renders children indented under parent', () => {
    const child = makeNode('child', 'auth-service', 1)
    const tree = [makeNode('root', 'main-app', 0, [child])]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    expect(screen.getByText('main-app')).toBeInTheDocument()
    expect(screen.getByText('auth-service')).toBeInTheDocument()
  })

  it('calls onSelect with project id when clicked', () => {
    const onSelect = vi.fn()
    const tree = [makeNode('p1', 'my-api')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={onSelect} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    screen.getByText('my-api').closest('[role="button"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onSelect).toHaveBeenCalledWith('p1')
  })

  it('shows empty state when no projects', () => {
    render(<Sidebar projectTree={[]} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    expect(screen.getByText(/No projects yet/i)).toBeInTheDocument()
  })

  it('marks selected project as active', () => {
    const tree = [makeNode('p1', 'selected-proj')]
    render(<Sidebar projectTree={tree} selectedId="p1" onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    const item = screen.getByText('selected-proj').closest('[role="button"]')
    expect(item?.className).toContain('active')
  })

  it('calls onDelete when remove is chosen from overflow menu and confirmed', async () => {
    const onDelete = vi.fn()
    const tree = [makeNode('p1', 'my-project')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={vi.fn()} onDelete={onDelete} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    await act(async () => { screen.getByRole('button', { name: /More options/i }).click() })
    const removeBtn = screen.getAllByRole('button', { name: /Remove project/i }).find(el => el.tagName === 'BUTTON')!
    await act(async () => { removeBtn.click() })
    await act(async () => { screen.getByRole('button', { name: /Confirm remove my-project/i }).click() })
    expect(onDelete).toHaveBeenCalledWith('p1')
  })

  it('renders overflow menu as a portal in document.body', async () => {
    const tree = [makeNode('p1', 'my-project')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    await act(async () => { screen.getByRole('button', { name: /More options/i }).click() })
    const menu = document.querySelector('.project-overflow-menu')
    expect(menu).toBeInTheDocument()
    expect(menu?.parentElement).toBe(document.body)
  })

  it('calls onAddSubProject when chosen from overflow menu', async () => {
    const onAddSubProject = vi.fn()
    const tree = [makeNode('p1', 'my-project')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={onAddSubProject} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    await act(async () => { screen.getByRole('button', { name: /More options/i }).click() })
    const subBtn = screen.getAllByRole('button', { name: /Add sub-project/i }).find(el => el.tagName === 'BUTTON')!
    await act(async () => { subBtn.click() })
    expect(onAddSubProject).toHaveBeenCalledWith('p1')
  })

  it('calls onAdd when add project button is clicked', () => {
    const onAdd = vi.fn()
    render(<Sidebar projectTree={[]} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={onAdd} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    screen.getByRole('button', { name: /Add project folder/i }).click()
    expect(onAdd).toHaveBeenCalled()
  })

  it('calls onSelect with keyboard Space key', () => {
    const onSelect = vi.fn()
    const tree = [makeNode('p1', 'my-api')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={onSelect} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    const item = screen.getByText('my-api').closest('[role="button"]')!
    fireEvent.keyDown(item, { key: ' ' })
    expect(onSelect).toHaveBeenCalledWith('p1')
  })

  it('calls onSelect with keyboard Enter key', () => {
    const onSelect = vi.fn()
    const tree = [makeNode('p1', 'my-api')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={onSelect} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    const item = screen.getByText('my-api').closest('[role="button"]')!
    fireEvent.keyDown(item, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('p1')
  })

  it('collapses and expands sidebar', async () => {
    render(<Sidebar projectTree={[]} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Collapse sidebar/i })) })
    expect(screen.getByRole('button', { name: /Expand sidebar/i })).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Expand sidebar/i })) })
    expect(screen.getByRole('button', { name: /Collapse sidebar/i })).toBeInTheDocument()
  })

  it('collapses and expands child projects', async () => {
    const child = makeNode('child', 'auth-service', 1)
    const tree = [makeNode('root', 'main-app', 0, [child])]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    expect(screen.getByText('auth-service')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Collapse main-app/i })) })
    expect(screen.queryByText('auth-service')).not.toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Expand main-app/i })) })
    expect(screen.getByText('auth-service')).toBeInTheDocument()
  })

  it('shows var count correctly for plural', () => {
    const child = makeNode('p1', 'proj', 0)
    const nodeWithVars = {
      ...child,
      project: {
        ...child.project,
        vars: [
          { id: 'v1', key: 'K1', val: 'v1', revealed: false, sourceProjectId: 'p1' },
          { id: 'v2', key: 'K2', val: 'v2', revealed: false, sourceProjectId: 'p1' },
        ]
      }
    }
    render(<Sidebar projectTree={[nodeWithVars]} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    expect(screen.getByText('2 vars')).toBeInTheDocument()
  })

  it('calls onGenerateExample when "Generate .env.example" is chosen from overflow menu', async () => {
    const onGenerateExample = vi.fn()
    const tree = [makeNode('p1', 'my-project')]
    render(<Sidebar projectTree={tree} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={onGenerateExample} />)
    await act(async () => { screen.getByRole('button', { name: /More options/i }).click() })
    const genBtn = screen.getAllByRole('button', { name: /Generate .env.example/i }).find(el => el.tagName === 'BUTTON')!
    await act(async () => { genBtn.click() })
    expect(onGenerateExample).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }))
  })

  it('shows var count correctly for singular', () => {
    const child = makeNode('p1', 'proj', 0)
    const nodeWithVar = {
      ...child,
      project: { ...child.project, vars: [{ id: 'v1', key: 'K', val: 'v', revealed: false, sourceProjectId: 'p1' }] }
    }
    render(<Sidebar projectTree={[nodeWithVar]} selectedId={null} onSelect={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} onAddSubProject={vi.fn()} onOpenShellIntegration={vi.fn()} onOpenSettings={vi.fn()} onImportFromExample={vi.fn()} onGenerateExample={vi.fn()} />)
    expect(screen.getByText('1 var')).toBeInTheDocument()
  })
})
