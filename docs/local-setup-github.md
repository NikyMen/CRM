# Entorno local y push seguro

## Preparación local

1. Instalar desde la raíz:

```bash
pnpm install
```

2. Crear archivos locales:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env.local
```

3. Completar sin versionar:

- `DATABASE_URL` y `DIRECT_URL` de una PostgreSQL de desarrollo.
- `REDIS_URL`.
- `JWT_SECRET` de al menos 32 caracteres.
- `FRONTEND_URL=http://localhost:3001`.
- `ROMEZ_OWNER_*` sólo para ejecutar el bootstrap.

Mantener `ALLOW_PUBLIC_REGISTRATION=false`, `ENABLE_LEGACY_CHANNELS=false`, `DEFAULT_CURRENCY=PYG` y `APP_TIMEZONE=America/Asuncion`.

4. Preparar una base limpia y crear el owner:

```bash
pnpm --filter crm db:generate
pnpm --filter crm db:migrate
pnpm --filter crm db:bootstrap
```

5. Levantar Gestión ROMEZ:

```bash
pnpm dev
```

- Web: `http://localhost:3001`.
- API: `http://localhost:3000/api/v1`.
- Salud: `http://localhost:3000/health`.

## Verificación

```bash
pnpm --filter crm test
pnpm --filter crm build
pnpm --filter frontend lint
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend build
```

No usar `prisma db push` en producción.

## GitHub seguro

Antes de subir:

```bash
git status --short
git diff -- . ":(exclude)**/.env" ":(exclude)**/.env.*"
```

No deben aparecer `.env`, `.data`, dumps, respaldos, tokens, claves privadas, documentos ni sesiones/medios de WhatsApp.

Si Git en Windows informa `detected dubious ownership`, autorizar únicamente la ruta exacta del repositorio:

```bash
git config --global --add safe.directory D:/dev/crm/CRM
```

## Canal WhatsApp

La integración canónica es un solo WhatsApp mediante QR/Baileys, configurado por owner/admin desde Configuración. Los módulos heredados Meta, Inbox y Chatwoot permanecen en el código por reversibilidad, pero no registran rutas cuando `ENABLE_LEGACY_CHANNELS=false`.

No guardar credenciales de DNIT, Marangatu, SIFEN ni WhatsApp en Git u Obsidian.
