# Libiku

Libation Web GUI for Docker, ZimaOS, and optional Gluetun deployments.

## Summary

Libiku is a web interface for [Libation](https://github.com/rmcrackan/Libation). The app builds Libation CLI inside the container, reads the Libation SQLite database in read-only mode for the Library view, and runs scan, download, status, login, and import actions through the official CLI.

## Part of the ishiku Family

Libiku follows the shared Pixel Soft Utility design system used by ishiku apps: calm surfaces, rounded components, a mobile app shell, a desktop dashboard, and consistent themes. The app uses the same six themes as the other ishiku utilities: Lavender, Mint, Sky, Amber, Rose, and Graphite, each with Light, Dark, and System mode.

The first launch uses the shared admin setup with a Docker secret. After that, public registration is closed and the Web GUI requires an admin session.

## Features

- Dashboard with Libation version, public IP context, active jobs, and job history.
- Library view with search, status filter, sorting, and card-based mobile layout.
- Actions for Refresh, Liberate All, single-title Liberate, Force, PDF, and Status Check.
- Account list via `LibationCli list-accounts`.
- Guided Amazon/Audible account connection with a one-time browser sign-in link and clear response-URL handoff.
- `audible-cli` JSON account import as an alternative background job.
- JSON editors for `Settings.json` and `AccountsSettings.json`.
- Logs, diagnostics, and technical information in the Settings section.
- First-run admin setup with setup secret, hashed password, and session cookie.

## Tech Stack

- Node.js without a frontend framework.
- Libation CLI from the upstream Libation repository.
- SQLite access through `sqlite3` in the container, read-only for library data.
- Docker multi-stage build with .NET SDK for Libation and Node runtime for Libiku.
- Pixel Soft Utility design system with local CSS/JS, local icon sprite, and local logo.

## Installation

### Docker Compose

Create a setup secret first:

```bash
sudo install -d -m 0750 -o 1001 -g 1001 \
  /DATA/AppData/libiku/config \
  /DATA/AppData/libiku/db \
  /DATA/AppData/libiku/data
mkdir -p secrets
umask 077
printf '%s\n' 'replace-with-a-long-random-secret' > secrets/setup_secret.txt
```

Libiku runs as UID/GID `1001:1001`. Existing bind-mounted data must be writable by that identity before the hardened container starts:

```bash
sudo chown -R 1001:1001 \
  /DATA/AppData/libiku/config \
  /DATA/AppData/libiku/db \
  /DATA/AppData/libiku/data
```

Run directly without VPN:

```bash
docker compose -f docker-compose.yml up -d
```

For custom deployments, `docker-compose.example.yml` can be used as a neutral template.

Recommended Gluetun deployment:

```bash
docker compose -f compose.gluetun.yml up -d
```

Before starting the Gluetun stack, replace the placeholders in `compose.gluetun.yml`:

```yaml
MULLVAD_ACCOUNT_ID: INSERT_HERE
WIREGUARD_PRIVATE_KEY: INSERT_HERE
WIREGUARD_ADDRESSES: INSERT_HERE
```

The Web GUI is available on this port:

```text
http://<host>:3100
```

### First Launch

On first launch, Libiku shows a blocking admin setup. The normal app is only visible after the first admin account has been created.

### Create Admin Account

Enter the setup secret from `secrets/setup_secret.txt`, a display name, an admin username, and an admin password in the setup window. The admin password must be at least 12 characters long and must not match the setup secret.

After successful creation, registration closes. Additional admins cannot be created through the public setup.

### Connect an Amazon Account

Open **Accounts** and choose **Connect Amazon account**:

1. Enter the email address used by the Amazon account and select the Audible marketplace where the audiobooks were purchased.
2. Select **Start secure sign-in**, then open the one-time Amazon link shown by Libiku. The Amazon password is entered only on Amazon's site.
3. Complete sign-in and any verification challenge. Amazon then redirects to a final page that may look broken or say it does not exist; this is expected.
4. Copy the complete URL from that final page's browser address bar, return to Libiku, paste it into **Final browser URL**, and select **Finish connection**.

The final browser URL is the response URL. Libiku sends it only to the still-running Libation login process; it is not placed in process arguments, job logs, or persistent Libiku data. A sign-in session expires after 15 minutes by default, and a fresh flow can be started safely after cancellation, expiry, or restart.

## Configuration

### Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Web server port inside the container |
| `TZ` | `Europe/Berlin` | Time zone for logs and display |
| `LIBIKU_AUTH_FILE` | `/config/LibikuAuth.json` | Persistent admin and setup metadata |
| `LIBIKU_SESSION_TTL_SECONDS` | `604800` | Admin session lifetime |
| `LIBIKU_AMAZON_LOGIN_TTL_SECONDS` | `900` | Maximum lifetime of an in-progress Amazon browser sign-in |
| `LIBATION_CLI` | `/libation/LibationCli` | Path to Libation CLI |
| `LIBATION_FILES_DIR` | `/config` | Libation settings and accounts |
| `LIBATION_DB_DIR` | `/db` | Search path for Libation databases |
| `LIBATION_BOOKS_DIR` | `/data` | Download output path |
| `PUBLIC_IP_URL` | `https://api.ipify.org?format=json` | Public IP check |
| `PUBLIC_IP_INTERVAL_SECONDS` | `300` | Public IP check interval |

### Docker Secrets

Libiku prefers:

```text
ISHIKU_SETUP_SECRET_FILE=/run/secrets/ishiku_setup_secret
```

`ISHIKU_SETUP_SECRET` is intended only as a fallback for simple local deployments. The secret is not stored in the database and is not sent to the browser.

### Persistent Data

The Compose files use these paths by default:

| Host path | Container path | Purpose |
| --- | --- | --- |
| `/DATA/AppData/libiku/config` | `/config` | Libation settings, accounts, and Libiku auth file |
| `/DATA/AppData/libiku/db` | `/db` | Libation database |
| `/DATA/AppData/libiku/data` | `/data` | Download output |
| `/DATA/AppData/libiku/gluetun` | `/gluetun` | Gluetun state data in the VPN stack |

## Security

- The setup secret is only used for the first admin registration.
- The admin password must not match the setup secret.
- Passwords are stored as Node `scrypt` hashes, never as plaintext.
- Public registration is closed after the first admin account.
- Sessions use HttpOnly cookies with `SameSite=Lax`.
- Failed setup attempts are rate-limited.
- Amazon sign-in starts are rate-limited; response URLs are accepted only from same-origin sessions and are never retained in job logs.
- Health checks at `/healthz` do not expose sensitive data.

## Updates and Backup

Pull new images and recreate the stack:

```bash
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d
```

Back up the persistent `/config`, `/db`, and `/data` directories before updates. In Gluetun mode, also back up `/gluetun` if its state should be preserved.

## Development

```bash
npm install
npm run dev
```

For local development without a built Libation CLI, set `LIBATION_CLI` to an existing `LibationCli` path.

Syntax check:

```bash
npm run check
```

## Created with ChatGPT Codex

This project was designed and revised with support from ChatGPT Codex. Maintenance, ownership, operating responsibility, and publishing responsibility remain with the repository owner.

## Status and License

Status: early Docker-first Web GUI for Libation CLI.

A license file is not included yet. Add an appropriate license before reuse outside your own deployment.
