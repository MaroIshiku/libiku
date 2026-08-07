# Security baseline

Apply OWASP ASVS 5.0.0 identifiers (`v5.0.0-x.y.z`), defense in depth, least privilege, secure defaults, and fail-closed behavior.

## Identity and sessions

- Default account apps use Argon2id with at least 19 MiB memory, two iterations, and parallelism one; tune upward while retaining denial-of-service limits. Legacy scrypt/bcrypt/PBKDF2 profiles require an upgrade-on-login plan.
- Return generic authentication errors, rate-limit by account and network signal without permanent lockout, rotate sessions after authentication and privilege changes, and support revocation, idle expiry, absolute expiry, and recent re-authentication.
- Session cookies are `HttpOnly`, `Secure` in every non-local deployment, narrowly scoped, and use an appropriate `SameSite` mode. Mutating browser requests require CSRF protection. Authentication tokens never go in `localStorage`.
- First-run secrets are single-use and setup closes permanently after success. Support TOTP, recovery codes, and later WebAuthn where the product requires accounts.
- Dropiku and Meiku are the only single-vault exceptions. Their approved flows must not be expanded with alternate login methods without a new security decision.

## Application and platform controls

Enforce authorization on the server with deny-by-default roles. Define and test CORS, CSP, HSTS, security headers, proxy trust, redirects, uploads, MIME and size limits, archive handling, SSRF egress rules, injection boundaries, path handling, webhook authentication, concurrency, and error redaction. Never log passwords, TOTP or recovery codes, tokens, complete keys, secrets, or sensitive request bodies.

Containers run as a non-root user with a minimal base, dropped capabilities, no privilege escalation, a read-only root filesystem where compatible, bounded resources, health checks, and secrets mounted at runtime. Images and build layers contain no secrets. CI uses least-privilege permissions and immutable action SHAs.

Audit successful and failed sign-ins, password and MFA changes, recovery-code use, session revocation, role/admin changes, and security configuration changes with actor, target, result, request ID, and time—never the secret value.

Security-critical requirements need negative integration or end-to-end tests. A failed or unavailable mandatory security check prevents `VERIFIED`.
