'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Squares2X2Icon,
  ChartBarIcon,
  CpuChipIcon,
  UserGroupIcon,
  Bars3Icon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
  QueueListIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import { useHealthStatus } from '@/lib/use-health-status';
import { useTheme } from '@/lib/theme-context';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { status, lastChecked, error } = useHealthStatus();
  const { theme, setTheme } = useTheme();

  const navigation = [
    { name: 'Control Center', href: '/', icon: Squares2X2Icon },
    { name: 'Logs', href: '/compliance', icon: QueueListIcon },
    { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
    { name: 'AI Models', href: '/models', icon: CpuChipIcon },
    { name: 'Users', href: '/users', icon: UserGroupIcon },
    { name: 'Test Sanitization', href: '/test-sanitization', icon: BeakerIcon },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
        fixed inset-y-0 left-0 z-50 w-64 rounded-tr-2xl border-r border-gray-200 bg-white
        transition-transform duration-300
        ease-in-out dark:border-[#242424] dark:bg-[#000000]
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
      >
        {/* Sidebar header */}
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center">
            <Image
              src="/logo_wh.png"
              alt="Node2AI"
              width={326}
              height={91}
              className="hidden h-8 w-auto dark:block"
            />
            <Image
              src="/logo_dk.png"
              alt="Node2AI"
              width={318}
              height={85}
              className="block h-8 w-auto dark:hidden"
            />
          </div>
          <button
            onClick={onToggle}
            className="hover:bg-black/3 rounded-md p-2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:bg-black/10 dark:hover:text-gray-300"
            aria-label="Close sidebar"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-3">
          <div className="space-y-1">
            {navigation.map(item => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`
                    group flex items-center px-3 py-2 text-sm font-medium transition-colors
                    ${
                      isActive
                        ? 'sidebar-active-border ml-2 border-l-4 text-gray-700 dark:text-gray-300'
                        : 'rounded-md text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                    }
                  `}
                >
                  <item.icon
                    className={`
                      mr-3 h-5 w-5 flex-shrink-0
                      ${
                        isActive
                          ? 'text-gray-500 dark:text-gray-400'
                          : 'text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-200'
                      }
                    `}
                  />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Sidebar footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-xs text-gray-600 dark:text-gray-400">
              <div
                className={`
                mr-2 h-2 w-2 rounded-full
                ${
                  status === 'healthy'
                    ? 'bg-green-500'
                    : status === 'unhealthy'
                      ? 'bg-red-500'
                      : 'bg-yellow-500'
                }
              `}
              />
              {status === 'healthy'
                ? 'API Server Online'
                : status === 'unhealthy'
                  ? 'API Server Offline'
                  : 'Checking...'}
            </div>
            <div className="flex items-center space-x-1 rounded-md border border-[#f9fafb] p-0.5 dark:border-[#21262e]">
              <button
                onClick={() => setTheme('light')}
                className={`p-0.5 transition-colors ${
                  theme === 'light'
                    ? 'rounded-full border border-[#f9fafb] text-gray-900 dark:border-[#21262e] dark:text-gray-100'
                    : 'rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                aria-label="Light mode"
              >
                <SunIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`p-0.5 transition-colors ${
                  theme === 'dark'
                    ? 'rounded-full border border-[#f9fafb] text-gray-900 dark:border-[#21262e] dark:text-gray-100'
                    : 'rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                aria-label="Dark mode"
              >
                <MoonIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function SidebarToggle({ isOpen, onToggle }: SidebarProps) {
  return (
    <button
      onClick={onToggle}
      className={`hover:bg-black/3 z-50 cursor-pointer rounded-md border border-[#21262e] p-2 text-gray-400 transition-colors hover:text-gray-600 dark:hover:bg-black/10 dark:hover:text-gray-300 ${isOpen ? 'hidden' : 'block'}`}
      aria-label="Toggle sidebar"
      type="button"
    >
      <Bars3Icon className="h-5 w-5" />
    </button>
  );
}
