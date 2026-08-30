#!/usr/bin/env bash
set -euo pipefail

backup_root="${ROMEZ_BACKUP_DIR:-/var/www/crm/backups}"
target="${1:-}"

if [[ -z "$target" ]]; then
  echo "Uso: verify-backup.sh /var/www/crm/backups/romez-pre-reset-..." >&2
  exit 2
fi

resolved_root="$(realpath "$backup_root")"
resolved_target="$(realpath "$target")"

case "$resolved_target" in
  "$resolved_root"/romez-pre-reset-*) ;;
  *) echo "Respaldo fuera del alcance permitido" >&2; exit 3 ;;
esac

cd "$resolved_target"
sha256sum --check SHA256SUMS
pg_restore --list database.dump >/dev/null
gzip -t application-files.tar.gz
test -s row-counts.tsv
test -s application-files.tsv

listing="$(mktemp)"
trap 'rm -f "$listing"' EXIT
tar -tzf application-files.tar.gz > "$listing"
if awk '$0 ~ /^\// || $0 ~ /(^|\/)\.\.($|\/)/ { found=1 } END { exit found ? 0 : 1 }' "$listing"; then
  echo "El respaldo de archivos contiene una ruta insegura" >&2
  exit 4
fi
if grep -Ev '^\.data/(whatsapp-auth|whatsapp-media|client-documents)(/|$)' "$listing" | grep -q .; then
  echo "El respaldo contiene rutas fuera del alcance esperado" >&2
  exit 4
fi
grep -q '^\.data/whatsapp-auth/' "$listing"
grep -q '^\.data/whatsapp-media/' "$listing"
printf 'backup=ok\npath=%s\n' "$resolved_target"
