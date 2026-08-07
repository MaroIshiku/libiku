---
name: ishiku-design-review
description: Review and align an ishiku interface with the shared visual, responsive, English-language, and WCAG 2.2 AA design standard. Use for UI implementation, theme/component work, accessibility, visual regression, or cross-app consistency.
---

# ishiku design review

## Inputs

At workspace scope, read the human entrypoint at `Root/.ishiku/policies/design-system.md`, then load the single authoritative machine contract at `Root/.ishiku/design-system/contract.json`. Do not copy the full specification into app repositories. In a standalone app clone, use `.ishiku/project.yaml`, `.ishiku/design-system.lock`, the local implementation tokens/components, and `.ishiku/kit/scripts/check-design`; the executable checks and provenance lock are distributed even though the central contract is not. Also read supported routes/states and approved screenshots/assets. Require test credentials that contain no production secrets.

## Workflow

1. Inventory pages, components, states, breakpoints, tokens, themes, and deviations.
2. Ensure all visible text is English and the standard header/profile/Settings/Theme/About structure is used.
3. Replace unjustified hard-coded colors, spacing, radii, shadows, motion, and duplicate primitives with semantic family tokens/components.
4. Test semantic HTML, labels, keyboard order, focus, dialogs, announcements, contrast, target size, reduced motion, zoom, long strings, clipping, and horizontal overflow.
5. Capture deterministic visual tests at 390×844, 412×915, 768×1024, 1440×900, and 1920×1080 across light/dark, all six themes, loading/error/empty/dialog, and mobile/desktop navigation.
6. Run axe and `node .ishiku/kit/scripts/design-system verify .`. Review diffs manually against approved intent.

Never update baselines automatically, hide content to remove a diff, use unlabeled icon-only controls, or treat one viewport/theme as representative.

## Output and completion

Report route/state/theme/viewport coverage, accessibility results, visual artifacts, accepted design decisions, fixed deviations, and remaining issues. Missing required visual or accessibility evidence prevents `VERIFIED`.
