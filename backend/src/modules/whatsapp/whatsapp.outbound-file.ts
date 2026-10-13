import { z } from 'zod'
import { ValidationError } from '../../types'
import { WHATSAPP_OUTBOUND_FILE_MAX_BYTES } from './whatsapp.manager'

/** Archivo saliente en base64, compartido por el envío directo y la respuesta de tickets. */
export const outboundFileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(160),
  dataBase64: z.string().min(1).max(Math.ceil(WHATSAPP_OUTBOUND_FILE_MAX_BYTES * 1.4)),
})

export function decodeOutboundFile(file: z.infer<typeof outboundFileSchema>) {
  const normalizedBase64 = file.dataBase64
    .replace(/^data:[^;]+;base64,/i, '')
    .replace(/\s/g, '')

  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(normalizedBase64)) {
    throw new ValidationError('Archivo invalido: base64 no valido')
  }

  const buffer = Buffer.from(normalizedBase64, 'base64')
  if (!buffer.length) {
    throw new ValidationError('Archivo invalido: contenido vacio')
  }

  if (buffer.length > WHATSAPP_OUTBOUND_FILE_MAX_BYTES) {
    throw new ValidationError('El archivo supera el limite de 8 MB')
  }

  return {
    fileName: file.fileName,
    mimeType: file.mimeType,
    buffer,
    sizeBytes: buffer.length,
  }
}
