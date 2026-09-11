type JsonRecord = Record<string, unknown>

type LoginSession = {
  accessToken: string
  user: { id: string }
  workspace: { id: string }
  role: string
}

type Routes = {
  health: string
  api: string
}

type RaceParticipant = {
  label: 'A' | 'B'
  expectedUserId: string
  session: LoginSession
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000'
const DEFAULT_SESSION_COUNT = 15
const REQUEST_TIMEOUT_MS = 10_000
const SSE_TIMEOUT_MS = 8_000

class AcceptanceError extends Error {}

function printHelp() {
  console.log(`Uso:
  BASE_URL=http://127.0.0.1:3000 \\
  ACCEPTANCE_EMAIL=... ACCEPTANCE_PASSWORD=... \\
  pnpm acceptance

El modo predeterminado es read-only: health, login, /auth/me y 15 conexiones SSE.
La carrera de tickets requiere ACCEPTANCE_MODE=claim-race y confirmacion explicita.
Ver docs/acceptance-backend.md.`)
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new AcceptanceError(`Falta la variable local ${name}.`)
  return value
}

function positiveIntEnv(name: string, fallback: number, maximum: number) {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new AcceptanceError(`${name} debe ser un entero entre 1 y ${maximum}.`)
  }
  return value
}

function resolveRoutes(value: string): Routes {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new AcceptanceError('BASE_URL no es una URL valida.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new AcceptanceError('BASE_URL debe usar http o https.')
  }

  parsed.hash = ''
  parsed.search = ''
  const cleanPath = parsed.pathname.replace(/\/+$/, '')
  const apiPath = cleanPath.endsWith('/api/v1')
    ? cleanPath
    : `${cleanPath}/api/v1`.replace(/\/{2,}/g, '/')
  const api = `${parsed.origin}${apiPath}`
  return { health: `${parsed.origin}/health`, api }
}

async function readJson(response: Response): Promise<JsonRecord> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return {}
  const value = await response.json().catch(() => ({}))
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {}
}

async function jsonRequest(
  label: string,
  url: string,
  init: RequestInit = {},
  acceptedStatuses: number[] = [200]
) {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    const suffix = error instanceof Error && error.name === 'TimeoutError'
      ? ' (timeout)'
      : ''
    throw new AcceptanceError(`${label}: no se pudo conectar${suffix}.`)
  }
  const body = await readJson(response)
  if (!acceptedStatuses.includes(response.status)) {
    throw new AcceptanceError(`${label}: HTTP ${response.status}.`)
  }
  return { status: response.status, body }
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` }
}

async function checkHealth(routes: Routes) {
  const { body } = await jsonRequest('health', routes.health)
  if (body.status !== 'ok') throw new AcceptanceError('health: respuesta inesperada.')
  console.log('health=ok')
}

async function login(routes: Routes, email: string, password: string, label: string) {
  const { body } = await jsonRequest(label, `${routes.api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const session = body as unknown as LoginSession
  if (
    typeof session.accessToken !== 'string' || !session.accessToken ||
    typeof session.user?.id !== 'string' ||
    typeof session.workspace?.id !== 'string' ||
    typeof session.role !== 'string'
  ) {
    throw new AcceptanceError(`${label}: contrato de respuesta invalido.`)
  }
  return session
}

async function checkInvalidLogin(routes: Routes, email: string, password: string) {
  const invalidPassword = `${password}__invalid__`
  const { status } = await jsonRequest('login-invalido', `${routes.api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: invalidPassword }),
  }, [401])
  if (status !== 401) throw new AcceptanceError('login-invalido: respuesta inesperada.')
  console.log('invalid_login=ok')
}

async function checkMe(routes: Routes, session: LoginSession, label: string) {
  const { body } = await jsonRequest(label, `${routes.api}/auth/me`, {
    headers: bearer(session.accessToken),
  })
  if (body.userId !== session.user.id || body.workspaceId !== session.workspace.id) {
    throw new AcceptanceError(`${label}: la identidad autenticada no coincide.`)
  }
}

async function checkSse(routes: Routes, session: LoginSession, label: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SSE_TIMEOUT_MS)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await fetch(`${routes.api}/whatsapp/events`, {
      headers: {
        ...bearer(session.accessToken),
        Accept: 'text/event-stream',
      },
      signal: controller.signal,
    })
    if (response.status !== 200) {
      throw new AcceptanceError(`${label}: SSE respondio HTTP ${response.status}.`)
    }
    if (!(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      throw new AcceptanceError(`${label}: SSE devolvio un Content-Type inesperado.`)
    }
    if (!response.body) throw new AcceptanceError(`${label}: SSE no devolvio un stream.`)

    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let received = ''
    while (!received.includes(': connected') && received.length < 1024) {
      const chunk = await reader.read()
      if (chunk.done) break
      received += decoder.decode(chunk.value, { stream: true })
    }
    if (!received.includes(': connected')) {
      throw new AcceptanceError(`${label}: SSE no envio el saludo inicial.`)
    }
  } catch (error) {
    if (error instanceof AcceptanceError) throw error
    if (controller.signal.aborted) throw new AcceptanceError(`${label}: SSE excedio el timeout.`)
    throw new AcceptanceError(`${label}: no se pudo abrir SSE.`)
  } finally {
    clearTimeout(timeout)
    await reader?.cancel().catch(() => undefined)
    controller.abort()
  }
}

async function checkConcurrentSessions(routes: Routes, session: LoginSession, count: number) {
  await Promise.all(Array.from({ length: count }, async (_, index) => {
    const label = `cliente-${index + 1}`
    await Promise.all([
      checkMe(routes, session, `${label}/auth`),
      checkSse(routes, session, `${label}/sse`),
    ])
  }))
  console.log(`authenticated_clients=ok count=${count}`)
  console.log(`sse_connections=ok count=${count}`)
}

function raceParticipant(label: 'A' | 'B', session: LoginSession): RaceParticipant {
  const prefix = `ACCEPTANCE_RACER_${label}`
  const participant = {
    label,
    expectedUserId: requiredEnv(`${prefix}_USER_ID`),
    session,
  }
  if (participant.session.user.id !== participant.expectedUserId) {
    throw new AcceptanceError(`corredor-${label}: USER_ID no coincide con las credenciales.`)
  }
  if (participant.session.role === 'viewer') {
    throw new AcceptanceError(`corredor-${label}: viewer no puede tomar tickets.`)
  }
  return participant
}

async function ticketSnapshot(routes: Routes, participant: RaceParticipant, ticketId: string) {
  const { body } = await jsonRequest(
    `corredor-${participant.label}/ticket`,
    `${routes.api}/tickets/${encodeURIComponent(ticketId)}`,
    { headers: bearer(participant.session.accessToken) }
  )
  return body
}

async function assignWithoutThrow(routes: Routes, participant: RaceParticipant, ticketId: string) {
  let response: Response
  try {
    response = await fetch(`${routes.api}/tickets/${encodeURIComponent(ticketId)}/assign`, {
      method: 'PATCH',
      headers: {
        ...bearer(participant.session.accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedToUserId: participant.expectedUserId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    return { participant, status: 0 }
  }
  await response.body?.cancel().catch(() => undefined)
  return { participant, status: response.status }
}

async function runClaimRace(routes: Routes) {
  if (process.env.ACCEPTANCE_ALLOW_MUTATION !== 'claim-ticket') {
    throw new AcceptanceError(
      'claim-race requiere ACCEPTANCE_ALLOW_MUTATION=claim-ticket.'
    )
  }
  const ticketId = requiredEnv('ACCEPTANCE_TICKET_ID')

  const [sessionA, sessionB] = await Promise.all([
    login(
      routes,
      requiredEnv('ACCEPTANCE_RACER_A_EMAIL'),
      requiredEnv('ACCEPTANCE_RACER_A_PASSWORD'),
      'corredor-A/login'
    ),
    login(
      routes,
      requiredEnv('ACCEPTANCE_RACER_B_EMAIL'),
      requiredEnv('ACCEPTANCE_RACER_B_PASSWORD'),
      'corredor-B/login'
    ),
  ])
  const a = raceParticipant('A', sessionA)
  const b = raceParticipant('B', sessionB)
  if (a.expectedUserId === b.expectedUserId) {
    throw new AcceptanceError('La carrera requiere dos usuarios diferentes.')
  }
  if (a.session.workspace.id !== b.session.workspace.id) {
    throw new AcceptanceError('Los corredores deben pertenecer al mismo espacio.')
  }

  const [beforeA, beforeB] = await Promise.all([
    ticketSnapshot(routes, a, ticketId),
    ticketSnapshot(routes, b, ticketId),
  ])
  if (beforeA.assignedToUserId !== null || beforeB.assignedToUserId !== null) {
    throw new AcceptanceError('El ticket indicado no esta libre; no se ejecuto la carrera.')
  }
  if (!beforeA.activeKey || !beforeB.activeKey) {
    throw new AcceptanceError('El ticket indicado no esta activo; no se ejecuto la carrera.')
  }

  const results = await Promise.all([
    assignWithoutThrow(routes, a, ticketId),
    assignWithoutThrow(routes, b, ticketId),
  ])
  const successes = results.filter((result) => result.status >= 200 && result.status < 300)
  if (successes.length !== 1) {
    throw new AcceptanceError(
      `claim-race: se esperaban 1 exito y 1 rechazo; exitos=${successes.length}.`
    )
  }
  const winner = successes[0]
  const loser = results.find((result) => result !== winner)!
  if (![403, 404, 409].includes(loser.status)) {
    throw new AcceptanceError(`claim-race: el perdedor respondio HTTP ${loser.status}.`)
  }

  const after = await ticketSnapshot(routes, winner.participant, ticketId)
  if (after.assignedToUserId !== winner.participant.expectedUserId) {
    throw new AcceptanceError('claim-race: la asignacion final no coincide con el ganador.')
  }
  console.log(`ticket_claim_race=ok winner=${winner.participant.label} loser_http=${loser.status}`)
  console.log('ticket_claim_race_note=el_ticket_quedo_asignado_al_ganador')
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp()
    return
  }

  const mode = process.env.ACCEPTANCE_MODE?.trim() || 'read-only'
  if (!['read-only', 'claim-race'].includes(mode)) {
    throw new AcceptanceError('ACCEPTANCE_MODE debe ser read-only o claim-race.')
  }
  const routes = resolveRoutes(process.env.BASE_URL?.trim() || DEFAULT_BASE_URL)
  const sessionCount = positiveIntEnv('ACCEPTANCE_SESSION_COUNT', DEFAULT_SESSION_COUNT, 50)

  console.log(`acceptance_mode=${mode}`)
  await checkHealth(routes)
  const primaryEmail = requiredEnv('ACCEPTANCE_EMAIL')
  const primaryPassword = requiredEnv('ACCEPTANCE_PASSWORD')
  await checkInvalidLogin(routes, primaryEmail, primaryPassword)
  const primary = await login(
    routes,
    primaryEmail,
    primaryPassword,
    'login'
  )
  await checkMe(routes, primary, 'login/me')
  console.log('login=ok')
  await checkConcurrentSessions(routes, primary, sessionCount)

  if (mode === 'claim-race') await runClaimRace(routes)
  else console.log('mutations=skipped')

  console.log('acceptance=ok')
}

main().catch((error) => {
  const message = error instanceof AcceptanceError
    ? error.message
    : 'Fallo inesperado sin detalles para evitar exponer datos.'
  console.error(`acceptance=failed reason=${message}`)
  process.exitCode = 1
})
