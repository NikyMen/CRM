-- Línea comercial: una persona atiende el chat y el asistente de n8n no responde.
ALTER TABLE "collection_whatsapp_chats" ADD COLUMN "assistantPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "collection_whatsapp_chats" ADD COLUMN "assistantPausedAt" TIMESTAMP(3);
