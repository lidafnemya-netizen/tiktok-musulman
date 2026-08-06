import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { RootStackParamList } from '../../navigation';
import { Avatar } from '../../components/ui/Avatar';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../../constants/theme';
import { IcHeart, IcHeartFill, IcComment, IcShare, IcClose, IcPlus } from '../../components/ui/Icons';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Thread {
  id: string;
  content: string;
  like_count: number;
  reply_count: number;
  repost_count: number;
  is_liked: boolean;
  is_reposted?: boolean;
  created_at: string;
  user: { id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean };
}

interface ThreadsPage { items: Thread[]; next_cursor: string | null }

function fmtTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'maintenant';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}j`;
}

function ThreadItem({ item, onUserPress }: { item: Thread; onUserPress: () => void }) {
  const [liked, setLiked] = useState(item.is_liked);
  const [likeCount, setLikeCount] = useState(item.like_count);
  const [reposted, setReposted] = useState(!!item.is_reposted);
  const [repostCount, setRepostCount] = useState(item.repost_count);

  const likeMutation = useMutation({
    mutationFn: () => api.post(`/threads/${item.id}/like`),
    onMutate: () => {
      const wasLiked = liked;
      setLiked(!wasLiked);
      setLikeCount((c) => (wasLiked ? c - 1 : c + 1));
    },
    onError: () => {
      setLiked(item.is_liked);
      setLikeCount(item.like_count);
    },
  });

  const repostMutation = useMutation({
    mutationFn: () => api.post(`/posts/${item.id}/repost`),
    onMutate: () => {
      const was = reposted;
      setReposted(!was);
      setRepostCount((c) => (was ? c - 1 : c + 1));
    },
    onError: () => {
      setReposted(!!item.is_reposted);
      setRepostCount(item.repost_count);
    },
  });

  return (
    <View style={styles.threadCard}>
      <View style={styles.threadLeft}>
        <TouchableOpacity onPress={onUserPress} activeOpacity={0.8}>
          <Avatar uri={item.user.avatar_url} name={item.user.display_name} size={40} verified={item.user.is_verified} />
        </TouchableOpacity>
        <View style={styles.threadLine} />
      </View>

      <View style={styles.threadRight}>
        <View style={styles.threadMeta}>
          <TouchableOpacity onPress={onUserPress} activeOpacity={0.8}>
            <Text style={styles.threadName}>{item.user.display_name}</Text>
          </TouchableOpacity>
          <Text style={styles.threadUsername}>@{item.user.username}</Text>
          <Text style={styles.threadDot}>·</Text>
          <Text style={styles.threadTime}>{fmtTime(item.created_at)}</Text>
        </View>

        <Text style={styles.threadContent}>{item.content}</Text>

        <View style={styles.threadActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => likeMutation.mutate()} activeOpacity={0.7}>
            {liked ? <IcHeartFill size={18} /> : <IcHeart size={18} color={COLORS.textMuted} />}
            {likeCount > 0 && <Text style={[styles.actionCount, liked && styles.actionCountLiked]}>{likeCount}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7}>
            <IcComment size={18} color={COLORS.textMuted} />
            {item.reply_count > 0 && <Text style={styles.actionCount}>{item.reply_count}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => repostMutation.mutate()} activeOpacity={0.7}>
            <IcShare size={18} color={reposted ? COLORS.primary : COLORS.textMuted} />
            {repostCount > 0 && <Text style={[styles.actionCount, reposted && { color: COLORS.primary }]}>{repostCount}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function ThreadsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [compose, setCompose] = useState('');
  const [composing, setComposing] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch, isRefetching } =
    useInfiniteQuery({
      queryKey: ['threads'],
      queryFn: ({ pageParam }) =>
        api.get('/threads', { params: { cursor: pageParam, limit: 15 } })
          .then((r) => r.data as ThreadsPage)
          .catch(() => ({ items: [], next_cursor: null } as ThreadsPage)),
      initialPageParam: null as string | null,
      getNextPageParam: (last) => last.next_cursor,
    });

  const threads = data?.pages.flatMap((p) => p.items) ?? [];

  const postMutation = useMutation({
    mutationFn: (content: string) => api.post('/threads', { content }),
    onSuccess: () => {
      setCompose('');
      setComposing(false);
      qc.invalidateQueries({ queryKey: ['threads'] });
    },
    onError: () => Alert.alert('Erreur', 'Impossible de publier ce fil.'),
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Fils</Text>
        <TouchableOpacity
          style={styles.composeBtn}
          onPress={() => setComposing((v) => !v)}
          activeOpacity={0.8}
        >
          {composing ? <IcClose size={16} color={COLORS.primary} /> : <IcPlus size={16} color={COLORS.primary} />}
        </TouchableOpacity>
      </View>

      {/* Compose box */}
      {composing && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.composeBox}>
            <Avatar uri={user?.avatar_url ?? null} name={user?.display_name ?? 'U'} size={36} />
            <TextInput
              style={styles.composeInput}
              value={compose}
              onChangeText={setCompose}
              placeholder="Quoi de nouveau ?"
              placeholderTextColor={COLORS.textPlaceholder}
              multiline
              maxLength={280}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.postBtn, (!compose.trim() || postMutation.isPending) && styles.postBtnDisabled]}
              onPress={() => compose.trim() && postMutation.mutate(compose.trim())}
              disabled={!compose.trim() || postMutation.isPending}
              activeOpacity={0.8}
            >
              <Text style={styles.postBtnText}>Publier</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Feed */}
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ThreadItem
            item={item}
            onUserPress={() =>
              navigation.navigate('UserProfile', { userId: item.user.id, username: item.user.username })
            }
          />
        )}
        onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} />
        }
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>≡</Text>
              <Text style={styles.emptyTitle}>Aucun fil pour l'instant</Text>
              <Text style={styles.emptySubtitle}>Soyez le premier à publier !</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => setComposing(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyBtnText}>Écrire un fil</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
  },
  headerTitle: { fontSize: FONT.size.xl, fontWeight: FONT.weight.bold, color: COLORS.text },
  composeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  composeBtnText: { fontSize: 16, color: COLORS.primary },

  composeBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.white, padding: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  composeInput: {
    flex: 1, fontSize: FONT.size.base, color: COLORS.text,
    minHeight: 60, textAlignVertical: 'top',
    paddingTop: 2,
  },
  postBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
    paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-end',
  },
  postBtnDisabled: { opacity: 0.4 },
  postBtnText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.white },

  listContent: { paddingBottom: 32 },

  threadCard: {
    flexDirection: 'row', gap: 12,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: 4,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  threadLeft: { alignItems: 'center', gap: 4 },
  threadLine: { width: 1.5, flex: 1, backgroundColor: COLORS.borderLight, minHeight: 20, marginTop: 4 },
  threadRight: { flex: 1, paddingBottom: SPACING.sm },

  threadMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 4 },
  threadName: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.text },
  threadUsername: { fontSize: FONT.size.xs, color: COLORS.textMuted },
  threadDot: { fontSize: FONT.size.xs, color: COLORS.textSubtle },
  threadTime: { fontSize: FONT.size.xs, color: COLORS.textSubtle },

  threadContent: { fontSize: FONT.size.base, color: COLORS.text, lineHeight: 22, marginBottom: SPACING.sm },

  threadActions: { flexDirection: 'row', gap: SPACING.md },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  actionIcon: { fontSize: 18, color: COLORS.textMuted },
  actionIconLiked: { color: COLORS.like },
  actionCount: { fontSize: FONT.size.xs, color: COLORS.textMuted },
  actionCountLiked: { color: COLORS.like },

  emptyWrap: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48, color: COLORS.primaryLight, marginBottom: 8 },
  emptyTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold, color: COLORS.text },
  emptySubtitle: { fontSize: FONT.size.sm, color: COLORS.textMuted },
  emptyBtn: {
    marginTop: SPACING.md, backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full, paddingHorizontal: 24, paddingVertical: 10,
  },
  emptyBtnText: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.white },
});
