#!/usr/bin/env bash
set -euo pipefail

repo_dir="${ROMEZ_REPO_DIR:-/var/www/crm}"
runtime_user="romez"

if [[ "$EUID" -ne 0 || "$repo_dir" != "/var/www/crm" || ! -d "$repo_dir/backend" || ! -d "$repo_dir/frontend" ]]; then
  echo "Ejecutá este script como root sobre /var/www/crm." >&2
  exit 2
fi

if ! id "$runtime_user" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /home/romez --shell /bin/bash --user-group "$runtime_user"
fi
chown "$runtime_user:$runtime_user" /home/romez
chmod 700 /home/romez

if [[ -f "$repo_dir/.env" ]]; then
  chown root:root "$repo_dir/.env"
  chmod 600 "$repo_dir/.env"
fi

install -d -o "$runtime_user" -g "$runtime_user" -m 700 "$repo_dir/backend/.data"
chown -R -- "$runtime_user:$runtime_user" "$repo_dir/backend/.data"
find "$repo_dir/backend/.data" -type d -exec chmod 700 {} +
find "$repo_dir/backend/.data" -type f -exec chmod 600 {} +

for env_file in \
  "$repo_dir/backend/.env" \
  "$repo_dir/frontend/.env" \
  "$repo_dir/frontend/.env.local" \
  "$repo_dir/frontend/.env.production"
do
  if [[ -f "$env_file" ]]; then
    chown "$runtime_user:$runtime_user" "$env_file"
    chmod 600 "$env_file"
  fi
done

if [[ -d "$repo_dir/frontend/.next" ]]; then
  install -d -o "$runtime_user" -g "$runtime_user" -m 700 "$repo_dir/frontend/.next/cache"
  chown -R -- "$runtime_user:$runtime_user" "$repo_dir/frontend/.next/cache"
  find "$repo_dir/frontend/.next/cache" -type d -exec chmod 700 {} +
  find "$repo_dir/frontend/.next/cache" -type f -exec chmod 600 {} +
fi

install -d -o root -g root -m 755 /etc/systemd/system/pm2-romez.service.d
printf '[Service]\nUMask=0077\n' > /etc/systemd/system/pm2-romez.service.d/override.conf
chmod 644 /etc/systemd/system/pm2-romez.service.d/override.conf

printf 'runtime_user=ok\nuser=%s\n' "$runtime_user"
