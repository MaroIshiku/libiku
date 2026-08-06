# Verification policy

Map every mandatory AppSpec requirement to implementation and at least one executable test. Security-critical requirements need a security or negative-path test. Reject missing acceptance criteria, duplicate IDs, `TODO`/`TBD` placeholders, unreachable functionality, and documented UI/API behavior that disagrees.

The shared verification sequence is: schemas and traceability; formatting, lint and type checks; architecture; unit, integration, contract and migration tests; production build; Docker build and smoke test; browser E2E, axe and visual regression; security, dependency and secret scans; SBOM; performance budget; backup/restore; and upgrade. Local development and CI invoke `.ishiku/kit/scripts/verify-app`.

Risk A covers copy/icons/small layout changes, B normal features and APIs, C identity/storage/database/network/upstreams, and D platform or security foundations. Verification depth is proportional to risk. Long-running endurance runs are outside the default quality and release gates and may be executed only when the user explicitly requests one for a defined application and duration.
