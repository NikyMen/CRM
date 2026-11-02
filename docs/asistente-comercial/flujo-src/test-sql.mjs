// Prueba las consultas de sql.js contra un PostgreSQL real en memoria (pglite, sin instalar nada en el sistema).
// Uso:  npm install --no-save @electric-sql/pglite   (en una carpeta temporal)   y   node test-sql.mjs
import assert from 'node:assert'
import { createRequire } from 'node:module'
import { PGlite } from '@electric-sql/pglite'

const sql = createRequire(import.meta.url)('./sql.js')
const db = new PGlite()
let ok = 0
const t = async (name, fn) => { try { await fn(); ok++; console.log('  ✔', name) } catch (e) { console.log('  ✘', name, '\n     ', e.message); process.exitCode = 1 } }
const q = async (text, params = []) => (await db.query(text, params)).rows

await db.exec(sql.SETUP)
await t('el esquema se puede crear dos veces (IF NOT EXISTS)', async () => { await db.exec(sql.SETUP) })

const P = '595981000111'
await t('leer un chat inexistente no devuelve filas', async () => assert.deepStrictEqual(await q(sql.GET_ONE, [P]), []))

await t('primer mensaje: crea la fila con el texto en el buffer', async () => {
  await q(sql.UPSERT_BUFFER, [P, '{"n":1}', 'M1', 'Hola'])
  const [r] = await q(sql.GET_ONE, [P])
  assert.strictEqual(r.buffer, 'Hola'); assert.strictEqual(r.lastMsgId, 'M1'); assert.strictEqual(r.estado, '{"n":1}')
})
await t('ráfaga: los mensajes se agregan en orden y gana el último id', async () => {
  await q(sql.UPSERT_BUFFER, [P, '{"n":2}', 'M2', 'quiero una EAS'])
  await q(sql.UPSERT_BUFFER, [P, '{"n":3}', 'M3', 'para marketing'])
  const [r] = await q(sql.GET_ONE, [P])
  assert.strictEqual(r.buffer, 'Hola\nquiero una EAS\npara marketing'); assert.strictEqual(r.lastMsgId, 'M3')
})
await t('consumir con un id viejo NO devuelve nada ni vacía el buffer', async () => {
  assert.deepStrictEqual(await q(sql.CONSUMIR_BUFFER, [P, 'M1']), [])
  assert.strictEqual((await q(sql.GET_ONE, [P]))[0].buffer, 'Hola\nquiero una EAS\npara marketing')
})
await t('consumir con el último id devuelve todo el texto y vacía el buffer', async () => {
  const [r] = await q(sql.CONSUMIR_BUFFER, [P, 'M3'])
  assert.strictEqual(r.buffer, 'Hola\nquiero una EAS\npara marketing'); assert.strictEqual(r.lastMsgId, 'M3'); assert.strictEqual(r.estado, '{"n":3}')
  assert.strictEqual((await q(sql.GET_ONE, [P]))[0].buffer, '')
})
await t('una segunda ejecución con el mismo id ya no consume (no hay doble respuesta)', async () => {
  const [r] = await q(sql.CONSUMIR_BUFFER, [P, 'M3'])
  assert.strictEqual(r.buffer, '')
})
await t('un mensaje que llega mientras la IA trabaja arranca un buffer nuevo', async () => {
  await q(sql.UPSERT_BUFFER, [P, '{"n":4}', 'M4', 'una duda más'])
  assert.strictEqual((await q(sql.GET_ONE, [P]))[0].buffer, 'una duda más')
})
await t('guardar estado no toca el buffer ni el último id', async () => {
  await q(sql.UPSERT_ESTADO, [P, '{"n":5}'])
  const [r] = await q(sql.GET_ONE, [P])
  assert.strictEqual(r.estado, '{"n":5}'); assert.strictEqual(r.buffer, 'una duda más'); assert.strictEqual(r.lastMsgId, 'M4')
})
await t('guardar estado de un chat nuevo lo crea con buffer vacío', async () => {
  await q(sql.UPSERT_ESTADO, ['595981000222', '{"x":1}'])
  const [r] = await q(sql.GET_ONE, ['595981000222'])
  assert.strictEqual(r.buffer, ''); assert.strictEqual(r.lastMsgId, null)
})
await t('buffer abandonado hace más de 10 min se descarta', async () => {
  await db.query("UPDATE romez_chats SET updated_at = now() - interval '11 minutes' WHERE phone = $1", [P])
  await q(sql.UPSERT_BUFFER, [P, '{}', 'M9', 'texto nuevo'])
  assert.strictEqual((await q(sql.GET_ONE, [P]))[0].buffer, 'texto nuevo')
})
await t('leer todos devuelve los chats con los alias que usan los nodos', async () => {
  const rows = await q(sql.GET_ALL)
  assert.strictEqual(rows.length, 2); assert.ok('lastMsgId' in rows[0] && 'estado' in rows[0])
})
await t('el texto con comillas, saltos de línea y emojis se guarda tal cual', async () => {
  const raro = `Dijo "hola" y 'chau'\n✅ 10.000.000 \\ $1`
  await q(sql.UPSERT_BUFFER, ['595981000333', '{}', 'X1', raro])
  assert.strictEqual((await q(sql.GET_ONE, ['595981000333']))[0].buffer, raro)
})
console.log(`\n${ok} pruebas de SQL OK`)
