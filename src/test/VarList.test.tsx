import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VarList from '../components/VarList'
import type { Project, EnvVar } from '../types'

const makeProject = (vars: EnvVar[] = []): Project => ({
  id: 'p1', name: 'Test Project', path: '/test', parentId: null,
  vars, environments: [{ suffix: '', vars: [] }], activeEnv: '',
  inheritanceMode: 'merge-child-wins', sortOrder: 0,
})

const makeVar = (key: string, val: string, revealed = false): EnvVar => ({
  id: crypto.randomUUID(), key, val, revealed, sourceProjectId: 'p1',
})

describe('VarList', () => {
  it('shows select a project when project is null', () => {
    render(<VarList project={null} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    expect(screen.getByText(/Select a project/i)).toBeInTheDocument()
  })

  it('renders env var keys', () => {
    const project = makeProject([makeVar('DATABASE_URL', 'postgres://localhost'), makeVar('PORT', '3000')])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    expect(screen.getByText('DATABASE_URL')).toBeInTheDocument()
    expect(screen.getByText('PORT')).toBeInTheDocument()
  })

  it('shows empty state when no vars and no search', () => {
    const project = makeProject([])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    expect(screen.getByText(/No variables yet/i)).toBeInTheDocument()
  })

  it('filters vars by search query', () => {
    const project = makeProject([makeVar('DATABASE_URL', 'postgres'), makeVar('PORT', '3000')])
    render(<VarList project={project} selectedVarId={null} searchQuery="database" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    expect(screen.getByText('DATABASE_URL')).toBeInTheDocument()
    expect(screen.queryByText('PORT')).not.toBeInTheDocument()
  })

  it('shows no results message when search finds nothing', () => {
    const project = makeProject([makeVar('PORT', '3000')])
    render(<VarList project={project} selectedVarId={null} searchQuery="zzz" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    expect(screen.getByText(/No results for/i)).toBeInTheDocument()
  })

  it('calls onSelectVar when var item is clicked', () => {
    const onSelectVar = vi.fn()
    const v = makeVar('API_KEY', 'secret')
    const project = makeProject([v])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={onSelectVar} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />);
    (screen.getByText('API_KEY').closest('[role="listitem"]')! as HTMLElement).click()
    expect(onSelectVar).toHaveBeenCalledWith(v.id)
  })

  it('calls onAddVar when + button is clicked', () => {
    const onAddVar = vi.fn()
    const project = makeProject([])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={onAddVar} onDeleteVar={vi.fn()} />)
    screen.getByRole('button', { name: /Add new variable/i }).click()
    expect(onAddVar).toHaveBeenCalled()
  })

  it('shows masked value preview for hidden vars', () => {
    const project = makeProject([makeVar('SECRET', 'my-secret', false)])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    expect(screen.getByText('••••••••')).toBeInTheDocument()
  })

  it('shows revealed value when var is revealed', () => {
    const project = makeProject([makeVar('PORT', '3000', true)])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    expect(screen.getByText('3000')).toBeInTheDocument()
  })

  it('calls onSearchChange when search input changes', () => {
    const onSearchChange = vi.fn()
    const project = makeProject([makeVar('KEY', 'val')])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={onSearchChange} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ke' } })
    expect(onSearchChange).toHaveBeenCalledWith('ke')
  })

  it('marks selected var as active', () => {
    const v = makeVar('MY_KEY', 'val')
    const project = makeProject([v])
    render(<VarList project={project} selectedVarId={v.id} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    const item = screen.getByText('MY_KEY').closest('[role="listitem"]')
    expect(item?.className).toContain('active')
  })

  it('calls onSelectVar with keyboard Enter key', () => {
    const onSelectVar = vi.fn()
    const v = makeVar('ENV_KEY', 'val')
    const project = makeProject([v])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={onSelectVar} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    const item = screen.getByText('ENV_KEY').closest('[role="listitem"]')!
    fireEvent.keyDown(item, { key: 'Enter' })
    expect(onSelectVar).toHaveBeenCalledWith(v.id)
  })

  it('calls onSelectVar with keyboard Space key', () => {
    const onSelectVar = vi.fn()
    const v = makeVar('ENV_KEY', 'val')
    const project = makeProject([v])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={onSelectVar} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    const item = screen.getByText('ENV_KEY').closest('[role="listitem"]')!
    fireEvent.keyDown(item, { key: ' ' })
    expect(onSelectVar).toHaveBeenCalledWith(v.id)
  })

  it('shows var color classification for secret keys', () => {
    const project = makeProject([makeVar('API_SECRET', 'val')])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    expect(screen.getByText('API_SECRET')).toBeInTheDocument()
  })

  it('shows var color for url keys', () => {
    const project = makeProject([makeVar('DATABASE_URL', 'postgres://localhost')])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    expect(screen.getByText('DATABASE_URL')).toBeInTheDocument()
  })

  it('shows var color for database keys', () => {
    const project = makeProject([makeVar('REDIS_HOST', 'localhost')])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    expect(screen.getByText('REDIS_HOST')).toBeInTheDocument()
  })

  it('truncates long values in preview', () => {
    const longVal = 'a'.repeat(40)
    const v = makeVar('LONG_KEY', longVal, true) // revealed = true to show val
    const project = makeProject([v])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    // Should show truncated value
    expect(screen.getByText(/a{28}…/)).toBeInTheDocument()
  })

  it('shows confirmation UI when delete button is clicked', () => {
    const v = makeVar('API_KEY', 'secret')
    const project = makeProject([v])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Delete API_KEY/i }))
    expect(screen.getByRole('button', { name: /Confirm delete/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel delete/i })).toBeInTheDocument()
  })

  it('does not call onDeleteVar when cancel is clicked', () => {
    const onDeleteVar = vi.fn()
    const v = makeVar('API_KEY', 'secret')
    const project = makeProject([v])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={onDeleteVar} />)
    fireEvent.click(screen.getByRole('button', { name: /Delete API_KEY/i }))
    fireEvent.click(screen.getByRole('button', { name: /Cancel delete/i }))
    expect(onDeleteVar).not.toHaveBeenCalled()
    expect(screen.getByText('API_KEY')).toBeInTheDocument()
  })

  it('calls onDeleteVar when confirm delete is clicked', () => {
    const onDeleteVar = vi.fn()
    const v = makeVar('API_KEY', 'secret')
    const project = makeProject([v])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={onDeleteVar} />)
    fireEvent.click(screen.getByRole('button', { name: /Delete API_KEY/i }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm delete/i }))
    expect(onDeleteVar).toHaveBeenCalledWith(v.id)
  })

  it('dismisses confirmation on Escape key', () => {
    const onDeleteVar = vi.fn()
    const v = makeVar('API_KEY', 'secret')
    const project = makeProject([v])
    render(<VarList project={project} selectedVarId={null} searchQuery="" onSearchChange={vi.fn()} onSelectVar={vi.fn()} onAddVar={vi.fn()} onDeleteVar={onDeleteVar} />)
    fireEvent.click(screen.getByRole('button', { name: /Delete API_KEY/i }))
    fireEvent.keyDown(screen.getByRole('listitem'), { key: 'Escape' })
    expect(onDeleteVar).not.toHaveBeenCalled()
    expect(screen.getByText('API_KEY')).toBeInTheDocument()
  })
})

describe('VarList push button', () => {
  const renderVarList = (onOpenPush: (() => void) | null, vars: EnvVar[] = [makeVar('API_KEY', 'secret')]) => {
    const project = makeProject(vars)
    return render(
      <VarList
        project={project}
        selectedVarId={null}
        searchQuery=""
        onSearchChange={vi.fn()}
        onSelectVar={vi.fn()}
        onAddVar={vi.fn()}
        onDeleteVar={vi.fn()}
        onOpenPush={onOpenPush}
      />
    )
  }

  it('renders push button when onOpenPush is provided', () => {
    renderVarList(vi.fn())
    expect(screen.getByTestId('push-to-stage-btn')).toBeInTheDocument()
  })

  it('calls onOpenPush when push button is clicked', () => {
    const onOpenPush = vi.fn()
    renderVarList(onOpenPush)
    fireEvent.click(screen.getByTestId('push-to-stage-btn'))
    expect(onOpenPush).toHaveBeenCalledTimes(1)
  })

  it('push button is disabled when onOpenPush is null', () => {
    renderVarList(null)
    const btn = screen.getByTestId('push-to-stage-btn')
    expect(btn).toHaveStyle({ pointerEvents: 'none' })
  })

  it('push button has correct aria-label and title', () => {
    renderVarList(vi.fn())
    const btn = screen.getByTestId('push-to-stage-btn')
    expect(btn).toHaveAttribute('aria-label', 'Push variables to stage')
    expect(btn).toHaveAttribute('title', 'Push to stage (⌘⇧P)')
  })

  it('push button renders but is disabled when onOpenPush is null', () => {
    renderVarList(null)
    const btn = screen.getByTestId('push-to-stage-btn')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveStyle({ opacity: '0.4' })
  })

  it('push button does not call handler when disabled (onOpenPush is null)', () => {
    const onOpenPush = vi.fn()
    renderVarList(null)
    fireEvent.click(screen.getByTestId('push-to-stage-btn'))
    expect(onOpenPush).not.toHaveBeenCalled()
  })

  it('renders push button even when project has no vars', () => {
    renderVarList(null, [])
    expect(screen.getByTestId('push-to-stage-btn')).toBeInTheDocument()
  })
})
