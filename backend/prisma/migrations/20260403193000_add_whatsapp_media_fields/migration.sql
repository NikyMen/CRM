ALTER TABLE "whatsapp_messages"
ADD COLUMN "mediaPath" TEXT,
ADD COLUMN "mediaMimeType" TEXT,
ADD COLUMN "mediaFileName" TEXT,
ADD COLUMN "mediaSizeBytes" INTEGER,
ADD COLUMN "mediaDurationSeconds" INTEGER;
