# Architecture policy

## Profiles

New apps use Node.js 24 LTS, TypeScript, Fastify, React, TanStack Router, React Hook Form, Zod, SQLite with Drizzle, Vitest, Playwright, and axe-core. Keep frontend, HTTP application, domain logic, persistence, and external integrations behind explicit boundaries. Validate configuration at startup and expose separate liveness and readiness endpoints.

Existing Go, Python, .NET-integrating, or appliance-oriented applications may retain their stack through `platform.profile` and an adapter decision. Modernization must preserve behavior, data, remotes, branches, and rollback paths. A rewrite needs an explicit decision.

## Shared capabilities

Use the platform implementation or a documented adapter for authentication, revocable sessions, permissions, validation, theme tokens, header/navigation/profile menu, dialogs, toasts, tables, cards, empty/error states, logging, configuration, health checks, app manifest, About view, API errors, and test helpers. Do not create a second foundation implementation in a new app.

All APIs use a stable error envelope with `code`, `message`, `requestId`, and optional field errors. All app manifests expose version, build date, and Git SHA. UI strings are English.

## Dependency decisions

Pin direct dependencies and container bases to supported versions; pin release inputs to immutable digests where practical. Record a new dependency's purpose, maintenance health, license, security history, size/runtime impact, alternatives, and removal plan. Overrides live only in `.ishiku/overrides/`, include tests and a review date, and fail closed after expiry.
