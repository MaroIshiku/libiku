---
name: ishiku-orchestrator
description: Coordinate substantial ishiku application and cross-app work from scope discovery through requirement clarification, implementation, specialist reviews, and evidence-based completion. Use for features, migrations, modernization, releases, or any task spanning multiple quality domains.
---

# ishiku orchestrator

## Inputs

Require the user goal and the target workspace or app. Discover the AppSpec, `workspace.yaml`, `.ishiku/project.yaml`, Git state, and available runtimes. Accept explicit compatibility, data, authentication, release, and risk constraints.

## Workflow

1. Declare the workspace, affected apps and repositories, permitted write areas, and protected areas.
2. Invoke the project-analysis workflow and inventory behavior, requirements, architecture, data, security, design, Docker, tests, CI, releases, upstreams, Git history, and local changes.
3. Compare the request with `appspec.yaml`, platform policies, and recorded decisions. Assign or update requirement IDs.
4. Stop for user clarification when a security, architecture, data, compatibility, release, or destructive decision is materially open. Document small reversible assumptions.
5. Write an ordered implementation and rollback plan. Classify risk A–D.
6. Implement without silently removing behavior. Keep app-specific Git edits inside `repository/`.
7. Run the test-engineer, security-review, design-review, Docker-review, release, and upstream workflows when applicable.
8. Run `node .ishiku/kit/scripts/verify-app . --full` from an app clone, or `pnpm ishiku:verify` at workspace scope.
9. Reconcile every AppSpec requirement with the traceability report and remaining deviations.

Do not skip a review because code compiles, accept changed visual baselines automatically, invent passing evidence, hide failed checks, publish private workspace files, or rewrite an existing specialist stack without approval.

## Stop conditions

Use `BLOCKED` for missing material decisions/access. Use `IMPLEMENTED_BUT_NOT_VERIFIED` when any mandatory check fails, is unavailable, is skipped, or lacks evidence. Use `VERIFIED` only when every applicable gate and independent-clone check passes.

## Output

Report: `Status`, `Scope`, `Requirements`, `Changes`, `Verification evidence`, `Security`, `Design`, `Containers and release`, `Migration and rollback`, `Known deviations`, and `Next action`. Include exact commands and outcomes.
