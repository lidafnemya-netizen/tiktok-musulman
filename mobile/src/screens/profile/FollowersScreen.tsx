import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator,
} from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../hooks/useTheme';
import { COLORS, FONT, SPACING, RADIUS } from '../../constants/theme';
import { IcBack, IcCheck } from '../../components/ui/Icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Followers'>;

interface UserItem {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  follower_count: number;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n ?? 0);
}

export default function FollowersScreen({ route, navigation }: Props) {
  const { userId, username, type } = route.params;
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user: me } = useAuthStore();
  const qc = useQueryClient();
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: [type, userId],
    queryFn: ({ pageParam }) =>
      api.get(`/users/${userId}/${type}`, { params: { cursor: pageParam, limit: 30 } })
        .then(r => r.data as { items: UserItem[]; next_cursor: string | null }),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.next_cursor,
  });

  const items = data?.pages.flatMap(p => p.items) ?? [];

  const followMutation = useMutation({
    mutationFn: (targetId: string) => api.post(`/users/${targetId}/follow`),
    onMutate: (targetId) => {
      setFollowed(prev => {
        const next = new Set(prev);
        if (next.has(targetId)) next.delete(targetId);
        else next.add(targetId);
        return next;
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <IcBack size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>
          {type === 'followers' ? `Abonnés de @${username}` : `Abonnements de @${username}`}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primaryLight} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={u => u.id}
          contentContainerStyle={{ paddingVertical: SPACING.sm }}
          showsVerticalScrollIndicator={false}
          onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
          onEndReachedThreshold={0.4}
          renderItem={({ item: u }) => {
            const isMe = u.id === me?.id;
            const isFollowed = followed.has(u.id);
            return (
              <TouchableOpacity
                style={[styles.row, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}
                onPress={() => navigation.navigate('UserProfile', { userId: u.id, username: u.username })}
                activeOpacity={0.7}
              >
                {u.avatar_url ? (
                  <Image source={{ uri: u.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={[styles.avatarInitial, { color: COLORS.primary }]}>
                      {u.display_name[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.info}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.displayName, { color: theme.text }]} numberOfLines={1}>
                      {u.display_name}
                    </Text>
                    {u.is_verified && (
                      <View style={styles.verifiedBadge}>
                        <IcCheck size={9} color="#fff" strokeWidth={3} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.sub, { color: theme.textMuted }]}>
                    @{u.username} · {fmtNum(u.follower_count)} abonnés
                  </Text>
                </View>
                {!isMe && (
                  <TouchableOpacity
                    style={[styles.followBtn, isFollowed && { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }]}
                    onPress={() => followMutation.mutate(u.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.followBtnText, isFollowed && { color: theme.text }]}>
                      {isFollowed ? 'Abonné' : 'Suivre'}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                {type === 'followers' ? 'Aucun abonné' : 'Aucun abonnement'}
              </Text>
            </View>
          }
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={COLORS.primaryLight} style={{ padding: 16 }} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: 1, gap: 12,
  },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 18, fontWeight: FONT.weight.bold },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  displayName: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, flexShrink: 1 },
  verifiedBadge: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  sub: { fontSize: FONT.size.xs, marginTop: 1 },
  followBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
    paddingHorizontal: 16, paddingVertical: 7,
  },
  followBtnText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: FONT.size.base },
});
