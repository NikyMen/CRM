ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "team_invitations" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_invitations_role_check" CHECK ("role" IN ('admin', 'member', 'viewer')),
  CONSTRAINT "team_invitations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "workspace_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "team_invitations_tokenHash_key" ON "team_invitations"("tokenHash");
CREATE INDEX "team_invitations_createdById_expiresAt_idx" ON "team_invitations"("createdById", "expiresAt");
