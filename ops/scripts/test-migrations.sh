#!/usr/bin/env bash
set -euo pipefail

repo_dir="${ROMEZ_REPO_DIR:-/var/www/crm}"
prisma_dir="${1:-}"

if [[ "$repo_dir" != "/var/www/crm" || -z "$prisma_dir" || ! -f "$prisma_dir/schema.prisma" ]]; then
  echo "Uso: test-migrations.sh /ruta/temporal/prisma" >&2
  exit 2
fi

container="romez-migration-check-$(date +%s)-$$"
case "$container" in
  romez-migration-check-*) ;;
  *) exit 3 ;;
esac

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --detach --rm \
  --name "$container" \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --env POSTGRES_DB=romez_migration_check \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -U postgres -d romez_migration_check >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$container" pg_isready -U postgres -d romez_migration_check >/dev/null

host_port="$(docker port "$container" 5432/tcp | sed -n 's/.*://p')"
[[ "$host_port" =~ ^[0-9]+$ ]]
export DATABASE_URL="postgresql://postgres@127.0.0.1:${host_port}/romez_migration_check"
export DIRECT_URL="$DATABASE_URL"

cd "$repo_dir/backend"
pnpm exec prisma migrate deploy --schema "$prisma_dir/schema.prisma"
pnpm exec prisma validate --schema "$prisma_dir/schema.prisma"
pnpm exec prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel "$prisma_dir/schema.prisma" \
  --exit-code

table_count="$(docker exec "$container" psql -U postgres -d romez_migration_check -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public';")"
[[ "$table_count" -ge 35 ]]
printf 'migrations=ok\ntables=%s\n' "$table_count"
