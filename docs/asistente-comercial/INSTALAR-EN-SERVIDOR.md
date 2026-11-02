# Asistente comercial · instalación con wppia deployado y n8n del servidor

Camino recomendado para las pruebas: usa el **wppia que ya está deployado** (`https://wppia.consultoriadigital.io`) y el **n8n de tu servidor**. No hace falta levantar nada en tu PC y no se toca el backend del CRM.

```
otro teléfono ──► WhatsApp (número de pruebas vinculado a wppia) ──► wppia ──webhook──► n8n ──► OpenAI
                                                                      ▲                    │
                                                                      └──── send-message ◄─┘      (estado de cada chat: PostgreSQL)
```

## Ya instalado en el servidor (1/11/2026)

En `72.60.15.125` se creó un PostgreSQL dedicado para el asistente (opción 2 de [`opciones-base-de-datos.html`](opciones-base-de-datos.html)):

| Qué | Valor |
| --- | --- |
| Contenedor | `romez-asistente-pg` (`postgres:16-alpine`, reinicio `unless-stopped`, 512 MB) |
| Red | `n8n_default`, **sin puertos publicados** (solo n8n lo ve) |
| Volumen | `romez_asistente_pgdata` |
| Base / usuario | `romez_asistente` / `romez_asistente` |
| Contraseña | en `/root/romez-asistente-pg.env` (permiso 600): `ssh farmacia "grep POSTGRES_PASSWORD /root/romez-asistente-pg.env"` |
| Tabla | `romez_chats` ya creada |

**Credencial `Postgres ROMEZ` en n8n:** host `romez-asistente-pg`, puerto `5432`, base `romez_asistente`, usuario `romez_asistente`, SSL *Disable*. Con eso se salta el paso 3 de abajo (crear la tabla).

Deshacer todo: `docker rm -f romez-asistente-pg && docker volume rm romez_asistente_pgdata && rm /root/romez-asistente-pg.env`.

## 1 · Sesión nueva en wppia (panel deployado)

1. Creá una sesión nueva (p. ej. "ROMEZ prueba"). No toques las sesiones de otros clientes.
2. **Webhook URL:** `https://TU-N8N/webhook/romez-comercial` con el dominio real de tu n8n. Evento `messages.upsert`.
3. Activá **`includeFromMe`** (mensajes propios): sin eso el bot no detecta que una persona escribió desde el teléfono.
4. Copiá el **token** (se muestra una sola vez; si lo perdés, rotalo) y el **secreto del webhook**.
5. Escaneá el QR con el número de pruebas. **No uses el número comercial** hasta después de la demo.

## 2 · Credenciales en n8n

| Nombre exacto | Tipo | Dato |
| --- | --- | --- |
| `Bearer Auth WppIA` | Bearer Auth | el token de la sesión de wppia (solo el token, sin la palabra "Bearer") |
| `OpenAI ROMEZ` | OpenAI API | tu API key |
| `Postgres ROMEZ` | Postgres | host, base, usuario y contraseña de un PostgreSQL al que llegue tu n8n |
| `ROMEZ CRM X-API-Key` | Header Auth | solo si algún día activás el nodo del CRM (viene desactivado) |

## 3 · Crear la tabla (una sola vez; en farmacia ya está hecho)

La tabla es `romez_chats` (una fila por chat). El SQL está en [`romez_chats.sql`](romez_chats.sql). La forma más simple, sin consola:

1. En n8n creá un workflow temporal con un nodo **Postgres → Execute Query** y la credencial `Postgres ROMEZ`.
2. Pegá el contenido de `romez_chats.sql` y ejecutalo (*Test step*).
3. Borrá ese workflow temporal.

Si no sabés qué Postgres usar: el mismo que usa tu n8n sirve (la tabla se llama `romez_chats` y no pisa nada), aunque una base propia queda más prolija.

## 4 · Importar y configurar el flujo

1. *Workflows → Import from file* → [`romez-asistente-comercial.n8n.json`](romez-asistente-comercial.n8n.json). Queda inactivo.
2. En los 8 nodos **Postgres** (los que dicen *Leer…* / *Guardar…*) elegí `Postgres ROMEZ`. En los HTTP de wppia, `Bearer Auth WppIA`; en Whisper y en *OpenAI Chat Model*, `OpenAI ROMEZ`.
3. Abrí el nodo **Config** y completá:
   - `webhookSecret`: el secreto del paso 1. Mientras diga `CAMBIAR`, el flujo descarta todo.
   - `soloPrueba`: el teléfono **desde el que vas a escribir** (solo dígitos, con código de país). Mientras esté vacío, contestaría a cualquiera: no lo actives así.
   - `notificarA`: WhatsApp que recibe el aviso cuando hay que derivar a una persona.
   - `wppiaUrl` ya viene con `https://wppia.consultoriadigital.io`.
4. **Activá** el workflow.

## 5 · Probar

Desde el teléfono de `soloPrueba` escribile al número vinculado:

| Prueba | Esperado |
| --- | --- |
| `¡Hola! Quisiera más información sobre la creación de EAS` | Saludo del asistente virtual y pregunta por nombre y rubro. |
| `Soy Ana, quiero una EAS para una consultora` | Mensaje de costos con el texto exacto de la ficha (Gs. 880.000…). |
| Una nota de voz | Se transcribe (Whisper) y se contesta. |
| 3 mensajes seguidos en 5 s | Una sola respuesta, con todo junto. |
| Escribir vos desde el teléfono vinculado | El bot se calla 8 h en ese chat. |
| `quiero una SA, ¿cuánto sale?` | Deriva a una persona y avisa a `notificarA`. |

Las ejecuciones se ven en *Executions*. Para ver el estado de un chat: `SELECT phone, estado, last_msg_id, buffer FROM romez_chats;`.

## Si algo falla

- **No responde nada:** workflow inactivo, `soloPrueba` sin tu teléfono o `webhookSecret` en `CAMBIAR`. El nodo *Normalizar mensaje* muestra el motivo en `reason`.
- **El webhook no llega:** revisá la URL de la sesión en wppia y que el workflow esté **activo** (la URL de producción es `/webhook/`, no `/webhook-test/`).
- **Falla un nodo Postgres:** que la tabla exista y que la credencial esté elegida en los 8 nodos.
- **Se calla de golpe:** una persona escribió desde el teléfono (pausa de 8 h) o se llegó al tope de 10 respuestas por hora. Para reanudar: `UPDATE romez_chats SET estado = '{}' WHERE phone = '595...';`

## Mantener el flujo

La fuente está en `flujo-src/` (un archivo por nodo de código, el prompt y `sql.js`):

```powershell
node docs\asistente-comercial\flujo-src\gen.js       # regenera el JSON y romez_chats.sql
node docs\asistente-comercial\flujo-src\test.js      # 52 pruebas de la lógica (usa los fixtures de wppia)
node docs\asistente-comercial\flujo-src\test-sql.mjs # 13 pruebas del SQL contra Postgres real (requiere @electric-sql/pglite)
```

Los precios y textos de la ficha están en `flujo-src/code/ficha.js`; confirmalos antes de usar el flujo con clientes reales.
