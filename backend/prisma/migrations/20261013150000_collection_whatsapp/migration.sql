-- CreateTable
CREATE TABLE "collection_whatsapp_sessions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "phoneJid" TEXT,
    "pushName" TEXT,
    "qrCode" TEXT,
    "lastConnectedAt" TIMESTAMP(3),
    "lastDisconnectedAt" TIMESTAMP(3),
    "lastDisconnectCode" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_whatsapp_chats" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "lidJid" TEXT,
    "phoneNumber" TEXT,
    "displayName" TEXT,
    "companyId" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastMessageFromMe" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_whatsapp_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_whatsapp_messages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL DEFAULT false,
    "pushName" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "status" TEXT,
    "mediaPath" TEXT,
    "mediaMimeType" TEXT,
    "mediaFileName" TEXT,
    "mediaSizeBytes" INTEGER,
    "sentByUserId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_whatsapp_sessions_workspaceId_key" ON "collection_whatsapp_sessions"("workspaceId");

-- CreateIndex
CREATE INDEX "collection_whatsapp_chats_workspaceId_lastMessageAt_idx" ON "collection_whatsapp_chats"("workspaceId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "collection_whatsapp_chats_workspaceId_companyId_idx" ON "collection_whatsapp_chats"("workspaceId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_whatsapp_chats_workspaceId_jid_key" ON "collection_whatsapp_chats"("workspaceId", "jid");

-- CreateIndex
CREATE INDEX "collection_whatsapp_messages_workspaceId_chatId_sentAt_idx" ON "collection_whatsapp_messages"("workspaceId", "chatId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "collection_whatsapp_messages_chatId_messageId_key" ON "collection_whatsapp_messages"("chatId", "messageId");

-- AddForeignKey
ALTER TABLE "collection_whatsapp_sessions" ADD CONSTRAINT "collection_whatsapp_sessions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_whatsapp_chats" ADD CONSTRAINT "collection_whatsapp_chats_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_whatsapp_chats" ADD CONSTRAINT "collection_whatsapp_chats_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_whatsapp_messages" ADD CONSTRAINT "collection_whatsapp_messages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_whatsapp_messages" ADD CONSTRAINT "collection_whatsapp_messages_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "collection_whatsapp_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_whatsapp_messages" ADD CONSTRAINT "collection_whatsapp_messages_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
