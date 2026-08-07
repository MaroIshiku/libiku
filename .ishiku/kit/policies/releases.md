# Release policy

Use semantic versions and immutable Git tags. A release is built once, tested by digest, published to GHCR with version and digest metadata, scanned, supplied with an SPDX or CycloneDX SBOM, provenance-attested, and promoted without rebuilding. Workflows use full action SHAs and minimum job permissions.

Weekly dependency and upstream discovery runs Monday at 05:00 Europe/Berlin. Updates arrive as reviewable pull requests containing changelog/risk analysis, license/security results, generated changes, verification evidence, and rollback instructions. Never auto-merge a breaking, security-sensitive, or upstream-generated change.

Release notes include requirements delivered, migrations, compatibility, known risks, backup and rollback instructions, image digest, SBOM, provenance, and test evidence.
