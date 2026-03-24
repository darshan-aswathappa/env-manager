import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ExposureCheckService, EXPOSURE_RECHECK_EVENT } from '../lib/exposure/ExposureCheckService';

const SETTINGS_KEY = 'envvault_settings';

function loadSettings(): { gitguardianToken: string } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { gitguardianToken: '' };
    return { gitguardianToken: '', ...JSON.parse(raw) };
  } catch {
    return { gitguardianToken: '' };
  }
}

function saveSettings(settings: { gitguardianToken: string }): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [token, setToken] = useState(() => loadSettings().gitguardianToken);
  const [saved, setSaved] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);

  function handleSave() {
    saveSettings({ gitguardianToken: token.trim() });
    // Clear cached results so all keys re-check with the new token
    ExposureCheckService.clearCache();
    window.dispatchEvent(new CustomEvent(EXPOSURE_RECHECK_EVENT));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClear() {
    setToken('');
    saveSettings({ gitguardianToken: '' });
  }

  return (
    <div>
      <h2 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-primary)' }}>
        Settings
      </h2>

      <section style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
          Exposure detection
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '12px' }}>
          Provide a{' '}
          <a
            href="https://app.gitguardian.com/api"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-text)', textDecoration: 'none' }}
          >
            GitGuardian API token <ExternalLink size={10} style={{ display: 'inline', verticalAlign: 'middle' }} />
          </a>{' '}
          to check if your secrets appear in known public leaks (22M+ secrets).
          Without a token, you get 5 checks/day. Free tier: 10,000/month.
        </p>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type={tokenVisible ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              spellCheck={false}
              autoComplete="off"
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '7px 36px 7px 10px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => setTokenVisible((v) => !v)}
              aria-label={tokenVisible ? 'Hide token' : 'Show token'}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                padding: 0,
                fontSize: '0.7rem',
              }}
            >
              {tokenVisible ? '🙈' : '👁'}
            </button>
          </div>
          {token && (
            <button
              onClick={handleClear}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '7px 10px',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>

        <p style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
          Token is stored locally only. Your secrets are never sent in plaintext — only a 5-character hash prefix is transmitted.
        </p>
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '7px 16px',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          style={{
            background: saved ? 'var(--color-success-bg)' : 'var(--accent)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            padding: '7px 16px',
            fontSize: '0.8rem',
            color: saved ? 'var(--color-success)' : '#fff',
            cursor: 'pointer',
            transition: 'background var(--t-fast)',
          }}
        >
          {saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
    </div>
  );
}
