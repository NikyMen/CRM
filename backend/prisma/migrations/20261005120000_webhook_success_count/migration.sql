-- schema.prisma declara successCount desde el inicio pero ninguna migracion lo creaba:
-- cada evento del EventBus fallaba al leer webhook_endpoints y la request respondia 500.
ALTER TABLE "webhook_endpoints" ADD COLUMN IF NOT EXISTS "successCount" INTEGER NOT NULL DEFAULT 0;
