'use client';

import { useState, useEffect, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'viewer' | 'developer';
  status: 'active' | 'inactive' | 'pending';
}

interface EditUserDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (userData: Partial<User> & { id: string }) => Promise<void> | void;
  user: User | null;
}

export function EditUserDialog({
  isOpen,
  onClose,
  onSubmit,
  user,
}: EditUserDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'user' as 'admin' | 'user' | 'viewer' | 'developer',
    status: 'active' as 'active' | 'inactive' | 'pending',
  });

  const dialogRef = useRef<HTMLDivElement>(null);

  // Load user data when dialog opens
  useEffect(() => {
    if (isOpen && user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        role: user.role || 'user',
        status: user.status || 'active',
      });
      // Auto-focus on the first input when dialog opens
      setTimeout(() => {
        const firstInput = dialogRef.current?.querySelector(
          'input, select'
        ) as HTMLElement;
        firstInput?.focus();
      }, 100);
    }
  }, [isOpen, user]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.email && user) {
      onSubmit({
        id: user.id,
        ...formData,
      });
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-md transform rounded-md border border-gray-200 bg-white shadow-lg transition-all duration-200 ease-out dark:border-[#242424] dark:bg-black"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-6 dark:border-[#242424]">
          <h2 className="text-xl text-gray-900 dark:text-white">Edit User</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div>
            <label className="mb-2 block text-sm text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="dropdown-transparent dropdown-normal-weight w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none dark:border-[#242424] dark:text-white"
              placeholder="Enter user name"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-700 dark:text-gray-300">
              Email *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={e =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="dropdown-transparent dropdown-normal-weight w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none dark:border-[#242424] dark:text-white"
              placeholder="Enter email address"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-700 dark:text-gray-300">
              Role
            </label>
            <select
              value={formData.role}
              onChange={e =>
                setFormData({
                  ...formData,
                  role: e.target.value as
                    | 'admin'
                    | 'user'
                    | 'viewer'
                    | 'developer',
                })
              }
              className="dropdown-transparent dropdown-normal-weight w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none dark:border-[#242424] dark:text-white"
            >
              <option value="user">User</option>
              <option value="viewer">Viewer</option>
              <option value="developer">Developer</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-700 dark:text-gray-300">
              Status
            </label>
            <select
              value={formData.status}
              onChange={e =>
                setFormData({
                  ...formData,
                  status: e.target.value as 'active' | 'inactive' | 'pending',
                })
              }
              className="dropdown-transparent dropdown-normal-weight w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none dark:border-[#242424] dark:text-white"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 border-t border-gray-200 pt-6 dark:border-[#242424]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-white dark:hover:bg-gray-800"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
