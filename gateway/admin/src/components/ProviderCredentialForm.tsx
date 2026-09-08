export type ProviderCredentialPublic = {
  application_id: string;
  organization_id: string;
  provider_kind: string;
  endpoint_url: string;
  api_key_last4: string;
  api_key?: string;
  model_map: Record<string, string>;
  status: string;
  updated_at: string;
};
