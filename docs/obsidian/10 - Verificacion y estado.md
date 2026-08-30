---
tags: [pruebas, aceptacion, estado]
---

# Verificación y estado

Este documento se actualiza con evidencia de cada publicación. No marcar algo como operativo sólo porque aparece en pantalla.

## Automatización obligatoria

- Prisma validate, generate y migraciones.
- Pruebas backend y compilación TypeScript.
- ESLint y build de frontend.
- Aislamiento por workspace y responsable.
- Carrera de asignación de tickets.
- Ticket siguiente después de cerrar el anterior.
- Cargos, pagos parciales, vencimientos e importaciones duplicadas.
- Checklists por período y permisos.
- Registro público bloqueado y bootstrap sin credenciales impresas.

## Web

- Login inválido y válido.
- owner, admin, member y viewer.
- Alta, búsqueda y asignación de cliente.
- Gestión comercial y vínculo con cliente.
- Importación Excel/CSV.
- Cuenta corriente y pago.
- Ticket libre, toma, respuesta y cierre.
- Escritorio y móvil.
- Ausencia de la marca anterior en superficies visibles.

## Concurrencia

Simular al menos 15 sesiones con conexiones en vivo y una carrera de toma. Resultado esperado: una respuesta exitosa, las demás con conflicto controlado, sin doble asignación.

## Estado de publicación

| Control | Estado | Evidencia |
|---|---|---|
| Código local | Implementado; revisión final abierta | Rama `codex/gestion-romez` |
| Backend | Verificado | Build correcto y 51/51 pruebas |
| Frontend | Verificado | ESLint sin errores, TypeScript correcto y build de 28 rutas |
| Dependencias productivas | Verificado | `pnpm audit`: 0 críticas, 0 altas; 3 moderadas transitivas |
| Migraciones limpias | Verificado | PostgreSQL 16 temporal, 10 migraciones y 41 tablas |
| Respaldo productivo | Verificado | Copia VPS + copia externa, SHA-256 y restauración temporal correctos |
| Pruebas web | Pendiente | Requieren instancia nueva aislada y credenciales owner temporales/reales |
| DNS/HTTPS | Bloqueado externamente | Crear A `romez.consultoriadigital.io` → `72.60.15.125` |
| WhatsApp real | Requiere presencia | Escanear QR y probar ida/vuelta |

## Evidencia de respaldo

- Respaldo canónico: `/var/www/crm/backups/romez-pre-reset-20260830T020857Z`.
- Conteos restaurados: 12 usuarios, 10 espacios, 69 contactos, 73 oportunidades, 1.089 chats y 11.289 mensajes.
- WhatsApp auth: 1.856 archivos. Medios: 1.478 archivos y 743.621.733 bytes.
- La base histórica fue creada parcialmente con `db push` y su tabla `_prisma_migrations` tiene deriva. Por eso la publicación aprobada usa una base limpia; no se intenta actualizar esa base en el lugar.
- No eliminar el respaldo canónico ni el intento parcial anterior sin autorización explícita.

Actualizar esta tabla después de cada verificación; no borrar evidencia anterior relevante.
