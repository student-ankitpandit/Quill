BEGIN;

ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "providerOrderId" TEXT,
  ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_providerOrderId_key"
  ON "Subscription"("providerOrderId");

CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_providerPaymentId_key"
  ON "Subscription"("providerPaymentId");

ALTER TABLE "Subscription"
  ALTER COLUMN "provider" SET DEFAULT 'razorpay',
  ALTER COLUMN "currency" SET DEFAULT 'INR';

COMMIT;
