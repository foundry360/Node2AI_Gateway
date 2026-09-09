import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';
import { ThemeToggle } from '@/components/ThemeToggle';

const PERSONAS = [
  { initials: 'AK', name: 'Avery Kim', role: 'Security Lead, Contoso Health' },
  { initials: 'JR', name: 'Jordan Reyes', role: 'AI Ops, Northwind Bank' },
  { initials: 'MS', name: 'Morgan Singh', role: 'Compliance, Apex Retail' },
] as const;

export default function LoginPage() {
  return (
    <div className="login-shell">
      <div className="login-theme">
        <ThemeToggle />
      </div>

      <section className="login-pane login-pane-form" aria-label="Sign in">
        <div className="login-pane-inner">
          <div className="login-brand-top">
            <img
              src="/brand/enigma-logo.png"
              alt="Enigma"
              className="login-logo-mark"
            />
          </div>

          <div className="login-card">
            <h1 className="login-card-title">Enigma login</h1>
            <Suspense fallback={<p className="muted">Loading…</p>}>
              <LoginForm />
            </Suspense>
          </div>

          <div className="login-customer-row">
            <span>Need access?</span>
            <a className="login-outline-btn" href="mailto:support@enigma.ai">
              Contact us
            </a>
          </div>
        </div>

        <p className="login-legal">
          © {new Date().getFullYear()} Enigma · Privacy · Terms of Service
        </p>
      </section>

      <aside className="login-pane login-pane-promo" aria-label="Product">
        <div className="login-promo-copy">
          <p className="login-promo-kicker">
            Enigma · AI governance for production systems
          </p>
          <h2 className="login-promo-headline">
            Be in the room when AI actions need human authority
          </h2>
          <p className="login-promo-lede">
            Policy, review, and decision integrity stay in one console while
            your agents keep working. Authorize or deny with the prompt in
            front of you, not buried in logs.
          </p>
          <a className="login-promo-cta" href="https://node2ai.ai" target="_blank" rel="noreferrer">
            Learn more
            <span aria-hidden="true">↗</span>
          </a>
        </div>

        <ul className="login-personas">
          {PERSONAS.map((p) => (
            <li key={p.name} className="login-persona">
              <span className="login-persona-avatar" aria-hidden="true">
                {p.initials}
              </span>
              <span className="login-persona-name">{p.name}</span>
              <span className="login-persona-role">{p.role}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
