#!/usr/bin/env bash
set -euo pipefail

repo_dir="${ROMEZ_REPO_DIR:-/var/www/crm}"
if [[ "$repo_dir" != "/var/www/crm" || ! -f "$repo_dir/backend/.env" ]]; then
  echo "El runtime ROMEZ no está preparado en /var/www/crm" >&2
  exit 2
fi

read -r -p "Email del owner ROMEZ: " ROMEZ_OWNER_EMAIL
read -r -p "Nombre: " ROMEZ_OWNER_FIRST_NAME
read -r -p "Apellido (opcional): " ROMEZ_OWNER_LAST_NAME
read -r -s -p "Contraseña (mínimo 12 caracteres): " ROMEZ_OWNER_PASSWORD
printf '\n'
read -r -s -p "Repetir contraseña: " password_confirmation
printf '\n'

if [[ ${#ROMEZ_OWNER_PASSWORD} -lt 12 || "$ROMEZ_OWNER_PASSWORD" != "$password_confirmation" ]]; then
  echo "Las contraseñas no coinciden o tienen menos de 12 caracteres." >&2
  exit 3
fi

export ROMEZ_OWNER_EMAIL ROMEZ_OWNER_PASSWORD ROMEZ_OWNER_FIRST_NAME ROMEZ_OWNER_LAST_NAME
trap 'unset ROMEZ_OWNER_EMAIL ROMEZ_OWNER_PASSWORD ROMEZ_OWNER_FIRST_NAME ROMEZ_OWNER_LAST_NAME password_confirmation' EXIT

cd "$repo_dir"
pnpm --filter crm db:bootstrap
printf 'bootstrap_owner=ok\n'
