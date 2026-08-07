---
name: ishiku-security-review
description: Review and test an ishiku app against the central OWASP-aligned security baseline. Use for authentication, sessions, authorization, input/output, secrets, audit, network, supply-chain, container, or security-sensitive release changes.
---

# ishiku security review

## Inputs and baseline

Read `policies/security.md`, the AppSpec's security-critical requirements, project profile, threat boundaries, data classes, proxy/deployment model, and recorded overrides. Preserve Dropiku and Meiku's approved single-vault profiles; require the standard account profile elsewhere.

## Workflow

1. Build a threat model for actors, assets, entry points, trust boundaries, abuse cases, and recovery.
2. Inspect password hashing, setup/recovery/MFA, generic failures, rate limiting, session creation/rotation/revocation/expiry/cookies/CSRF, recent authentication, and deny-by-default authorization.
3. Test CORS/CSP/HSTS/headers/proxy trust, XSS/injection, SSRF/egress, paths/uploads/archives, redirects/webhooks, concurrency, error handling, log redaction, and resource limits.
4. Scan tracked files, history risk, build context, images, dependencies, licenses, secrets, workflows, permissions, action pins, SBOM and provenance.
5. Add negative automated tests for every critical requirement. Reference OWASP ASVS 5.0.0 IDs precisely.
6. Run `node .ishiku/kit/scripts/check-security .` plus app security tests and container checks. Record tool versions and evidence.

Never print a discovered secret, weaken a control to make a test pass, rely on client-only authorization, accept tokens in `localStorage`, or waive a critical finding without an approved non-expired override and compensating test.

## Output and completion

List findings by severity with requirement/ASVS ID, evidence, exploit impact, affected paths, remediation, and test. Include passed controls and residual risk. Any open critical/high finding or missing mandatory scan prevents `VERIFIED`.
