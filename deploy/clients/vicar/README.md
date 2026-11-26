# Vicar Inmobiliaria

Cliente #3 del producto: **Vicar Inmobiliaria** (Instagram `@vicarinmobiliaria` y `@vicar1544`,
más varias páginas de Facebook). Argentina.

Corre el mismo código de `main` que ROMEZ y Wolves; sólo cambian la configuración y los assets.
El alta sigue paso a paso la de Wolves: ver [`../wolves/README.md`](../wolves/README.md) y
reemplazar los valores por los de esta tabla.

## Qué hay acá

| Archivo | Para qué |
| --- | --- |
| `brand.env` | Marca y región (`BRAND_*`, `NEXT_PUBLIC_BRAND_*`, `APP_TIMEZONE`, `DEFAULT_CURRENCY`). Sin secretos. |
| `docker-compose.override.yml` | Contenedores y volúmenes propios (`vicar_*`, `crm_vicar_*`). |
| `post-bootstrap.cjs` | Tablero de inmobiliaria, checklists contables archivados y la instalación "pelada" (sólo redes). Idempotente. |
| `source/vicar-logo-original.jpg` | Logo que mandó el cliente (1080×1080, fondo blanco). |
| `source/vicar-pdf-source.png` | Origen del logo de los PDF: fondo blanco liso, lienzo 1,55:1. |

Assets: `frontend/public/brand/vicar-{light,dark,favicon}.png` y
`backend/assets/vicar-logo{-rgb.zlib,-alpha.zlib,.json}`.

| Servicio | Dónde (local) |
| --- | --- |
| PostgreSQL | `127.0.0.1:55434`, contenedor `vicar_postgres`, volumen `crm_vicar_postgres_data`, base `vicar_db` |
| Redis | `127.0.0.1:56381`, contenedor `vicar_redis`, volumen `crm_vicar_redis_data` |
| Backend | `http://127.0.0.1:3020` (API `/api/v1`, salud `/health`) |
| Frontend | `http://localhost:3021` |

Proyecto de Compose: `crm-vicar` (`docker compose -p crm-vicar up -d postgres redis`).
Credenciales del owner: `backend/.data/owner-vicar.txt` (git lo ignora).
Bootstrap: `ROMEZ_WORKSPACE_NAME="Vicar Inmobiliaria" ROMEZ_WORKSPACE_SLUG=vicar`.

```bash
pnpm --filter crm dev
pnpm --filter frontend exec next dev -p 3021
node deploy/clients/vicar/post-bootstrap.cjs backend/.data/owner-vicar.txt
```

## Datos de ejemplo (sólo local)

`demo/seed-demo.cjs` carga una demo ficticia para mostrar el CRM: 4 usuarios (Santiago admin,
Maximiliano y Sebastián vendedores, Evelyn contenidos, todos `@vicar.test`), 8 chats de WhatsApp
con fotos ilustradas de propiedades (`demo/fotos/`), 4 conversaciones de Instagram y 3 de
Facebook, los 15 leads repartidos en el tablero y 2 publicaciones de Instagram en borrador.
Teléfonos `54937940000xx`. Las cuentas de Instagram y Facebook de la demo quedan **sin conectar**:
se leen, pero no se puede responder ni publicar.

Con `--completo` agrega 3 tickets de postventa, 4 propietarios en Clientes, 5 tareas y mensajes en
el chat interno, para una instalación que tenga esas secciones prendidas.

```bash
node deploy/clients/vicar/demo/seed-demo.cjs            # reemplaza la demo anterior
node deploy/clients/vicar/demo/seed-demo.cjs --completo # también tickets, propietarios, tareas y chat interno
node deploy/clients/vicar/demo/seed-demo.cjs --borrar   # sólo la borra
```

Las contraseñas de los usuarios nuevos quedan en `backend/.data/usuarios-vicar.txt` (git lo
ignora). Volver a correr el script no cambia las contraseñas ya creadas. **Nunca** correrlo
contra producción.

## Producción

Desplegado el 2026-11-26 en **https://vicar.consultoriadigital.io**, en el VPS compartido
`72.60.15.125` (alias ssh `farmacia`), igual que Wolves (ver [`../wolves/ops/README.md`](../wolves/ops/README.md)):

| Pieza | Vicar |
| --- | --- |
| Carpeta | `/var/www/crm-vicar` (de root), datos en `backend/.data` (de `vicar`, 0700) |
| Usuario Unix | `vicar`, con su daemon `pm2-vicar` |
| PM2 | `vicar-backend` en `172.18.0.1:3830`, `vicar-frontend` en `172.18.0.1:3831` (`ops/pm2`) |
| Docker | proyecto `crm-vicar`: `vicar_postgres` 127.0.0.1:55434, `vicar_redis` 127.0.0.1:56381 |
| HTTPS | Traefik con `/docker/n8n/dynamic/vicar.yml` (`ops/traefik`), certificado de Let's Encrypt |

Es una **demo**: tiene cargados los datos de ejemplo y todas las cuentas (el dueño y los cuatro
`@vicar.test`) usan la clave compartida que se pasó con `seed-demo.cjs --clave=…`. Antes de
usarlo con datos reales: borrar la demo (`--borrar`), cambiar las claves y dar de baja los
usuarios de ejemplo.

En el servidor, `pnpm --filter … ` frena por `pnpm.overrides` (pnpm 10): para el bootstrap se
usa `backend/node_modules/.bin/tsx prisma/seed.ts` directo.

## Cómo queda configurado

El cliente pidió la instalación **pelada**: sólo las redes. El menú tiene cuatro entradas.

| Sección | Qué es |
| --- | --- |
| **Mensajes** (`/mensajes`) | Tablero kanban con las conversaciones de las tres redes. Arriba se filtra por red (una, varias o todas). Clic en la tarjeta abre el chat; arrastrarla cambia la etapa. |
| **WhatsApp** (`/redes/whatsapp`) | Abre directo en los chats (filtros Míos y Libres). La vinculación por QR está en la pestaña Conexión. Sin «Forzar IA» ni «Atiende el asistente». |
| **Instagram** (`/redes/instagram`) | Pestañas Mensajes, **Publicar** (imagen + texto, borradores y envío) y Conexión. |
| **Facebook** (`/redes/facebook`) | Pestañas Mensajes (Messenger) y Conexión. |

- **Responsable en todos los chats**, como en Tickets: owner y admin asignan a cualquiera desde el chat; un vendedor toma un chat libre o libera el suyo, y quien responde un chat libre se lo queda. Cada vendedor ve sólo lo suyo y lo libre. El lead del tablero sigue al responsable de su chat. En Mensajes se filtra por responsable (Míos, cada persona del equipo o Libres) además de por red.
- Menú del usuario: sólo Equipo y Cerrar sesión (`NEXT_PUBLIC_USER_MENU_HIDE=notifications,settings` en `brand.env`). Configuración se abre escribiendo `/settings`. En WhatsApp no se muestra nada de RUC ni legajos. En Mensajes, «Ocultar embudo» esconde la barra de proporciones (se recuerda por navegador).
- Columnas del tablero: Consulta recibida → Calificación → Visita coordinada →
  Propuesta / reserva → Negociación → Operación cerrada (ganada) → No concretado (perdida).
- Módulos prendidos: Mensajes, WhatsApp, Instagram, Facebook y Equipo (está en el menú del
  usuario; sin él no se crean los vendedores). Todo lo demás, apagado. `collectionsOff` apaga
  Cobranzas también para owner y admin.
- `backend/.env` lleva `ENABLE_LEGACY_CHANNELS=true`: registra el webhook de Meta
  (`/api/v1/inbox/meta/webhook`) por el que entran los mensajes de Instagram y Facebook.
- Colores: azul marino del logo (`#021c48`) en botones y sidebar. El acento queda azul y no rojo:
  en la app el rojo ya significa error, vencido o "no concretado".

## Para que Instagram y Facebook funcionen de verdad

La pantalla y la API están; falta lo que depende de Meta y del servidor. Nada de esto se probó
contra Meta.

1. Publicar el CRM con https y poner `PUBLIC_API_URL` en `backend/.env`. Sin eso Meta no puede
   entregar mensajes ni descargar la imagen de una publicación (en local no funciona).
2. App de Meta del negocio con `META_APP_SECRET` y `META_WEBHOOK_VERIFY_TOKEN`, el webhook
   apuntando a `/api/v1/inbox/meta/webhook` y los permisos aprobados: `instagram_manage_messages`,
   `instagram_content_publish` y `pages_messaging`.
3. Cargar en la pestaña **Conexión** de cada red el ID de la cuenta y el token de la página.
   El CRM consulta la cuenta en Meta antes de guardarla.

Límites conocidos: se publica una sola imagen JPG por publicación (sin carrusel, video ni
programación); en los chats de Instagram y Facebook se responde sólo con texto; Meta sólo deja
responder dentro de las 24 h del último mensaje del cliente.

## Qué pidió el cliente y qué hay hoy

Sale de la reunión del 2026-11-26 (transcripción y resumen en `_cliente/`, fuera de git).

| Pedido | Estado en `main` |
| --- | --- |
| Una sola bandeja para WhatsApp | **Está.** Sección WhatsApp y tablero de Mensajes (línea comercial, QR/Baileys). |
| Cada vendedor ve sólo sus chats; el dueño ve todo | **Está** en WhatsApp, Instagram y Facebook y en el tablero (lo propio y lo libre), con responsable por chat como en Tickets. |
| Etiquetas y etapas del lead | **Está** (embudo, etapas desde el chat). |
| Chat interno del equipo | **Está.** |
| Notificaciones de mensajes entrantes | **Está** en el navegador (sonido y aviso). No hay app ni push en el celular. |
| Instagram y Facebook/Messenger en la misma bandeja | **Está la pantalla y la API** (`modules/social` sobre `modules/inbox`); cada conversación nueva entra al tablero como tarjeta. **Sin probar contra Meta**: ver la sección anterior. |
| Reparto equitativo de consultas (50/50) | **No está.** La asignación es manual (tomar o asignar), como en Tickets. |
| Derivar por propiedad (la consulta va a quien captó el inmueble) | **No está.** No existe el concepto de propiedad. |
| Ficha de propiedades (dirección, operación, precio, captador) | **No está.** |
| Estadísticas por propiedad y por vendedor | **Parcial.** Hay métricas de atención por persona; no por propiedad. |
| Publicar en Instagram desde el sistema | **Está** para una imagen con texto (Instagram → Publicar). **Sin probar contra Meta.** En Facebook no. |
| Cobros y honorarios (reemplazar los Excel) | **Está** el módulo Cobranzas, pero sólo en PYG/USD. Apagado en esta instalación. Etapa 2. |

### Orden propuesto

1. **Responsable por chat de WhatsApp + reparto automático** en las tres redes (round-robin entre
   vendedores activos, con reasignación manual). Es lo que resuelve el miedo central de la reunión.
2. **Propiedades**: ficha mínima con captador; regla "consulta por esta propiedad → su captador;
   si es compartida → reparto".
3. **Conectar Instagram y Messenger de verdad** sobre la cuenta unificada (depende de que el
   cliente defina qué cuenta queda, de la app de Meta y de tener el CRM publicado).
4. **Estadísticas** por vendedor y propiedad.
5. **Etapa 2**: Cobranzas en ARS, honorarios.

## A tener en cuenta

Valen las mismas de Wolves: moneda (la interfaz muestra `Gs.` y sólo ofrece PYG/USD), teléfonos
(asume +595: cargar `+54 9 …`), RUC/DV en clientes y el favicon de ROMEZ que Next inyecta antes.
Además:

- Los textos del login hablan de "estudio", "legajos" y "cobranzas".
- `pnpm --filter crm test` falla en una prueba del PDF de cobranzas mientras `backend/.env` tenga
  la marca de Vicar: espera el logo de ROMEZ. Con las `BRAND_*` vacías pasa.
- El logo viene de un JPG de 1080 px: alcanza. Si llega el vectorial, regenerar los PNG.

## Pendiente

- Escanear el QR de WhatsApp (en persona, desde la app).
- Definir con el cliente: qué cuenta de Instagram queda, criterios de derivación y vendedores.
- Producción: dominio, VPS, PM2 y Traefik (copiar `../wolves/ops/` cuando se decida).
