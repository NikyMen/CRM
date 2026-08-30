# Operacion de Gestion ROMEZ

La topologia productiva oficial es:

- PostgreSQL y Redis en Docker Compose, publicados solo en loopback en
  `55432` y `56379` para no interferir con otros servicios del VPS.
- Redis usa contraseña obligatoria y persistencia AOF; el secreto debe ser URL-safe y vivir sólo en los `.env` protegidos.
- Backend Fastify y frontend Next.js en PM2, con una sola instancia de backend.
- PM2 se ejecuta bajo el usuario dedicado `romez`; la aplicación nunca corre como `root`.
- Nginx en `:8080` como upstream interno.
- Traefik en `:443` para HTTPS y certificado automatico.

Archivos versionados:

- `pm2/ecosystem.config.cjs`: procesos de aplicacion.
- `nginx/romez.conf`: frontend, API y SSE sin buffering.
- `traefik/romez.yml`: dominio HTTPS.
- `systemd/nginx-romez.conf`: ordena Nginx después de Docker para que exista el gateway privado.
- `logrotate/romez`: limita y comprime logs PM2 del usuario aislado.
- `scripts/backup-production.sh`: snapshot con el backend detenido.
- `scripts/verify-backup.sh`: hashes e integridad de archivos.
- `scripts/test-restore.sh`: restauración temporal y comparación de conteos.
- `scripts/test-migrations.sh`: aplica el historial completo sobre PostgreSQL 16 vacío.
- `scripts/bootstrap-owner.sh`: solicita las credenciales en una terminal privada y las mantiene sólo en memoria durante el bootstrap.
- `scripts/prepare-runtime-user.sh`: crea/verifica el usuario aislado y ajusta únicamente `.env` y `.data`; no cambia respaldos ni otros proyectos.

El despliegue y el reinicio de datos requieren respaldo verificado. No copiar
archivos `.env`, sesiones ni medios a Git.

Permisos: el release es de lectura para `romez`; `backend/.env` debe ser `0600` y pertenecer a `romez`; sólo `backend/.data` y los logs necesitan escritura. No dar acceso al usuario de servicio a otros proyectos del VPS.

Crear el owner sin guardar su contraseña:

```bash
sudo -iu romez /var/www/crm/ops/scripts/bootstrap-owner.sh
```

Antes de iniciar PM2 por primera vez:

```bash
sudo /var/www/crm/ops/scripts/prepare-runtime-user.sh
sudo pm2 startup systemd -u romez --hp /home/romez
sudo systemctl daemon-reload
sudo pm2 stop crm-backend crm-frontend
sudo -iu romez bash -lc 'umask 077; pm2 start /var/www/crm/ops/pm2/ecosystem.config.cjs; pm2 save; pm2 kill'
sudo systemctl enable --now pm2-romez
curl --fail http://127.0.0.1:3000/health
curl --fail --head http://127.0.0.1:3002/login
sudo install -m 0644 /var/www/crm/ops/logrotate/romez /etc/logrotate.d/romez
sudo logrotate -d /etc/logrotate.d/romez
```

Si la validación falla, detener únicamente los procesos nuevos y recuperar los anteriores:

```bash
sudo -iu romez pm2 delete crm-backend crm-frontend
sudo systemctl stop pm2-romez
sudo -iu romez pm2 kill
sudo pm2 restart crm-backend crm-frontend
```

Después de validar el daemon nuevo, retirar **sólo** los dos procesos viejos del daemon root y conservar las demás aplicaciones compartidas:

```bash
sudo pm2 delete crm-backend crm-frontend
sudo pm2 save
```

Antes de habilitar el vhost, verificar el gateway privado y aplicar el orden de arranque:

```bash
ip -4 addr show | grep -q '172.18.0.1/'
sudo install -D -m 0644 /var/www/crm/ops/systemd/nginx-romez.conf /etc/systemd/system/nginx.service.d/romez.conf
sudo systemctl daemon-reload
sudo nginx -t
```

Orden mínimo: detener `crm-backend`, ejecutar backup, verificarlo, descargar una segunda copia, verificarla y ejecutar `test-restore.sh`. El backend actual puede reiniciarse si la publicación todavía no va a continuar.

Evidencia vigente: el respaldo canónico `romez-pre-reset-20260830T020857Z` fue verificado en el VPS, descargado y restaurado temporalmente. Las 10 migraciones actuales también fueron aplicadas sobre una base vacía (41 tablas). No intentar una actualización in-place del dump histórico: su registro `_prisma_migrations` tiene deriva; la publicación ROMEZ usa una base nueva limpia.
