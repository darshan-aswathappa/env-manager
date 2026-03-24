/**
 * Provides hashing utilities for the exposure check system.
 *
 * GitGuardian HasMySecretLeaked uses plain SHA-256 (not scrypt).
 * Protocol (same model as HaveIBeenPwned):
 *   prefix = SHA-256(secret).slice(0, 5)  → sent to API
 *   fullHash = SHA-256(secret)             → compared against returned bucket
 *
 * The raw secret never leaves the browser — only the 5-char prefix is sent.
 */
export class HashingService {
  async sha256Hex(value: string): Promise<string> {
    const encoded = new TextEncoder().encode(value);
    const buf = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** Cache key — first 16 chars of SHA-256, never the raw value */
  async cacheKey(value: string): Promise<string> {
    return (await this.sha256Hex(value)).slice(0, 16);
  }

  /** 5-char prefix sent to GitGuardian's k-anonymity endpoint */
  async gitguardianPrefix(value: string): Promise<string> {
    return (await this.sha256Hex(value)).slice(0, 5);
  }
}
