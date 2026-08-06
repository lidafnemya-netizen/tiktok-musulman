import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, Switch, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../hooks/useTheme';
import { COLORS, FONT, SPACING, RADIUS } from '../../constants/theme';
import { IcBack, IcEye } from '../../components/ui/Icons';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Viewer {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  viewed_at: string;
  is_new: boolean;
}

interface ProfileViewsResponse {
  enabled: boolean;
  count: number;
  items: Viewer[];
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

export default function ProfileViewsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user, updateUser } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<ProfileViewsResponse>({
    queryKey: ['profile-views'],
    queryFn: () => api.get('/users/me/profile-views').then(r => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => api.patch('/users/me/profile-view-setting', { enabled }),
    onMutate: (enabled) => updateUser({ profile_view_enabled: enabled }),
    onSettled: () => { qc.invalidateQueries({ queryKey: ['profile-views'] }); refetch(); },
  });

  const enabled = user?.profile_view_enabled ?? false;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={{ height: insets.top, backgroundColor: theme.surface }} />
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <IcBack size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Vues du profil</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.toggleRow, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.toggleTitle, { color: theme.text }]}>Voir qui a visité ton profil</Text>
          <Text style={[styles.toggleSub, { color: theme.textMuted }]}>
            Si tu actives, tes propres visites de profils redeviennent visibles aux autres.
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={(v) => toggleMutation.mutate(v)}
          trackColor={{ true: theme.tabActive, false: theme.border }}
        />
      </View>

      {!enabled ? (
        <View style={styles.emptyWrap}>
          <IcEye size={40} color={theme.textSubtle} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Fonctionnalité désactivée</Text>
          <Text style={[styles.emptySub, { color: theme.textMuted }]}>
            Active l'option ci-dessus pour voir qui a visité ton profil récemment.
          </Text>
        </View>
      ) : isLoading ? (
        <ActivityIndicator color={COLORS.primaryLight} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(v) => v.id}
          ListHeaderComponent={
            <Text style={[styles.countLabel, { color: theme.textMuted }]}>
              {data?.count ?? 0} visite{(data?.count ?? 0) !== 1 ? 's' : ''} · 30 derniers jours
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, item.is_new && { backgroundColor: theme.primaryBg }]}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('UserProfile', { userId: item.id, username: item.username })}
            >
              {item.avatar_url
                ? <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                : <View style={[styles.avatar, { backgroundColor: theme.primaryBg, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: theme.tabActive }}>{item.display_name[0]?.toUpperCase()}</Text>
                  </View>
              }
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.text }]}>{item.display_name}</Text>
                <Text style={[styles.username, { color: theme.textMuted }]}>@{item.username}</Text>
              </View>
              <Text style={[styles.time, { color: theme.textSubtle }]}>{timeAgo(item.viewed_at)}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Aucune visite récente</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SPACING.md, paddingVertical: 14, borderBottomWidth: 1,
  },
  toggleTitle: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  toggleSub: { fontSize: FONT.size.xs, marginTop: 3, lineHeight: 16 },

  countLabel: { fontSize: FONT.size.xs, paddingHorizontal: SPACING.md, paddingVertical: 10 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SPACING.md, paddingVertical: 10,
  },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  name: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  username: { fontSize: FONT.size.xs, marginTop: 1 },
  time: { fontSize: FONT.size.xs },

  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 8, paddingHorizontal: SPACING.xl },
  emptyTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  emptySub: { fontSize: FONT.size.sm, textAlign: 'center', lineHeight: 20 },
});
