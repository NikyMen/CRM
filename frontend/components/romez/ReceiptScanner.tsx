'use client'

/* eslint-disable @next/next/no-img-element -- la vista previa es un data URL local, next/image no aplica. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Image as ImageIcon, RefreshCw, ScanLine, X } from 'lucide-react'
import clsx from 'clsx'

type ReceiptScannerProps = {
  /** Recibe el número elegido por el usuario y cierra el escáner. */
  onDetected: (value: string) => void
}

type Stage = 'camera' | 'working' | 'review'

const MAX_SIDE = 1400

/**
 * Extrae números de comprobante del texto crudo del OCR. Prioriza el formato
 * paraguayo `001-001-0000123` y cae a las secuencias de dígitos más largas.
 */
export function extractReceiptNumbers(text: string) {
  const flat = text.replace(/[^0-9\-]+/g, ' ')
  const candidates: string[] = []
  const push = (value: string) => {
    if (value && !candidates.includes(value)) candidates.push(value)
  }

  for (const match of flat.matchAll(/(\d{3})\s*-\s*(\d{3})\s*-\s*(\d{5,8})/g)) {
    push(`${match[1]}-${match[2]}-${match[3].slice(-7).padStart(7, '0')}`)
  }
  for (const match of flat.matchAll(/\b(\d{13,16})\b/g)) {
    const digits = match[1]
    if (digits.length >= 13) push(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6).slice(-7).padStart(7, '0')}`)
  }

  const runs = Array.from(flat.matchAll(/\d{5,}/g)).map((match) => match[0])
  for (const run of runs.sort((left, right) => right.length - left.length)) push(run)

  return candidates.slice(0, 6)
}

export function ReceiptScanner({ onDetected }: ReceiptScannerProps) {
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState<Stage>('camera')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState('')
  const [candidates, setCandidates] = useState<string[]>([])
  const [rawText, setRawText] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const startStream = useCallback(async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no permite usar la cámara en vivo. Sacá la foto con el botón de abajo.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
    } catch {
      setError('No pudimos abrir la cámara. Revisá los permisos o sacá la foto con el botón de abajo.')
    }
  }, [])

  useEffect(() => {
    if (!open || stage !== 'camera') return
    void startStream()
    return stopStream
  }, [open, stage, startStream, stopStream])

  useEffect(() => () => stopStream(), [stopStream])

  const close = () => {
    stopStream()
    setOpen(false)
    setStage('camera')
    setCandidates([])
    setRawText('')
    setProgress(0)
    setError('')
    setPreview('')
  }

  const runOcr = async (source: CanvasImageSource, width: number, height: number) => {
    setStage('working')
    setProgress(0)
    setError('')
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')
    if (!context) { setError('No pudimos procesar la imagen.'); setStage('camera'); return }
    context.drawImage(source, 0, 0, canvas.width, canvas.height)

    // Escala de grises con contraste reforzado: el OCR lee mucho mejor los dígitos impresos.
    const frame = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 0; index < frame.data.length; index += 4) {
      const gray = 0.299 * frame.data[index] + 0.587 * frame.data[index + 1] + 0.114 * frame.data[index + 2]
      const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128))
      frame.data[index] = boosted
      frame.data[index + 1] = boosted
      frame.data[index + 2] = boosted
    }
    context.putImageData(frame, 0, 0)
    setPreview(canvas.toDataURL('image/jpeg', 0.8))
    stopStream()

    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        workerPath: '/tesseract/worker.min.js',
        corePath: '/tesseract/tesseract-core-simd-lstm.wasm.js',
        langPath: '/tesseract',
        logger: (message) => {
          if (message.status === 'recognizing text') setProgress(Math.round(message.progress * 100))
        },
      })
      await worker.setParameters({ tessedit_char_whitelist: '0123456789-' })
      const { data } = await worker.recognize(canvas)
      await worker.terminate()
      const found = extractReceiptNumbers(data.text ?? '')
      setRawText((data.text ?? '').trim())
      setCandidates(found)
      setStage('review')
      if (!found.length) setError('No encontramos números legibles. Probá con más luz y acercando el comprobante.')
    } catch {
      setError('No pudimos ejecutar el escaneo en este dispositivo.')
      setStage('review')
    }
  }

  const captureFromVideo = async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) { setError('La cámara todavía no está lista.'); return }
    await runOcr(video, video.videoWidth, video.videoHeight)
  }

  const captureFromFile = async (file: File) => {
    const url = URL.createObjectURL(file)
    try {
      const image = new window.Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('load'))
        image.src = url
      })
      await runOcr(image, image.naturalWidth, image.naturalHeight)
    } catch {
      setError('No pudimos leer esa imagen.')
      setStage('camera')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  return (
    <>
      <button type="button" className="btn-secondary !min-h-9 w-full" onClick={() => setOpen(true)}>
        <Camera size={14} /> Escanear comprobante
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Escanear comprobante">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-[var(--line)] bg-[var(--paper)] sm:rounded-2xl">
            <header className="flex items-center justify-between border-b border-[var(--line-soft)] px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink-primary)]"><ScanLine size={16} /> Escanear comprobante</p>
              <button type="button" className="btn-secondary !min-h-8 !px-2" onClick={close} aria-label="Cerrar escáner"><X size={14} /></button>
            </header>

            <div className="flex-1 overflow-y-auto p-4">
              {stage === 'camera' ? (
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-black">
                    <video ref={videoRef} className="block h-full w-full max-h-[50vh] object-contain" playsInline muted />
                    <span className="pointer-events-none absolute inset-x-6 top-1/2 h-20 -translate-y-1/2 rounded-lg border-2 border-dashed border-white/70" />
                  </div>
                  <p className="text-[11px] font-semibold text-[var(--ink-tertiary)]">Encuadrá el número del comprobante dentro del recuadro y tocá Capturar.</p>
                </div>
              ) : null}

              {stage === 'working' ? (
                <div className="space-y-3 py-6 text-center">
                  {preview ? <img src={preview} alt="Comprobante capturado" className="mx-auto max-h-56 rounded-lg border border-[var(--line)]" /> : null}
                  <p className="text-sm font-bold text-[var(--ink-primary)]">Leyendo números… {progress}%</p>
                  <div className="mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-[var(--line)]">
                    <div className="h-full bg-[var(--brand-blue)] transition-[width]" style={{ width: `${Math.max(4, progress)}%` }} />
                  </div>
                </div>
              ) : null}

              {stage === 'review' ? (
                <div className="space-y-3">
                  {preview ? <img src={preview} alt="Comprobante capturado" className="mx-auto max-h-48 rounded-lg border border-[var(--line)]" /> : null}
                  {candidates.length ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold text-[var(--ink-secondary)]">Números detectados — tocá el correcto</p>
                      <div className="grid gap-2">
                        {candidates.map((candidate, index) => (
                          <button
                            key={candidate}
                            type="button"
                            className={clsx(
                              'rounded-lg border px-3 py-2 text-left font-mono text-sm font-bold tabular-nums text-[var(--ink-primary)]',
                              index === 0 ? 'border-[var(--brand-blue)] bg-[var(--brand-paper)]' : 'border-[var(--line-soft)] bg-[var(--paper-soft)]',
                            )}
                            onClick={() => { onDetected(candidate); close() }}
                          >
                            {candidate}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {rawText ? (
                    <details className="rounded-lg border border-[var(--line-soft)] bg-[var(--paper-soft)] px-3 py-2">
                      <summary className="cursor-pointer text-[11px] font-bold text-[var(--ink-secondary)]">Ver texto leído</summary>
                      <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--ink-tertiary)]">{rawText}</pre>
                    </details>
                  ) : null}
                </div>
              ) : null}

              {error ? <p className="mt-3 text-[11px] font-semibold text-[var(--warning)]">{error}</p> : null}
            </div>

            <footer className="flex flex-wrap gap-2 border-t border-[var(--line-soft)] px-4 py-3">
              {stage === 'camera' ? (
                <button type="button" className="btn-primary flex-1" onClick={() => void captureFromVideo()}>
                  <Camera size={15} /> Capturar
                </button>
              ) : null}
              {stage === 'review' ? (
                <button type="button" className="btn-secondary flex-1" onClick={() => { setStage('camera'); setCandidates([]); setRawText(''); setError('') }}>
                  <RefreshCw size={15} /> Reintentar
                </button>
              ) : null}
              <button type="button" className="btn-secondary flex-1" disabled={stage === 'working'} onClick={() => fileRef.current?.click()}>
                <ImageIcon size={15} /> Foto del teléfono
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void captureFromFile(file)
                }}
              />
            </footer>
          </div>
        </div>
      ) : null}
    </>
  )
}
