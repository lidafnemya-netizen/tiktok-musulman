import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Ban, CheckCircle, UserCog } from 'lucide-react';
import { api } from '../api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  gender: string;
  role: string;
  is_banned: boolean;
  ban_reason: string | null;
  follower_count: number;
  post_count: number;
  created_at: string;
}

export default function Users() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ items: User[] }>({
    queryKey: ['admin-users', debouncedSearch],
    queryFn: () => api.get('/admin/users', { params: { search: debouncedSearch || undefined, limit: 50 } }).then((r) => r.data),
  });

  const banMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/admin/users/${id}/ban`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const unbanMutation = useMutation({
    mutationFn: (id: string) => api.post(`/admin/users/${id}/unban`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => api.patch(`/admin/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const handlePromote = (user: User) => {
    const next = user.role === 'ADMIN' ? 'USER' : user.role === 'MODERATOR' ? 'ADMIN' : 'MODERATOR';
    if (window.confirm(`Change @${user.username} role from ${user.role} to ${next}?`)) {
      roleMutation.mutate({ id: user.id, role: next });
    }
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedSearch(v), 400);
  };

  const handleBan = (user: User) => {
    const reason = window.prompt(`Ban reason for @${user.username}:`);
    if (reason?.trim()) banMutation.mutate({ id: user.id, reason });
  };

  const roleBadge = (role: string) => {
    if (role === 'ADMIN') return <Badge>Admin</Badge>;
    if (role === 'MODERATOR') return <Badge variant="secondary">Mod</Badge>;
    return <span className="text-xs text-gray-600">User</span>;
  };

  return (
    <div className="p-6 space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.items.length ?? 0} accounts
          </p>
        </div>
        <div className="relative w-56">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <Input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search users..."
            className="pl-8"
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.02]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Posts</TableHead>
              <TableHead>Followers</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data?.items.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-600/30 border border-white/10 flex items-center justify-center text-xs font-bold text-indigo-300 shrink-0">
                      {user.display_name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{user.display_name}</p>
                      <p className="text-xs text-gray-600">@{user.username}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-gray-400 text-xs">{user.email}</TableCell>
                <TableCell className="text-gray-500 text-xs capitalize">{user.gender.toLowerCase()}</TableCell>
                <TableCell>{roleBadge(user.role)}</TableCell>
                <TableCell className="text-gray-400">{user.post_count}</TableCell>
                <TableCell className="text-gray-400">{user.follower_count.toLocaleString()}</TableCell>
                <TableCell>
                  {user.is_banned ? (
                    <Badge variant="destructive">Banned</Badge>
                  ) : (
                    <Badge variant="success">Active</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {user.is_banned ? (
                      <Button variant="ghost" size="icon" onClick={() => unbanMutation.mutate(user.id)} title="Unban" className="h-7 w-7 hover:text-emerald-400">
                        <CheckCircle size={13} />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => handleBan(user)} title="Ban" className="h-7 w-7 hover:text-red-400">
                        <Ban size={13} />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => handlePromote(user)} title="Change role" className="h-7 w-7 hover:text-indigo-400">
                      <UserCog size={13} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && !data?.items.length && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-600 py-12">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
