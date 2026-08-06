---
name: ishiku-docker-review
description: Review, harden, build, and smoke-test Docker delivery for an ishiku app. Use for Dockerfiles, Compose, build contexts, runtime users, health checks, persistence, secrets, networking, multi-architecture images, or container release readiness.
---

# ishiku Docker review

## Inputs

Read Dockerfiles, Compose files, `.dockerignore`, runtime/write paths, ports, health/readiness endpoints, secret sources, volumes, reverse-proxy assumptions, architectures, and upgrade/backup requirements.

## Workflow

1. Prove the build context stays inside the cloned repository and excludes Git, private data, secrets, databases, backups, tests not needed at runtime, and local artifacts.
2. Pin minimal supported bases; use reproducible multi-stage builds and a non-root runtime. Drop capabilities, disable privilege escalation, prefer read-only root, bound resources, and mount only required writable paths.
3. Validate configuration and secrets at startup. Do not bake secrets or ship default credentials.
4. Add liveness/readiness checks, graceful shutdown, persistence ownership, logging bounds, and explicit network exposure.
5. Run Compose config validation, image build, image inspection, secret/SBOM/vulnerability scans, non-root/read-only checks, startup/health/API smoke, restart, persistence, backup/restore, and upgrade tests. Test declared architectures in CI.
6. Record image digest and exact Docker/Compose versions.

Never infer a build from syntax validation, use `latest` for a release, run privileged without an approved exception, expose an admin service by default, or report `VERIFIED` when the daemon/build/smoke test was unavailable.

## Output and completion

Report build context, base/digest, user/capabilities/filesystem, ports/volumes/secrets, health, scan/SBOM, build and runtime evidence, persistence/restore/upgrade, and residual findings. Missing Docker execution evidence yields `IMPLEMENTED_BUT_NOT_VERIFIED`.
