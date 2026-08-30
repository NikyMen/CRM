---
tags: [integraciones, seguridad, paraguay]
---

# Integraciones y seguridad

## Alcance actual

- WhatsApp compartido mediante Baileys.
- Webhooks/API keys heredados dentro de Configuración para owner/admin.
- Eventos de dominio con EventBus y BullMQ/Redis en producción.
- Importaciones manuales Excel/CSV para clientes y cobranzas.

## Fuera de alcance deliberado

- Integración automática con DNIT.
- Automatización de Marangatu.
- Integración SIFEN.
- Conversión automática de monedas.
- Almacenamiento de usuarios o contraseñas tributarias.

## Controles

- Registro público apagado por defecto.
- Login con límite estricto independiente del límite global.
- API keys y webhooks restringidos a roles administrativos.
- Archivos con límite de tamaño, validación de tipo y autorización por cliente.
- Secretos sólo en variables locales protegidas.
- Auth y medios de WhatsApp fuera de Git.
- Respaldos fuera del árbol público y con hashes.

## Datos personales

Los contactos, documentos, chats y cobros son información sensible. Aplicar mínimo privilegio, auditoría, retención definida y eliminación autorizada. Evitar datos reales en capturas, fixtures y pruebas.
