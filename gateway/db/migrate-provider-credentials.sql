-- Application-scoped BYOK provider credentials (customer model API keys).
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS application_provider_credentials (
  application_id     TEXT PRIMARY KEY REFERENCES applications(application_id),
  organization_id    TEXT NOT NULL REFERENCES organizations(organization_id),
  provider_kind      TEXT NOT NULL
                       CHECK (provider_kind IN ('openai_compatible', 'custom')),
  endpoint_url       TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  api_key_last4      TEXT NOT NULL,
  model_map          JSONB NOT NULL DEFAULT '{}'::jsonb,
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'disabled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
