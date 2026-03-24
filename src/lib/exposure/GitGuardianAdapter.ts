/**
 * GitGuardian HasMySecretLeaked adapter.
 *
 * Protocol (k-anonymity, same model as HaveIBeenPwned):
 *  1. Client computes SHA-256(secret)
 *  2. Sends only the first 5 hex chars (the "prefix") to the API
 *  3. API returns a bucket of SHA-256 hashes sharing that prefix
 *  4. Client checks if its full SHA-256 is in the returned set
 *
 * The raw secret never leaves the browser — only 5 chars of its SHA-256 are sent.
 * ~1 in 1,048,576 hashes share any given 5-char prefix.
 *
 * API: https://api.hasmysecretleaked.com/v1/prefix/{prefix}
 * Auth: Authorization: Token <gitguardian_token>  (optional, raises rate limits)
 */

const HMSL_BASE = 'https://api.hasmysecretleaked.com/v1';

export class GitGuardianAdapter {
  constructor(private readonly token: string | null) {}

  get isConfigured(): boolean {
    return !!this.token;
  }

  /**
   * Returns true if the full SHA-256 hash of the secret is in GitGuardian's leak DB.
   * @param prefixHex   - first 5 chars of SHA-256(secret)  — sent to the API
   * @param fullHashHex - full SHA-256(secret)               — compared locally
   */
  async checkPrefix(prefixHex: string, fullHashHex: string): Promise<boolean> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Token ${this.token}`;
    }

    const res = await fetch(`${HMSL_BASE}/prefix/${prefixHex}`, { headers });

    if (res.status === 404) return false;
    if (res.status === 429) throw new Error('rate_limited');
    if (!res.ok) throw new Error(`hmsl_error_${res.status}`);

    // Handle multiple response shapes GitGuardian may return:
    //   { hashes: [...] }   or
    //   { results: [...] }  or
    //   [...]               (plain array)
    const raw = await res.json();
    const hashes: string[] = Array.isArray(raw)
      ? (raw as string[])
      : ((raw as Record<string, unknown>).hashes as string[] | undefined) ??
        ((raw as Record<string, unknown>).results as string[] | undefined) ??
        [];

    const needle = fullHashHex.toLowerCase();
    return hashes.some((h) => h.toLowerCase() === needle);
  }
}
