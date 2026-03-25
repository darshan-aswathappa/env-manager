import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
// userEvent available for future tests requiring pointer/keyboard simulation
// import userEvent from '@testing-library/user-event'
import PushToStagePanel from '../components/PushToStage/PushToStagePanel'
import type { Project, EnvVar, ConflictReport } from '../types'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../lib/envFile', () => ({
  previewPushVarsToStage: vi.fn().mockResolvedValue({
    newKeys: [],
    conflictSame: [],
    conflictDifferent: [],
  }),
  pushVarsToStage: vi.fn().mockResolvedValue({
    summary: { written: [], skippedConflict: [], skippedNoChange: [] },
    snapshot: null,
    targetCreated: false,
    updatedVars: [],
  }),
}))

import { previewPushVarsToStage, pushVarsToStage } from '../lib/envFile'

const mockPreview = vi.mocked(previewPushVarsToStage)
const mockPush = vi.mocked(pushVarsToStage)

// ── Helpers ────────────────────────────────────────────────────────────────

let idCounter = 0
const makeVar = (key: string, val: string, revealed = false): EnvVar => ({
  id: `var-${++idCounter}`,
  key,
  val,
  revealed,
  sourceProjectId: 'p1',
})

// Helper to build ConflictDetail array from keys
const makeDifferent = (keys: string[]) =>
  keys.map((key) => ({ key, sourceVal: 'new-val', targetVal: 'old-val' }))

const makeReport = (overrides: Partial<{
  newKeys: string[];
  conflictSame: string[];
  conflictDifferent: string[];
}> = {}): ConflictReport => ({
  newKeys: overrides.newKeys ?? [],
  conflictSame: overrides.conflictSame ?? [],
  conflictDifferent: makeDifferent(overrides.conflictDifferent ?? []),
})

const makeProject = (vars: EnvVar[] = [], envSuffixes: string[] = ['', 'staging']): Project => ({
  id: 'p1',
  name: 'Test Project',
  path: '/test',
  parentId: null,
  vars,
  environments: envSuffixes.map((suffix) => ({ suffix, vars: [] })),
  activeEnv: 'development',
  inheritanceMode: 'merge-child-wins',
  sortOrder: 0,
})

const defaultProps = {
  project: makeProject(),
  sourceSuffix: 'development',
  onClose: vi.fn(),
  onPushComplete: vi.fn(),
}

// ── Suites ────────────────────────────────────────────────────────────────

describe('PushToStagePanel', () => {
  beforeEach(() => {
    idCounter = 0
    vi.clearAllMocks()
    mockPreview.mockResolvedValue(makeReport())
    mockPush.mockResolvedValue({
      summary: { written: [], skippedConflict: [], skippedNoChange: [] },
      snapshot: null,
      targetCreated: false,
      updatedVars: [],
    })
  })

  // ── 1. Rendering ──────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders panel with header "Push Variables"', () => {
      render(<PushToStagePanel {...defaultProps} />)
      expect(screen.getByText('Push Variables')).toBeInTheDocument()
    })

    it('shows source suffix in subtitle "from .env.development"', () => {
      render(<PushToStagePanel {...defaultProps} sourceSuffix="development" />)
      // Text is split across elements: "from " + <span>.env.development</span>
      // Multiple spans render this text (header + footer), so use getAllByText
      const matches = screen.getAllByText('.env.development')
      expect(matches.length).toBeGreaterThan(0)
    })

    it('shows source suffix for root .env when suffix is empty string', () => {
      render(<PushToStagePanel {...defaultProps} sourceSuffix="" />)
      // envDisplayName('') returns '.env'
      const spans = screen.getAllByText('.env')
      expect(spans.length).toBeGreaterThan(0)
    })

    it('shows all project vars as rows', () => {
      const vars = [makeVar('API_KEY', 'secret'), makeVar('DATABASE_URL', 'postgres://localhost')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      expect(screen.getByText('API_KEY')).toBeInTheDocument()
      expect(screen.getByText('DATABASE_URL')).toBeInTheDocument()
    })

    it('shows empty state when project has no vars', () => {
      render(<PushToStagePanel {...defaultProps} project={makeProject([])} />)
      expect(screen.getByText(/No variables/i)).toBeInTheDocument()
    })

    it('shows search input', () => {
      render(<PushToStagePanel {...defaultProps} />)
      expect(screen.getByTestId('push-search-input')).toBeInTheDocument()
    })

    it('shows select-all checkbox when project has vars', () => {
      const project = makeProject([makeVar('KEY', 'val')])
      render(<PushToStagePanel {...defaultProps} project={project} />)
      expect(screen.getByTestId('select-all-checkbox')).toBeInTheDocument()
    })

    it('stage selector has correct options excluding sourceSuffix', () => {
      const project = makeProject([], ['', 'development', 'staging', 'production'])
      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      const selector = screen.getByTestId('stage-selector')
      // development should be excluded
      expect(selector).not.toHaveTextContent('.env.development')
      // others should be present
      expect(selector).toHaveTextContent('.env')
      expect(selector).toHaveTextContent('.env.staging')
      expect(selector).toHaveTextContent('.env.production')
    })

    it('shows (empty) label for stages with no vars', () => {
      const project = makeProject(
        [makeVar('KEY', 'val')],
        ['', 'staging']
      )
      // staging environment has no vars (empty)
      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      const selector = screen.getByTestId('stage-selector')
      expect(selector).toHaveTextContent('(empty)')
    })

    it('shows masked value for unrevealed vars', () => {
      const vars = [makeVar('SECRET', 'super-secret', false)]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      expect(screen.getByText('•••••••')).toBeInTheDocument()
    })

    it('shows revealed value truncated to 24 chars', () => {
      const vars = [makeVar('LONG_KEY', 'a'.repeat(30), true)]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      expect(screen.getByText('a'.repeat(24) + '…')).toBeInTheDocument()
    })

    it('renders the data-testid root container', () => {
      render(<PushToStagePanel {...defaultProps} />)
      expect(screen.getByTestId('push-to-stage-panel')).toBeInTheDocument()
    })
  })

  // ── 2. Variable selection ─────────────────────────────────────────────

  describe('Variable selection', () => {
    it('clicking var row toggles checkbox to checked', () => {
      const vars = [makeVar('API_KEY', 'secret')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      const row = screen.getByTestId(`var-row-${vars[0].id}`)
      fireEvent.click(row)
      const checkbox = screen.getByTestId(`var-checkbox-${vars[0].id}`) as HTMLInputElement
      expect(checkbox.checked).toBe(true)
    })

    it('clicking var row again toggles checkbox to unchecked', () => {
      const vars = [makeVar('API_KEY', 'secret')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      const row = screen.getByTestId(`var-row-${vars[0].id}`)
      fireEvent.click(row)
      fireEvent.click(row)
      const checkbox = screen.getByTestId(`var-checkbox-${vars[0].id}`) as HTMLInputElement
      expect(checkbox.checked).toBe(false)
    })

    it('select-all checkbox selects all visible vars', () => {
      const vars = [makeVar('KEY1', 'v1'), makeVar('KEY2', 'v2')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      fireEvent.click(screen.getByTestId('select-all-checkbox'))
      vars.forEach((v) => {
        const cb = screen.getByTestId(`var-checkbox-${v.id}`) as HTMLInputElement
        expect(cb.checked).toBe(true)
      })
    })

    it('select-all is indeterminate when partially selected', () => {
      const vars = [makeVar('KEY1', 'v1'), makeVar('KEY2', 'v2')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      // Select only first row
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      const selectAll = screen.getByTestId('select-all-checkbox') as HTMLInputElement
      expect(selectAll.indeterminate).toBe(true)
    })

    it('Cmd+A selects all visible vars', async () => {
      const vars = [makeVar('KEY1', 'v1'), makeVar('KEY2', 'v2')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      const panel = screen.getByTestId('push-to-stage-panel')
      fireEvent.keyDown(panel, { key: 'a', metaKey: true })
      vars.forEach((v) => {
        const cb = screen.getByTestId(`var-checkbox-${v.id}`) as HTMLInputElement
        expect(cb.checked).toBe(true)
      })
    })

    it('Ctrl+A selects all visible vars', () => {
      const vars = [makeVar('KEY1', 'v1'), makeVar('KEY2', 'v2')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      const panel = screen.getByTestId('push-to-stage-panel')
      fireEvent.keyDown(panel, { key: 'a', ctrlKey: true })
      vars.forEach((v) => {
        const cb = screen.getByTestId(`var-checkbox-${v.id}`) as HTMLInputElement
        expect(cb.checked).toBe(true)
      })
    })

    it('selected vars hidden by filter remain in selection', async () => {
      const vars = [makeVar('API_KEY', 'secret'), makeVar('DATABASE_URL', 'postgres')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)

      // Select both rows
      fireEvent.click(screen.getByTestId('select-all-checkbox'))

      // Filter to show only one
      fireEvent.change(screen.getByTestId('push-search-input'), { target: { value: 'API' } })

      // DATABASE_URL is hidden but still selected — panel should show helper text
      expect(screen.getByText(/hidden by filter/i)).toBeInTheDocument()
    })

    it('shows "(N selected, M hidden)" when filter is active with hidden selections', () => {
      const vars = [makeVar('API_KEY', 'secret'), makeVar('DATABASE_URL', 'postgres'), makeVar('PORT', '3000')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)

      // Select all
      fireEvent.click(screen.getByTestId('select-all-checkbox'))

      // Filter to show only one
      fireEvent.change(screen.getByTestId('push-search-input'), { target: { value: 'API' } })

      // Should show "3 selected, 2 hidden by filter"
      expect(screen.getByText(/3 selected.*2 hidden/i)).toBeInTheDocument()
    })

    it('deselecting all makes select-all unchecked and not indeterminate', () => {
      const vars = [makeVar('KEY1', 'v1')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)

      // Select then deselect
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))

      const selectAll = screen.getByTestId('select-all-checkbox') as HTMLInputElement
      expect(selectAll.checked).toBe(false)
      expect(selectAll.indeterminate).toBe(false)
    })

    it('Cmd+A only selects visible rows when filter is active', () => {
      const vars = [makeVar('API_KEY', 'secret'), makeVar('DATABASE_URL', 'postgres')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)

      // Filter to show only API_KEY
      fireEvent.change(screen.getByTestId('push-search-input'), { target: { value: 'API' } })

      // Cmd+A
      const panel = screen.getByTestId('push-to-stage-panel')
      fireEvent.keyDown(panel, { key: 'a', metaKey: true })

      // Only API_KEY should be selected (DATABASE_URL is hidden, so not selected by Cmd+A)
      const apiCheckbox = screen.getByTestId(`var-checkbox-${vars[0].id}`) as HTMLInputElement
      expect(apiCheckbox.checked).toBe(true)
    })
  })

  // ── 3. Stage selection + conflict detection ───────────────────────────

  describe('Stage selection + conflict detection', () => {
    it('selecting a stage calls previewPushVarsToStage', async () => {
      const vars = [makeVar('KEY', 'val')]
      const project = makeProject(vars, ['development', 'staging'])
      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)

      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(mockPreview).toHaveBeenCalled()
      })
    })

    it('conflict badge appears for conflicting vars after preview', async () => {
      const vars = [makeVar('CONFLICT_KEY', 'old-val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ conflictDifferent: ['CONFLICT_KEY'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('conflict-badge-CONFLICT_KEY')).toBeInTheDocument()
      })
    })

    it('conflictSame badge appears for identical vars', async () => {
      const vars = [makeVar('SAME_KEY', 'same-val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ conflictSame: ['SAME_KEY'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('conflict-badge-SAME_KEY')).toBeInTheDocument()
      })
    })

    it('toggling conflict decision to skip unchecks that var row', async () => {
      const vars = [makeVar('CONFLICT_KEY', 'old-val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ conflictDifferent: ['CONFLICT_KEY'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)

      // Select the var first
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('conflict-badge-CONFLICT_KEY')).toBeInTheDocument()
      })

      // Click the badge to toggle to 'skip'
      fireEvent.click(screen.getByTestId('conflict-badge-CONFLICT_KEY'))

      const checkbox = screen.getByTestId(`var-checkbox-${vars[0].id}`) as HTMLInputElement
      expect(checkbox.checked).toBe(false)
    })

    it('CTA is disabled when no stage is selected', () => {
      const vars = [makeVar('KEY', 'val')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      const cta = screen.getByTestId('push-cta-button')
      expect(cta).toBeDisabled()
    })

    it('CTA label updates when selection changes', async () => {
      const vars = [makeVar('KEY1', 'v1'), makeVar('KEY2', 'v2')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ newKeys: ['KEY1', 'KEY2'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      // Select one var
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))

      await waitFor(() => {
        expect(screen.getByTestId('push-cta-button')).toHaveTextContent('Push 1 variable')
      })

      // Select second var
      fireEvent.click(screen.getByTestId(`var-row-${vars[1].id}`))

      await waitFor(() => {
        expect(screen.getByTestId('push-cta-button')).toHaveTextContent('Push 2 variables')
      })
    })
  })

  // ── 4. Summary bar ────────────────────────────────────────────────────

  describe('Summary bar', () => {
    it('is not shown when no targetSuffix is selected', () => {
      const vars = [makeVar('KEY', 'val')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      expect(screen.queryByTestId('summary-bar')).not.toBeInTheDocument()
    })

    it('shows correct new count after stage selection', async () => {
      const vars = [makeVar('NEW_KEY', 'val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ newKeys: ['NEW_KEY'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('summary-bar')).toHaveTextContent('1 new')
      })
    })

    it('shows correct overwrite count for conflicting vars', async () => {
      const vars = [makeVar('CONFLICT_KEY', 'val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ conflictDifferent: ['CONFLICT_KEY'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('summary-bar')).toHaveTextContent('1 overwrite')
      })
    })

    it('shows 0 identical when no conflictSame vars are selected', async () => {
      const vars = [makeVar('NEW_KEY', 'val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ newKeys: ['NEW_KEY'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('summary-bar')).toHaveTextContent('0 identical')
      })
    })

    it('shows summary with all three counts', async () => {
      const vars = [
        makeVar('NEW_KEY', 'new'),
        makeVar('OVERWRITE_KEY', 'changed'),
        makeVar('SAME_KEY', 'same'),
      ]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(
        makeReport({
          newKeys: ['NEW_KEY'],
          conflictDifferent: ['OVERWRITE_KEY'],
          conflictSame: ['SAME_KEY'],
        })
      )

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      // Select all
      fireEvent.click(screen.getByTestId('select-all-checkbox'))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        const bar = screen.getByTestId('summary-bar')
        expect(bar).toHaveTextContent('1 new')
        expect(bar).toHaveTextContent('1 overwrite')
        expect(bar).toHaveTextContent('1 identical')
      })
    })
  })

  // ── 5. Push action ────────────────────────────────────────────────────

  describe('Push action', () => {
    it('CTA is disabled when no effective vars to push (all identical)', async () => {
      const vars = [makeVar('SAME_KEY', 'same-val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ conflictSame: ['SAME_KEY'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('push-cta-button')).toBeDisabled()
      })
    })

    it('shows "Nothing to push" text when all values are identical', async () => {
      const vars = [makeVar('SAME_KEY', 'same-val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ conflictSame: ['SAME_KEY'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('push-cta-button')).toHaveTextContent(/Nothing to push/i)
      })
    })

    it('CTA is disabled while pushing', async () => {
      const vars = [makeVar('KEY', 'val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ newKeys: ['KEY'] }))
      // Never resolve so we can check intermediate state
      mockPush.mockReturnValue(new Promise(() => {}))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('push-cta-button')).not.toBeDisabled()
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('push-cta-button'))
      })

      expect(screen.getByTestId('push-cta-button')).toBeDisabled()
    })

    it('calls pushVarsToStage with correct arguments on CTA click', async () => {
      const vars = [makeVar('NEW_KEY', 'val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ newKeys: ['NEW_KEY'] }))
      mockPush.mockResolvedValue({
        summary: { written: ['NEW_KEY'], skippedConflict: [], skippedNoChange: [] },
        snapshot: null,
        targetCreated: false,
        updatedVars: vars,
      })

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('push-cta-button')).not.toBeDisabled()
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('push-cta-button'))
      })

      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'p1',
          sourceSuffix: 'development',
          targetSuffix: 'staging',
        })
      )
    })

    it('calls onPushComplete with targetSuffix, updatedVars, snapshot on success', async () => {
      const vars = [makeVar('NEW_KEY', 'val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ newKeys: ['NEW_KEY'] }))
      const updatedVars = [...vars]
      mockPush.mockResolvedValue({
        summary: { written: ['NEW_KEY'], skippedConflict: [], skippedNoChange: [] },
        snapshot: 'snap-123',
        targetCreated: false,
        updatedVars,
      })

      const onPushComplete = vi.fn()
      render(
        <PushToStagePanel
          {...defaultProps}
          project={project}
          sourceSuffix="development"
          onPushComplete={onPushComplete}
        />
      )

      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('push-cta-button')).not.toBeDisabled()
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('push-cta-button'))
      })

      await waitFor(() => {
        expect(onPushComplete).toHaveBeenCalledWith('staging', updatedVars, 'snap-123')
      })
    })

    it('shows error message on push failure', async () => {
      const vars = [makeVar('NEW_KEY', 'val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ newKeys: ['NEW_KEY'] }))
      mockPush.mockRejectedValue(new Error('File write failed'))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('push-cta-button')).not.toBeDisabled()
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('push-cta-button'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument()
      })
    })

    it('error message contains failure text', async () => {
      const vars = [makeVar('NEW_KEY', 'val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ newKeys: ['NEW_KEY'] }))
      mockPush.mockRejectedValue(new Error('File write failed'))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => expect(screen.getByTestId('push-cta-button')).not.toBeDisabled())
      await act(async () => { fireEvent.click(screen.getByTestId('push-cta-button')) })

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent(/File write failed|push failed/i)
      })
    })

    it('push request includes correct conflictDecisions', async () => {
      const vars = [
        makeVar('OVERWRITE_KEY', 'new-val'),
        makeVar('SKIP_KEY', 'other-val'),
      ]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(
        makeReport({ conflictDifferent: ['OVERWRITE_KEY', 'SKIP_KEY'] })
      )
      mockPush.mockResolvedValue({
        summary: { written: [], skippedConflict: [], skippedNoChange: [] },
        snapshot: null,
        targetCreated: false,
        updatedVars: [],
      })

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)

      // Select both vars
      fireEvent.click(screen.getByTestId('select-all-checkbox'))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('conflict-badge-SKIP_KEY')).toBeInTheDocument()
      })

      // Toggle SKIP_KEY to 'skip'
      fireEvent.click(screen.getByTestId('conflict-badge-SKIP_KEY'))

      await waitFor(() => expect(screen.getByTestId('push-cta-button')).not.toBeDisabled())
      await act(async () => { fireEvent.click(screen.getByTestId('push-cta-button')) })

      const callArg = mockPush.mock.calls[0][0]
      expect(callArg.projectId).toBe('p1')
      expect(callArg.targetSuffix).toBe('staging')
      // SKIP_KEY was toggled to 'skip'
      expect(callArg.conflictDecisions.get('SKIP_KEY')).toBe('skip')
      // OVERWRITE_KEY was never toggled, so it's omitted from the Map (default is 'overwrite')
      expect(callArg.conflictDecisions.get('OVERWRITE_KEY')).toBeUndefined()
    })
  })

  // ── 6. Keyboard shortcuts ─────────────────────────────────────────────

  describe('Keyboard shortcuts', () => {
    it('Escape calls onClose', () => {
      const onClose = vi.fn()
      render(<PushToStagePanel {...defaultProps} onClose={onClose} />)
      const panel = screen.getByTestId('push-to-stage-panel')
      fireEvent.keyDown(panel, { key: 'Escape' })
      expect(onClose).toHaveBeenCalled()
    })

    it('Cmd+A selects all visible rows', () => {
      const vars = [makeVar('KEY1', 'v1'), makeVar('KEY2', 'v2')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      const panel = screen.getByTestId('push-to-stage-panel')
      fireEvent.keyDown(panel, { key: 'a', metaKey: true })
      vars.forEach((v) => {
        const cb = screen.getByTestId(`var-checkbox-${v.id}`) as HTMLInputElement
        expect(cb.checked).toBe(true)
      })
    })

    it('Ctrl+A selects all visible rows on non-Mac', () => {
      const vars = [makeVar('KEY1', 'v1'), makeVar('KEY2', 'v2')]
      const project = makeProject(vars)
      render(<PushToStagePanel {...defaultProps} project={project} />)
      const panel = screen.getByTestId('push-to-stage-panel')
      fireEvent.keyDown(panel, { key: 'a', ctrlKey: true })
      vars.forEach((v) => {
        const cb = screen.getByTestId(`var-checkbox-${v.id}`) as HTMLInputElement
        expect(cb.checked).toBe(true)
      })
    })
  })

  // ── 7. Edge cases ─────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('all vars identical: CTA is disabled', async () => {
      const vars = [makeVar('SAME', 'val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ conflictSame: ['SAME'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('push-cta-button')).toBeDisabled()
      })
    })

    it('shows empty state when var list is empty', () => {
      const project = makeProject([])
      render(<PushToStagePanel {...defaultProps} project={project} />)
      expect(screen.getByText(/No variables/i)).toBeInTheDocument()
    })

    it('sourceSuffix is excluded from stage dropdown', () => {
      const project = makeProject([], ['development', 'staging', 'production'])
      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      const selector = screen.getByTestId('stage-selector')
      const options = Array.from(selector.querySelectorAll('option'))
      const optionValues = options.map((o) => (o as HTMLOptionElement).value)
      expect(optionValues).not.toContain('development')
    })

    it('CTA label shows singular "variable" for 1 selected', async () => {
      const vars = [makeVar('KEY', 'val')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ newKeys: ['KEY'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId(`var-row-${vars[0].id}`))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('push-cta-button')).toHaveTextContent('Push 1 variable to')
        expect(screen.getByTestId('push-cta-button')).not.toHaveTextContent('variables')
      })
    })

    it('CTA label shows plural "variables" for multiple selected', async () => {
      const vars = [makeVar('KEY1', 'v1'), makeVar('KEY2', 'v2')]
      const project = makeProject(vars, ['development', 'staging'])
      mockPreview.mockResolvedValue(makeReport({ newKeys: ['KEY1', 'KEY2'] }))

      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)
      fireEvent.click(screen.getByTestId('select-all-checkbox'))
      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      await waitFor(() => {
        expect(screen.getByTestId('push-cta-button')).toHaveTextContent('Push 2 variables to')
      })
    })
  })

  describe('VarRow keyboard and hover interactions', () => {
    const defaultProps = {
      onClose: vi.fn(),
      onPushComplete: vi.fn(),
    }

    beforeEach(() => {
      mockPreview.mockResolvedValue({ newKeys: [], conflictSame: [], conflictDifferent: [] })
      mockPush.mockResolvedValue({
        summary: { written: [], skippedConflict: [], skippedNoChange: [] },
        snapshot: null, targetCreated: false, updatedVars: [],
      })
    })

    it('Enter key on var row toggles selection', () => {
      const v = makeVar('API_KEY', 'val')
      const project = makeProject([v], ['development', 'staging'])
      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)

      const row = screen.getByTestId(`var-row-${v.id}`)
      expect(screen.getByTestId(`var-checkbox-${v.id}`)).not.toBeChecked()
      fireEvent.keyDown(row, { key: 'Enter' })
      expect(screen.getByTestId(`var-checkbox-${v.id}`)).toBeChecked()
    })

    it('Space key on var row toggles selection', () => {
      const v = makeVar('DB_URL', 'val')
      const project = makeProject([v], ['development', 'staging'])
      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)

      const row = screen.getByTestId(`var-row-${v.id}`)
      fireEvent.keyDown(row, { key: ' ' })
      expect(screen.getByTestId(`var-checkbox-${v.id}`)).toBeChecked()
    })

    it('other keys on var row do not toggle selection', () => {
      const v = makeVar('SECRET', 'val')
      const project = makeProject([v], ['development', 'staging'])
      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)

      const row = screen.getByTestId(`var-row-${v.id}`)
      fireEvent.keyDown(row, { key: 'Tab' })
      expect(screen.getByTestId(`var-checkbox-${v.id}`)).not.toBeChecked()
    })

    it('toggleSelectAll deselects all when all visible are already selected', () => {
      const vars = [makeVar('K1', 'v1'), makeVar('K2', 'v2')]
      const project = makeProject(vars, ['development', 'staging'])
      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)

      // Select all first
      fireEvent.click(screen.getByTestId('select-all-checkbox'))
      expect(screen.getByTestId(`var-checkbox-${vars[0].id}`)).toBeChecked()
      expect(screen.getByTestId(`var-checkbox-${vars[1].id}`)).toBeChecked()

      // Click select-all again → deselect all
      fireEvent.click(screen.getByTestId('select-all-checkbox'))
      expect(screen.getByTestId(`var-checkbox-${vars[0].id}`)).not.toBeChecked()
      expect(screen.getByTestId(`var-checkbox-${vars[1].id}`)).not.toBeChecked()
    })
  })

  describe('Preview error handling', () => {
    const defaultProps = {
      onClose: vi.fn(),
      onPushComplete: vi.fn(),
    }

    it('continues without conflict info when previewPushVarsToStage throws', async () => {
      mockPreview.mockRejectedValue(new Error('read failed'))
      const v = makeVar('KEY', 'val')
      const project = makeProject([v], ['development', 'staging'])
      render(<PushToStagePanel {...defaultProps} project={project} sourceSuffix="development" />)

      fireEvent.change(screen.getByTestId('stage-selector'), { target: { value: 'staging' } })

      // After preview fails, no conflict badge should appear — no crash
      await waitFor(() => {
        expect(screen.queryByTestId(`conflict-badge-KEY`)).not.toBeInTheDocument()
      })
    })
  })
})
