# Asistente comercial de WhatsApp · pruebas en local

> Esta guía es la opción 100 % local. Si ya tenés **wppia deployado y n8n en el servidor**, usá [`INSTALAR-EN-SERVIDOR.md`](INSTALAR-EN-SERVIDOR.md): es el camino más corto.

Entorno de pruebas en tu PC: **wppia** (gateway Baileys) + **n8n** locales. Nada de esto toca producción ni el backend del CRM.

```
otro teléfono ──► WhatsApp (tu número de prueba, vinculado por QR) ──► wppia :3720 ──► n8n :5678 ──► OpenAI
                                                                         ▲                 │
                                                                         └── send-message ◄┘
```

## Reglas de seguridad

- **No vincules el número comercial (+595 993 334 466) ni los de wppia del servidor.** WhatsApp cierra una de las dos sesiones si el mismo dispositivo se vincula en dos lugares.
- Si vinculás **tu WhatsApp personal**, el bot podría contestarle a tus contactos. Por eso el flujo local sale con `soloPrueba = 000000000` (no contesta a nadie) y solo responde al teléfono que pongas ahí.
- n8n y wppia escuchan solo en `127.0.0.1`.
- Token y secreto de la sesión de wppia se guardan en `D:\dev\n8n-local\wppia-sesion.json`, **fuera del repo**.

## Requisitos (una sola vez)

- wppia compilado en `D:\dev\wppia` (`npm install && npm run build`) y con admin configurado (`WPPIA_ADMIN_PASSWORD` en su `.env`).
- n8n instalado en `D:\dev\n8n-local`: `npm install n8n@latest` (Node 22 o 24).

## Arrancar

```powershell
powershell -ExecutionPolicy Bypass -File docs\asistente-comercial\local\iniciar-local.ps1
```

Crea la sesión de wppia con el webhook apuntando al n8n local, importa la credencial `Bearer Auth WppIA` y el flujo ya configurado, y abre dos ventanas (wppia y n8n). Es idempotente.

## Lo que falta hacer a mano (5 pasos)

1. **n8n** (`http://127.0.0.1:5678`): crear el usuario dueño de tu instancia local.
2. **Credencial OpenAI**: *Credentials → Create → OpenAI API*, nombre exacto **`OpenAI ROMEZ`**, y tu API key.
3. **PostgreSQL**: el flujo guarda el estado de cada chat en una tabla. Creá la credencial `Postgres ROMEZ` (necesitás un PostgreSQL al que llegue tu n8n local, por ejemplo uno en Docker), ejecutá `romez_chats.sql` una vez y elegí esa credencial en los 8 nodos Postgres.
4. **wppia** (`http://127.0.0.1:3720`, usuario `admin`): abrí la sesión *ROMEZ comercial (local)*, activá **mensajes propios (`includeFromMe`)** y escaneá el QR desde *WhatsApp → Dispositivos vinculados*.
5. **Nodo `Config` del flujo**: poné en `soloPrueba` el teléfono **desde el que vas a escribir** (con código de país, solo dígitos, p. ej. `595981123456`) y, si querés recibir avisos de derivación, `notificarA`. Después **activá** el workflow (interruptor arriba a la derecha).

## Probar

Desde otro teléfono (el de `soloPrueba`) escribile al número vinculado:

| Prueba | Esperado |
| --- | --- |
| `¡Hola! Quisiera más información sobre la creación de EAS` | Saludo del asistente virtual y pregunta por nombre y rubro. |
| Responder `Soy Ana, quiero una EAS para una consultora` | Mensaje de costos con el texto exacto de la ficha (Gs. 880.000…). |
| Mandar una nota de voz | Se transcribe y se contesta (necesita la credencial OpenAI). |
| 3 mensajes seguidos en 5 s | Una sola respuesta, con todo junto. |
| Escribir vos desde el teléfono vinculado | El bot se calla 8 h en ese chat (si `includeFromMe` está activo). |
| `quiero una SA, ¿cuánto sale?` | Deriva a una persona y avisa a `notificarA`. |

Los resultados de cada ejecución se ven en *Executions* del n8n local.

## Si algo falla

- **No responde nada**: revisá que el workflow esté activo, que `soloPrueba` tenga tu teléfono y que `webhookSecret` no diga `CAMBIAR`.
- **El webhook no llega**: en wppia, la sesión debe tener la URL `http://127.0.0.1:5678/webhook/romez-comercial` y el evento `messages.upsert`.
- **Reimportar el flujo**: borrá `D:\dev\n8n-local\.flujo-importado` o corré `node docs\asistente-comercial\local\preparar-local.mjs --force` (crea una copia nueva; borrá la vieja en n8n).
- **Empezar de cero**: cerrá las ventanas y borrá `D:\dev\n8n-local\data` y `D:\dev\n8n-local\wppia-sesion.json`.

## Editar el flujo

La fuente está en `flujo-src/` (un archivo por nodo de código y el prompt). Después de cambiar algo:

```powershell
node docs\asistente-comercial\flujo-src\gen.js   # regenera romez-asistente-comercial.n8n.json
node docs\asistente-comercial\flujo-src\test.js  # 46 pruebas de la lógica (usa los fixtures de wppia)
```

Los precios y textos de la ficha viven en `flujo-src/code/ficha.js`; confirmalos antes de usar el flujo con clientes reales.
