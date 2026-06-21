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

The compose files are ready for ZimaOS Docker apps and use your ZimaOS storage paths by default:

| Host path | Container path | Purpose |
| --- | --- | --- |
| `/media/ZimaOS-HD/AppData/ish_libation/config` | `/config` | Libation settings and accounts files |
| `/media/ZimaOS-HD/AppData/ish_libation/db` | `/db` | Libation database |
| `/media/ZimaOS-HD/AppData/ish_libation/gluetun` | `/gluetun` | Gluetun state and server data |
| `/media/ZimaOS-HD/AppData/ish_libation/data` | `/data` | Downloaded books |

Direct mode without VPN:

```bash
docker compose -f compose.yml up -d
```

Recommended Gluetun mode:

```bash
docker compose -f compose.gluetun.yml up -d
```

Before starting the Gluetun mode, replace the `INSERT_HERE` placeholders in `compose.gluetun.yml`:

```yaml
MULLVAD_ACCOUNT_ID: INSERT_HERE
WIREGUARD_PRIVATE_KEY: INSERT_HERE
WIREGUARD_ADDRESSES: INSERT_HERE
```

In Gluetun mode the WebUI uses:

```yaml
network_mode: "service:gluetun"
```

That means port `3000` is published on the `gluetun` service, not on `ish-libation`.
This is a Docker limitation of `network_mode: service:gluetun`. The ZimaOS app metadata still points to `Libation (Ish)` and `ish-libation`; Gluetun is only the network sidecar.
The Gluetun firewall must also allow the WebUI port. The provided compose file sets:

```yaml
FIREWALL_INPUT_PORTS: 3000
```

The compose file intentionally does not set `DNS_UPSTREAM_PLAIN_ADDRESSES`; Gluetun's own documentation recommends keeping the built-in DNS forwarding defaults instead of pointing plain DNS directly at a VPN-provider DNS address.

For ZimaOS, the WebUI container runs as `0:0` to avoid bind-mount permission issues on `/media/ZimaOS-HD/...`.

Open:

```text
http://<zimaos-host>:3100
```

## Volumes

| Container path | Purpose |
| --- | --- |
| `/config` | Libation settings and accounts files |
| `/db` | Libation database |
| `/data` | Downloaded books |

## Fixed settings

| Setting | Value | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | WebUI port inside the container |
| Host port | `3100` | Host port exposed by Docker/ZimaOS |
| App data path | `/media/ZimaOS-HD/AppData/ish_libation` | Base path for config, db and Gluetun data |
| Books path | `/media/ZimaOS-HD/AppData/ish_libation/data` | Host path for downloaded books |
| Runtime user | `0:0` | Runtime user for bind-mount writes |
| `LIBATION_FILES_DIR` | `/config` | Directory passed to Libation CLI |
| `LIBATION_DB_DIR` | `/db` | Directory searched for `*.db` |
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
