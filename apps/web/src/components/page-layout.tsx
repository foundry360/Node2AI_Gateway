'use client';

import { ReactNode, useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Sidebar, SidebarToggle } from '@/components/sidebar';
import { useSidebar } from '@/components/sidebar-provider';
import {
  InboxIcon,
  ArrowRightOnRectangleIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface PageLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  headerActions?: ReactNode;
}

export function PageLayout({
  children,
  title,
  subtitle,
  headerActions,
}: PageLayoutProps) {
  const { isOpen, toggle } = useSidebar();
  const { user, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatar_url]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-[#030303]">
      {/* Sidebar */}
      <Sidebar isOpen={isOpen} onToggle={toggle} />

      {/* Main content */}
      <div
        className={`flex flex-1 flex-col transition-all duration-300 ease-in-out ${isOpen ? 'lg:pl-64' : ''}`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white shadow dark:bg-[#000000]">
          <div className="w-full px-4 sm:px-6 lg:px-8">
            <div className="py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <SidebarToggle isOpen={isOpen} onToggle={toggle} />
                  <div
                    className={`ml-3 transition-opacity duration-300 ease-in-out ${isOpen ? 'opacity-0' : 'opacity-100'}`}
                  >
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
                </div>
                <div className="flex items-center space-x-2">
                  {headerActions}
                  {/* Inbox Icon */}
                  <button className="relative rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300">
                    <InboxIcon className="h-6 w-6" />
                    {/* Notification Badge */}
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                      3
                    </span>
                  </button>
                  {/* Settings Icon */}
                  <Link
                    href="/settings"
                    className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                    title="Settings"
                  >
                    <Cog6ToothIcon className="h-6 w-6" />
                  </Link>
                  {/* Profile Avatar with Dropdown */}
                  <div ref={dropdownRef} className="relative">
                    <button
                      className="flex items-center space-x-3 rounded-lg p-2"
                      onClick={() => setShowDropdown(!showDropdown)}
                    >
                      <div className="relative">
                        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 border-[#1a1e24] bg-gray-200 dark:bg-gray-700">
                          {user?.avatar_url &&
                          user.avatar_url.trim().length > 0 &&
                          !avatarError ? (
                            <img
                              src={user.avatar_url}
                              alt={user.name || user.email || 'User avatar'}
                              className="h-full w-full object-cover"
                              onError={() => setAvatarError(true)}
                            />
                          ) : (
                            (() => {
                              const name =
                                user?.display_name ||
                                user?.name ||
                                user?.email ||
                                'Guest';
                              const nameParts = name.trim().split(/\s+/);
                              let initials = '';
                              if (nameParts.length >= 2) {
                                initials =
                                  nameParts[0][0].toUpperCase() +
                                  nameParts[
                                    nameParts.length - 1
                                  ][0].toUpperCase();
                              } else if (nameParts.length === 1) {
                                initials = nameParts[0][0].toUpperCase();
                              } else {
                                initials = 'G';
                              }
                              return (
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                  {initials}
                                </span>
                              );
                            })()
                          )}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-500 dark:border-[#000000]"></div>
                      </div>
                      <div className="hidden text-left sm:block">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {user?.name || user?.email || 'Guest'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {user?.role
                            ? user.role.charAt(0).toUpperCase() +
                              user.role.slice(1)
                            : 'Guest'}
                        </p>
                      </div>
                    </button>

                    {/* Dropdown Menu */}
                    {showDropdown && (
                      <div className="absolute right-0 z-50 mt-2 w-48 rounded-md border border-gray-200 bg-white shadow-lg dark:border-[#242424] dark:bg-[#000000]">
                        <div className="py-1">
                          <button
                            onClick={handleLogout}
                            className="flex w-full items-center px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-transparent dark:text-gray-300 dark:hover:bg-transparent"
                          >
                            <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5" />
                            Logout
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
