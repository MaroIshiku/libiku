---
name: ishiku-upstream-maintenance
description: Discover, assess, update, and verify external projects, generated clients, containers, and dependencies used by ishiku apps. Use for weekly maintenance, upstream releases, security updates, generated-code refreshes, compatibility changes, or rollback planning.
---

# ishiku upstream maintenance

## Inputs

Read `.ishiku/project.yaml` upstream declarations, lockfiles, image references, generated-code provenance, licenses, current versions/digests, update policy, integration tests, and supported compatibility range.

## Workflow

1. Discover updates from authoritative upstream releases and advisories. Record current/candidate versions, dates, signatures/digests, changelog, license, and support status.
2. Classify breaking, security, data-format, network, authentication, and generated-code risks. Ask before incompatible behavior or irreversible migration.
3. Update through a dedicated branch/PR. Pin versions and digests; regenerate deterministically and include provenance plus meaningful diffs.
4. Run upstream-specific contract, failure/degraded-mode, migration, regression, security, Docker, and full app verification. Test rollback to the previous compatible version.
5. For C/D changes, test upstream, DNS, network failure, and restart recovery where applicable.
6. Schedule discovery Monday 05:00 Europe/Berlin. Do not auto-merge high-risk updates.

Never track `master`, `main`, or `latest` for releases, trust a changelog without integration evidence, suppress generated diffs, ignore license changes, or update unrelated dependencies in the same PR.

## Output and completion

Report upstream, old/new version and digest, release/security/license analysis, generated changes, tests, compatibility, rollback, and PR. Missing authoritative metadata or verification prevents `VERIFIED`.
