-- Catálogo de propiedades y fechas agendadas de los leads (Calendario).
-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "title" TEXT NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'sale',
    "propertyType" TEXT NOT NULL DEFAULT 'house',
    "status" TEXT NOT NULL DEFAULT 'available',
    "price" DECIMAL(15,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "address" TEXT,
    "city" TEXT,
    "neighborhood" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "areaM2" INTEGER,
    "description" TEXT NOT NULL DEFAULT '',
    "coverImage" BYTEA,
    "coverMimeType" TEXT,
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(200),
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "properties_workspaceId_isArchived_createdAt_idx" ON "properties"("workspaceId", "isArchived", "createdAt");

-- CreateIndex
CREATE INDEX "properties_workspaceId_assignedToUserId_idx" ON "properties"("workspaceId", "assignedToUserId");

-- CreateIndex
CREATE UNIQUE INDEX "properties_workspaceId_code_key" ON "properties"("workspaceId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_dealId_key" ON "appointments"("dealId");

-- CreateIndex
CREATE INDEX "appointments_workspaceId_startsAt_idx" ON "appointments"("workspaceId", "startsAt");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

