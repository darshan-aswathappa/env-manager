export type ExposureStatus = 'idle' | 'checking' | 'exposed' | 'clean' | 'error';
export type ExposureSource = 'local-pattern' | 'gitguardian' | 'cache';

export interface ExposureResult {
  status: ExposureStatus;
  source?: ExposureSource;
  checkedAt?: number;
  detail?: string;
}

export interface CachedExposureResult {
  /** SHA-256 hex prefix of the secret value — never the raw value */
  hashPrefix: string;
  exposed: boolean;
  source: ExposureSource;
  checkedAt: number;
  expiresAt: number;
}
