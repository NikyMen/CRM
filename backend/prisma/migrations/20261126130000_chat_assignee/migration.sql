-- Responsable de los chats de las líneas de WhatsApp (bandeja de Mensajes).
ALTER TABLE "collection_whatsapp_chats" ADD COLUMN "assignedToUserId" TEXT;
ALTER TABLE "collection_whatsapp_chats" ADD COLUMN "assignedAt" TIMESTAMP(3);

CREATE INDEX "collection_whatsapp_chats_workspaceId_line_assignedToUserId_idx" ON "collection_whatsapp_chats"("workspaceId", "line", "assignedToUserId");

ALTER TABLE "collection_whatsapp_chats" ADD CONSTRAINT "collection_whatsapp_chats_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
