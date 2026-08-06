---
name: ishiku-new-app
description: Create a complete standalone ishiku web application workspace and Git repository from an approved AppSpec. Use when scaffolding a new app with the standard stack, platform controls, tests, containers, documentation, and release automation.
---

# ishiku new app

## Inputs

Require a valid lowercase app ID, display name, product purpose, approved requirements and acceptance criteria, data model, roles, integrations, license, and risk class. Clarify authentication, sensitive data, destructive operations, and upstream ownership before generation.

## Workflow

1. Confirm no target path exists and record the allowed write scope.
2. Use `node .ishiku/scripts/create-app <id> "<name>"`; do not hand-copy an older app.
3. Complete `repository/appspec.yaml` with unique requirement IDs and remove every placeholder.
4. Implement the standard Node 24 LTS, TypeScript, Fastify, React, SQLite/Drizzle profile using platform validation, identity, revocable sessions, permissions, logging, health, manifest, UI, and error contracts.
5. Add migrations, seed/test factories, secrets via files or runtime injection, non-root Docker, Compose example, `.env.example`, README, changelog, license notices, About/version/build data, and backup/restore/upgrade procedures.
6. Add unit, integration, contract, migration, E2E, axe, visual, security, performance, Docker-smoke, backup/restore, and upgrade tests. Generate traceability.
7. Synchronize the kit and install immutable, least-privilege PR, release, and update workflows.
8. Run full verification, then export or clone the repository to a temporary independent directory and repeat it.

Do not create alternative foundation libraries, use floating versions, store auth tokens in browser storage, accept visual baselines automatically, or claim completion from scaffolding alone.

## Output and completion

Report created paths, decisions, requirements, commands, artifacts, clone evidence, image digest, and rollback. `VERIFIED` requires every applicable gate; unavailable Docker, browser, or release evidence yields `IMPLEMENTED_BUT_NOT_VERIFIED`.
