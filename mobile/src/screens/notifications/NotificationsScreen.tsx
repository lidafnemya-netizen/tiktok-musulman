import React, { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart, MessageCircle, UserPlus, Bookmark, AtSign, Bell, Check } from 'lucide-react-native';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { useTheme } from '../../hooks/useTheme';
import { COLORS, FONT, SPACING, RADIUS } from '../../constants/theme';
import { IcBack } from '../../components/ui/Icons';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  data?: { post_id?: string; user_id?: string; comment_id?: string; session_id?: string };
}

type Tab = 'all' | 'likes' | 'comments' | 'follows';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all',      label: 'Tous' },
  { key: 'likes',    label: 'Like' },
  { key: 'comments', label: 'Commentaires' },
  { key: 'follows',  label: 'Abonnés' },
];

const TAB_TYPES: Record<Tab, string[]> = {
  all:      [],
  likes:    ['LIKE'],
  comments: ['COMMENT', 'MENTION'],
  follows:  ['FOLLOW'],
};

const TYPE_META: Record<string, { icon: any; color: string; bg: string }> = {
  LIKE:                     { icon: Heart,          color: '#FF3B5C', bg: '#FEE2E2' },
  COMMENT:                  { icon: MessageCircle,  color: '#3B82F6', bg: '#DBEAFE' },
  FOLLOW:                   { icon: UserPlus,       color: COLORS.primary, bg: COLORS.primaryBg },
  SAVE:                     { icon: Bookmark,       color: '#8B5CF6', bg: '#EDE9FE' },
  MENTION:                  { icon: AtSign,         color: '#F59E0B', bg: '#FEF3C7' },
  MESSAGE_REQUEST:          { icon: MessageCircle,  color: '#06B6D4', bg: '#CFFAFE' },
  MESSAGE_REQUEST_ACCEPTED: { icon: Check,          color: COLORS.primary, bg: COLORS.primaryBg },
  LIVE_START:               { icon: Bell,           color: '#FF3B30', bg: '#FFE5E5' },
  SYSTEM:                   { icon: Bell,           color: '#6B7280', bg: '#F3F4F6' },
};

function fmtTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}j`;
}

export default function NotificationsScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('all');

  const { data, isLoading, refetch, isRefetching } = useQuery<{ items: Notification[] }>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data).catch(() => ({ items: [] })),
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
  });

  const readAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-unread'] });
    },
  });

  const markRead = (notif: Notification) => {
    api.patch(`/notifications/${notif.id}/read`).catch(() => {});
    qc.setQueryData(['notifications'], (old: any) => old ? {
      ...old, items: old.items.map((n: Notification) =>
        n.id === notif.id ? { ...n, is_read: true } : n),
    } : old);
    qc.invalidateQueries({ queryKey: ['notif-unread'] });

    const postId = notif.data?.post_id;
    const userId = notif.data?.user_id;
    const sessionId = notif.data?.session_id;

    if (sessionId && notif.type === 'LIVE_START') {
      nav.navigate('LiveViewer', { sessionId, broadcasterId: userId ?? '' });
    } else if (postId && ['LIKE', 'COMMENT', 'SAVE', 'MENTION'].includes(notif.type)) {
      nav.navigate('VideoPlayer', { postId });
    } else if (userId) {
      nav.navigate('UserProfile', { userId, username: '' });
    }
  };

  const allNotifs = data?.items ?? [];
  const typeFilter = TAB_TYPES[activeTab];
  const filtered = typeFilter.length === 0 ? allNotifs
    : allNotifs.filter(n => typeFilter.includes(n.type));
  const unread = allNotifs.filter(n => !n.is_read).length;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <IcBack size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
        {unread > 0 ? (
          <TouchableOpacity onPress={() => readAllMutation.mutate()} style={styles.markAllBtn} disabled={readAllMutation.isPending}>
            <Text style={styles.markAllText}>Tout lire</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 68 }} />}
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        {TABS.map(t => {
          const tabCount = t.key === 'all' ? unread
            : allNotifs.filter(n => !n.is_read && TAB_TYPES[t.key].includes(n.type)).length;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, activeTab === t.key && styles.tabActive]}
              onPress={() => setActiveTab(t.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabLabel, { color: activeTab === t.key ? COLORS.primary : theme.textMuted },
                activeTab === t.key && styles.tabLabelActive]}>
                {t.label}
              </Text>
              {tabCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{tabCount > 9 ? '9+' : tabCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primaryLight} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={n => n.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} />}
          renderItem={({ item: n }) => {
            const meta = TYPE_META[n.type] ?? TYPE_META.SYSTEM;
            return (
              <TouchableOpacity
                style={[
                  styles.row,
                  { borderBottomColor: theme.borderLight },
                  !n.is_read && { backgroundColor: theme.primaryBg },
                ]}
                onPress={() => markRead(n)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
                  <meta.icon size={19} color={meta.color} strokeWidth={1.8} />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowTitle, { color: theme.text }]}>{n.title}</Text>
                  <Text style={[styles.rowBody, { color: theme.textMuted }]} numberOfLines={2}>{n.body}</Text>
                  <Text style={[styles.rowTime, { color: theme.textSubtle }]}>{fmtTime(n.created_at)}</Text>
                </View>
                {!n.is_read && <View style={[styles.dot, { backgroundColor: COLORS.primary }]} />}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Bell size={42} color={theme.textSubtle} strokeWidth={1.5} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Aucune notification</Text>
              <Text style={[styles.emptySub, { color: theme.textMuted }]}>
                {activeTab === 'all' ? 'Tes notifications apparaîtront ici'
                  : activeTab === 'likes' ? 'Aucun j\'aime pour l\'instant'
                  : activeTab === 'comments' ? 'Aucun commentaire pour l\'instant'
                  : 'Aucun nouvel abonné pour l\'instant'}
              </Text>
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
    paddingHorizontal: SPACING.md, paddingVertical: 8, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '700' },
  markAllBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  markAllText: { fontSize: FONT.size.sm, color: COLORS.primary, fontWeight: FONT.weight.semibold },

  tabs: {
    flexDirection: 'row', borderBottomWidth: 1,
    paddingHorizontal: SPACING.sm,
  },
  tab: {
    flex: 1, paddingVertical: 11, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabLabel: { fontSize: 12, fontWeight: FONT.weight.medium },
  tabLabelActive: { color: COLORS.primary, fontWeight: FONT.weight.semibold },
  tabBadge: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeText: { fontSize: 9, fontWeight: FONT.weight.bold, color: '#fff' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  iconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowInfo: { flex: 1, gap: 2 },
  rowTitle: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, lineHeight: 18 },
  rowBody: { fontSize: FONT.size.xs, lineHeight: 16 },
  rowTime: { fontSize: 11, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  empty: { alignItems: 'center', paddingTop: 70, gap: 10 },
  emptyTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold },
  emptySub: { fontSize: FONT.size.sm, textAlign: 'center', paddingHorizontal: 40 },
});
