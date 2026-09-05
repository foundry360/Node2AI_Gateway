import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function LoginPage() {
  return (
    <div className="login-shell">
      <div className="login-theme">
        <ThemeToggle />
      </div>
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-name">Enigma</div>
          <div className="brand-sub">AI Governance Gateway</div>
        </div>
        <h1 className="page-title">Sign in</h1>
        <p className="page-lede">Access the governance console.</p>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
