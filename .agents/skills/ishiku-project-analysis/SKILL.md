---
name: ishiku-project-analysis
description: Produce an evidence-based inventory of one ishiku app or the complete workspace before implementation. Use to discover repository boundaries, AppSpecs, stacks, behavior, security, design, tests, containers, CI, releases, upstreams, risks, and unresolved decisions.
---

# ishiku project analysis

## Inputs

Require a workspace or app path and the intended task. Read root and app-local `AGENTS.md`, `workspace.yaml`, `appspec.yaml`, `.ishiku/project.yaml`, decisions, overrides, and Git state.

## Workflow

1. Determine single-app versus cross-app scope and resolve every real Git root.
2. Record branches, remotes, worktrees, uncommitted and untracked files without modifying them.
3. Inventory frontend/backend/runtime/database, identity and session behavior, permissions, data and migrations, dependencies/upstreams, Docker/Compose, tests, workflows, release/GHCR, shared code, and design assets.
4. Compare AppSpec with reachable UI/API behavior. List requirement gaps and contradictions.
5. Search for credentials, personal data, unsafe defaults, absolute paths, publish-boundary violations, and unlicensed assets without printing secret values.
6. Run safe baseline checks and capture exact outcomes. Do not install, edit, build containers, or mutate external systems unless separately authorized.
7. Classify findings by impact and identify decisions that cross the clarification gate.

Use `rg --files`, `rg`, Git read commands, language-native read-only checks, and `node .ishiku/kit/scripts/verify-app .` where available. Redact secrets and user data.

## Stop conditions

Stop and report `BLOCKED` only when required files or access prevent a meaningful inventory. Otherwise produce the inventory even when implementation decisions remain open.

## Output

Report: `Scope and boundaries`, `Git state`, `AppSpec and traceability`, `Technology`, `Identity and data`, `Security`, `Design`, `Tests`, `Docker`, `CI/release`, `Upstreams`, `Shared candidates`, `Debt and risks`, `Baseline evidence`, and `Clarifications required`.
