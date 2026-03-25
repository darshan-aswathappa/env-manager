import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import ShellIntegration from '../components/ShellIntegration'

const mockInvoke = vi.mocked(invoke)

describe('ShellIntegration', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('shows loading state then displays hook snippet', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.resolve('# hook code here')
      if (cmd === 'get_app_data_dir') return Promise.resolve('/home/user/.config/env-manager')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => expect(screen.getByText(/hook code here/i)).toBeInTheDocument())
  })

  it('shows the app data dir path', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.resolve('# hook')
      if (cmd === 'get_app_data_dir') return Promise.resolve('/home/user/.config/env-manager')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => expect(screen.getByText(/\.config\/env-manager/i)).toBeInTheDocument())
  })

  it('shows instructions to paste into shell config', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.resolve('# hook')
      if (cmd === 'get_app_data_dir') return Promise.resolve('/tmp/env-manager')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => {
      // Instructions mention zshrc or bashrc somewhere in the document
      const body = document.body.textContent || ''
      expect(body).toMatch(/zshrc|bashrc/i)
    })
  })

  it('copy button exists after load', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.resolve('# hook')
      if (cmd === 'get_app_data_dir') return Promise.resolve('/tmp/env-manager')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    })
  })

  it('shows error message when generate_shell_hook fails', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.reject(new Error('failed'))
      if (cmd === 'get_app_data_dir') return Promise.resolve('/tmp')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => {
      expect(screen.getByText(/error|failed|unable/i)).toBeInTheDocument()
    })
  })

  it('shows error message when get_app_data_dir also fails', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.reject(new Error('no app data'))
      if (cmd === 'get_app_data_dir') return Promise.reject(new Error('not available'))
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => {
      const text = document.body.textContent || ''
      expect(text).toMatch(/error|failed|unable/i)
    })
  })

  it('copy button handles clipboard failure gracefully', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('not allowed')) },
      writable: true,
      configurable: true,
    })
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.resolve('# hook content')
      if (cmd === 'get_app_data_dir') return Promise.resolve('/tmp')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument())
    await act(async () => { screen.getByRole('button', { name: /copy/i }).click() })
    // Should not crash
    expect(document.body).toBeTruthy()
  })

  it('copy button shows Copied after successful clipboard write', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.resolve('# hook content')
      if (cmd === 'get_app_data_dir') return Promise.resolve('/tmp')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument())
    await act(async () => { screen.getByRole('button', { name: /copy/i }).click() })
    await waitFor(() => expect(screen.getByRole('button', { name: /Copied/i })).toBeInTheDocument())
  })

  it('switches to Windows platform tab', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.resolve('# hook')
      if (cmd === 'get_app_data_dir') return Promise.resolve('/tmp')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => expect(screen.getByRole('tab', { name: /Windows/i })).toBeInTheDocument())
    await act(async () => { screen.getByRole('tab', { name: /Windows/i }).click() })
    // Shell tabs (zsh/bash) should no longer appear (windows only shows bash)
    expect(screen.queryByRole('button', { name: /zsh/i })).not.toBeInTheDocument()
  })

  it('switches to bash shell tab on mac', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.resolve('# hook')
      if (cmd === 'get_app_data_dir') return Promise.resolve('/tmp')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => expect(screen.getByRole('tab', { name: /bash$/ })).toBeInTheDocument())
    await act(async () => { screen.getByRole('tab', { name: /bash$/ }).click() })
    const bodyText = document.body.textContent || ''
    expect(bodyText).toMatch(/\.bashrc/)
  })

  it('retry button reloads the hook snippet after error', async () => {
    let callCount = 0
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') {
        callCount++
        if (callCount === 1) return Promise.reject(new Error('fail'))
        return Promise.resolve('# retried hook')
      }
      if (cmd === 'get_app_data_dir') return Promise.resolve('/tmp')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => expect(screen.getByText(/error|failed|unable/i)).toBeInTheDocument())
    const retryBtn = screen.getByRole('button', { name: /Try again/i })
    await act(async () => { retryBtn.click() })
    await waitFor(() => expect(screen.getByText(/retried hook/i)).toBeInTheDocument())
  })

  it('switches back to mac tab after switching to windows', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.resolve('# hook')
      if (cmd === 'get_app_data_dir') return Promise.resolve('/tmp')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => expect(screen.getByRole('tab', { name: /Windows/i })).toBeInTheDocument())
    // Switch to Windows
    await act(async () => { screen.getByRole('tab', { name: /Windows/i }).click() })
    expect(screen.queryByRole('tablist', { name: /Shell/i })).not.toBeInTheDocument()
    // Switch back to Mac
    await act(async () => { screen.getByRole('tab', { name: /macOS/i }).click() })
    // Shell tabs should reappear
    expect(screen.getByRole('tablist', { name: /Shell/i })).toBeInTheDocument()
  })

  it('switches back to zsh tab after switching to bash', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return Promise.resolve('# hook content')
      if (cmd === 'get_app_data_dir') return Promise.resolve('/tmp')
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    await waitFor(() => expect(screen.getByRole('tab', { name: /bash$/ })).toBeInTheDocument())
    // Switch to bash
    await act(async () => { screen.getByRole('tab', { name: /bash$/ }).click() })
    // Switch back to zsh
    await act(async () => { screen.getByRole('tab', { name: /zsh \(default\)/ }).click() })
    const bodyText = document.body.textContent || ''
    expect(bodyText).toMatch(/\.zshrc/)
  })

  it('shows loading initially before data loads', async () => {
    let resolveHook: (v: string) => void = () => {}
    let resolveDir: (v: string) => void = () => {}
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'generate_shell_hook') return new Promise(r => { resolveHook = r })
      if (cmd === 'get_app_data_dir') return new Promise(r => { resolveDir = r })
      return Promise.resolve(null)
    })
    render(<ShellIntegration />)
    expect(screen.getByText(/Loading shell hook/i)).toBeInTheDocument()
    await act(async () => {
      resolveHook('# the hook')
      resolveDir('/tmp')
    })
  })
})
