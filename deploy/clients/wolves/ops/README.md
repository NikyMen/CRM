# Wolves en `wolves.consultoriadigital.io`

Despliegue de Wolves en el VPS donde ya corre ROMEZ (`romez.consultoriadigital.io`), con la misma
topología: PostgreSQL y Redis en Docker sobre loopback, backend y frontend en PM2, Nginx en
`:8080` y Traefik en `:443`. Wolves no comparte nada con ROMEZ salvo Nginx y Traefik, que eligen el
sitio por dominio.

| | ROMEZ | Wolves |
| --- | --- | --- |
| Carpeta | `/var/www/crm` | `/var/www/crm-wolves` |
| Usuario Unix | `romez` | `wolves` |
| PM2 | `crm-backend` 3000, `crm-frontend` 3002 | `wolves-backend` 3010, `wolves-frontend` 3011 |
| Docker | `crm_postgres` 55432, `crm_redis` 56379 | `wolves_postgres` 55433, `wolves_redis` 56380 |
| Volúmenes | `crm_romez_*` | `crm_wolves_*` |
| Nginx / Traefik | `romez.conf` / `romez.yml` | `wolves.conf` / `wolves.yml` |

Los scripts de `ops/scripts` (`prepare-runtime-user.sh`, `bootstrap-owner.sh`) sólo aceptan
`/var/www/crm` y el usuario `romez`: no sirven para Wolves. Acá van los pasos equivalentes.

**Nunca** detener ni reiniciar `crm-backend`, `crm-frontend`, `pm2-romez`, sus contenedores ni el
PostgreSQL/Redis del host. Nginx se recarga (`reload`), no se reinicia.

## 0. Antes de empezar

```bash
dig +short wolves.consultoriadigital.io          # tiene que dar la IP del VPS
ss -ltn | grep -E ':(3010|3011|55433|56380)\b'   # tiene que salir vacío
docker volume ls | grep crm_wolves               # vacío si es la primera vez
```

Sin el registro DNS `A`, Traefik no puede emitir el certificado.

## 1. Usuario y código

```bash
sudo useradd --system --create-home --home-dir /home/wolves --shell /bin/bash --user-group wolves
sudo chmod 700 /home/wolves
sudo git clone https://github.com/NikyMen/CRM.git /var/www/crm-wolves
cd /var/www/crm-wolves
sudo pnpm install --frozen-lockfile
```

## 2. PostgreSQL y Redis

```bash
sudo cp deploy/clients/wolves/docker-compose.override.yml docker-compose.override.yml
sudo install -m 600 -o root -g root /dev/null .env   # completar con la sección Compose de ops/production.env.example
sudo docker compose -p crm-wolves up -d postgres redis
sudo docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E 'wolves_|crm_'
```

Tienen que verse `wolves_postgres` y `wolves_redis` en 55433/56380, y los `crm_*` de ROMEZ intactos.

## 3. `.env` de backend y frontend

Partir de `deploy/clients/wolves/ops/production.env.example` y sumar las dos secciones de
`deploy/clients/wolves/brand.env`, con los colores entre comillas. Secretos nuevos y al azar: no
reutilizar los de ROMEZ ni los de la instancia local.

```bash
sudo install -m 600 -o wolves -g wolves /dev/null backend/.env
sudo install -m 600 -o wolves -g wolves /dev/null frontend/.env
sudo install -d -m 700 -o wolves -g wolves backend/.data
```

## 4. Compilar y migrar

```bash
sudo pnpm --filter crm build
sudo pnpm --filter frontend build
sudo chown -R wolves:wolves frontend/.next/cache && sudo chmod 700 frontend/.next/cache
sudo pnpm --filter crm exec prisma migrate deploy
```

`NEXT_PUBLIC_API_URL` y la marca se fijan en el build: si cambia `frontend/.env`, recompilar.

## 5. PM2 bajo `wolves`

```bash
sudo install -d -m 755 /etc/systemd/system/pm2-wolves.service.d
printf '[Service]\nUMask=0077\n' | sudo tee /etc/systemd/system/pm2-wolves.service.d/override.conf
sudo pm2 startup systemd -u wolves --hp /home/wolves
sudo systemctl daemon-reload
sudo -iu wolves bash -lc 'umask 077; pm2 start /var/www/crm-wolves/deploy/clients/wolves/ops/pm2/ecosystem.config.cjs; pm2 save; pm2 kill'
sudo systemctl enable --now pm2-wolves
curl --fail http://127.0.0.1:3010/health
curl --fail --head http://127.0.0.1:3011/login
sudo install -m 0644 deploy/clients/wolves/ops/logrotate/wolves /etc/logrotate.d/wolves
```

## 6. Owner y ajustes

Una sola vez, en una shell de root privada. Las credenciales quedan sólo en variables
exportadas: no van a disco, al historial ni a la línea de comandos (`ps`).

```bash
sudo -i
cd /var/www/crm-wolves
read -r -p "Email del owner: " ROMEZ_OWNER_EMAIL
read -r -s -p "Contraseña (16+): " ROMEZ_OWNER_PASSWORD; printf '\n'
export ROMEZ_OWNER_EMAIL ROMEZ_OWNER_PASSWORD ROMEZ_OWNER_FIRST_NAME=Administrador \
  ROMEZ_WORKSPACE_NAME="Wolves Indumentaria" ROMEZ_WORKSPACE_SLUG=wolves
NODE_OPTIONS="-r $(node -p "require.resolve('dotenv/config',{paths:['backend']})")" \
  DOTENV_CONFIG_PATH="$PWD/backend/.env" DOTENV_CONFIG_QUIET=true \
  pnpm --filter crm db:bootstrap
node deploy/clients/wolves/post-bootstrap.cjs \
  <(printf 'email=%s\npassword=%s\n' "$ROMEZ_OWNER_EMAIL" "$ROMEZ_OWNER_PASSWORD") \
  http://127.0.0.1:3010/api/v1
unset ROMEZ_OWNER_EMAIL ROMEZ_OWNER_PASSWORD
exit
```

`seed.ts` no carga `backend/.env`; por eso se le precarga dotenv.

Sin `ROMEZ_WORKSPACE_NAME` y `ROMEZ_WORKSPACE_SLUG`, el bootstrap crea "ROMEZ Servicios Contables".

## 7. Nginx y Traefik

```bash
sudo install -m 0644 deploy/clients/wolves/ops/nginx/wolves.conf <carpeta de romez.conf>/wolves.conf
sudo nginx -t && sudo systemctl reload nginx
sudo install -m 0644 deploy/clients/wolves/ops/traefik/wolves.yml <carpeta de romez.yml>/wolves.yml
curl --fail https://wolves.consultoriadigital.io/health
curl --fail --head https://wolves.consultoriadigital.io/login
curl --fail https://romez.consultoriadigital.io/health   # ROMEZ sigue respondiendo
```

Traefik toma el archivo nuevo solo (file provider) y emite el certificado con `mytlschallenge`.

## 8. WhatsApp

El QR se escanea en persona desde Configuración. Los números de clientes van en formato
internacional (`+54 9 …`): la normalización todavía asume Paraguay.

## Volver atrás

Sólo toca lo de Wolves:

```bash
sudo rm <carpeta de romez.yml>/wolves.yml
sudo rm <carpeta de romez.conf>/wolves.conf && sudo nginx -t && sudo systemctl reload nginx
sudo systemctl disable --now pm2-wolves
sudo docker compose -p crm-wolves stop        # nunca down -v: borra los datos
```
