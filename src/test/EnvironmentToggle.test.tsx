import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EnvironmentToggle from '../components/EnvironmentToggle'
import type { Environment } from '../types'

const mockEnvs: Environment[] = [
  { suffix: '', vars: [{ id: '1', key: 'A', val: 'a', revealed: false, sourceProjectId: 'p1' }] },
  { suffix: 'local', vars: [{ id: '2', key: 'B', val: 'b', revealed: false, sourceProjectId: 'p1' }] },
  { suffix: 'development', vars: [] },
  { suffix: 'production', vars: [] },
  { suffix: 'testing', vars: [] },
  { suffix: 'staging', vars: [] },
]

describe('EnvironmentToggle', () => {
  it('renders a select element with all environments as options', () => {
    render(<EnvironmentToggle environments={mockEnvs} activeEnv="" onSwitch={() => {}} />)
    const select = screen.getByRole('combobox', { name: /Environment/i })
    expect(select).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(6)
  })

  it('shows the active environment as selected', () => {
    render(<EnvironmentToggle environments={mockEnvs} activeEnv="local" onSwitch={() => {}} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('local')
  })

  it('calls onSwitch with the new suffix when selection changes', () => {
    const onSwitch = vi.fn()
    render(<EnvironmentToggle environments={mockEnvs} activeEnv="" onSwitch={onSwitch} />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'production' } })
    expect(onSwitch).toHaveBeenCalledWith('production')
  })

  it('does not call onSwitch when selecting the same environment', () => {
    const onSwitch = vi.fn()
    render(<EnvironmentToggle environments={mockEnvs} activeEnv="local" onSwitch={onSwitch} />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'local' } })
    expect(onSwitch).not.toHaveBeenCalled()
  })

  it('shows var count in option labels for environments with vars', () => {
    render(<EnvironmentToggle environments={mockEnvs} activeEnv="" onSwitch={() => {}} />)
    const options = screen.getAllByRole('option')
    // .env has 1 var, .env.local has 1 var
    expect(options[0].textContent).toContain('.env')
    expect(options[0].textContent).toContain('1')
    expect(options[1].textContent).toContain('.env.local')
    expect(options[1].textContent).toContain('1')
    // .env.development has 0 vars — no count
    expect(options[2].textContent).toBe('.env.development')
  })

  it('displays all six environment options', () => {
    render(<EnvironmentToggle environments={mockEnvs} activeEnv="" onSwitch={() => {}} />)
    expect(screen.getByText(/\.env\.local/)).toBeInTheDocument()
    expect(screen.getByText(/\.env\.development/)).toBeInTheDocument()
    expect(screen.getByText(/\.env\.production/)).toBeInTheDocument()
    expect(screen.getByText(/\.env\.testing/)).toBeInTheDocument()
    expect(screen.getByText(/\.env\.staging/)).toBeInTheDocument()
  })
})
