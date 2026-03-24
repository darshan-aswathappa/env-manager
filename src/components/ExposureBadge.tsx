import { useEffect, useState } from 'react';
import { useExposureCheck } from '../hooks/useExposureCheck';
import type { ExposureStatus } from '../lib/exposure/types';

interface ExposureBadgeProps {
  value: string;
}

function Spinner() {
  return (
    <span
      className="exposure-spinner"
      aria-label="Checking for exposure…"
      role="status"
    />
  );
}

function statusLabel(status: ExposureStatus): string {
  switch (status) {
    case 'exposed': return 'Key found in public leaks — rotate immediately';
    case 'clean':   return 'Not found in known public leaks';
    case 'error':   return 'Exposure check failed';
    default:        return '';
  }
}

export default function ExposureBadge({ value }: ExposureBadgeProps) {
  const { status, result } = useExposureCheck(value);
  // 'clean' badge fades out after 3 s — only show it briefly to confirm check ran
  const [showClean, setShowClean] = useState(false);

  useEffect(() => {
    if (status === 'clean') {
      setShowClean(true);
      const t = setTimeout(() => setShowClean(false), 3000);
      return () => clearTimeout(t);
    }
    setShowClean(false);
  }, [status]);

  if (status === 'idle' || !value) return null;
  if (status === 'checking') return <Spinner />;

  if (status === 'exposed') {
    return (
      <span
        className="exposure-badge exposed"
        title={result?.detail ? `${statusLabel(status)} (${result.detail})` : statusLabel(status)}
        aria-label={statusLabel(status)}
        role="img"
      >
        ⚠
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span
        className="exposure-badge error"
        title="Exposure check failed — check your GitGuardian token in Settings"
        aria-label="Exposure check failed"
        role="img"
      >
        !
      </span>
    );
  }

  // clean — show briefly then disappear
  if (showClean) {
    return (
      <span
        className="exposure-badge clean"
        title={statusLabel('clean')}
        aria-label={statusLabel('clean')}
        role="img"
      >
        ✓
      </span>
    );
  }

  return null;
}
