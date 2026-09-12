# Clientes, pagos y acceso al equipo

Cambios:

- Legajo: eliminar cliente de la cartera (archivado; conserva historial) y editar persona física/jurídica.
- Cobranzas: eliminar/anular pagos o restaurarlos como recibidos; los saldos se recalculan. No se restaura si el cargo fue anulado o si se produciría un sobrepago.
- Estados de cargos en español. PDF completo por cliente desde Cuenta corriente o Pagos, con totales separados por moneda.
- Equipo, sólo owner: cambiar contraseñas y generar enlaces de registro con rol elegido, un uso y vencimiento a las 24 horas. La persona completa nombre, apellido, correo y contraseña.
- Cambiar contraseña invalida las sesiones y los enlaces de recuperación previos. Las cuentas compartidas con otros espacios deben usar recuperación de contraseña.

## Actualizar el VPS

Para la instalación PM2 en `/var/www/crm`, bajo usuario de aplicación `romez`.
Ejecutar después de que el commit esté disponible en `origin/codex/gestion-romez`.
Estos comandos interrumpen temporalmente frontend/backend. No reinician PostgreSQL ni Redis.

```bash
ssh farmacia
cd /var/www/crm
set -euo pipefail

sudo -iu romez pm2 stop crm-backend crm-frontend
backup_path="$(sudo bash ops/scripts/backup-production.sh)"
sudo bash ops/scripts/verify-backup.sh "$backup_path"

git pull --ff-only origin codex/gestion-romez
pnpm install --frozen-lockfile

# Verifica todo el historial en PostgreSQL 16 temporal, sin tocar la base real.
sudo bash ops/scripts/test-migrations.sh /var/www/crm/backend/prisma

pnpm --filter crm build
pnpm --filter crm test
pnpm --filter frontend lint
pnpm --filter frontend build

sudo -iu romez bash -lc 'cd /var/www/crm/backend && pnpm exec prisma migrate deploy'
sudo -iu romez pm2 restart /var/www/crm/ops/pm2/ecosystem.config.cjs --update-env
sudo -iu romez pm2 save

curl --fail http://127.0.0.1:3000/health
curl --fail --head http://127.0.0.1:3002/login
```

Si falla algún paso, no continuar con el reinicio. Conservar el respaldo y revisar el error.
No ejecutar `prisma db push`, `migrate reset` ni seeds para esta actualización.
La migración agrega `users.sessionVersion` y `team_invitations`; no borra datos.

Después de iniciar: generar una invitación desde Equipo, registrar una cuenta de prueba y comprobar que el mismo enlace ya no acepta otra alta. Verificar también cambio de contraseña, descarga del PDF y anulación/restauración de un pago de prueba.

## Verificación local

Build backend/frontend, TypeScript, lint (seis advertencias preexistentes de imágenes), pruebas de autenticación/cobranzas y revisión visual del PDF con datos ficticios.
No se ejecutó la migración contra PostgreSQL vacío local porque Docker no estaba disponible; el comando de arriba realiza esa verificación antes de migrar producción.
