ALTER TABLE "workspace_users"
ADD COLUMN "moduleAccess" JSONB NOT NULL DEFAULT '{}';
