-- Publicaciones para redes sociales armadas desde el CRM (sección Instagram → Publicar).
CREATE TABLE "social_posts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'instagram',
    "caption" TEXT NOT NULL,
    "imageMimeType" TEXT NOT NULL,
    "imageFileName" TEXT,
    "image" BYTEA NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "externalPostId" TEXT,
    "permalink" TEXT,
    "errorMessage" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "social_posts_workspaceId_network_createdAt_idx" ON "social_posts"("workspaceId", "network", "createdAt");

ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
