import { useState, useEffect, useRef, useCallback } from 'react';
import { ExposureCheckService, EXPOSURE_RECHECK_EVENT } from '../lib/exposure/ExposureCheckService';
import type { ExposureResult, ExposureStatus } from '../lib/exposure/types';

interface UseExposureCheckReturn {
  status: ExposureStatus;
  result: ExposureResult | null;
}

/**
 * Triggers an exposure check when `value` is non-empty.
 * Re-runs automatically when the GitGuardian token is saved (cache cleared + event dispatched).
 */
export function useExposureCheck(value: string): UseExposureCheckReturn {
  const [status, setStatus] = useState<ExposureStatus>('idle');
  const [result, setResult] = useState<ExposureResult | null>(null);
  const latestValue = useRef(value);

  const runCheck = useCallback((v: string) => {
    latestValue.current = v;
    if (!v || v.trim().length < 8) {
      setStatus('idle');
      setResult(null);
      return;
    }

    let cancelled = false;
    setStatus('checking');

    ExposureCheckService.check(v).then((res) => {
      if (cancelled || latestValue.current !== v) return;
      setStatus(res.status);
      setResult(res);
    }).catch(() => {
      if (cancelled || latestValue.current !== v) return;
      setStatus('error');
      setResult(null);
    });

    return () => { cancelled = true; };
  }, []);

  // Re-run when value changes
  useEffect(() => {
    const cleanup = runCheck(value);
    return cleanup;
  }, [value, runCheck]);

  // Re-run when token is saved (cache cleared, need fresh check)
  useEffect(() => {
    function handleRecheck() {
      runCheck(latestValue.current);
    }
    window.addEventListener(EXPOSURE_RECHECK_EVENT, handleRecheck);
    return () => window.removeEventListener(EXPOSURE_RECHECK_EVENT, handleRecheck);
  }, [runCheck]);

  return { status, result };
}
