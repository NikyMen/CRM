ALTER TABLE "sales" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "sales" ADD COLUMN "deletedByUserId" TEXT;

CREATE TABLE "sale_events" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sales_workspaceId_deletedAt_soldAt_idx" ON "sales"("workspaceId", "deletedAt", "soldAt");
CREATE INDEX "sale_events_workspaceId_saleId_createdAt_idx" ON "sale_events"("workspaceId", "saleId", "createdAt");
ALTER TABLE "sales" ADD CONSTRAINT "sales_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_events" ADD CONSTRAINT "sale_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_events" ADD CONSTRAINT "sale_events_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_events" ADD CONSTRAINT "sale_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
