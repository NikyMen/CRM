# Continuidad: permisos de módulos y resumen de cuenta

Fecha: 18/09/2026. Rama de trabajo: `codex/gestion-romez`.

## Objetivo entregado

- El botón **Eliminar cliente** quedó inmediatamente a la derecha de **Editar legajo** en el encabezado del cliente.
- Owner y admin ven **Cargar resumen**. Abre un diálogo con períodos rápidos y rango personalizado, genera un PDF descargable para ese cliente y muestra la marca ROMEZ en la esquina superior izquierda del documento.
- Cobranzas está desactivada por defecto para `member` y `viewer`; `owner` y `admin` siempre la ven. El servidor rechaza directamente las rutas de Cobranzas cuando el módulo no corresponde, por lo que ocultar el menú no es la única protección.
- En Equipo, owner/admin pueden abrir el selector animado de módulos de cada integrante no owner. Un admin sólo puede administrar member/viewer; el owner también puede ajustar admins. No se exponen Equipo ni Integraciones en ese selector, porque son áreas de administración protegidas por rol.

## Persistencia y migración

La migración `backend/prisma/migrations/20260918120000_member_module_access/migration.sql` agrega `workspace_users.moduleAccess` como JSONB con `{}` por defecto. Es aditiva y no elimina ni transforma datos existentes.

Antes de desplegar, usar exclusivamente:

```bash
pnpm --filter crm exec prisma migrate deploy --schema=prisma/schema.prisma
```

No usar `prisma db push` en producción. La aplicación no debe reiniciarse ni desplegarse desde esta tarea: falta la autorización y el alias del VPS vigente.

## Comportamiento técnico relevante

- `workspace.settings.modules` sigue siendo la configuración base del espacio.
- `workspace_users.moduleAccess` guarda los overrides de un integrante.
- La resolución efectiva está en `backend/src/core/modules/registry.ts` (`readMemberModuleState`). Para member/viewer, Cobranzas necesita el override explícito `true`. Para owner/admin siempre queda en `true`.
- `backend/src/core/modules/require-module.ts` usa la identidad autenticada, no sólo el workspace, y `collections` aplica ese guard a todas sus rutas.
- El PDF filtra pagos por `paidAt` y cargos por `createdAt` al elegir un período. Los montos continúan separados por moneda y no es un comprobante fiscal.

## Entorno local seguro

No se escribieron secretos ni se versionó ningún `.env`. Para correr localmente, copiar los ejemplos ya existentes a archivos ignorados y completar valores propios:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
pnpm --filter crm db:generate
pnpm --filter crm db:migrate
pnpm dev
```

El `.gitignore` cubre `.env*`, archivos de claves/certificados, respaldos, bases locales, `.data`, adjuntos de clientes y resultados de pruebas. Antes de hacer push, revisar `git status --short` y no agregar archivos ajenos a esta lista de cambios.

## Verificación pendiente para un continuador

1. Ejecutar las pruebas, TypeScript, lint y builds indicados en el README.
2. En una base local vacía, aplicar las migraciones y verificar que la columna `moduleAccess` exista.
3. Con sesiones de owner/admin/member/viewer, comprobar menú y respuestas HTTP de `/api/v1/collections/*`.
4. Como owner, habilitar Cobranzas a un member desde Equipo y recargar su sesión; debe aparecer el módulo y poder descargar el resumen sólo si sus permisos del recurso también lo permiten.
5. Generar el PDF de un cliente con y sin rango, revisar impresión y logo ROMEZ.