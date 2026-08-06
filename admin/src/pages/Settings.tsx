import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface SettingsData {
  total_users: number;
  version: string;
  features: Record<string, boolean>;
}

export default function Settings() {
  const { data, isLoading } = useQuery<SettingsData>({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/admin/settings').then((r) => r.data),
  });

  return (
    <div className="p-6 space-y-6 animate-slide-up">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Global app configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Platform</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">App version</span>
              <span className="text-white font-medium">{data?.version}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Total registered users</span>
            <span className="text-white font-medium">{isLoading ? <Skeleton className="h-4 w-12" /> : data?.total_users}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feature flags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
          ) : (
            Object.entries(data?.features ?? {}).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-gray-400 capitalize">{key.replace(/_/g, ' ')}</span>
                <Badge variant={val ? 'success' : 'secondary'}>{val ? 'Enabled' : 'Disabled'}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gender messaging rule</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 leading-relaxed">
            Un homme ne peut pas initier de DM vers une femme (sauf si elle a envoyé une demande en premier),
            et inversement. Règle appliquée côté API dans <code className="text-gray-300">POST /messages/conversation-request</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
