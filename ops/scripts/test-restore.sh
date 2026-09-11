#!/usr/bin/env bash
set -euo pipefail

backup_root="${ROMEZ_BACKUP_DIR:-/var/www/crm/backups}"
repo_dir="${ROMEZ_REPO_DIR:-/var/www/crm}"
target="${1:-}"
prisma_dir="${2:-}"

if [[ -z "$target" ]]; then
  echo "Uso: test-restore.sh /var/www/crm/backups/romez-pre-reset-..." >&2
  exit 2
fi

resolved_root="$(realpath "$backup_root")"
resolved_target="$(realpath "$target")"
case "$resolved_target" in
  "$resolved_root"/romez-pre-reset-*) ;;
  *) echo "Respaldo fuera del alcance permitido" >&2; exit 3 ;;
esac
if [[ -n "$prisma_dir" && ( "$repo_dir" != "/var/www/crm" || ! -f "$prisma_dir/schema.prisma" ) ]]; then
  echo "El esquema Prisma temporal no es válido" >&2
  exit 3
fi

container="romez-restore-check-$(date +%s)-$$"
actual="$(mktemp)"
files_restore="$(mktemp -d)"
case "$container" in
  romez-restore-check-*) ;;
  *) exit 4 ;;
esac

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -f "$actual"
  rm -rf -- "$files_restore"
}
trap cleanup EXIT

docker run --detach --rm \
  --name "$container" \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null
docker exec "$container" createdb -U postgres restore_check
docker exec -i "$container" pg_restore \
  -U postgres \
  -d restore_check \
  --no-owner \
  --no-privileges < "$resolved_target/database.dump"

if [[ -n "$prisma_dir" ]]; then
  host_port="$(docker port "$container" 5432/tcp | sed -n 's/.*://p')"
  [[ "$host_port" =~ ^[0-9]+$ ]]
  export DATABASE_URL="postgresql://postgres@127.0.0.1:${host_port}/restore_check"
  export DIRECT_URL="$DATABASE_URL"
  cd "$repo_dir/backend"
  pnpm exec prisma migrate deploy --schema "$prisma_dir/schema.prisma"
  pnpm exec prisma validate --schema "$prisma_dir/schema.prisma"
fi

docker exec -i "$container" psql \
  -U postgres \
  -d restore_check \
  --no-psqlrc \
  --tuples-only \
  --no-align > "$actual" <<'SQL'
SELECT 'users' || E'\t' || count(*) FROM users
UNION ALL SELECT 'workspaces' || E'\t' || count(*) FROM workspaces
UNION ALL SELECT 'contacts' || E'\t' || count(*) FROM contacts
UNION ALL SELECT 'deals' || E'\t' || count(*) FROM deals
UNION ALL SELECT 'whatsapp_sessions' || E'\t' || count(*) FROM whatsapp_sessions
UNION ALL SELECT 'whatsapp_chats' || E'\t' || count(*) FROM whatsapp_chats
UNION ALL SELECT 'whatsapp_messages' || E'\t' || count(*) FROM whatsapp_messages
ORDER BY 1;
SQL

diff --strip-trailing-cr "$resolved_target/row-counts.tsv" "$actual"

tar -C "$files_restore" -xzf "$resolved_target/application-files.tar.gz"
while IFS=$'\t' read -r data_path expected_bytes expected_files; do
  [[ "$data_path" == "path" ]] && continue
  restored_path="$files_restore/$data_path"
  test -d "$restored_path"
  actual_bytes="$(find "$restored_path" -type f -printf '%s\n' | awk '{ total += $1 } END { printf "%.0f", total }')"
  actual_files="$(find "$restored_path" -type f | wc -l)"
  [[ "$actual_bytes" == "$expected_bytes" ]]
  [[ "$actual_files" == "$expected_files" ]]
done < "$resolved_target/application-files.tsv"
printf 'restore=ok\nupgrade=%s\npath=%s\n' "$([[ -n "$prisma_dir" ]] && printf ok || printf skipped)" "$resolved_target"
