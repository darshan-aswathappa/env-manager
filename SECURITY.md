# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## Reporting a Vulnerability

Do not open a public GitHub issue for security vulnerabilities.

Report vulnerabilities privately via GitHub's Security Advisory feature:
https://github.com/xanf-code/env-manager/security/advisories/new

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if known)

You will receive a response within 72 hours.

## Security model

- Secret values are stored as plaintext in the Tauri app data directory. There is no encryption at rest.
- No data is transmitted over the network. The app makes no outbound connections.
- Values are never written to `localStorage` or any browser-accessible storage.
- Secret values are masked in the UI by default and must be explicitly revealed.
- Clipboard contents are cleared automatically after copying a secret (configurable).
- Destructive actions require explicit confirmation.
