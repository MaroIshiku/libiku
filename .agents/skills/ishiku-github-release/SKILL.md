---
name: ishiku-github-release
description: Create or review secure GitHub Actions, GHCR publishing, provenance, SBOM, changelog, and release gates for an ishiku app. Use for PR CI, tags, releases, workflow permissions, supply-chain hardening, or release readiness.
---

# ishiku GitHub release

## Inputs

Read repository visibility, default branch, required checks, GHCR image name, version policy, runner types, environments, secrets, risk class, upstreams, migration/rollback needs, and kit release policy.

## Workflow

1. Keep workflows clone-independent and call `.ishiku/kit/scripts/verify-app` so local and CI gates match.
2. Pin every third-party action to a full 40-character commit SHA with a version comment. Set workflow/job permissions to the minimum; separate untrusted PR checks from privileged publish jobs.
3. Build once, test and publish by digest, scan the image, emit SBOM, attest provenance with OIDC, and attach immutable evidence. Never expose secrets to forked code.
4. Gate releases on traceability, full verification, migrations, backup/restore, and upgrade evidence. Include image digest, compatibility, risk, and rollback in release notes.
5. Validate YAML, action pins, event filters, concurrency, caches, timeouts, artifact retention, GHCR permissions, and a dry-run or disposable release path.
6. Run `node .ishiku/kit/scripts/check-release .` and record the GitHub run URLs/results when available.

Never use floating action refs, broad write permissions, pull-request-target checkout of untrusted code, rebuild during promotion, publish on failed gates, or call CI configuration verified without an executed run.

## Output and completion

Report events, permissions, action SHAs, checks, image/digest, SBOM/provenance, release/rollback notes, run evidence, and remaining blockers. A workflow not executed in GitHub remains `IMPLEMENTED_BUT_NOT_VERIFIED`.
