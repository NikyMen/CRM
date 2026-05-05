'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, ImagePlus, Key, Loader2, Save, Settings, Shield, SlidersHorizontal,
  Users, Webhook,
} from 'lucide-react'
import clsx from 'clsx'
import { auth, type StoredAuth } from '@/lib/auth'
import { authApi } from '@/lib/api'
import { DEFAULT_AVATARS, UserAvatar } from '@/components/UserAvatar'
import WebhooksPage from '../webhooks/page'
import ApiKeysPage from '../api-keys/page'
import TeamPage from '../team/page'

type SettingsTab = 'profile' | 'webhooks' | 'api-keys' | 'team'

const PREVIEW_SIZE = 224
const OUTPUT_SIZE = 512

const TAB_ITEMS: {
  id: SettingsTab
  label: string
  icon: typeof Settings
  adminOnly?: boolean
}[] = [
  { id: 'profile', label: 'Avatar', icon: Settings },
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
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'No se pudo guardar el avatar.')
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
            <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="section-label">Imagen personalizada</p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Subi un logo o foto, ajusta zoom y posicion, y confirmala.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary"
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
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
                <ImagePlus size={34} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-bold text-slate-500">No hay imagen en edicion.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [user, setUser] = useState<StoredAuth | null>(null)

  useEffect(() => {
    setUser(auth.get())
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
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Configuracion</h1>
            <p className="text-sm font-medium text-slate-500">Perfil, integraciones y acceso del workspace.</p>
          </div>

          <div className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {visibleTabs.map((item) => {
              const Icon = item.icon
              const active = activeTab === item.id

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={clsx(
                    'flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold transition',
                    active
                      ? 'bg-primary-700 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {activeTab === 'profile' && <AvatarSettingsPanel />}
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
