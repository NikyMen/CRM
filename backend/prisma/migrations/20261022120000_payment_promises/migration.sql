-- CreateEnum
CREATE TYPE "PaymentPromiseStatus" AS ENUM ('PENDING', 'FULFILLED', 'BROKEN', 'CANCELLED');

-- CreateTable
CREATE TABLE "payment_promises" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chatId" TEXT,
    "promisedDate" DATE NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'PYG',
    "note" TEXT,
    "status" "PaymentPromiseStatus" NOT NULL DEFAULT 'PENDING',
    "assignedUserId" TEXT,
    "createdByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_promises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_promises_workspaceId_status_promisedDate_idx" ON "payment_promises"("workspaceId", "status", "promisedDate");

-- CreateIndex
CREATE INDEX "payment_promises_workspaceId_assignedUserId_status_promised_idx" ON "payment_promises"("workspaceId", "assignedUserId", "status", "promisedDate");

-- CreateIndex
CREATE INDEX "payment_promises_workspaceId_companyId_status_idx" ON "payment_promises"("workspaceId", "companyId", "status");

-- AddForeignKey
ALTER TABLE "payment_promises" ADD CONSTRAINT "payment_promises_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_promises" ADD CONSTRAINT "payment_promises_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_promises" ADD CONSTRAINT "payment_promises_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "collection_whatsapp_chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_promises" ADD CONSTRAINT "payment_promises_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_promises" ADD CONSTRAINT "payment_promises_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_promises" ADD CONSTRAINT "payment_promises_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

