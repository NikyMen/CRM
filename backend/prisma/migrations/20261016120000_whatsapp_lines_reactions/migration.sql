-- Números de WhatsApp aparte del de Tickets: cada uno es una "línea" (Cobranzas, Gestión comercial).
ALTER TABLE "collection_whatsapp_sessions" ADD COLUMN "line" TEXT NOT NULL DEFAULT 'collections';
DROP INDEX "collection_whatsapp_sessions_workspaceId_key";
CREATE UNIQUE INDEX "collection_whatsapp_sessions_workspaceId_line_key" ON "collection_whatsapp_sessions"("workspaceId", "line");

ALTER TABLE "collection_whatsapp_chats" ADD COLUMN "line" TEXT NOT NULL DEFAULT 'collections';
DROP INDEX "collection_whatsapp_chats_workspaceId_jid_key";
DROP INDEX "collection_whatsapp_chats_workspaceId_lastMessageAt_idx";
CREATE UNIQUE INDEX "collection_whatsapp_chats_workspaceId_line_jid_key" ON "collection_whatsapp_chats"("workspaceId", "line", "jid");
CREATE INDEX "collection_whatsapp_chats_workspaceId_line_lastMessageAt_idx" ON "collection_whatsapp_chats"("workspaceId", "line", "lastMessageAt");

-- Reacciones a mensajes (una por emisor).
ALTER TABLE "collection_whatsapp_messages" ADD COLUMN "reactions" JSONB;
ALTER TABLE "whatsapp_messages" ADD COLUMN "reactions" JSONB;
