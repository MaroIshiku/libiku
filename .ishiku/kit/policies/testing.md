# Verification policy

Map every mandatory AppSpec requirement to implementation and at least one executable test. Security-critical requirements need a security or negative-path test. Reject missing acceptance criteria, duplicate IDs, `TODO`/`TBD` placeholders, unreachable functionality, and documented UI/API behavior that disagrees.

The shared verification sequence is: schemas and traceability; formatting, lint and type checks; architecture; unit, integration, contract and migration tests; production build; Docker build and smoke test; browser E2E, axe and visual regression; security, dependency and secret scans; SBOM; performance budget; backup/restore; upgrade; and required soak evidence. Local development and CI invoke `.ishiku/kit/scripts/verify-app`.

Risk A covers copy/icons/small layout changes, B normal features and APIs, C identity/storage/database/network/upstreams, and D platform or security foundations. C and D require a configurable 48-hour isolated soak before release verification. Record start/end, artifact/image digest, scenario results, resource trends, restarts, data checks, and logs.
