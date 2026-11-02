// Consultas PostgreSQL del flujo (una sola tabla). Las usan gen.js (nodos Postgres) y test.js (prueba contra Postgres real).
// Fuente de verdad del esquema: también se vuelca a ../romez_chats.sql al correr gen.js.

const SETUP = `CREATE TABLE IF NOT EXISTS romez_chats (
  phone       text PRIMARY KEY,
  estado      text NOT NULL DEFAULT '{}',
  last_msg_id text,
  buffer      text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now()
);`

// Lectura de la ficha de un chat. Los alias dejan los nombres que usan los nodos Code (lastMsgId).
const GET_ONE = `SELECT phone, estado, last_msg_id AS "lastMsgId", buffer FROM romez_chats WHERE phone = $1 LIMIT 1`
const GET_ALL = `SELECT phone, estado, last_msg_id AS "lastMsgId", buffer FROM romez_chats`

// $1 teléfono · $2 estado (JSON) · $3 id del mensaje · $4 texto NUEVO.
// El texto se agrega al buffer dentro de la base (atómico). Un buffer sin tocar hace más de 10 min se descarta.
const UPSERT_BUFFER = `INSERT INTO romez_chats (phone, estado, last_msg_id, buffer)
VALUES ($1, $2, $3, $4)
ON CONFLICT (phone) DO UPDATE SET
  estado = EXCLUDED.estado,
  last_msg_id = EXCLUDED.last_msg_id,
  buffer = CASE
    WHEN romez_chats.buffer = '' OR romez_chats.updated_at < now() - interval '10 minutes' THEN EXCLUDED.buffer
    ELSE romez_chats.buffer || E'\\n' || EXCLUDED.buffer
  END,
  updated_at = now()
RETURNING phone`

// $1 teléfono · $2 estado (JSON). No toca el buffer.
const UPSERT_ESTADO = `INSERT INTO romez_chats (phone, estado)
VALUES ($1, $2)
ON CONFLICT (phone) DO UPDATE SET estado = EXCLUDED.estado, updated_at = now()
RETURNING phone`

// $1 teléfono · $2 id del mensaje de ESTA ejecución.
// Solo devuelve fila (y vacía el buffer) si este mensaje sigue siendo el último: una ráfaga la consume una sola ejecución.
const CONSUMIR_BUFFER = `UPDATE romez_chats r
SET buffer = '', updated_at = now()
FROM (SELECT phone, estado, buffer FROM romez_chats WHERE phone = $1 AND last_msg_id = $2 FOR UPDATE) c
WHERE r.phone = c.phone
RETURNING r.phone, c.estado AS estado, $2::text AS "lastMsgId", c.buffer AS buffer`

module.exports = { SETUP, GET_ONE, GET_ALL, UPSERT_BUFFER, UPSERT_ESTADO, CONSUMIR_BUFFER }
