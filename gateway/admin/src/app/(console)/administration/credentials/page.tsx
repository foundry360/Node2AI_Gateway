import { PageHeader } from '@/components/PageHeader';

export default function AdministrationCredentialsPage() {
  return (
    <div>
      <PageHeader
        title="Credentials"
        lede="Provider credentials are managed per application."
      />
      <p className="muted" style={{ maxWidth: '40rem', margin: 0 }}>
        Open an application to create or rotate model provider credentials and API keys. A dedicated
        credential inventory will land in a later release.
      </p>
      <p style={{ marginTop: '1rem' }}>
        <a className="btn btn-secondary" href="/applications">
          Go to Applications
        </a>
      </p>
    </div>
  );
}
