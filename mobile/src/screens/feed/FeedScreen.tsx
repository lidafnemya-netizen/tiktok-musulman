import React, { useState, useCallback, useRef } from 'react';
import {
  View, FlatList, StyleSheet, Text, TouchableOpacity,
  StatusBar, Dimensions, ViewToken, ScrollView, Image,
  RefreshControl, Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useInfiniteQuery, useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { VideoPlayerItem, FeedPost } from '../../components/video/VideoPlayerItem';
import { CommentsBottomSheet } from '../../components/video/CommentsBottomSheet';
import { BookCard, BookItem } from '../../components/books/BookCard';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../../constants/theme';
import { IcFilm, IcUsers, IcSearch, IcLive, IcHeartFill, IcHeart, IcComment, IcShare, IcClose, IcPlus } from '../../components/ui/Icons';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../hooks/useTheme';
import { Skeleton } from '../../components/ui/Skeleton';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const { height: H } = Dimensions.get('window');

type FeedTab = 'communaute' | 'proche' | 'suivis' | 'boutique' | 'pourtoi' | 'fils';

interface LiveSession {
  id: string;
  title: string;
  viewer_count: number;
  thumbnail_url: string | null;
  user: { id: string; username: string; display_name: string; avatar_url: string | null };
}

interface ThreadItem {
  id: string;
  content: string;
  like_count: number;
  reply_count: number;
  repost_count: number;
  is_liked: boolean;
  is_reposted?: boolean;
  created_at: string;
  user: { id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean };
  thumbnail_url?: string | null;
  media_urls?: string[];
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const isFocused = useIsFocused();
  const [tab, setTab] = useState<FeedTab>('pourtoi');
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set());
  const hidePost = useCallback((id: string) => setHiddenPostIds(prev => new Set([...prev, id])), []);

  // Height = actual FlatList rendered height (measured via onLayout — avoids calculation bugs)
  const tabBarHeight = useBottomTabBarHeight();
  const [listHeight, setListHeight] = React.useState(H - tabBarHeight);
  const ITEM_H = listHeight > 100 ? listHeight : H - tabBarHeight;

  // Pause all videos when leaving this screen
  const effectiveVisibleId = isFocused && (tab === 'pourtoi' || tab === 'suivis') ? visibleId : null;
  const seenIds = useRef<string[]>([]);

  // ── Pour Toi (video feed) ────────────────────────────────────────────────────
  const {
    data: feedData, fetchNextPage: fetchNextFeed,
    hasNextPage: hasNextFeed, isFetchingNextPage: fetchingFeed,
    isLoading: loadingFeed, refetch: refetchFeed, isRefetching: refreshingFeed,
  } = useInfiniteQuery({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) =>
      api.get('/posts/feed', {
        params: { cursor: pageParam, limit: 5, seen: seenIds.current.slice(-20).join(',') },
      }).then(r => r.data as { items: FeedPost[]; next_cursor: string | null }),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.next_cursor,
  });

  // ── Suivis (following feed) ──────────────────────────────────────────────────
  const {
    data: suivisData, fetchNextPage: fetchNextSuivis,
    hasNextPage: hasNextSuivis, isFetchingNextPage: fetchingSuivis,
    isLoading: loadingSuivis, refetch: refetchSuivis, isRefetching: refreshingSuivis,
  } = useInfiniteQuery({
    queryKey: ['following-feed'],
    queryFn: ({ pageParam }) =>
      api.get('/posts/following', {
        params: { cursor: pageParam, limit: 8 },
      }).then(r => r.data as { items: FeedPost[]; next_cursor: string | null })
        .catch(() => ({ items: [], next_cursor: null })),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.next_cursor,
    enabled: tab === 'suivis',
  });

  // ── Fils (threads) ───────────────────────────────────────────────────────────
  const {
    data: threadsData, fetchNextPage: fetchNextThreads,
    hasNextPage: hasNextThreads, isFetchingNextPage: fetchingThreads,
    isLoading: loadingThreads, refetch: refetchThreads,
  } = useInfiniteQuery({
    queryKey: ['threads'],
    queryFn: ({ pageParam }) =>
      api.get('/threads', { params: { cursor: pageParam, limit: 15 } })
        .then(r => r.data as { items: ThreadItem[]; next_cursor: string | null })
        .catch(() => ({ items: [], next_cursor: null })),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.next_cursor,
  });

  const rawPosts = feedData?.pages.flatMap(p => p.items) ?? [];
  const threads  = threadsData?.pages.flatMap(p => p.items) ?? [];

  // Books feed (fetch once, inject every 3 videos)
  const { data: booksData } = useInfiniteQuery({
    queryKey: ['books-feed'],
    queryFn: ({ pageParam }) => api.get('/books/feed', { params: { cursor: pageParam, limit: 10 } }).then(r => r.data as { items: BookItem[]; next_cursor: string | null }).catch(() => ({ items: [], next_cursor: null })),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.next_cursor,
  });
  const books = booksData?.pages.flatMap(p => p.items) ?? [];

  // Communauté — trending posts
  const {
    data: communauteData, fetchNextPage: fetchNextCommunaute,
    hasNextPage: hasNextCommunaute, isFetchingNextPage: fetchingCommunaute,
    isLoading: loadingCommunaute, refetch: refetchCommunaute,
  } = useInfiniteQuery({
    queryKey: ['trending-feed'],
    queryFn: ({ pageParam }) =>
      api.get('/posts/trending', { params: { cursor: pageParam, limit: 8 } })
        .then(r => r.data as { items: FeedPost[]; next_cursor: string | null })
        .catch(() => ({ items: [], next_cursor: null })),
    initialPageParam: null as string | null,
    getNextPageParam: last => last.next_cursor,
    enabled: tab === 'communaute',
  });

  // Active lives (refreshes every 30s)
  const { data: livesData } = useQuery<{ items: LiveSession[] }>({
    queryKey: ['feed-live-active'],
    queryFn: () => api.get('/live/active', { params: { limit: 10 } }).then(r => r.data).catch(() => ({ items: [] })),
    refetchInterval: 30_000,
  });
  const lives = livesData?.items ?? [];

  // Mix: 1 book every 3 videos + 1 live card every 4 videos
  type FeedItem = { type: 'video'; data: FeedPost } | { type: 'book'; data: BookItem } | { type: 'live'; data: LiveSession };
  const posts: FeedItem[] = [];
  let bookIdx = 0;
  let liveIdx = 0;
  rawPosts.forEach((post, i) => {
    posts.push({ type: 'video', data: post });
    if ((i + 1) % 4 === 0 && liveIdx < lives.length) {
      posts.push({ type: 'live', data: lives[liveIdx++] });
    } else if ((i + 1) % 3 === 0 && bookIdx < books.length) {
      posts.push({ type: 'book', data: books[bookIdx++] });
    }
  });

  // Auto-set first visible video when feed loads
  React.useEffect(() => {
    if (posts.length > 0 && visibleId === null) {
      const first = posts[0];
      setVisibleId(first.type === 'video' ? first.data.id : null);
    }
  }, [posts.length]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0) {
        const feedItem = viewableItems[0].item as FeedItem | undefined;
        const id = feedItem?.type === 'video' ? feedItem.data.id : undefined;
        setVisibleId(id ?? null);
        if (id && !seenIds.current.includes(id)) seenIds.current.push(id);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  });

  // Tap "Pour toi" again while already on it → refresh feed
  const handlePourToiPress = useCallback(() => {
    if (tab === 'pourtoi') { seenIds.current = []; refetchFeed(); }
    else setTab('pourtoi');
  }, [tab, refetchFeed]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* Header overlay */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        {/* Live — far left, plain icon, no circle/badge */}
        <TouchableOpacity
          style={[styles.liveInlineBtn, { top: insets.top + 2 }]}
          onPress={() => nav.navigate('LiveList' as any)}
          activeOpacity={0.8}
        >
          <IcLive size={18} color={lives.length > 0 ? '#FF3B30' : 'rgba(255,255,255,0.55)'} />
        </TouchableOpacity>

        <View style={styles.tabs}>
          {([
            ['suivis', 'Suivis'],
            ['pourtoi', 'Pour toi'],
            ['fils', 'Fils'],
          ] as [FeedTab, string][]).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={key === 'pourtoi' ? handlePourToiPress : () => setTab(key)}
              style={styles.tabBtn}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
              {tab === key && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Search icon — absolutely positioned so it doesn't skew centering */}
        <TouchableOpacity
          style={[styles.searchBtn, { top: insets.top + 2 }]}
          onPress={() => nav.navigate('Search')}
          activeOpacity={0.8}
        >
          <IcSearch size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* ── SUIVIS — feed comptes suivis ── */}
      {tab === 'suivis' && (
        <FlatList<FeedPost>
          data={(suivisData?.pages.flatMap(p => p.items) ?? []).filter(p => !hiddenPostIds.has(p.id))}
          keyExtractor={p => p.id}
          style={{ flex: 1 }}
          onLayout={e => setListHeight(e.nativeEvent.layout.height)}
          refreshControl={
            <RefreshControl
              refreshing={refreshingSuivis}
              onRefresh={() => refetchSuivis()}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          renderItem={({ item }) => (
            <VideoPlayerItem
              post={item}
              isVisible={effectiveVisibleId === item.id}
              onComment={() => setCommentsPostId(item.id)}
              onNotInterested={() => hidePost(item.id)}
              itemHeight={ITEM_H}
            />
          )}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig.current}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={1}
          removeClippedSubviews
          onEndReached={() => hasNextSuivis && !fetchingSuivis && fetchNextSuivis()}
          onEndReachedThreshold={2}
          getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
          ListEmptyComponent={
            !loadingSuivis ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { textAlign: 'center', paddingHorizontal: 40 }]}>
                  Abonne-toi à des créateurs pour voir leur contenu ici
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* ── POUR TOI — fullscreen video feed ── */}
      {tab === 'pourtoi' && loadingFeed && (
        <View style={{ flex: 1 }}>
          {[0, 1, 2].map(i => <VideoSkeleton key={i} height={ITEM_H} />)}
        </View>
      )}
      {tab === 'pourtoi' && !loadingFeed && (
        <FlatList<FeedItem>
          data={posts.filter(p => p.type !== 'video' || !hiddenPostIds.has(p.data.id))}
          style={{ flex: 1 }}
          onLayout={e => setListHeight(e.nativeEvent.layout.height)}
          keyExtractor={p =>
            p.type === 'video' ? p.data.id :
            p.type === 'book' ? `book-${p.data.id}` :
            `live-${p.data.id}`
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshingFeed}
              onRefresh={() => { seenIds.current = []; refetchFeed(); }}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          renderItem={({ item }) => {
            if (item.type === 'book') {
              return <BookCard book={item.data} isVisible={false} />;
            }
            if (item.type === 'live') {
              return <FeedLiveCard live={item.data} height={ITEM_H} onPress={() => nav.navigate('LiveViewer', { sessionId: item.data.id, broadcasterId: item.data.user.id })} />;
            }
            return (
              <VideoPlayerItem
                post={item.data}
                isVisible={effectiveVisibleId === item.data.id}
                onComment={() => setCommentsPostId(item.data.id)}
                onNotInterested={() => hidePost(item.data.id)}
                itemHeight={ITEM_H}
              />
            );
          }}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig.current}
          windowSize={5}
          maxToRenderPerBatch={3}
          initialNumToRender={2}
          removeClippedSubviews
          onEndReached={() => hasNextFeed && !fetchingFeed && fetchNextFeed()}
          onEndReachedThreshold={3}
          getItemLayout={(_, index) => ({ length: ITEM_H, offset: ITEM_H * index, index })}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Aucune vidéo pour l'instant</Text>
            </View>
          }
        />
      )}

      {/* ── COMMUNAUTÉ — trending videos ── */}
      {tab === 'communaute' && (
        <FlatList<FeedPost>
          data={(communauteData?.pages.flatMap(p => p.items) ?? []).filter(p => !hiddenPostIds.has(p.id))}
          keyExtractor={p => p.id}
          style={{ flex: 1 }}
          onLayout={e => setListHeight(e.nativeEvent.layout.height)}
          renderItem={({ item }) => (
            <VideoPlayerItem
              post={item}
              isVisible={effectiveVisibleId === item.id}
              onComment={() => setCommentsPostId(item.id)}
              onNotInterested={() => hidePost(item.id)}
              itemHeight={ITEM_H}
            />
          )}
          pagingEnabled
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig.current}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={1}
          removeClippedSubviews
          onEndReached={() => hasNextCommunaute && !fetchingCommunaute && fetchNextCommunaute()}
          onEndReachedThreshold={2}
          getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
          ListEmptyComponent={
            !loadingCommunaute ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyText, { textAlign: 'center' }]}>Aucune vidéo tendance</Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Placeholder tabs */}
      {(tab === 'proche' || tab === 'boutique') && (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { opacity: 0.5 }]}>Bientôt disponible</Text>
        </View>
      )}

      {/* Comments bottom sheet */}
      <CommentsBottomSheet postId={commentsPostId} onClose={() => setCommentsPostId(null)} />

      {/* ── FILS — text threads ── */}
      {tab === 'fils' && (
        <FilsFeed
          threads={threads}
          loading={loadingThreads}
          onLoadMore={() => hasNextThreads && !fetchingThreads && fetchNextThreads()}
          onRefresh={refetchThreads}
          onUserPress={(userId, username) => nav.navigate('UserProfile', { userId, username })}
          onThreadPress={(id) => nav.navigate('ThreadDetail', { threadId: id })}
          insets={insets}
        />
      )}
    </View>
  );
}

// ── Video skeleton placeholder ───────────────────────────────────────────────────
function VideoSkeleton({ height }: { height: number }) {
  return (
    <View style={{ width: '100%', height, backgroundColor: '#0a0a0a', overflow: 'hidden' }}>
      {/* Background shimmer */}
      <Skeleton width="100%" height={height} borderRadius={0} />
      {/* Bottom-left info */}
      <View style={{ position: 'absolute', bottom: 90, left: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Skeleton width={42} height={42} borderRadius={21} />
          <Skeleton width={120} height={14} borderRadius={7} />
        </View>
        <Skeleton width={200} height={12} borderRadius={6} />
        <Skeleton width={150} height={12} borderRadius={6} />
      </View>
      {/* Right side actions */}
      <View style={{ position: 'absolute', right: 12, bottom: 100, gap: 22, alignItems: 'center' }}>
        {[44, 44, 44, 44].map((s, i) => (
          <Skeleton key={i} width={s} height={s} borderRadius={22} />
        ))}
      </View>
    </View>
  );
}

// ── Live card in feed ────────────────────────────────────────────────────────────

function FeedLiveCard({ live, onPress, height }: { live: LiveSession; onPress: () => void; height: number }) {
  return (
    <TouchableOpacity style={{ width: '100%', height, backgroundColor: '#0a0a0a', overflow: 'hidden' }} onPress={onPress} activeOpacity={0.95}>
      {live.thumbnail_url
        ? <Image source={{ uri: live.thumbnail_url }} style={{ ...StyleSheet.absoluteFill, opacity: 0.7 }} resizeMode="cover" />
        : live.user.avatar_url
          ? <Image source={{ uri: live.user.avatar_url }} style={{ ...StyleSheet.absoluteFill, opacity: 0.3 }} resizeMode="cover" />
          : null
      }
      {/* Red live badge */}
      <View style={{ position: 'absolute', top: 60, left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FF3B30', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' }} />
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 0.5 }}>EN DIRECT</Text>
      </View>
      {/* Viewer count */}
      <View style={{ position: 'absolute', top: 60, right: 16, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}>
        <IcUsers size={12} color="#fff" />
        <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>{live.viewer_count}</Text>
      </View>
      {/* Bottom info */}
      <View style={{ position: 'absolute', bottom: 90, left: 16, right: 80, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {live.user.avatar_url
            ? <Image source={{ uri: live.user.avatar_url }} style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 2, borderColor: '#FF3B30' }} />
            : <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primaryBg, borderWidth: 2, borderColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.primary }}>{live.user.display_name[0]?.toUpperCase()}</Text>
              </View>
          }
          <View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>{live.user.display_name}</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>@{live.user.username}</Text>
          </View>
        </View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff', lineHeight: 20 }} numberOfLines={2}>{live.title}</Text>
        <View style={{ backgroundColor: '#FF3B3025', borderWidth: 1, borderColor: '#FF3B30', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FF3B30' }}>Appuyer pour rejoindre</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Fils sub-component ──────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}j`;
}

function FilsFeed({
  threads, loading, onLoadMore, onRefresh, onUserPress, onThreadPress, insets,
}: {
  threads: ThreadItem[];
  loading: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  onUserPress: (id: string, username: string) => void;
  onThreadPress: (id: string) => void;
  insets: { top: number; bottom: number };
}) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const theme = useTheme();
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const postMutation = useMutation({
    mutationFn: (content: string) => api.post('/threads', { content }),
    onSuccess: () => { setText(''); setComposing(false); qc.invalidateQueries({ queryKey: ['threads'] }); },
    onError: () => Alert.alert('Erreur', 'Impossible de publier.'),
  });

  const handleRefresh = async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {composing ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[{
            backgroundColor: theme.surface, padding: SPACING.md,
            borderBottomWidth: 1, borderBottomColor: theme.borderLight,
            paddingTop: insets.top + 56,
          }]}>
            <TextInput
              style={[{
                minHeight: 60, fontSize: FONT.size.base, textAlignVertical: 'top',
                paddingTop: 4, color: theme.text,
              }]}
              value={text}
              onChangeText={setText}
              placeholder="Quoi de nouveau ?"
              placeholderTextColor={theme.textSubtle}
              multiline
              maxLength={280}
              autoFocus
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <TouchableOpacity onPress={() => { setText(''); setComposing(false); }} style={{ padding: 8 }}>
                <IcClose size={20} color={theme.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[{ backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 20, paddingVertical: 8 }, !text.trim() && { opacity: 0.4 }]}
                onPress={() => text.trim() && postMutation.mutate(text.trim())}
                disabled={!text.trim() || postMutation.isPending}
              >
                <Text style={{ color: COLORS.white, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold }}>Publier</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <TouchableOpacity
          style={[{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: theme.surface, padding: SPACING.md,
            borderBottomWidth: 1, borderBottomColor: theme.borderLight,
            marginTop: insets.top + 56,
          }]}
          onPress={() => setComposing(true)}
          activeOpacity={0.8}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primaryBg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: FONT.weight.bold, color: COLORS.primary }}>
              {user?.display_name?.[0]?.toUpperCase() ?? 'U'}
            </Text>
          </View>
          <Text style={{ flex: 1, fontSize: FONT.size.base, color: theme.textSubtle }}>Quoi de nouveau ?</Text>
          <Text style={{ fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.primary, borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 6 }}>
            Publier
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={threads}
        keyExtractor={t => t.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
        onEndReached={onLoadMore}
        onEndReachedThreshold={2}
        renderItem={({ item: t }) => (
          <ThreadCard item={t} onUserPress={() => onUserPress(t.user.id, t.user.username)} onPress={() => onThreadPress(t.id)} theme={theme} />
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 6 }}>
              <Text style={{ fontSize: FONT.size.base, fontWeight: FONT.weight.medium, color: theme.text }}>Aucun fil pour l'instant.</Text>
              <Text style={{ fontSize: FONT.size.sm, color: theme.textMuted }}>Écris le premier !</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function ThreadCard({ item, onUserPress, onPress, theme }: { item: ThreadItem; onUserPress: () => void; onPress: () => void; theme: any }) {
  const [liked, setLiked] = useState(item.is_liked);
  const [likeCount, setLikeCount] = useState(item.like_count);
  const [reposted, setReposted] = useState(!!item.is_reposted);
  const [repostCount, setRepostCount] = useState(item.repost_count);

  const likeMutation = useMutation({
    mutationFn: () => api.post(`/threads/${item.id}/like`),
    onMutate: () => { const was = liked; setLiked(l => !l); setLikeCount(c => was ? c - 1 : c + 1); },
    onError: () => { setLiked(item.is_liked); setLikeCount(item.like_count); },
  });

  const repostMutation = useMutation({
    mutationFn: () => api.post(`/posts/${item.id}/repost`),
    onMutate: () => { const was = reposted; setReposted(!was); setRepostCount(c => was ? c - 1 : c + 1); },
    onError: () => { setReposted(!!item.is_reposted); setRepostCount(item.repost_count); },
  });

  return (
    <View style={{
      flexDirection: 'row', gap: 10,
      backgroundColor: theme.surface,
      paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: 4,
      borderBottomWidth: 1, borderBottomColor: theme.borderLight,
    }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <TouchableOpacity onPress={onUserPress}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.primaryBg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: FONT.weight.bold, color: COLORS.primary }}>
              {item.user.display_name[0]?.toUpperCase()}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={{ width: 1.5, flex: 1, backgroundColor: theme.borderLight, minHeight: 20 }} />
      </View>
      <View style={{ flex: 1, paddingBottom: SPACING.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <TouchableOpacity onPress={onUserPress}>
            <Text style={{ fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: theme.text }}>{item.user.display_name}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: FONT.size.xs, color: theme.textSubtle }}>{fmtTime(item.created_at)}</Text>
        </View>
        <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
          <Text style={{ fontSize: FONT.size.base, color: theme.text, lineHeight: 22 }}>{item.content}</Text>
        </TouchableOpacity>
        {((item.media_urls && item.media_urls.length > 0) || item.thumbnail_url) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
            {(item.media_urls && item.media_urls.length > 0 ? item.media_urls : [item.thumbnail_url!]).map((url, i) => (
              <Image key={i} source={{ uri: url }} style={{ width: 140, height: 140, borderRadius: 10 }} resizeMode="cover" />
            ))}
          </ScrollView>
        )}
        <View style={{ flexDirection: 'row', gap: SPACING.md, marginTop: 8 }}>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => likeMutation.mutate()} activeOpacity={0.7}>
            {liked ? <IcHeartFill size={18} color="#FF3B5C" /> : <IcHeart size={18} color={theme.textMuted} />}
            {likeCount > 0 && <Text style={[{ fontSize: FONT.size.xs, color: theme.textMuted }, liked && { color: '#FF3B5C' }]}>{likeCount}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} activeOpacity={0.7}>
            <IcComment size={18} color={theme.textMuted} />
            {item.reply_count > 0 && <Text style={{ fontSize: FONT.size.xs, color: theme.textMuted }}>{item.reply_count}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => repostMutation.mutate()} activeOpacity={0.7}>
            <IcShare size={18} color={reposted ? COLORS.primary : theme.textMuted} />
            {repostCount > 0 && <Text style={{ fontSize: FONT.size.xs, color: reposted ? COLORS.primary : theme.textMuted }}>{repostCount}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10, paddingBottom: 10, zIndex: 10,
  },
  tabs: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  tabBtn: { alignItems: 'center', paddingBottom: 6, paddingHorizontal: 2 },
  tabText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.55)',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  tabTextActive: { color: COLORS.white, fontWeight: '800', fontSize: 16 },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: '10%', right: '10%',
    height: 2.5, backgroundColor: COLORS.white, borderRadius: 2,
  },
  liveInlineBtn: { position: 'absolute', left: 10, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  searchBtn: { position: 'absolute', right: 10, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { height: H, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: COLORS.white, fontSize: FONT.size.base },
});

