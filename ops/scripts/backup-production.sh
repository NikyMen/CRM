#!/usr/bin/env bash
set -euo pipefail

repo_dir="${ROMEZ_REPO_DIR:-/var/www/crm}"
backup_root="${ROMEZ_BACKUP_DIR:-$repo_dir/backups}"

case "$repo_dir" in
  /var/www/crm) ;;
  *) echo "ROMEZ_REPO_DIR fuera del alcance permitido" >&2; exit 2 ;;
esac

root_backend_status="$({ pm2 jlist 2>/dev/null || printf '[]'; } | node -e '
let input = ""
process.stdin.on("data", (chunk) => input += chunk)
process.stdin.on("end", () => {
  const backendProcess = JSON.parse(input).find((item) => item.name === "crm-backend")
  process.stdout.write(backendProcess?.pm2_env?.status ?? "missing")
})
')"

runtime_backend_status="missing"
if id romez >/dev/null 2>&1; then
  runtime_backend_status="$({ runuser -u romez -- env PM2_HOME=/home/romez/.pm2 pm2 jlist 2>/dev/null || printf '[]'; } | node -e '
let input = ""
process.stdin.on("data", (chunk) => input += chunk)
process.stdin.on("end", () => {
  const backendProcess = JSON.parse(input).find((item) => item.name === "crm-backend")
  process.stdout.write(backendProcess?.pm2_env?.status ?? "missing")
})
')"
fi

if [[ "$root_backend_status" == "online" || "$runtime_backend_status" == "online" ]]; then
  echo "Detene crm-backend antes de crear el respaldo definitivo." >&2
  exit 3
fi

if command -v docker >/dev/null 2>&1 \
  && docker inspect crm_backend >/dev/null 2>&1 \
  && [[ "$(docker inspect --format '{{.State.Running}}' crm_backend)" == "true" ]]; then
  echo "Detene el contenedor crm_backend antes de crear el respaldo definitivo." >&2
  exit 3
fi

if command -v ss >/dev/null 2>&1 && ss -ltn 'sport = :3000' | tail -n +2 | grep -q .; then
  echo "El puerto backend 3000 todavía acepta conexiones; congelá todas las escrituras antes del respaldo." >&2
  exit 3
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_root/romez-pre-reset-$timestamp"

mkdir -p "$target"
chmod 700 "$target"

cd "$repo_dir/backend"

node <<'NODE' > "$target/database-url.txt"
require('dotenv').config({ quiet: true })
const url = new URL(process.env.DATABASE_URL)
console.log(JSON.stringify({
  engine: url.protocol.replace(':', ''),
  host: url.hostname,
  port: url.port || '5432',
  database: url.pathname.replace(/^\//, ''),
}))
NODE

database_url="$(node -e "require('dotenv').config({ quiet: true }); process.stdout.write(process.env.DATABASE_URL || '')")"
if [[ -z "$database_url" ]]; then
  echo "DATABASE_URL no definida" >&2
  exit 4
fi

pg_dump "$database_url" --format=custom --file="$target/database.dump"
pg_restore --list "$target/database.dump" > "$target/database.contents"

psql "$database_url" --no-psqlrc --tuples-only --no-align > "$target/row-counts.tsv" <<'SQL'
SELECT 'users' || E'\t' || count(*) FROM users
UNION ALL SELECT 'workspaces' || E'\t' || count(*) FROM workspaces
UNION ALL SELECT 'contacts' || E'\t' || count(*) FROM contacts
UNION ALL SELECT 'deals' || E'\t' || count(*) FROM deals
UNION ALL SELECT 'whatsapp_sessions' || E'\t' || count(*) FROM whatsapp_sessions
UNION ALL SELECT 'whatsapp_chats' || E'\t' || count(*) FROM whatsapp_chats
UNION ALL SELECT 'whatsapp_messages' || E'\t' || count(*) FROM whatsapp_messages
ORDER BY 1;
SQL

data_paths=(.data/whatsapp-auth .data/whatsapp-media)
if [[ -d "$repo_dir/backend/.data/client-documents" ]]; then
  data_paths+=(.data/client-documents)
fi
tar -C "$repo_dir/backend" -czf "$target/application-files.tar.gz" "${data_paths[@]}"
gzip -t "$target/application-files.tar.gz"

{
  printf 'path\tbytes\tfiles\n'
  for data_path in "${data_paths[@]}"; do
    absolute_path="$repo_dir/backend/$data_path"
    printf '%s\t%s\t%s\n' \
      "$data_path" \
      "$(find "$absolute_path" -type f -printf '%s\n' | awk '{ total += $1 } END { printf "%.0f", total }')" \
      "$(find "$absolute_path" -type f | wc -l)"
  done
} > "$target/application-files.tsv"

{
  printf 'backend_env_keys\n'
  sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$repo_dir/backend/.env" | sort
  printf 'git_commit=%s\n' "$(git -C "$repo_dir" rev-parse HEAD)"
  printf 'created_at=%s\n' "$timestamp"
} > "$target/config-manifest.txt"

(
  cd "$target"
  sha256sum \
    database.dump \
    database.contents \
    row-counts.tsv \
    application-files.tar.gz \
    application-files.tsv \
    config-manifest.txt \
    database-url.txt > SHA256SUMS
)

chmod 600 "$target"/*
printf '%s\n' "$target"
