# Wolves en `wolves.consultoriadigital.io`

Producción de Wolves en el VPS compartido `72.60.15.125` (Hostinger, alias ssh `farmacia`). Ese
servidor aloja unas 30 aplicaciones (n8n, farmacia, servired, pino, el CRM viejo en
`/var/www/crm`, etc.): **no es el servidor de ROMEZ** y nada de esto toca a las demás.

| Pieza | Wolves |
| --- | --- |
| Carpeta | `/var/www/crm-wolves` (de root, lectura para `wolves`) |
| Usuario Unix | `wolves`, con su propio daemon `pm2-wolves` |
| PM2 | `wolves-backend` en `172.18.0.1:3820`, `wolves-frontend` en `172.18.0.1:3821` |
| Docker | proyecto `crm-wolves`: `wolves_postgres` 127.0.0.1:55433, `wolves_redis` 127.0.0.1:56380, volúmenes `crm_wolves_*` |
| HTTPS | Traefik (`n8n-traefik-1`) con `/docker/n8n/dynamic/wolves.yml`; certificado `mytlschallenge` |

`172.18.0.1` es el gateway de la red `n8n_default`, donde vive Traefik: los procesos son
alcanzables por Traefik y no desde Internet. No se usa Nginx.

**No** reiniciar el container `n8n-traefik-1` (sirve n8n), ni tocar `pm2-root`, los `crm_*`,
`crmbase_*` ni otros proyectos. El puerto 3010 lo usa `cuantico-web-ia`.

## 0. Antes de empezar

```bash
dig +short wolves.consultoriadigital.io                 # 72.60.15.125
ss -ltn | grep -E ':(3820|3821|55433|56380)\b'          # vacío
```

## 1. Usuario y código

```bash
useradd --system --create-home --home-dir /home/wolves --shell /bin/bash --user-group wolves
chmod 700 /home/wolves
git clone https://github.com/NikyMen/CRM.git /var/www/crm-wolves
cd /var/www/crm-wolves
pnpm install --frozen-lockfile
```

## 2. PostgreSQL y Redis

```bash
cp deploy/clients/wolves/docker-compose.override.yml docker-compose.override.yml
install -m 600 /dev/null .env          # sección Compose de ops/production.env.example, secretos nuevos
docker compose -p crm-wolves up -d postgres redis
docker ps --format '{{.Names}}\t{{.Ports}}' | grep wolves_
```

## 3. `.env` de backend y frontend

`ops/production.env.example` más las dos secciones de `deploy/clients/wolves/brand.env` (colores
entre comillas). Secretos nuevos: no reutilizar los de la instancia local.

```bash
install -m 600 -o wolves -g wolves /dev/null backend/.env
install -m 600 -o wolves -g wolves /dev/null frontend/.env
install -d -m 700 -o wolves -g wolves backend/.data
```

## 4. Compilar y migrar

```bash
pnpm --filter crm build
pnpm --filter frontend build
chown -R wolves:wolves frontend/.next/cache && chmod 700 frontend/.next/cache
pnpm --filter crm exec prisma migrate deploy
```

`NEXT_PUBLIC_API_URL` y la marca se fijan en el build: si cambia `frontend/.env`, recompilar.

## 5. PM2 bajo `wolves`

```bash
install -d -m 755 /etc/systemd/system/pm2-wolves.service.d
printf '[Service]\nUMask=0077\n' > /etc/systemd/system/pm2-wolves.service.d/override.conf
pm2 startup systemd -u wolves --hp /home/wolves
systemctl daemon-reload
sudo -iu wolves bash -lc 'umask 077; pm2 start /var/www/crm-wolves/deploy/clients/wolves/ops/pm2/ecosystem.config.cjs; pm2 save; pm2 kill'
systemctl enable --now pm2-wolves
curl --fail http://172.18.0.1:3820/health
curl --fail --head http://172.18.0.1:3821/login
install -m 0644 deploy/clients/wolves/ops/logrotate/wolves /etc/logrotate.d/wolves
```

## 6. Owner y ajustes

El owner queda en `backend/.data/owner-wolves.txt` (`email=` y `password=`, de `wolves`, 0600),
fuera de git. `seed.ts` no carga `backend/.env`, por eso se le precarga dotenv:

```bash
F=backend/.data/owner-wolves.txt
NODE_OPTIONS="-r $(node -p "require.resolve('dotenv/config',{paths:['backend']})")" \
  DOTENV_CONFIG_PATH="$PWD/backend/.env" DOTENV_CONFIG_QUIET=true \
  ROMEZ_OWNER_EMAIL="$(sed -n 's/^email=//p' $F)" ROMEZ_OWNER_PASSWORD="$(sed -n 's/^password=//p' $F)" \
  ROMEZ_OWNER_FIRST_NAME=Administrador ROMEZ_WORKSPACE_NAME="Wolves Indumentaria" ROMEZ_WORKSPACE_SLUG=wolves \
  pnpm --filter crm db:bootstrap
node deploy/clients/wolves/post-bootstrap.cjs $F http://172.18.0.1:3820/api/v1
```

Una sola vez: repetir el bootstrap recrea el embudo de ROMEZ como predeterminado (ver el README de
la carpeta de arriba). Sin `ROMEZ_WORKSPACE_NAME`/`SLUG` crea "ROMEZ Servicios Contables".

## 7. HTTPS

```bash
install -m 0644 deploy/clients/wolves/ops/traefik/wolves.yml /docker/n8n/dynamic/wolves.yml
curl --fail https://wolves.consultoriadigital.io/health
curl --fail --head https://wolves.consultoriadigital.io/login
```

El primer pedido HTTPS dispara la emisión del certificado; puede tardar unos segundos.

## 8. WhatsApp

El QR se escanea en persona desde Configuración. Los números van en formato internacional
(`+54 9 …`): la normalización todavía asume Paraguay.

## Actualizar

```bash
cd /var/www/crm-wolves && git pull --ff-only && pnpm install --frozen-lockfile
pnpm --filter crm build && pnpm --filter frontend build
pnpm --filter crm exec prisma migrate deploy
systemctl restart pm2-wolves
```

## Volver atrás

Sólo toca lo de Wolves:

```bash
rm /docker/n8n/dynamic/wolves.yml
systemctl disable --now pm2-wolves
docker compose -p crm-wolves stop        # nunca down -v: borra los datos
```
