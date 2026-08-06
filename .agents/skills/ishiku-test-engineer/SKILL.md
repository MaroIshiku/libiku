---
name: ishiku-test-engineer
description: Turn ishiku AppSpec requirements into executable, risk-based verification and a machine-readable coverage matrix. Use to design tests, close coverage gaps, run quality gates, investigate failures, or decide whether VERIFIED is justified.
---

# ishiku test engineer

## Inputs

Read the AppSpec, traceability matrix, changed behavior, project commands, risk class, data migrations, deployment profile, upstreams, and prior incidents. Require each requirement to have an ID and concrete acceptance criteria.

## Workflow

1. Reject duplicate/missing IDs, placeholders, contradictory acceptance criteria, and UI/API mismatch.
2. Map each requirement to reachable implementation and unit, integration, contract, migration, E2E, security, accessibility/visual, and operational tests as applicable.
3. Prioritize negative paths, boundaries, concurrency, recovery, permissions, state transitions, and regression behavior. Security-critical requirements need explicit negative tests.
4. Keep test data synthetic, deterministic, isolated, and resettable. Verify migrations both forward and rollback/restore.
5. Run the shared sequence through `node .ishiku/kit/scripts/verify-app . --full`; do not replace shared checks with CI-only logic.
6. Reproduce failures and distinguish product defects from environment blockers.
7. Update `.ishiku/requirements/traceability.yaml` only with evidence-backed paths and states.

Do not delete or skip a failing test to pass, use snapshot-only assertions for critical behavior, mark an unexecuted test as passing, or claim coverage from file presence.

## Output and completion

Provide a requirement matrix, commands/environment, pass/fail/skip counts, artifacts, failures with reproduction, coverage gaps, and final binding status. Any required skip, unavailable environment, or flaky unresolved test yields `IMPLEMENTED_BUT_NOT_VERIFIED`.
