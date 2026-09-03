'use client';

import { useTheme } from '@/lib/theme-context';
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themes = [
    { value: 'light', label: 'Light', icon: SunIcon },
    { value: 'dark', label: 'Dark', icon: MoonIcon },
    { value: 'system', label: 'System', icon: ComputerDesktopIcon },
  ] as const;

  return (
    <div className="relative">
      <select
        value={theme}
        onChange={e => setTheme(e.target.value as 'light' | 'dark' | 'system')}
        className="appearance-none rounded-lg border border-gray-300 bg-transparent px-3 py-2 pr-8 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-[#242424]"
      >
        {themes.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
        {(() => {
          const currentTheme = themes.find(t => t.value === theme);
          const IconComponent = currentTheme?.icon;
          return IconComponent ? (
            <IconComponent className="h-4 w-4 text-gray-500" />
          ) : null;
        })()}
      </div>
    </div>
  );
}

export function ThemeToggleButton() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }
  };

  return (
    <button
      onClick={cycleTheme}
      className="rounded-lg border border-gray-300 p-2 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:hover:bg-gray-800"
      title={`Current theme: ${theme} (${resolvedTheme})`}
    >
      {resolvedTheme === 'dark' ? (
        <MoonIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
      ) : (
        <SunIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
      )}
    </button>
  );
}
