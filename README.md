# Gestión ROMEZ

Plataforma interna para ROMEZ Servicios Contables en Paraguay: clientes, gestión comercial, cobranzas, checklists, atención al cliente y tickets del WhatsApp compartido.

## Desarrollo local

Requisitos: Node.js 20+, pnpm, PostgreSQL y Redis.

```bash
pnpm install
pnpm --filter crm db:generate
pnpm --filter crm db:migrate
pnpm dev
```

- Web: `http://localhost:3001`
- API: `http://localhost:3000/api/v1`
- Salud: `http://localhost:3000/health`

Las variables se documentan sin secretos en `ops/production.env.example` y `frontend/.env.example`. `DIRECT_URL` debe acompañar a `DATABASE_URL` para Prisma.

## Verificación

```bash
pnpm --filter crm test
pnpm --filter crm build
pnpm --filter frontend lint
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend build
pnpm acceptance
```

Usar exclusivamente pnpm. No versionar `.env`, sesiones o medios de WhatsApp, respaldos ni credenciales tributarias.

## Datos iniciales

El registro público está deshabilitado. El bootstrap idempotente crea el espacio y owner de ROMEZ mediante variables locales:

```bash
ROMEZ_OWNER_EMAIL=... ROMEZ_OWNER_PASSWORD=... ROMEZ_OWNER_FIRST_NAME=... pnpm --filter crm db:seed
```

La contraseña no tiene valor predeterminado y no se imprime. El resto del equipo se crea desde Equipo.

## Documentación

- [Vault Obsidian](docs/obsidian/00%20-%20Inicio.md)
- [Operación y despliegue](ops/README.md)
- [Configuración local y GitHub](docs/local-setup-github.md)

Producción prevista: `https://romez.consultoriadigital.io`. El despliegue sólo continúa después de un respaldo con hashes y una restauración temporal verificada.

Estado al 2026-08-30: respaldo y restauración verificados; backend (53 pruebas), frontend y migraciones limpias en verde. La publicación final espera el registro DNS, las variables privadas `ROMEZ_OWNER_*` y el escaneo presencial del QR.
