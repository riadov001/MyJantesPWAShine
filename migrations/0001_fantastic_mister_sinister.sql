-- Adds the dedicated marketing email consent column on users so that the
-- mobile profile preferences endpoint can persist email opt-in independently
-- from sms_consent. Applied to development DB via `npm run db:push`.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "marketing_email_consent" boolean DEFAULT false NOT NULL;
