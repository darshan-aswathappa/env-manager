import type { CachedExposureResult, ExposureSource } from './types';

const CACHE_KEY_PREFIX = 'envvault_exp_';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 500;

/**
 * Persistent exposure check cache backed by localStorage.
 * Cache keys are SHA-256 hash prefixes — never raw secret values.
 */
export class ExposureCache {
  private memoryCache = new Map<string, CachedExposureResult>();

  get(cacheKey: string): CachedExposureResult | null {
    // Check memory first
    const mem = this.memoryCache.get(cacheKey);
    if (mem) {
      if (Date.now() < mem.expiresAt) return mem;
      this.memoryCache.delete(cacheKey);
    }

    // Fall back to localStorage
    try {
      const raw = localStorage.getItem(CACHE_KEY_PREFIX + cacheKey);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CachedExposureResult;
      if (Date.now() >= entry.expiresAt) {
        localStorage.removeItem(CACHE_KEY_PREFIX + cacheKey);
        return null;
      }
      this.memoryCache.set(cacheKey, entry);
      return entry;
    } catch {
      return null;
    }
  }

  set(
    cacheKey: string,
    exposed: boolean,
    source: ExposureSource,
  ): void {
    const entry: CachedExposureResult = {
      hashPrefix: cacheKey,
      exposed,
      source,
      checkedAt: Date.now(),
      expiresAt: Date.now() + TTL_MS,
    };
    this.memoryCache.set(cacheKey, entry);
    try {
      this.evictIfNeeded();
      localStorage.setItem(CACHE_KEY_PREFIX + cacheKey, JSON.stringify(entry));
    } catch {
      // localStorage full — silently skip persistence
    }
  }

  private evictIfNeeded(): void {
    const keys: Array<{ key: string; checkedAt: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(CACHE_KEY_PREFIX)) continue;
      try {
        const entry = JSON.parse(localStorage.getItem(k) ?? '{}') as CachedExposureResult;
        keys.push({ key: k, checkedAt: entry.checkedAt ?? 0 });
      } catch {
        localStorage.removeItem(k ?? '');
      }
    }
    if (keys.length < MAX_ENTRIES) return;
    // Remove oldest entries to stay under limit
    keys.sort((a, b) => a.checkedAt - b.checkedAt);
    keys.slice(0, keys.length - MAX_ENTRIES + 50).forEach(({ key }) => {
      localStorage.removeItem(key);
    });
  }
}
