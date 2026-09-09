'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { SelectDropdown } from '@/components/SelectDropdown';
import { StatusBadge } from '@/components/StatusBadge';
import {
  ADMIN_ROLE_OPTIONS,
  adminRoleDescription,
  adminRoleLabel,
} from '@/lib/admin-roles';
import type { AdminRole } from '@/lib/auth-session';
import { proxyJson } from '@/lib/client-api';

export type PublicAdminUser = {
  user_id: string;
  organization_id: string;
  username: string;
  role: AdminRole;
  status: 'ACTIVE' | 'DISABLED';
  created_at: string;
  updated_at: string;
};

type DialogMode =
  | { kind: 'add' }
  | { kind: 'edit'; user: PublicAdminUser }
  | { kind: 'status'; user: PublicAdminUser; next: 'ACTIVE' | 'DISABLED' }
  | { kind: 'password'; user: PublicAdminUser }
  | null;

const ROLE_SELECT_OPTIONS = ADMIN_ROLE_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

function statusLabel(status: string): string {
  return status === 'DISABLED' ? 'Disabled' : 'Active';
}

export function UsersAdminPanel() {
  const [users, setUsers] = useState<PublicAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [role, setRole] = useState<AdminRole>('READ_ONLY');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = (await proxyJson('users', 'GET')) as {
        users?: PublicAdminUser[];
      };
      const list = [...(data.users ?? [])].sort((a, b) =>
        a.username.localeCompare(b.username),
      );
      setUsers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openAdd() {
    setUsername('');
    setRole('READ_ONLY');
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
    setDialog({ kind: 'add' });
  }

  function openEdit(user: PublicAdminUser) {
    setUsername(user.username);
    setRole(user.role);
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
    setDialog({ kind: 'edit', user });
  }

  function openStatus(user: PublicAdminUser, next: 'ACTIVE' | 'DISABLED') {
    setFormError(null);
    setDialog({ kind: 'status', user, next });
  }

  function openPassword(user: PublicAdminUser) {
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
    setDialog({ kind: 'password', user });
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setFormError(null);
  }

  async function submitAdd() {
    const nextUsername = username.trim();
    if (!nextUsername) {
      setFormError('Username is required');
      return;
    }
    if (!password) {
      setFormError('Password is required');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await proxyJson('users', 'POST', {
        username: nextUsername,
        password,
        role,
      });
      setDialog(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(user: PublicAdminUser) {
    setBusy(true);
    setFormError(null);
    try {
      await proxyJson(`users/${user.user_id}`, 'PATCH', {
        role,
        status: user.status,
      });
      setDialog(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitStatus(user: PublicAdminUser, next: 'ACTIVE' | 'DISABLED') {
    setBusy(true);
    setFormError(null);
    try {
      await proxyJson(`users/${user.user_id}`, 'PATCH', { status: next });
      setDialog(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitPassword(user: PublicAdminUser) {
    if (!password) {
      setFormError('Password is required');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await proxyJson(`users/${user.user_id}`, 'PATCH', { password });
      setDialog(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        lede="Manage who can access Enigma and what they are allowed to do."
        actions={
          <button type="button" className="btn" onClick={openAdd}>
            + Add User
          </button>
        }
      />

      {error ? <div className="error">{error}</div> : null}

      {loading ? (
        <p className="muted">Loading users…</p>
      ) : users.length === 0 ? (
        <EmptyState
          title="No users"
          description="Add a user to grant access to the Enigma console."
        />
      ) : (
        <div className="settings-section-data">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Organization</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.user_id}>
                  <td>
                    <div className="admin-user-cell">
                      <span className="admin-user-name">{user.username}</span>
                    </div>
                  </td>
                  <td>{adminRoleLabel(user.role)}</td>
                  <td>
                    <StatusBadge
                      status={user.status === 'DISABLED' ? 'disabled' : 'active'}
                      label={statusLabel(user.status)}
                      showLabel
                      variant="badge"
                    />
                  </td>
                  <td className="mono muted">{user.organization_id}</td>
                  <td className="admin-user-actions">
                    <UserRowMenu
                      user={user}
                      onEdit={() => openEdit(user)}
                      onToggleStatus={() =>
                        openStatus(
                          user,
                          user.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED',
                        )
                      }
                      onResetPassword={() => openPassword(user)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === 'add' ? (
        <div className="drawer-root" role="presentation">
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Close"
            onClick={closeDialog}
          />
          <aside className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="add-user-title">
            <div className="drawer-header">
              <h2 id="add-user-title" className="drawer-title">
                Add User
              </h2>
              <button type="button" className="icon-btn" aria-label="Close" onClick={closeDialog}>
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            <div className="drawer-shell">
              <div className="drawer-form">
                {formError ? <div className="error">{formError}</div> : null}
                <label>
                  Username
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                </label>
                <label>
                  Role
                  <SelectDropdown
                    options={ROLE_SELECT_OPTIONS}
                    value={role}
                    onChange={(next) => setRole(next as AdminRole)}
                    ariaLabel="Role"
                  />
                </label>
                <p className="muted admin-role-hint">{adminRoleDescription(role)}</p>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  Confirm password
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                <p className="muted">
                  Status defaults to Active. Organization is set from your administrator account.
                </p>
              </div>
              <div className="drawer-actions">
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>
                  Cancel
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => void submitAdd()}>
                  {busy ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {dialog?.kind === 'edit' ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDialog}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-user-title" className="modal-title">
              Edit User
            </h2>
            {formError ? <div className="error">{formError}</div> : null}
            <div className="form-grid">
              <label>
                Username
                <input value={dialog.user.username} disabled />
              </label>
              <label>
                Organization
                <input value={dialog.user.organization_id} disabled className="mono" />
              </label>
              <label>
                Role
                <SelectDropdown
                  options={ROLE_SELECT_OPTIONS}
                  value={role}
                  onChange={(next) => setRole(next as AdminRole)}
                  ariaLabel="Role"
                />
              </label>
              <p className="muted admin-role-hint">{adminRoleDescription(role)}</p>
              <p className="muted">
                Status: {statusLabel(dialog.user.status)}. Use Enable/Disable from the row menu to change
                sign-in access.
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void submitEdit(dialog.user)}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialog?.kind === 'status' ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDialog}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-user-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="status-user-title" className="modal-title">
              {dialog.next === 'DISABLED' ? 'Disable this user?' : 'Enable this user?'}
            </h2>
            <p className="muted" style={{ margin: '0 0 0.85rem' }}>
              {dialog.next === 'DISABLED'
                ? 'They will no longer be able to sign in to Enigma.'
                : 'They will be able to sign in to Enigma again.'}
            </p>
            {formError ? <div className="error">{formError}</div> : null}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn${dialog.next === 'DISABLED' ? ' btn-danger' : ''}`}
                disabled={busy}
                onClick={() => void submitStatus(dialog.user, dialog.next)}
              >
                {busy
                  ? 'Updating…'
                  : dialog.next === 'DISABLED'
                    ? 'Disable User'
                    : 'Enable User'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialog?.kind === 'password' ? (
        <div className="modal-backdrop" role="presentation" onClick={closeDialog}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-user-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="password-user-title" className="modal-title">
              Reset Password
            </h2>
            <p className="muted" style={{ margin: '0 0 0.85rem' }}>
              Set a new password for <strong>{dialog.user.username}</strong>. The new password is not shown
              again after you save.
            </p>
            {formError ? <div className="error">{formError}</div> : null}
            <div className="form-grid">
              <label>
                New password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={closeDialog}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void submitPassword(dialog.user)}
              >
                {busy ? 'Saving…' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserRowMenu({
  user,
  onEdit,
  onToggleStatus,
  onResetPassword,
}: {
  user: PublicAdminUser;
  onEdit: () => void;
  onToggleStatus: () => void;
  onResetPassword: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="card-menu" ref={rootRef}>
      <button
        type="button"
        className="icon-btn card-menu-trigger"
        aria-label={`Actions for ${user.username}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal size={18} strokeWidth={1.75} />
      </button>
      {open ? (
        <div className="card-menu-dropdown" id={menuId} role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className={user.status === 'ACTIVE' ? 'card-menu-item-danger' : undefined}
            onClick={() => {
              setOpen(false);
              onToggleStatus();
            }}
          >
            {user.status === 'DISABLED' ? 'Enable' : 'Disable'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onResetPassword();
            }}
          >
            Reset Password
          </button>
        </div>
      ) : null}
    </div>
  );
}
