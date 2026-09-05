'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export function ThemeToggle() {
  const { toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      onClick={toggleTheme}
    >
      <Sun className="theme-icon theme-icon-sun" size={18} strokeWidth={1.75} aria-hidden />
      <Moon className="theme-icon theme-icon-moon" size={18} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
