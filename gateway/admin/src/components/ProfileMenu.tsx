'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Camera, Check, LogOut, Moon, Sun, Trash2 } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/components/ThemeProvider';

function userInitials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._@-]+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const word = parts[0];
    return word.slice(0, 2).toUpperCase();
  }
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

function AvatarFace({
  src,
  initials,
  className,
  title,
}: {
  src: string | null;
  initials: string;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`avatar${src ? ' has-image' : ''}${className ? ` ${className}` : ''}`}
      title={title}
      style={src ? { backgroundImage: `url(${src})` } : undefined}
      aria-hidden={title ? undefined : true}
    >
      {!src ? <span className="avatar-initials">{initials}</span> : null}
    </span>
  );
}

export function ProfileMenu({ userName = 'admin' }: { userName?: string }) {
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuId = useId();

  const initials = userInitials(userName);

  const refreshAvatar = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/api/profile/avatar', { cache: 'no-store' });
        if (!res.ok) {
          setAvatarUrl(null);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setAvatarUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch {
        setAvatarUrl(null);
      }
    });
  };

  useEffect(() => {
    refreshAvatar();
    return () => {
      setAvatarUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selectTheme = (next: ThemeMode) => {
    setTheme(next);
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setAvatarError(null);
    const body = new FormData();
    body.set('avatar', file);
    startTransition(async () => {
      try {
        const res = await fetch('/api/profile/avatar', { method: 'POST', body });
        const data = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        if (!res.ok) {
          setAvatarError(data?.message ?? 'Failed to upload avatar');
          return;
        }
        refreshAvatar();
      } catch {
        setAvatarError('Failed to upload avatar');
      }
    });
  };

  const onRemoveAvatar = () => {
    setAvatarError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
        if (!res.ok) {
          setAvatarError('Failed to remove avatar');
          return;
        }
        setAvatarUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      } catch {
        setAvatarError('Failed to remove avatar');
      }
    });
  };

  return (
    <div className={`profile-menu${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="profile-menu-trigger"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={userName}
        onClick={() => setOpen((value) => !value)}
      >
        <AvatarFace
          src={avatarUrl}
          initials={initials}
          className="profile-menu-trigger-face"
          title={userName}
        />
      </button>
      {open ? (
        <div className="profile-menu-panel" id={menuId} role="menu" aria-label="Account">
          <div className="profile-menu-user">
            <div className="profile-menu-avatar-wrap">
              <AvatarFace src={avatarUrl} initials={initials} className="profile-menu-avatar" />
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  void onPickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="profile-avatar-edit"
                aria-label="Change avatar"
                title="Change avatar"
                disabled={pending}
                onClick={() => fileRef.current?.click()}
              >
                <Camera size={14} strokeWidth={2} aria-hidden />
              </button>
            </div>
            <div className="profile-menu-user-copy">
              <div className="profile-menu-user-name">{userName}</div>
              <div className="profile-menu-user-role muted">Administrator</div>
            </div>
          </div>

          <div className="profile-menu-section">
            <div className="profile-menu-label">Avatar</div>
            <button
              type="button"
              className="profile-menu-item"
              role="menuitem"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
            >
              <Camera size={15} strokeWidth={1.75} aria-hidden />
              <span>{avatarUrl ? 'Change photo' : 'Add photo'}</span>
            </button>
            {avatarUrl ? (
              <button
                type="button"
                className="profile-menu-item"
                role="menuitem"
                disabled={pending}
                onClick={onRemoveAvatar}
              >
                <Trash2 size={15} strokeWidth={1.75} aria-hidden />
                <span>Remove photo</span>
              </button>
            ) : null}
            {avatarError ? <div className="profile-menu-error">{avatarError}</div> : null}
          </div>

          <div className="profile-menu-divider" />

          <div className="profile-menu-section">
            <div className="profile-menu-label">Theme</div>
            <div className="profile-theme-options" role="group" aria-label="Theme">
              <button
                type="button"
                className="profile-theme-option"
                data-theme-option="dark"
                role="menuitemradio"
                onClick={() => selectTheme('dark')}
              >
                <Moon size={15} strokeWidth={1.75} aria-hidden />
                <span>Dark</span>
                <Check className="profile-theme-check" size={14} strokeWidth={2.25} aria-hidden />
              </button>
              <button
                type="button"
                className="profile-theme-option"
                data-theme-option="light"
                role="menuitemradio"
                onClick={() => selectTheme('light')}
              >
                <Sun size={15} strokeWidth={1.75} aria-hidden />
                <span>Light</span>
                <Check className="profile-theme-check" size={14} strokeWidth={2.25} aria-hidden />
              </button>
            </div>
          </div>

          <div className="profile-menu-divider" />

          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="profile-menu-item profile-menu-logout" role="menuitem">
              <LogOut size={15} strokeWidth={1.75} aria-hidden />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
