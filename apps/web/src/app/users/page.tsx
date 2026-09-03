'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserGroupIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  ShieldCheckIcon,
  UserIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline';
import { PageLayout } from '@/components/page-layout';
import { Dropdown, SelectDropdown } from '@/components/dropdown';
import { AddUserDialog } from '@/components/add-user-dialog';
import { EditUserDialog } from '@/components/edit-user-dialog';
import { DeleteUserDialog } from '@/components/delete-user-dialog';
import { useAuth } from '@/contexts/AuthContext';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'viewer' | 'developer';
  status: 'active' | 'inactive' | 'pending';
  last_login?: string;
  created_at: string;
  api_keys_count: number;
  total_requests: number;
  avatar_url?: string;
}

// Helper function to get user initials
const getInitials = (name: string) => {
  const words = name.trim().split(' ');
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

// Avatar component
const UserAvatar = ({ user }: { user: User }) => {
  const [imageError, setImageError] = useState(false);

  const initials = getInitials(user.name);
  const colors = [
    'bg-blue-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-green-500',
    'bg-yellow-500',
    'bg-indigo-500',
    'bg-red-500',
    'bg-teal-500',
  ];
  const colorIndex = user.id.charCodeAt(0) % colors.length;
  const bgColor = colors[colorIndex];

  if (user.avatar_url && user.avatar_url.length > 0 && !imageError) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name}
        className="h-8 w-8 rounded-full object-cover"
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-full ${bgColor}`}
    >
      <span className="text-xs font-medium text-white">{initials}</span>
    </div>
  );
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const { token } = useAuth();

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);

      if (!token) {
        setUsers([]);
        setAllUsers([]);
        setLoading(false);
        return;
      }

      // Build query params
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        role: roleFilter === 'all' ? '' : roleFilter,
        status: statusFilter === 'all' ? '' : statusFilter,
        search: searchTerm,
      });

      // Remove empty params
      if (params.get('role') === '') params.delete('role');
      if (params.get('status') === '') params.delete('status');
      if (params.get('search') === '') params.delete('search');

      const url = `/api/v1/users?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load users: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.data && data.data.users) {
        const loadedUsers = data.data.users;

        // Force state update
        setUsers([...loadedUsers]);
        setAllUsers([...loadedUsers]);

        // Store pagination info
        if (data.data.pagination) {
          setTotalPages(data.data.pagination.totalPages || 1);
          setTotalUsers(data.data.pagination.total || 0);
        } else if (data.data.total !== undefined) {
          // Fallback: calculate from total count
          setTotalPages(Math.ceil(data.data.total / itemsPerPage));
          setTotalUsers(data.data.total);
        } else {
          // Default: assume there might be more pages if we got a full page
          setTotalPages(loadedUsers.length === itemsPerPage ? 2 : 1);
          setTotalUsers(loadedUsers.length);
        }
      } else {
        console.warn('Unexpected response format:', data);
        setUsers([]);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      // Don't clear users on error, keep showing what we have
    } finally {
      setLoading(false);
    }
  }, [token, currentPage, itemsPerPage, roleFilter, statusFilter, searchTerm]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage, searchTerm, roleFilter, statusFilter]);

  const handleCreateUser = async (userData: Partial<User>) => {
    try {
      setLoading(true);

      if (!token) {
        console.error('Not authenticated');
        alert('Please log in to create users');
        return;
      }

      // Try to save to API
      const response = await fetch('/api/v1/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        // If API fails, save to local state as fallback
        console.warn(
          'Failed to save user to API, saving locally:',
          response.status
        );
        const newId = (allUsers.length + 1).toString();
        const newUser: User = {
          id: newId,
          name: userData.name || '',
          email: userData.email || '',
          role: userData.role || 'user',
          status: userData.status || 'active',
          created_at: new Date().toISOString(),
          api_keys_count: 0,
          total_requests: 0,
          last_login: undefined,
        };

        const updatedAllUsers = [...allUsers, newUser];
        setAllUsers(updatedAllUsers);

        if (
          searchTerm === '' &&
          roleFilter === 'all' &&
          statusFilter === 'all'
        ) {
          setUsers(prevUsers => [...prevUsers, newUser]);
        }
      } else {
        // Successfully saved, reload users
        await loadUsers();
      }
    } catch (error) {
      console.error('Error saving user:', error);
      // Fallback: save locally
      const newId = (allUsers.length + 1).toString();
      const newUser: User = {
        id: newId,
        name: userData.name || '',
        email: userData.email || '',
        role: userData.role || 'user',
        status: userData.status || 'active',
        created_at: new Date().toISOString(),
        api_keys_count: 0,
        total_requests: 0,
        last_login: undefined,
      };

      const updatedAllUsers = [...allUsers, newUser];
      setAllUsers(updatedAllUsers);

      if (searchTerm === '' && roleFilter === 'all' && statusFilter === 'all') {
        setUsers(prevUsers => [...prevUsers, newUser]);
      }
    } finally {
      setLoading(false);
      setShowCreateUser(false);
    }
  };

  const handleEditUser = async (userData: Partial<User> & { id: string }) => {
    try {
      setLoading(true);

      if (!token) {
        console.error('Not authenticated');
        alert('Please log in to edit users');
        return;
      }

      const response = await fetch('/api/v1/users', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update user');
      }

      // Successfully updated, reload users
      setEditingUser(null);
      await loadUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      alert(error instanceof Error ? error.message : 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    try {
      setIsDeleting(true);

      if (!token) {
        console.error('Not authenticated');
        alert('Please log in to delete users');
        return;
      }

      const response = await fetch(`/api/v1/users?id=${deletingUser.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }

      // Successfully deleted, close dialog first, then reload users
      setDeletingUser(null);
      // Wait a moment for dialog to close, then reload
      setTimeout(() => {
        loadUsers().catch(err => {
          console.error('Error reloading users after delete:', err);
        });
      }, 100);
    } catch (error) {
      console.error('Error deleting user:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete user');
      setIsDeleting(false);
    } finally {
      setIsDeleting(false);
    }
  };

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
    setUsers([]);
    setAllUsers([]);
  }, [searchTerm, roleFilter, statusFilter]);

  if (loading) {
    return (
      <PageLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Loading users...
            </p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[95%] px-4 pb-6 pt-2 sm:px-6 lg:px-8 xl:max-w-[98%]">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-3xl text-gray-900 dark:text-white">Users</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage user accounts and permissions
          </p>
        </div>

        {/* Filters */}
        <div className="card mb-6 border-0 !bg-transparent shadow-none">
          <div className="p-0">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm text-gray-700">
                  Search
                </label>
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
                  <input
                    type="text"
                    className="input !bg-transparent pl-10"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-gray-700">Role</label>
                <SelectDropdown
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={[
                    { value: 'all', label: 'All Roles' },
                    { value: 'user', label: 'User' },
                    { value: 'viewer', label: 'Viewer' },
                    { value: 'developer', label: 'Developer' },
                    { value: 'admin', label: 'Admin' },
                  ]}
                  className=""
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-gray-700">
                  Status
                </label>
                <SelectDropdown
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: 'all', label: 'All Status' },
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                    { value: 'pending', label: 'Pending' },
                  ]}
                  className=""
                />
              </div>

              <div className="flex items-end justify-end">
                <button
                  onClick={() => setShowCreateUser(true)}
                  className="rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-white dark:hover:bg-gray-800"
                >
                  + Add User
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="card">
          <div className="card-content p-0">
            {users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <UserGroupIcon className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-white">
                  No users found
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Get started by creating a new user.
                </p>
                <button
                  onClick={() => setShowCreateUser(true)}
                  className="mt-4 rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-white dark:hover:bg-gray-800"
                >
                  + Add User
                </button>
              </div>
            ) : (
              <div className="max-h-[600px] overflow-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-[#8c929e]">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-[#8c929e]">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-[#8c929e]">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-[#8c929e]">
                        API Keys
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-[#8c929e]">
                        Requests
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-[#8c929e]">
                        Last Login
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-[#8c929e]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-[#000000]">
                    {users.map(user => (
                      <tr key={user.id}>
                        <td className="whitespace-nowrap px-6 py-3">
                          <div className="flex items-center">
                            <UserAvatar user={user} />
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {user.name}
                              </div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {user.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-3">
                          <span className="text-sm capitalize text-gray-900 dark:text-white">
                            {user.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-3">
                          <div className="flex items-center">
                            <div
                              className={`mr-2 h-3 w-3 rounded-full ${
                                user.status === 'active'
                                  ? 'bg-green-400'
                                  : user.status === 'inactive'
                                    ? 'bg-red-400'
                                    : 'bg-yellow-400'
                              }`}
                            ></div>
                            <span className="text-sm capitalize text-gray-900 dark:text-white">
                              {user.status}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {user.api_keys_count}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {user.total_requests.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-500 dark:text-gray-400">
                          {user.last_login
                            ? new Date(user.last_login).toLocaleString(
                                'en-US',
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }
                              )
                            : 'Never'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-3 text-sm">
                          <div className="flex justify-end">
                            <Dropdown
                              trigger={
                                <button className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300">
                                  <EllipsisHorizontalIcon className="h-5 w-5" />
                                </button>
                              }
                              items={[
                                {
                                  label: 'View Details',
                                  icon: <EyeIcon className="h-4 w-4" />,
                                  onClick: () => setSelectedUser(user),
                                },
                                {
                                  label: 'Edit User',
                                  icon: <PencilIcon className="h-4 w-4" />,
                                  onClick: () => {
                                    setEditingUser(user);
                                  },
                                },
                                {
                                  label: 'Delete User',
                                  icon: <TrashIcon className="h-4 w-4" />,
                                  onClick: () => {
                                    setDeletingUser(user);
                                  },
                                  className:
                                    'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20',
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls - Bottom */}
            {users.length > 0 && (
              <div className="border-t border-gray-200 px-4 py-3 dark:border-[#242424]">
                <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                      {Math.min(currentPage * itemsPerPage, totalUsers)} of{' '}
                      {totalUsers} users
                    </span>
                    <SelectDropdown
                      value={itemsPerPage.toString()}
                      onChange={value => setItemsPerPage(parseInt(value))}
                      options={[
                        { value: '25', label: '25 per page' },
                        { value: '50', label: '50 per page' },
                        { value: '75', label: '75 per page' },
                        { value: '100', label: '100 per page' },
                      ]}
                      className="w-32"
                    />
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() =>
                        setCurrentPage(prev => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#242424] dark:bg-[#000000] dark:text-gray-300 dark:hover:bg-[#0d1117]"
                    >
                      Previous
                    </button>

                    {/* Page Numbers */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`min-w-[40px] rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            pageNum === currentPage
                              ? 'bg-purple-600 text-white'
                              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-[#242424] dark:bg-[#000000] dark:text-gray-300 dark:hover:bg-[#0d1117]'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}

                    <button
                      onClick={() =>
                        setCurrentPage(prev => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage >= totalPages}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#242424] dark:bg-[#000000] dark:text-gray-300 dark:hover:bg-[#0d1117]"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Create User Dialog */}
        <AddUserDialog
          isOpen={showCreateUser}
          onClose={() => setShowCreateUser(false)}
          onSubmit={handleCreateUser}
        />

        {/* Edit User Dialog */}
        <EditUserDialog
          isOpen={!!editingUser}
          onClose={() => setEditingUser(null)}
          onSubmit={handleEditUser}
          user={editingUser}
        />

        {/* Delete User Dialog */}
        <DeleteUserDialog
          isOpen={!!deletingUser}
          onClose={() => setDeletingUser(null)}
          onConfirm={handleDeleteUser}
          user={deletingUser}
          isDeleting={isDeleting}
        />
      </div>
    </PageLayout>
  );
}
