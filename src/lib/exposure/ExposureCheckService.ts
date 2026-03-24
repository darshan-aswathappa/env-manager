import { HashingService } from './HashingService';
import { LocalPatternMatcher } from './LocalPatternMatcher';
import { ExposureCache } from './ExposureCache';
import { GitGuardianAdapter } from './GitGuardianAdapter';
import { RequestQueue } from './RequestQueue';
import type { ExposureResult } from './types';

const SETTINGS_KEY = 'envvault_settings';

function loadToken(): string | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as { gitguardianToken?: string }).gitguardianToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Orchestrates all exposure checks for a given secret value.
 *
 * Check order:
 *  1. Cache hit → return immediately
 *  2. LocalPatternMatcher → instant offline check (structural match only)
 *  3. GitGuardian HasMySecretLeaked → k-anonymity network check
 *
 * The raw secret value is hashed immediately on entry and discarded.
 */
class ExposureCheckServiceImpl {
  private readonly hasher = new HashingService();
  private readonly matcher = new LocalPatternMatcher();
  private readonly cache = new ExposureCache();
  private readonly queue = new RequestQueue(40);

  /** Wipes the localStorage cache so next check() call hits the network. */
  clearCache(): void {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('envvault_exp_')) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
    this.cache['memoryCache'].clear();
  }

  async check(value: string): Promise<ExposureResult> {
    if (!value || value.trim().length < 8) {
      return { status: 'idle' };
    }

    // 1. Cache
    const cacheKey = await this.hasher.cacheKey(value);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        status: cached.exposed ? 'exposed' : 'clean',
        source: 'cache',
        checkedAt: cached.checkedAt,
      };
    }

    // 2. Local pattern — confirms the value structurally matches a secret format
    const matchLabel = this.matcher.match(value);

    // 3. GitGuardian k-anonymity check (queued, rate-limited)
    const token = loadToken();
    const adapter = new GitGuardianAdapter(token);

    return this.queue.enqueue(async () => {
      try {
        const prefix = await this.hasher.gitguardianPrefix(value);
        const fullHash = await this.hasher.sha256Hex(value); // used for bucket comparison
        const exposed = await adapter.checkPrefix(prefix, fullHash);

        this.cache.set(cacheKey, exposed, 'gitguardian');
        return {
          status: exposed ? 'exposed' : 'clean',
          source: 'gitguardian',
          checkedAt: Date.now(),
          detail: matchLabel ?? undefined,
        } satisfies ExposureResult;
      } catch {
        // Network failure or no token — fall back to local pattern result
        const localExposed = matchLabel !== null;
        this.cache.set(cacheKey, localExposed, 'local-pattern');
        return {
          status: localExposed ? 'exposed' : 'clean',
          source: 'local-pattern',
          checkedAt: Date.now(),
          detail: matchLabel ?? undefined,
        } satisfies ExposureResult;
      }
    }, /* priority */ 5);
  }
}

// Singleton — shared queue and cache across all components
export const ExposureCheckService = new ExposureCheckServiceImpl();

/**
 * Dispatched when the GitGuardian token is saved.
 * Components listen for this to re-trigger exposure checks.
 */
export const EXPOSURE_RECHECK_EVENT = 'envvault:exposure-recheck';
