# Migración a un VPS dedicado

Paso a paso para mover Gestión ROMEZ desde el VPS compartido actual a un VPS
privado exclusivo del proyecto, sin perder datos y con vuelta atrás en cada etapa.

Convenciones de este documento:

- `VPS-A` es el servidor actual (compartido con otros proyectos).
- `VPS-B` es el servidor nuevo (dedicado).
- Todo se instala en `/var/www/crm` y corre bajo el usuario de servicio `romez`.
- Los comandos con `sudo` van en `VPS-B` salvo que diga lo contrario.

## Qué cambia respecto del VPS compartido

En `VPS-A` la topología tiene dos capas de proxy porque Traefik y Nginx son
compartidos con otras apps: Traefik `:443` → Nginx `127.0.0.1:8080` → PM2.

En `VPS-B` el servidor es sólo de ROMEZ, así que conviene dejar **una sola capa**:
Nginx en `:80/:443` con certificado de Let's Encrypt vía certbot, apuntando
directo a los procesos PM2. Eso elimina Traefik, el vhost interno `:8080`, la
regla de red `172.18.0.0/12` y el archivo `systemd/nginx-romez.conf`.

Si preferís no tocar la topología durante la migración, se puede copiar tal cual
y simplificar después. En ese caso saltate el paso 7 y replicá Traefik.

---

## Fase 0 — Antes de tocar nada

### 0.1 Inventario de lo que hay que mover

| Elemento | Dónde vive en VPS-A |
|---|---|
| Base de datos PostgreSQL | contenedor `crm_postgres`, volumen `crm_romez_postgres_data` |
| Redis | contenedor `crm_redis`, volumen `crm_romez_redis_data` |
| Sesión de WhatsApp | `/var/www/crm/backend/.data/whatsapp-auth` |
| Medios de WhatsApp | `/var/www/crm/backend/.data/whatsapp-media` |
| Documentos de clientes | `/var/www/crm/backend/.data/client-documents` |
| Secretos | `/var/www/crm/.env` y `/var/www/crm/backend/.env` |
| Certificado TLS | Traefik (se regenera en VPS-B, no se copia) |

Los `.env` **no** están en Git y no se deben commitear nunca.

### 0.2 Requisitos de VPS-B

- Ubuntu/Debian reciente, 2 vCPU y 4 GB de RAM como mínimo.
- Node.js en la misma versión mayor que VPS-A. Verificalo antes:
  ```bash
  ssh VPS-A "node -v && pm2 -v && docker --version"
  ```
- Docker + Docker Compose, Nginx, certbot, git, pm2 global.
- Puertos 22, 80 y 443 abiertos. Postgres y Redis quedan sólo en loopback.

### 0.3 Bajar el TTL del DNS

Al menos 24 horas antes, poné el registro A de `romez.consultoriadigital.io`
en TTL 300. Así el corte de DNS del día de la migración dura minutos y no horas.

---

## Fase 1 — Preparar VPS-B (sin cortar el servicio)

Todo esto se hace con `VPS-A` funcionando normalmente.

### 1.1 Paquetes base

```bash
sudo apt update && sudo apt install -y git nginx certbot python3-certbot-nginx ca-certificates curl
```

Instalá Docker siguiendo la guía oficial de Docker para tu distro, y después
Node.js y PM2:

```bash
sudo npm install -g pm2
```

### 1.2 Clonar el repositorio

```bash
sudo mkdir -p /var/www
sudo git clone <url-del-repo> /var/www/crm
cd /var/www/crm
sudo git checkout main
```

### 1.3 Usuario de servicio aislado

```bash
sudo /var/www/crm/ops/scripts/prepare-runtime-user.sh
```

Crea el usuario `romez`, deja `.data` en `0700` y los `.env` en `0600`.
La app nunca corre como root.

### 1.4 Secretos

Copiá `ops/production.env.example` a los dos destinos y completá los valores.
**Generá contraseñas nuevas** para Postgres y Redis: no reutilices las de VPS-A.

```bash
sudo cp /var/www/crm/ops/production.env.example /var/www/crm/.env
sudo nano /var/www/crm/.env
sudo nano /var/www/crm/backend/.env
```

`JWT_SECRET` **sí** se copia igual que en VPS-A. Si lo cambiás, todas las
sesiones abiertas se invalidan y el equipo tiene que volver a loguearse.

Para generar los secretos nuevos:

```bash
openssl rand -base64 32 | tr -d '/+=' | head -c 40
```

### 1.5 Levantar Postgres y Redis

```bash
cd /var/www/crm
sudo docker compose up -d postgres redis
sudo docker compose ps
```

Ambos tienen que quedar en `healthy`. Sólo escuchan en `127.0.0.1:55432` y
`127.0.0.1:56379`.

### 1.6 Build de la aplicación

```bash
cd /var/www/crm
sudo corepack pnpm install --frozen-lockfile
sudo corepack pnpm build
```

El build del frontend hornea `NEXT_PUBLIC_API_URL`, así que ese valor tiene que
estar puesto **antes** de construir.

### 1.7 Probar las migraciones sobre una base vacía

```bash
sudo /var/www/crm/ops/scripts/test-migrations.sh
```

Esto valida el historial completo de Prisma, incluida la migración nueva del
módulo de Ventas, antes de tocar datos reales.

---

## Fase 2 — Ensayo de restauración (todavía sin corte)

El objetivo es practicar la restauración con datos reales antes del día del corte.

### 2.1 Respaldo de ensayo en VPS-A

El script exige que el backend esté detenido, porque un dump con escrituras en
curso puede quedar inconsistente. Para el ensayo podés parar 2 minutos en un
horario de baja actividad:

```bash
ssh VPS-A
sudo -iu romez pm2 stop crm-backend
sudo /var/www/crm/ops/scripts/backup-production.sh
sudo -iu romez pm2 start crm-backend
```

Imprime la ruta del respaldo, por ejemplo
`/var/www/crm/backups/romez-pre-reset-20260911T...Z`.

### 2.2 Verificar y transferir

```bash
ssh VPS-A "sudo /var/www/crm/ops/scripts/verify-backup.sh <ruta-del-respaldo>"
scp -r VPS-A:<ruta-del-respaldo> ./romez-ensayo
scp -r ./romez-ensayo VPS-B:/tmp/
ssh VPS-B "cd /tmp/romez-ensayo && sha256sum -c SHA256SUMS"
```

Nunca restaures un respaldo cuyos hashes no verifiquen.

### 2.3 Restaurar en VPS-B

```bash
cd /var/www/crm/backend
sudo -u romez bash -lc 'set -a; . ./.env; set +a; pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" /tmp/romez-ensayo/database.dump'
sudo tar -C /var/www/crm/backend -xzf /tmp/romez-ensayo/application-files.tar.gz
sudo chown -R romez:romez /var/www/crm/backend/.data
```

### 2.4 Comparar conteos

```bash
sudo /var/www/crm/ops/scripts/test-restore.sh
cat /tmp/romez-ensayo/row-counts.tsv
```

Los conteos de `users`, `workspaces`, `contacts`, `deals` y las tablas de
WhatsApp tienen que coincidir exactamente con el archivo del respaldo.

### 2.5 Arrancar PM2 y probar a ciegas

```bash
sudo pm2 startup systemd -u romez --hp /home/romez
sudo systemctl daemon-reload
sudo -iu romez bash -lc 'umask 077; pm2 start /var/www/crm/ops/pm2/ecosystem.config.cjs; pm2 save; pm2 kill'
sudo systemctl enable --now pm2-romez
curl --fail http://127.0.0.1:3000/health
curl --fail --head http://127.0.0.1:3002/login
```

Si ambos responden, VPS-B ya sirve la aplicación completa con datos reales.
Anotá cuánto tardó cada paso: ese es el presupuesto de tiempo del corte real.

---

## Fase 3 — Reverse proxy y TLS en VPS-B

### 3.1 Vhost propio del servidor dedicado

Creá `/etc/nginx/sites-available/romez` con el contenido de
`ops/nginx/romez.conf`, cambiando el bloque `server` por:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name romez.consultoriadigital.io;
}
```

Quitá las líneas `listen 172.18.0.1:8080`, `allow` y `deny all`: ya no hay un
Traefik intermedio del que defenderse, y el tráfico entra por el puerto público.

El resto de los `location` queda igual: `/api/v1/`, `/health`, el SSE de
`whatsapp/events` con `proxy_buffering off`, y `/` hacia el frontend en `:3002`.

```bash
sudo ln -s /etc/nginx/sites-available/romez /etc/nginx/sites-enabled/romez
sudo nginx -t && sudo systemctl reload nginx
```

### 3.2 Certificado

Mientras el DNS todavía apunta a VPS-A, validá por DNS para no depender del corte:

```bash
sudo certbot certonly --manual --preferred-challenges dns -d romez.consultoriadigital.io
```

Una vez movido el DNS (fase 4), podés pasarlo al modo automático:

```bash
sudo certbot --nginx -d romez.consultoriadigital.io
sudo systemctl status certbot.timer
```

### 3.3 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Verificá que 55432 y 56379 no estén expuestos:

```bash
sudo ss -ltnp | grep -E '55432|56379'
```

Sólo deben aparecer en `127.0.0.1`.

---

## Fase 4 — El corte real

Elegí una ventana de baja actividad. Duración esperada: 20 a 40 minutos.

1. **Avisar al equipo.** Nadie debe cargar datos durante la ventana.
2. **Congelar VPS-A.**
   ```bash
   ssh VPS-A "sudo -iu romez pm2 stop crm-backend crm-frontend"
   ```
3. **Respaldo definitivo.**
   ```bash
   ssh VPS-A "sudo /var/www/crm/ops/scripts/backup-production.sh"
   ssh VPS-A "sudo /var/www/crm/ops/scripts/verify-backup.sh <ruta>"
   ```
4. **Transferir y verificar hashes** igual que en 2.2.
5. **Restaurar en VPS-B** igual que en 2.3, ahora sobre la base ya probada.
6. **Comparar conteos** contra `row-counts.tsv`. Si algo no coincide, pará acá.
7. **Arrancar VPS-B.**
   ```bash
   ssh VPS-B "sudo -iu romez pm2 restart crm-backend crm-frontend && curl --fail http://127.0.0.1:3000/health"
   ```
8. **Mover el DNS** a la IP de VPS-B.
9. **Verificar desde afuera** cuando propague:
   ```bash
   curl --fail https://romez.consultoriadigital.io/health
   ```
10. **Reconectar WhatsApp.** La sesión de Baileys viaja en `.data/whatsapp-auth`
    y normalmente reconecta sola. Si pide QR, escanealo desde
    Configuración → WhatsApp. Confirmá que entran mensajes nuevos antes de
    dar por cerrada la migración.

### Vuelta atrás

Mientras el DNS siga con TTL 300 y `VPS-A` no se haya tocado, revertir es:

```bash
ssh VPS-B "sudo -iu romez pm2 stop crm-backend crm-frontend"
ssh VPS-A "sudo -iu romez pm2 start crm-backend crm-frontend"
```

y devolver el registro A a la IP de VPS-A. Los datos cargados en VPS-B durante
la ventana se pierden, por eso el paso 1 (congelar al equipo) no es opcional.

---

## Fase 5 — Después de migrar

### 5.1 Logrotate y respaldos automáticos

```bash
sudo install -m 0644 /var/www/crm/ops/logrotate/romez /etc/logrotate.d/romez
sudo logrotate -d /etc/logrotate.d/romez
```

Programá el respaldo diario en cron y mandá una copia fuera del servidor. Un
respaldo que vive sólo en el VPS no protege contra la pérdida del VPS.

### 5.2 Dejar VPS-A en modo sólo lectura

No lo borres todavía. Durante una o dos semanas:

```bash
ssh VPS-A "sudo systemctl disable --now pm2-romez"
ssh VPS-A "sudo docker compose -f /var/www/crm/docker-compose.yml stop"
```

Y sacá el vhost de ROMEZ de la configuración compartida de Traefik y Nginx para
que no queden rutas apuntando a una app apagada.

### 5.3 Limpieza final

Recién cuando VPS-B lleve dos semanas estable:

- Guardar el último respaldo de VPS-A fuera de los dos servidores.
- Borrar `/var/www/crm` de VPS-A y sus volúmenes Docker.
- Rotar el `JWT_SECRET` si sospechás que alguien más tuvo acceso a VPS-A.

---

---

## Camino corto: migrar sin conservar los datos

Si lo que hay en el servidor actual son pruebas y no hace falta conservarlo, la
migración se reduce mucho. Se saltean la Fase 0.1, la Fase 2 completa y los
pasos 2 a 6 de la Fase 4: no hay respaldo, ni transferencia, ni restauración, ni
comparación de conteos. `JWT_SECRET` se genera nuevo en vez de copiarse, y la
sesión de WhatsApp se vuelve a vincular con el QR.

Lo que sigue siendo obligatorio:

1. Publicar el código que va a producción. Los `.env` no están en Git, así que
   se crean a mano desde `ops/production.env.example`, y hay que confirmar qué
   rama se clona: si el trabajo vive en una rama, clonar `main` no lo trae.
2. Fase 1 completa, de 1.1 a 1.6: paquetes, clonado, usuario de servicio,
   secretos, Postgres y Redis en Docker, y build.
3. `prisma migrate deploy` sobre la base vacía.
4. Crear el owner con `ops/scripts/bootstrap-owner.sh`.
5. Fase 3 completa: Nginx, certificado y firewall.
6. Arrancar PM2 y verificar los dos health checks.
7. Mover el DNS y escanear el QR de WhatsApp.

Dejá el servidor viejo prendido hasta confirmar que el nuevo anda. Como no hay
datos que perder, la vuelta atrás es devolver el registro A a la IP anterior.

---

## Checklist de verificación

Después de migrar, probá cada módulo con un usuario real:

- [ ] Login y logout
- [ ] Clientes: alta, edición y documentos adjuntos
- [ ] Ventas: nueva venta, confirmar, anular, exportar CSV
- [ ] Cobranzas: cargo, pago e importación de planilla
- [ ] Tickets y chat interno
- [ ] Atención al cliente: llega un mensaje nuevo de WhatsApp
- [ ] Configuración → Módulos: apagar y prender un módulo
- [ ] `curl --fail https://romez.consultoriadigital.io/health`
- [ ] Renovación automática del certificado: `sudo certbot renew --dry-run`
