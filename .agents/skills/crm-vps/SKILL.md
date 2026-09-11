---
name: crm-vps
description: Inspect and operate this CRM deployment on its VPS through the configured SSH alias. Use for remote status, logs, deployment, restart, or production diagnostics; do not use for ordinary local development.
---

# CRM VPS

The local SSH alias is `farmacia` and the CRM directory on the server is `/var/www/crm`. Authentication is handled by the user's SSH configuration; never read, copy, print, or commit private keys.

## Read-only workflow

Use the repository CLI first:

- `pnpm vps:check`: verify SSH, Docker, remote directory, and Compose file.
- `pnpm vps:status`: show remote Git state and every Compose service.
- `pnpm vps logs <service> <lines>`: read 1-1000 lines for `backend`, `frontend`, `postgres`, or `redis`.

These commands are safe diagnostics. Avoid including tokens, connection strings, personal data, or full sensitive log payloads in the response.

## Remote mutations

Only mutate the VPS when the current user request explicitly authorizes that action. Mutations include `git pull`, file edits, deploy/build, migrations, container restart/stop, database writes, firewall changes, and package installation.

Before an authorized deployment or repair:

1. Run `pnpm vps:check` and `pnpm vps:status`.
2. Preserve and report unexpected remote Git changes; do not overwrite them.
3. Work only under `/var/www/crm` unless the request names another target.
4. Never print or download `.env`, database contents, credentials, SSH material, or WhatsApp session data.
5. Prefer reversible, scoped commands. Do not use destructive Git or Docker cleanup commands.
6. Verify container status and health after the change.

The CLI intentionally has no deploy or restart command. Use direct `ssh farmacia ...` only for a specifically authorized operation, keeping the remote command explicit and narrowly scoped.

## Failures

Do not loop on failed production operations. Gather read-only status/log evidence, identify the failing stage, and report the blocker or apply only the requested fix.
