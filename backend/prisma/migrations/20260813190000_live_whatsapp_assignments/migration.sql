-- Stable 8-digit lead identifiers and persistent WhatsApp identity/assignment.
ALTER TABLE "deals" ADD COLUMN "leadNumber" VARCHAR(8);

WITH numbered AS (
  SELECT
    id,
    LPAD((10000000 + ROW_NUMBER() OVER (ORDER BY MD5(id)))::TEXT, 8, '0') AS code
  FROM "deals"
)
UPDATE "deals" AS d
SET "leadNumber" = numbered.code
FROM numbered
WHERE d.id = numbered.id;

ALTER TABLE "deals" ALTER COLUMN "leadNumber" SET NOT NULL;
CREATE UNIQUE INDEX "deals_workspaceId_leadNumber_key" ON "deals"("workspaceId", "leadNumber");

ALTER TABLE "whatsapp_chats"
  ADD COLUMN "lidJid" TEXT,
  ADD COLUMN "phoneNumberSource" TEXT,
  ADD COLUMN "assignedToUserId" TEXT;

CREATE INDEX "whatsapp_chats_workspaceId_assignedToUserId_idx"
  ON "whatsapp_chats"("workspaceId", "assignedToUserId");

ALTER TABLE "whatsapp_chats"
  ADD CONSTRAINT "whatsapp_chats_assignedToUserId_fkey"
  FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
