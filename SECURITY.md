# Security policy

## Supported code

The currently published site's `master` branch is the supported version. Feature branches, old commits and the future Astro implementation are not considered production releases until deployed.

## Report vulnerabilities privately

Use the repository's [Security tab](https://github.com/Fooftilly/Fooftilly.github.io/security) and **Report a vulnerability** when GitHub private vulnerability reporting is enabled.

If private reporting is unavailable, do **not** post exploit code, credentials, private metadata, active tokens or detailed reproduction steps in a public issue. Open only a minimal request asking the maintainer for a private reporting channel.

Only test systems and data you own or are authorized to test. Include the affected URL/component, commit or deployment revision, reproduction conditions and impact without disclosing private data.

## Areas of concern

- Untrusted bookmark URLs and metadata rendered into HTML or embedded content.
- Cross-site scripting, unsafe link schemes, and third-party iframe/analytics behavior.
- GitHub Actions supply-chain issues, overly broad token permissions and untrusted PR execution.
- Future authenticated bookmark submission routes, token storage, request authorization and rate limiting.
- Content or private information accidentally published through generated assets, logs or previews.

Security reports are investigated and addressed through reviewable fixes, with disclosure coordinated when applicable. Do not report security vulnerabilities by committing secrets or publishing a full exploit to an issue or PR.
