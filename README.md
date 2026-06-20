# ish-libation

Docker-first WebUI for [rmcrackan/Libation](https://github.com/rmcrackan/Libation).

The image builds Libation's official CLI from upstream and wraps it with a WebUI for Docker/ZimaOS style deployments. It is designed to run either directly or behind a Gluetun VPN container.

## Current capabilities

- Dashboard with Libation version, paths, active jobs and current public IP.
- Public IP check in the header, useful when the container uses Gluetun networking.
- Library view from Libation's SQLite database.
- Refresh/scan, liberate all, per-book liberate, force re-liberate, PDF-only and status check buttons.
- Account listing via `LibationCli list-accounts`.
- External login and audible-cli JSON import as background jobs.
- Advanced JSON editors for `Settings.json` and `AccountsSettings.json`.
- Job history and logs.

## Image

```text
ghcr.io/maroishiku/ish-libation:latest
```

The included GitHub Actions workflow publishes multi-arch images to GHCR on pushes to `main`, tags and manual workflow dispatch.

## ZimaOS compose

Direct mode:

```bash
docker compose -f compose.yml up -d
```

Gluetun mode:

```bash
cp .env.example .env
# fill in the WireGuard values
docker compose -f compose.gluetun.yml up -d
```

In Gluetun mode the WebUI uses:

```yaml
network_mode: "service:gluetun"
```

That means port `3000` is published on the `gluetun` service, not on `ish-libation`.

Open:

```text
http://<zimaos-host>:3000
```

## Volumes

| Container path | Purpose |
| --- | --- |
| `/config` | Libation settings and accounts files |
| `/db` | Libation database |
| `/data` | Downloaded books |

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | WebUI port inside the container |
| `LIBATION_FILES_DIR` | `/config` | Directory passed to Libation CLI |
| `LIBATION_DB_DIR` | `/db` | Directory searched for `*.db` |
| `LIBATION_DB_FILE` | empty | Optional explicit database filename |
| `LIBATION_BOOKS_DIR` | `/data` | Download output directory |
| `PUBLIC_IP_URL` | `https://api.ipify.org?format=json` | Public IP endpoint |
| `PUBLIC_IP_INTERVAL_SECONDS` | `300` | Public IP refresh interval |

## Notes

This project intentionally uses Libation CLI for mutating operations and reads the SQLite database in read-only mode for the library view. That keeps the first version conservative: downloads, scans and status changes go through Libation's own command surface.

The upstream CLI documentation warns that the CLI does not perform every GUI-only upgrade or post-upgrade migration. For that reason, installations with older databases should be tested carefully before relying on fully automated upgrades.

## Development

```bash
npm install
npm run dev
```

For local development without a built Libation CLI, set `LIBATION_CLI` to an existing `LibationCli` path.
