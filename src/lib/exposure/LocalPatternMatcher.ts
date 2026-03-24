/**
 * Offline, zero-network pattern matcher.
 * Detects keys that STRUCTURALLY match known-leaked secret formats.
 * Returns a match label if the value looks like a recognizable secret type,
 * which means the structural format is confirmed but exposure is NOT confirmed —
 * callers should follow up with a network check.
 */

interface PatternEntry {
  label: string;
  pattern: RegExp;
}

const PATTERNS: PatternEntry[] = [
  // Stripe
  { label: 'Stripe secret key', pattern: /^sk_(live|test)_[0-9a-zA-Z]{24,}$/ },
  { label: 'Stripe publishable key', pattern: /^pk_(live|test)_[0-9a-zA-Z]{24,}$/ },
  { label: 'Stripe restricted key', pattern: /^rk_(live|test)_[0-9a-zA-Z]{24,}$/ },
  // AWS
  { label: 'AWS access key ID', pattern: /^AKIA[0-9A-Z]{16}$/ },
  { label: 'AWS secret access key', pattern: /^[0-9a-zA-Z/+]{40}$/ },
  // GitHub
  { label: 'GitHub personal access token', pattern: /^ghp_[0-9a-zA-Z]{36}$/ },
  { label: 'GitHub OAuth token', pattern: /^gho_[0-9a-zA-Z]{36}$/ },
  { label: 'GitHub app token', pattern: /^(ghu|ghs|ghr)_[0-9a-zA-Z]{36}$/ },
  { label: 'GitHub fine-grained token', pattern: /^github_pat_[0-9a-zA-Z_]{82}$/ },
  // Slack
  { label: 'Slack bot token', pattern: /^xoxb-[0-9]{11}-[0-9]{11}-[0-9a-zA-Z]{24}$/ },
  { label: 'Slack user token', pattern: /^xoxp-[0-9]{11}-[0-9]{11}-[0-9]{11}-[0-9a-z]{32}$/ },
  { label: 'Slack webhook', pattern: /^https:\/\/hooks\.slack\.com\/services\/T[0-9A-Z]+\/B[0-9A-Z]+\/[0-9a-zA-Z]+$/ },
  // Twilio
  { label: 'Twilio account SID', pattern: /^AC[0-9a-f]{32}$/ },
  { label: 'Twilio auth token', pattern: /^[0-9a-f]{32}$/ },
  // SendGrid
  { label: 'SendGrid API key', pattern: /^SG\.[0-9a-zA-Z\-_]{22}\.[0-9a-zA-Z\-_]{43}$/ },
  // Mailgun
  { label: 'Mailgun API key', pattern: /^key-[0-9a-zA-Z]{32}$/ },
  // npm
  { label: 'npm access token', pattern: /^npm_[0-9a-zA-Z]{36}$/ },
  // OpenAI
  { label: 'OpenAI API key', pattern: /^sk-[0-9a-zA-Z]{48}$/ },
  { label: 'OpenAI project key', pattern: /^sk-proj-[0-9a-zA-Z\-_]{48,}$/ },
  // Google
  { label: 'Google API key', pattern: /^AIza[0-9A-Za-z\-_]{35}$/ },
  { label: 'Google OAuth client secret', pattern: /^GOCSPX-[0-9A-Za-z\-_]{28}$/ },
  // Anthropic
  { label: 'Anthropic API key', pattern: /^sk-ant-[0-9a-zA-Z\-_]{95,}$/ },
  // DeepSeek
  { label: 'DeepSeek API key', pattern: /^sk-[0-9a-f]{32}$/ },
  // Mistral
  { label: 'Mistral API key', pattern: /^[0-9a-zA-Z]{32}$/ },
  // Cohere
  { label: 'Cohere API key', pattern: /^[0-9a-zA-Z]{40}$/ },
  // Groq
  { label: 'Groq API key', pattern: /^gsk_[0-9a-zA-Z]{52}$/ },
  // Together AI
  { label: 'Together AI key', pattern: /^[0-9a-f]{64}$/ },
  // Cloudflare
  { label: 'Cloudflare API token', pattern: /^[0-9a-zA-Z_\-]{40}$/ },
  // HuggingFace
  { label: 'HuggingFace token', pattern: /^hf_[0-9a-zA-Z]{37}$/ },
  // GitLab
  { label: 'GitLab personal token', pattern: /^glpat-[0-9a-zA-Z\-_]{20}$/ },
];

export class LocalPatternMatcher {
  /**
   * Returns the matched secret type label, or null if no pattern matches.
   * A match means the value structurally resembles a known secret format —
   * NOT that it is definitively leaked.
   */
  match(value: string): string | null {
    if (!value || value.length < 8) return null;
    for (const entry of PATTERNS) {
      if (entry.pattern.test(value)) {
        return entry.label;
      }
    }
    return null;
  }

  isRecognizedSecretFormat(value: string): boolean {
    return this.match(value) !== null;
  }
}
