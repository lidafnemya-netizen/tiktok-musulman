import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, SPACING, RADIUS } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { IcBack, IcUsers } from '../../components/ui/Icons';

type Props = NativeStackScreenProps<RootStackParamList, 'LiveList'>;

interface LiveSession {
  id: string;
  title: string;
  category: string;
  viewer_count: number;
  thumbnail_url: string | null;
  user: { id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean };
}

function fmtNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export default function LiveListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const { data, isLoading, refetch, isRefetching } = useQuery<{ items: LiveSession[] }>({
    queryKey: ['live-active-list'],
    queryFn: () => api.get('/live/active').then(r => r.data).catch(() => ({ items: [] })),
    refetchInterval: 15_000,
  });

  const lives = data?.items ?? [];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <IcBack size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.liveDot} />
          <Text style={[styles.headerTitle, { color: theme.text }]}>Lives en cours</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.primaryLight} style={{ marginTop: 60 }} />
      ) : lives.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyDot} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Aucun live en cours</Text>
          <Text style={[styles.emptySub, { color: theme.textMuted }]}>Sois le premier à démarrer un live !</Text>
        </View>
      ) : (
        <FlatList
          data={lives}
          keyExtractor={l => l.id}
          contentContainerStyle={{ padding: SPACING.md, gap: 12 }}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
          renderItem={({ item: live }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: theme.surface }]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('LiveViewer', { sessionId: live.id, broadcasterId: live.user.id })}
            >
              {/* Thumbnail / avatar background */}
              <View style={styles.thumbWrap}>
                {live.thumbnail_url ? (
                  <Image source={{ uri: live.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
                ) : live.user.avatar_url ? (
                  <Image source={{ uri: live.user.avatar_url }} style={[styles.thumb, { opacity: 0.5 }]} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbFallback]} />
                )}
                <View style={styles.liveBadge}>
                  <View style={styles.liveBadgeDot} />
                  <Text style={styles.liveBadgeText}>EN DIRECT</Text>
                </View>
                <View style={styles.viewerBadge}>
                  <IcUsers size={11} color={COLORS.white} />
                  <Text style={styles.viewerCount}>{fmtNum(live.viewer_count)}</Text>
                </View>
              </View>

              {/* Info */}
              <View style={styles.info}>
                <View style={styles.userRow}>
                  {live.user.avatar_url ? (
                    <Image source={{ uri: live.user.avatar_url }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarInitial}>{live.user.display_name[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.displayName, { color: theme.text }]} numberOfLines={1}>
                      {live.user.display_name}
                    </Text>
                    <Text style={[styles.username, { color: theme.textMuted }]}>@{live.user.username}</Text>
                  </View>
                </View>
                <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>{live.title}</Text>
                <View style={[styles.catBadge, { backgroundColor: COLORS.primaryBg }]}>
                  <Text style={[styles.catText, { color: COLORS.primary }]}>{live.category}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30' },
  headerTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF3B3020' },
  emptyTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold },
  emptySub: { fontSize: FONT.size.sm },

  card: { borderRadius: RADIUS.lg, overflow: 'hidden' },
  thumbWrap: { width: '100%', aspectRatio: 16 / 9, position: 'relative' },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { backgroundColor: COLORS.primaryBg },
  liveBadge: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FF3B30', borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  liveBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.white },
  liveBadgeText: { fontSize: 10, fontWeight: FONT.weight.bold, color: COLORS.white, letterSpacing: 0.5 },
  viewerBadge: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  viewerCount: { fontSize: 11, fontWeight: FONT.weight.semibold, color: COLORS.white },

  info: { padding: SPACING.md, gap: 8 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: {
    backgroundColor: COLORS.primaryBg, borderWidth: 1.5, borderColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 14, fontWeight: FONT.weight.bold, color: COLORS.primary },
  displayName: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  username: { fontSize: FONT.size.xs },
  title: { fontSize: FONT.size.base, fontWeight: FONT.weight.medium, lineHeight: 20 },
  catBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.full },
  catText: { fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold },
});
