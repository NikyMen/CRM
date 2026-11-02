-- CreateTable
CREATE TABLE "assistant_settings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "testOnlyPhones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedPhones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifyTo" TEXT,
    "pauseHours" INTEGER NOT NULL DEFAULT 8,
    "waitSeconds" INTEGER NOT NULL DEFAULT 6,
    "maxAudioSeconds" INTEGER NOT NULL DEFAULT 150,
    "maxRepliesPerHour" INTEGER NOT NULL DEFAULT 10,
    "timezone" TEXT NOT NULL DEFAULT 'America/Asuncion',
    "officeDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "officeFrom" TEXT NOT NULL DEFAULT '08:00',
    "officeTo" TEXT NOT NULL DEFAULT '18:00',
    "followUpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "followUpHours" INTEGER NOT NULL DEFAULT 22,
    "followUpFrom" TEXT NOT NULL DEFAULT '08:30',
    "followUpTo" TEXT NOT NULL DEFAULT '18:00',
    "followUpMessage" TEXT NOT NULL DEFAULT '',
    "fallbackMessage" TEXT NOT NULL DEFAULT '',
    "extraInstructions" TEXT NOT NULL DEFAULT '',
    "handoffTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "crmSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "servicesSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_services" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "amount" DECIMAL(18,0),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_settings_workspaceId_key" ON "assistant_settings"("workspaceId");

-- CreateIndex
CREATE INDEX "assistant_services_workspaceId_sortOrder_idx" ON "assistant_services"("workspaceId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_services_workspaceId_code_key" ON "assistant_services"("workspaceId", "code");

-- AddForeignKey
ALTER TABLE "assistant_settings" ADD CONSTRAINT "assistant_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_services" ADD CONSTRAINT "assistant_services_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

