-- CreateEnum
CREATE TYPE "InternalConversationType" AS ENUM ('GENERAL', 'DIRECT');

-- CreateTable
CREATE TABLE "internal_conversations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "InternalConversationType" NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_conversation_participants" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_chat_messages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "internal_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_conversations_workspaceId_key_key" ON "internal_conversations"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "internal_conversations_workspaceId_type_lastMessageAt_idx" ON "internal_conversations"("workspaceId", "type", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "internal_conversation_participants_conversationId_userId_key" ON "internal_conversation_participants"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "internal_conversation_participants_userId_conversationId_idx" ON "internal_conversation_participants"("userId", "conversationId");

-- CreateIndex
CREATE INDEX "internal_chat_messages_workspaceId_conversationId_createdAt_idx" ON "internal_chat_messages"("workspaceId", "conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "internal_conversations" ADD CONSTRAINT "internal_conversations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_conversation_participants" ADD CONSTRAINT "internal_conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "internal_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_conversation_participants" ADD CONSTRAINT "internal_conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_chat_messages" ADD CONSTRAINT "internal_chat_messages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_chat_messages" ADD CONSTRAINT "internal_chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "internal_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_chat_messages" ADD CONSTRAINT "internal_chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
