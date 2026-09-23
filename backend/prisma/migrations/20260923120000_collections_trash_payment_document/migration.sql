-- Papelera de cobranzas: quién y cuándo eliminó cada registro.
ALTER TABLE "receivables" ADD COLUMN "voidedByUserId" TEXT;
ALTER TABLE "payments" ADD COLUMN "voidedByUserId" TEXT;
ALTER TABLE "recurring_charges" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "recurring_charges" ADD COLUMN "deletedByUserId" TEXT;

-- Comprobante obligatorio al cobrar (o constancia de que no se adjunta).
ALTER TABLE "payments" ADD COLUMN "documentId" TEXT;
ALTER TABLE "payments" ADD COLUMN "documentWaived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "receivables" ADD CONSTRAINT "receivables_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "client_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recurring_charges" ADD CONSTRAINT "recurring_charges_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
