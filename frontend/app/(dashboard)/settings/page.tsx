'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Check, ImagePlus, Key, KanbanSquare, Loader2, RefreshCcw, Save, Settings,
  Shield, SlidersHorizontal, Smartphone, Unplug, Users, Webhook, Wifi, WifiOff,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import NextImage from 'next/image'
import QRCode from 'qrcode'
import clsx from 'clsx'
import { auth, type StoredAuth } from '@/lib/auth'
import { authApi, whatsappApi } from '@/lib/api'
import type { WhatsAppSessionSnapshot } from '@/types'
import { formatDateTime, getErrorMessage } from '@/lib/format'
import { DEFAULT_AVATARS, UserAvatar } from '@/components/UserAvatar'
import WebhooksPage from '../webhooks/page'
import ApiKeysPage from '../api-keys/page'
import TeamPage from '../team/page'
import PipelinesPage from '../pipelines/page'
import { PillNav } from '@/components/react-bits/PillNav'

type SettingsTab = 'profile' | 'whatsapp' | 'kanban' | 'webhooks' | 'api-keys' | 'team'

const PREVIEW_SIZE = 224
const OUTPUT_SIZE = 512

const TAB_ITEMS: {
  id: SettingsTab
  label: string
  icon: typeof Settings
  adminOnly?: boolean
}[] = [
  { id: 'profile', label: 'Perfil', icon: Settings },
  { id: 'whatsapp', label: 'WhatsApp', icon: Smartphone, adminOnly: true },
  { id: 'kanban', label: 'Gestión comercial', icon: KanbanSquare, adminOnly: true },
  { id: 'webhooks', label: 'Webhooks', icon: Webhook, adminOnly: true },
  { id: 'api-keys', label: 'API Keys', icon: Key, adminOnly: true },
  { id: 'team', label: 'Equipo', icon: Users, adminOnly: true },
]

type EditorState = {
  src: string
  fileName: string
  zoom: number
  x: number
  y: number
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

async function renderEditedAvatar(editor: EditorState) {
  const image = await loadImage(editor.src)
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)

  const baseScale = Math.max(OUTPUT_SIZE / image.width, OUTPUT_SIZE / image.height) * editor.zoom
  const width = image.width * baseScale
  const height = image.height * baseScale
  const x = (OUTPUT_SIZE - width) / 2 + (editor.x / PREVIEW_SIZE) * OUTPUT_SIZE
  const y = (OUTPUT_SIZE - height) / 2 + (editor.y / PREVIEW_SIZE) * OUTPUT_SIZE

  ctx.drawImage(image, x, y, width, height)

  for (const quality of [0.86, 0.76, 0.66]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length < 480_000 || quality === 0.66) return dataUrl
  }

  return canvas.toDataURL('image/jpeg', 0.66)
}

function AvatarSettingsPanel() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const editorUrlRef = useRef<string | null>(null)
  const [user, setUser] = useState<StoredAuth | null>(null)
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(DEFAULT_AVATARS[0].value)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const current = auth.get()
    setUser(current)
    setSelectedAvatar(current?.avatar || DEFAULT_AVATARS[0].value)
  }, [])

  useEffect(() => {
    return () => {
      if (editorUrlRef.current) URL.revokeObjectURL(editorUrlRef.current)
    }
  }, [])

  const hasChanges = selectedAvatar !== (user?.avatar || DEFAULT_AVATARS[0].value)

  function closeEditor() {
    if (editorUrlRef.current) {
      URL.revokeObjectURL(editorUrlRef.current)
      editorUrlRef.current = null
    }
    setEditor(null)
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    setMessage('')
    setError('')

    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('El archivo tiene que ser una imagen.')
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      setError('La imagen no puede superar 6 MB.')
      return
    }

    closeEditor()
    const objectUrl = URL.createObjectURL(file)
    editorUrlRef.current = objectUrl
    setEditor({
      src: objectUrl,
      fileName: file.name,
      zoom: 1,
      x: 0,
      y: 0,
    })
  }

  async function confirmEditedImage() {
    if (!editor) return
    setProcessing(true)
    setError('')

    try {
      const dataUrl = await renderEditedAvatar(editor)
      setSelectedAvatar(dataUrl)
      closeEditor()
    } catch {
      setError('No se pudo procesar la imagen.')
    } finally {
      setProcessing(false)
    }
  }

  async function saveAvatar() {
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const res = await authApi.updateAvatar(selectedAvatar)
      const updated = res.data.user
      auth.updateUser({
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        avatar: updated.avatar,
      })
      setUser((current) => current ? { ...current, ...updated } : current)
      setSelectedAvatar(updated.avatar || DEFAULT_AVATARS[0].value)
      setMessage('Avatar actualizado.')
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'No se pudo guardar el avatar.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Avatar del usuario</h1>
        <p className="mt-1 font-medium text-slate-500">
          Elegi un avatar base o subi una imagen y ajustala antes de guardarla.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <div className="interactive-card static-card p-6">
          <p className="section-label mb-4">Vista previa</p>
          <div className="flex flex-col items-center text-center">
            <UserAvatar
              avatar={selectedAvatar}
              firstName={user?.firstName}
              lastName={user?.lastName}
              email={user?.email}
              size="xl"
            />
            <h2 className="mt-4 text-lg font-extrabold text-slate-900">
              {user?.firstName ?? 'Usuario'} {user?.lastName ?? ''}
            </h2>
            <p className="text-sm font-medium text-slate-500">{user?.email}</p>
          </div>

          <button
            type="button"
            onClick={saveAvatar}
            disabled={!hasChanges || saving}
            className="btn-primary mt-6 w-full py-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar avatar
          </button>

          {message && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              <Check size={16} /> {message}
            </p>
          )}
          {error && (
            <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
              {error}
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div className="interactive-card static-card p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Avatares por defecto</p>
                <p className="mt-1 text-sm font-medium text-slate-500">Cinco estilos listos para usar.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {DEFAULT_AVATARS.map((avatar) => (
                <button
                  key={avatar.value}
                  type="button"
                  onClick={() => {
                    setSelectedAvatar(avatar.value)
                    setMessage('')
                    setError('')
                  }}
                  className={clsx(
                    'flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50',
                    selectedAvatar === avatar.value
                      ? 'border-primary-300 bg-primary-50 text-primary-700'
                      : 'border-slate-200 bg-white'
                  )}
                >
                  <UserAvatar
                    avatar={avatar.value}
                    firstName={user?.firstName}
                    lastName={user?.lastName}
                    email={user?.email}
                    size="lg"
                  />
                  {avatar.name}
                </button>
              ))}
            </div>
          </div>

          <div className="interactive-card static-card p-6">
          <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-primary-100 bg-primary-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="section-label">Imagen personalizada</p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Tu identidad visual, lista para usar en todo ROMEZ.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary w-full shrink-0 sm:w-auto"
              >
                <ImagePlus size={16} />
                Subir imagen
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {editor ? (
              <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
                <div>
                  <div className="mx-auto h-56 w-56 overflow-hidden rounded-3xl border border-slate-200 bg-slate-100 shadow-inner">
                    <img
                      src={editor.src}
                      alt=""
                      className="h-full w-full object-cover"
                      style={{
                        transform: `translate(${editor.x}px, ${editor.y}px) scale(${editor.zoom})`,
                      }}
                    />
                  </div>
                  <p className="mt-3 truncate text-center text-xs font-bold text-slate-400">
                    {editor.fileName}
                  </p>
                </div>

                <div className="space-y-4">
                  {[
                    { key: 'zoom', label: 'Zoom', min: 1, max: 2.5, step: 0.05 },
                    { key: 'x', label: 'Horizontal', min: -80, max: 80, step: 1 },
                    { key: 'y', label: 'Vertical', min: -80, max: 80, step: 1 },
                  ].map((control) => (
                    <label key={control.key} className="block">
                      <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                        <SlidersHorizontal size={15} className="text-primary-500" />
                        {control.label}
                      </span>
                      <input
                        type="range"
                        min={control.min}
                        max={control.max}
                        step={control.step}
                        value={editor[control.key as keyof EditorState] as number}
                        onChange={(event) =>
                          setEditor((current) =>
                            current
                              ? { ...current, [control.key]: Number(event.target.value) }
                              : current
                          )
                        }
                        className="w-full accent-primary-700"
                      />
                    </label>
                  ))}

                  <div className="flex flex-wrap gap-3 pt-2">
                    <button
                      type="button"
                      onClick={confirmEditedImage}
                      disabled={processing}
                      className="btn-primary"
                    >
                      {processing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      Usar imagen editada
                    </button>
                    <button type="button" onClick={closeEditor} className="btn-secondary">
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/30 px-6 py-12 text-center">
                <ImagePlus size={34} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-bold text-slate-600">Todavía no hay una imagen personalizada</p>
                <p className="mx-auto mt-1 max-w-sm text-xs font-medium leading-5 text-slate-400">Subí una foto o logo para previsualizarlo, ajustarlo y guardarlo como tu avatar.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const WHATSAPP_STATUS: Record<WhatsAppSessionSnapshot['status'], string> = {
  CONNECTED: 'Conectado',
  CONNECTING: 'Conectando',
  PAIRING: 'Esperando vinculación',
  ERROR: 'Con error',
  DISCONNECTED: 'Desconectado',
}

function WhatsAppSettingsPanel() {
  const queryClient = useQueryClient()
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null)
  const sessionQuery = useQuery<WhatsAppSessionSnapshot>({
    queryKey: ['whatsapp-session'],
    queryFn: () => whatsappApi.getSession().then((response) => response.data),
    retry: false,
    refetchInterval: (query) => ['PAIRING', 'CONNECTING'].includes(query.state.data?.status ?? '') ? 3_000 : 15_000,
  })
  const connect = useMutation({
    mutationFn: () => whatsappApi.connect(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsapp-session'] }),
  })
  const disconnect = useMutation({
    mutationFn: () => whatsappApi.disconnect(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-session'] })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      queryClient.invalidateQueries({ queryKey: ['customer-service-summary'] })
    },
  })

  useEffect(() => {
    let active = true
    const qrCode = sessionQuery.data?.qrCode
    if (!qrCode) {
      setQrImageUrl(null)
      return () => { active = false }
    }
    QRCode.toDataURL(qrCode, { width: 360, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#062d65', light: '#ffffff' } })
      .then((url) => { if (active) setQrImageUrl(url) })
      .catch(() => { if (active) setQrImageUrl(null) })
    return () => { active = false }
  }, [sessionQuery.data?.qrCode])

  if (sessionQuery.isLoading) return <div className="mx-auto max-w-5xl p-6"><div className="state-panel"><Loader2 size={24} className="animate-spin text-[var(--brand-blue)]" /><p className="text-sm font-semibold text-[var(--ink-secondary)]">Consultando el WhatsApp del estudio…</p></div></div>

  const session = sessionQuery.data
  const isConnected = session?.status === 'CONNECTED'
  const runtimeReady = Boolean(session?.runtimeCompatible && session?.packageInstalled)
  const busy = connect.isPending || disconnect.isPending
  const error = sessionQuery.error || connect.error || disconnect.error

  return <div className="mx-auto max-w-5xl space-y-6 p-6">
    <div><p className="section-label">Canal compartido</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--ink-primary)]">WhatsApp de ROMEZ</h2><p className="mt-1 text-sm text-[var(--ink-tertiary)]">Una única sesión alimenta la bandeja de tickets de todo el estudio.</p></div>

    <section className="paper-panel overflow-hidden">
      <header className="flex flex-col gap-4 border-b border-[var(--line-soft)] p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className={clsx('grid h-11 w-11 place-items-center rounded-lg border', isConnected ? 'border-[var(--success-line)] bg-[var(--success-paper)] text-[var(--success)]' : 'border-[var(--line)] bg-[var(--paper-soft)] text-[var(--ink-tertiary)]')}>{isConnected ? <Wifi size={20} /> : <WifiOff size={20} />}</span><div><p className="text-sm font-extrabold text-[var(--ink-primary)]">{WHATSAPP_STATUS[session?.status ?? 'DISCONNECTED']}</p><p className="mt-1 text-xs text-[var(--ink-tertiary)]">{session?.pushName || session?.phoneNumber || 'Sin número vinculado'}</p></div></div><div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={!runtimeReady || busy} onClick={() => connect.mutate()}>{connect.isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCcw size={15} />}{isConnected ? 'Reanudar sesión' : session?.qrCode ? 'Actualizar QR' : 'Generar QR'}</button><button type="button" className="btn-secondary" disabled={!session || busy || (!session.hasActiveSocket && !session.authAvailable)} onClick={() => { if (window.confirm('¿Desconectar el WhatsApp compartido de ROMEZ?')) disconnect.mutate() }}>{disconnect.isPending ? <Loader2 size={15} className="animate-spin" /> : <Unplug size={15} />}Desconectar</button></div></header>

      {!runtimeReady ? <div className="flex gap-3 border-b border-[var(--danger-line)] bg-[var(--danger-paper)] p-4 text-sm text-[var(--danger)]"><AlertTriangle size={18} className="shrink-0" /><p><strong>El servidor de WhatsApp no está disponible.</strong> Revisá que el proceso persistente y Baileys estén instalados antes de vincular el número.</p></div> : null}
      {error || session?.lastError ? <div className="flex gap-3 border-b border-[var(--danger-line)] bg-[var(--danger-paper)] p-4 text-sm text-[var(--danger)]"><AlertTriangle size={18} className="shrink-0" /><p>{session?.lastError || getErrorMessage(error, 'No pudimos consultar la sesión.')}</p></div> : null}

      <div className="grid lg:grid-cols-[360px_1fr]">
        <div className="border-b border-[var(--line-soft)] p-5 lg:border-b-0 lg:border-r">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Vinculación por QR</p>
          {qrImageUrl ? <><div className="mt-4 grid place-items-center rounded-lg border border-[var(--line)] bg-white p-4"><NextImage unoptimized src={qrImageUrl} alt="Código QR para vincular WhatsApp" width={280} height={280} className="h-auto w-full max-w-[280px]" /></div><p className="mt-3 text-xs leading-5 text-[var(--ink-tertiary)]">En el teléfono: WhatsApp → Dispositivos vinculados → Vincular dispositivo. El código se actualiza automáticamente mientras espera.</p></> : <div className="mt-4 grid min-h-64 place-items-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--paper-soft)] p-6 text-center"><div><Smartphone size={30} className="mx-auto text-[var(--brand-blue)]" /><p className="mt-3 text-sm font-bold text-[var(--ink-primary)]">{isConnected ? 'Número vinculado' : 'Todavía no hay un QR activo'}</p><p className="mt-1 text-xs text-[var(--ink-tertiary)]">{isConnected ? 'Los mensajes entrantes se convierten en tickets.' : 'Generá un código para conectar el único número del estudio.'}</p></div></div>}
        </div>
        <dl className="grid content-start sm:grid-cols-2">
          <SessionDatum label="Número" value={session?.phoneNumber || 'Sin vincular'} />
          <SessionDatum label="Nombre" value={session?.pushName || '—'} />
          <SessionDatum label="Última conexión" value={formatDateTime(session?.lastConnectedAt)} />
          <SessionDatum label="Conversaciones sincronizadas" value={String(session?.chatCount ?? 0)} />
          <SessionDatum label="Sesión guardada" value={session?.authAvailable ? 'Sí' : 'No'} />
          <SessionDatum label="Proceso activo" value={session?.hasActiveSocket ? 'Sí' : 'No'} />
        </dl>
      </div>
    </section>
  </div>
}

function SessionDatum({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-[var(--line-soft)] p-5 odd:sm:border-r"><dt className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">{label}</dt><dd className="mt-2 text-sm font-bold text-[var(--ink-primary)]">{value}</dd></div>
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [user, setUser] = useState<StoredAuth | null>(null)

  useEffect(() => {
    setUser(auth.get())
    const requestedTab = new URLSearchParams(window.location.search).get('tab') as SettingsTab | null
    if (requestedTab && TAB_ITEMS.some((item) => item.id === requestedTab)) setActiveTab(requestedTab)
  }, [])

  const canManageSettings = user?.role === 'owner' || user?.role === 'admin'

  useEffect(() => {
    if (!canManageSettings && activeTab !== 'profile') {
      setActiveTab('profile')
    }
  }, [activeTab, canManageSettings])

  const visibleTabs = useMemo(
    () => TAB_ITEMS.filter((item) => !item.adminOnly || canManageSettings),
    [canManageSettings]
  )

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-20 border-b border-slate-200/70 bg-[var(--background)]/90 px-4 py-3 backdrop-blur-xl md:top-0">
        <div className="mx-auto flex max-w-6xl flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Configuración</h1>
              <p className="mt-0.5 text-sm font-medium text-slate-500">Perfil, integraciones y acceso del espacio de trabajo.</p>
            </div>
          </div>

          <div className="min-w-0 overflow-x-auto pb-0.5">
            <PillNav items={visibleTabs} active={activeTab} onChange={setActiveTab} />
          </div>
        </div>
      </div>

      {activeTab === 'profile' && <AvatarSettingsPanel />}
      {canManageSettings && activeTab === 'whatsapp' && <WhatsAppSettingsPanel />}
      {canManageSettings && activeTab === 'kanban' && <PipelinesPage />}
      {canManageSettings && activeTab === 'webhooks' && <WebhooksPage />}
      {canManageSettings && activeTab === 'api-keys' && <ApiKeysPage />}
      {canManageSettings && activeTab === 'team' && <TeamPage />}
      {!canManageSettings && (
        <div className="mx-auto mt-6 max-w-5xl px-6">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            <Shield size={16} className="mr-2 inline" />
            Webhooks, API Keys y Equipo solo estan disponibles para owner/admin.
          </div>
        </div>
      )}
    </div>
  )
}
