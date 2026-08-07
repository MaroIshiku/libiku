---
name: ishiku-modernize-app
description: Migrate or improve an existing ishiku app while preserving behavior, data, Git history, local work, and rollback. Use for workspace restructuring, platform alignment, dependency consolidation, security hardening, design alignment, or legacy-stack adaptation.
---

# ishiku modernize app

## Inputs

Require the app workspace, requested target, compatibility promises, data constraints, and approved exceptions. Discover Git roots, remotes, branches, uncommitted work, assets, specs, build contexts, upstreams, and local sensitive files.

## Workflow

1. Document reachable behavior and baseline checks before editing.
2. Compare behavior to AppSpec; capture security, design, library, workflow, and duplicate-foundation differences.
3. Identify migration risks, data/backward-compatibility requirements, and rollback checkpoints. Ask before incompatible or destructive changes.
4. Preserve `.git`, remotes, branches, and working changes. Move an existing repository to `<app>/repository/` without reinitializing it. Keep planning, references, source assets, and private data outside Git.
5. Add `workspace.yaml`, local metadata, requirements, decisions/overrides, clone-local skills and kit. Update only paths proven to depend on the old layout.
6. Modernize in reversible slices and add regression/data migration tests before changing behavior. Retain specialist stacks using a profile/adapter.
7. Generate traceability, run all applicable specialist reviews and full verification, then verify an independent clone/export.

Never discard uncommitted files, squash or recreate history, move secrets into Git, silently remove features, or label an untested compatibility assumption as verified.

## Output and completion

Report old/new paths, history/remotes/branches, local work preservation, behavioral deltas, data migration, updated references, tests, rollback, clone evidence, and remaining overrides. Use only the three binding completion states.
