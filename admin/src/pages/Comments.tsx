import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface CommentItem {
  id: string;
  content: string;
  created_at: string;
  user: { id: string; username: string; display_name: string };
  post: { id: string; caption: string | null } | null;
}

export default function Comments() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ items: CommentItem[] }>({
    queryKey: ['admin-comments', debounced],
    queryFn: () => api.get('/admin/comments', { params: { search: debounced || undefined, limit: 50 } }).then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-comments'] }),
  });

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(v), 400);
  };

  const handleDelete = (c: CommentItem) => {
    if (window.confirm(`Delete this comment by @${c.user.username}?`)) {
      deleteMutation.mutate(c.id);
    }
  };

  return (
    <div className="p-6 space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Comments</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.items.length ?? 0} comments</p>
        </div>
        <div className="relative w-56">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <Input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Search comments..." className="pl-8" />
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] overflow-hidden bg-white/[0.02]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Comment</TableHead>
              <TableHead>Post</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data?.items.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <p className="text-sm font-medium text-white">{c.user.display_name}</p>
                  <p className="text-xs text-gray-600">@{c.user.username}</p>
                </TableCell>
                <TableCell className="text-gray-300 text-sm max-w-md truncate">{c.content}</TableCell>
                <TableCell className="text-gray-500 text-xs max-w-xs truncate">{c.post?.caption ?? '—'}</TableCell>
                <TableCell className="text-gray-600 text-xs">{new Date(c.created_at).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(c)} title="Delete" className="h-7 w-7 hover:text-red-400">
                    <Trash2 size={13} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && !data?.items.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-600 py-12">No comments found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
