import React, { useState, useEffect } from 'react';
import { createThumbnail } from 'react-native-create-thumbnail';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  FlatList, ScrollView, Alert, ActivityIndicator, RefreshControl, Modal, ActionSheetIOS, Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { useAuthStore } from '../../stores/authStore';
import { api, getTokens } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, SPACING, RADIUS, SHADOW, API_BASE_URL } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { IcSettings, IcSave, IcCheck, IcHeart, IcGrid, IcEdit, IcCamera, IcChart, IcPlay, IcRepeat, IcThreads, IcEye } from '../../components/ui/Icons';
import { EditProfileScreen } from './EditProfileScreen';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Post {
  id: string;
  thumbnail_url: string | null;
  video_url?: string;
  view_count: number;
  like_count: number;
}

function getThumbUrl(post: Pick<Post, 'thumbnail_url' | 'video_url'>): string | null {
  if (post.thumbnail_url) return post.thumbnail_url;
  const v = post.video_url;
  if (!v) return null;
  // Cloudinary: generate thumbnail via URL transformation
  if (v.includes('cloudinary.com')) {
    return v
      .replace('/video/upload/', '/video/upload/so_0,q_auto,f_jpg/')
      .replace(/\.(mp4|mov|avi|webm|mkv)$/i, '.jpg');
  }
  return null;
}

interface Thread {
  id: string;
  content: string;
  like_count: number;
  reply_count: number;
  created_at: string;
}

const TABS = [
  { key: 'Vidéos', Icon: IcGrid },
  { key: 'Fils', Icon: IcThreads },
  { key: 'Like', Icon: IcHeart },
  { key: 'Favoris', Icon: IcSave },
  { key: 'Reposts', Icon: IcRepeat },
];
const LIKE_SUBTABS = ['Pour toi', 'Fils'] as const;
type LikeSubTab = typeof LIKE_SUBTABS[number];
const FAV_SUBTABS = ['Vidéos', 'Sons', 'Collections'] as const;
type FavSubTab = typeof FAV_SUBTABS[number];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user, updateUser, loadMe } = useAuthStore();
  const theme = useTheme();

  // Real-time stats — reload user every 15s
  useQuery({
    queryKey: ['me-stats'],
    queryFn: async () => { await loadMe(); return null; },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    enabled: !!user?.id,
  });
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [likeSubTab, setLikeSubTab] = useState<LikeSubTab>('Pour toi');
  const [favSubTab, setFavSubTab] = useState<FavSubTab>('Vidéos');
  const [editVisible, setEditVisible] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverError, setCoverError] = useState(false);

  const { data: posts, isLoading: postsLoading, refetch: refetchPosts, isRefetching } = useQuery<{ items: Post[] }>({
    queryKey: ['user-posts', user?.id],
    queryFn: () => api.get(`/posts/user/${user?.id}`).then((r) => r.data),
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });

  const { data: threads, isLoading: threadsLoading } = useQuery<{ items: Thread[] }>({
    queryKey: ['user-threads', user?.id],
    queryFn: () => api.get(`/threads?user_id=${user?.id}&limit=30`).then((r) => r.data).catch(() => ({ items: [] })),
    enabled: !!user?.id && activeTab === 1,
  });

  const { data: liked, isLoading: likedLoading } = useQuery<{ items: Post[] }>({
    queryKey: ['user-liked', user?.id],
    queryFn: () => api.get('/posts/liked').then((r) => r.data).catch(() => ({ items: [] })),
    enabled: !!user?.id && activeTab === 2 && likeSubTab === 'Pour toi',
  });

  const { data: likedThreads, isLoading: likedThreadsLoading } = useQuery<{ items: Thread[] }>({
    queryKey: ['user-liked-threads', user?.id],
    queryFn: () => api.get('/threads/liked').then((r) => r.data).catch(() => ({ items: [] })),
    enabled: !!user?.id && activeTab === 2 && likeSubTab === 'Fils',
  });

  const { data: collections, isLoading: collectionsLoading, refetch: refetchCollections } = useQuery<{ items: { id: string; name: string; description: string | null; cover_url: string | null; item_count: number }[] }>({
    queryKey: ['collections'],
    queryFn: () => api.get('/collections').then((r) => r.data).catch(() => ({ items: [] })),
    enabled: !!user?.id && activeTab === 3 && favSubTab === 'Collections',
  });

  const { data: favorites, isLoading: favLoading } = useQuery<{ items: Post[] }>({
    queryKey: ['favorites'],
    queryFn: () => api.get('/favorites').then((r) => r.data).catch(() => ({ items: [] })),
    enabled: !!user?.id && activeTab === 3,
  });

  const { data: reposts, isLoading: repostsLoading } = useQuery<{ items: { post: Post; user: { id: string; username: string; display_name: string; avatar_url: string | null } }[] }>({
    queryKey: ['user-reposts', user?.id],
    queryFn: () => api.get(`/posts/user/${user?.id}/reposts`).then((r) => r.data).catch(() => ({ items: [] })),
    enabled: !!user?.id && activeTab === 4,
  });

  if (!user) return null;

  const handleAvatarPress = () => {
    const options = ['Prendre une photo', 'Choisir depuis la galerie', 'Annuler'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2 },
        (i) => { if (i === 0) pickAvatar('camera'); else if (i === 1) pickAvatar('library'); },
      );
    } else {
      Alert.alert('Photo de profil', '', [
        { text: 'Prendre une photo', onPress: () => pickAvatar('camera') },
        { text: 'Depuis la galerie', onPress: () => pickAvatar('library') },
        { text: 'Annuler', style: 'cancel' },
      ]);
    }
  };

  const pickAvatar = async (src: 'camera' | 'library') => {
    const fn = src === 'camera' ? launchCamera : launchImageLibrary;
    const result = await fn({ mediaType: 'photo', quality: 0.9, maxWidth: 500, maxHeight: 500 });
    if (result.didCancel || !result.assets?.[0]?.uri) return;

    setAvatarLoading(true);
    try {
      const asset = result.assets[0];
      const tokens = await getTokens();
      if (!tokens) throw new Error('Non authentifié');

      const formData = new FormData();
      formData.append('file', { uri: asset.uri, type: asset.type ?? 'image/jpeg', name: 'avatar.jpg' } as any);

      const uploadRes = await fetch(`${API_BASE_URL}/upload/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        throw new Error(err?.error ?? `Upload error ${uploadRes.status}`);
      }

      const uploadData = await uploadRes.json();
      const avatar_url: string = uploadData.url;

      if (!avatar_url) throw new Error('URL manquante dans la réponse');

      // Save to server
      await api.patch('/users/me', { avatar_url });

      // Update local state immediately + re-sync store from DB
      updateUser({ avatar_url });
      await loadMe();

      // Invalidate all caches so avatar propagates everywhere
      qc.invalidateQueries();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? "Impossible de mettre à jour la photo.");
    } finally {
      setAvatarLoading(false);
    }
  };

  const gridData = activeTab === 0 ? posts?.items
    : activeTab === 2 && likeSubTab === 'Pour toi' ? liked?.items
    : activeTab === 3 ? favorites?.items
    : null;

  const gridLoading = activeTab === 0 ? postsLoading
    : activeTab === 2 && likeSubTab === 'Pour toi' ? likedLoading
    : activeTab === 2 && likeSubTab === 'Fils' ? likedThreadsLoading
    : activeTab === 3 ? favLoading
    : false;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Modal visible={editVisible} animationType="slide" presentationStyle="pageSheet">
        <EditProfileScreen onClose={() => { setEditVisible(false); qc.invalidateQueries({ queryKey: ['me'] }); }} />
      </Modal>

      {/* Status-bar strip filled with header color so there's no beige seam */}
      <View style={{ height: insets.top, backgroundColor: theme.surface }} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchPosts} tintColor={COLORS.primary} />}
      >
        {/* Top bar */}
        <View style={[styles.topBar, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
          <Text style={[styles.topUsername, { color: theme.text }]} numberOfLines={1}>@{user.username}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('ProfileViews')} activeOpacity={0.7}>
              <IcEye size={22} color={theme.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Settings')} activeOpacity={0.7}>
              <IcSettings size={22} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Cover photo — collapsed when no cover set (no empty placeholder band) */}
        {(user as any).cover_url && !coverError ? (
          <View style={styles.coverWrap}>
            <Image
              source={{ uri: (user as any).cover_url }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onError={() => setCoverError(true)}
            />
            {coverLoading && (
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                <ActivityIndicator color={COLORS.white} />
              </View>
            )}
          </View>
        ) : null}

        {/* Hero */}
        <View style={[styles.heroSection, { backgroundColor: theme.surface }, !(user as any).cover_url && { marginTop: 0 }]}>
          <View style={styles.avatarWrap}>
            <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.85}>
              {avatarLoading ? (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <ActivityIndicator color={COLORS.primaryLight} />
                </View>
              ) : user.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarText}>{user.display_name[0]?.toUpperCase()}</Text>
                </View>
              )}
              {user.is_verified && (
                <View style={styles.verifiedBadge}>
                  <IcCheck size={10} color={COLORS.white} strokeWidth={3} />
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addStoryBadge, { borderColor: theme.surface }]}
              onPress={() => navigation.navigate('CreateCamera')}
              activeOpacity={0.85}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={styles.addStoryBadgeText}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.displayName, { color: theme.text }]}>{user.display_name}</Text>
          <Text style={[styles.username, { color: theme.textMuted }]}>@{user.username}</Text>
          {user.bio ? <Text style={[styles.bio, { color: theme.textMuted }]}>{user.bio}</Text> : null}

          <View style={styles.statsRow}>
            <TouchableOpacity onPress={() => navigation.navigate('Followers', { userId: user.id, username: user.username, type: 'following' })} activeOpacity={0.7}>
              <StatItem label="Abonnements" value={user.following_count ?? 0} theme={theme} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Followers', { userId: user.id, username: user.username, type: 'followers' })} activeOpacity={0.7}>
              <StatItem label="Abonnés" value={user.follower_count ?? 0} theme={theme} />
            </TouchableOpacity>
            <StatItem label="J'aime" value={user.like_count ?? 0} theme={theme} />
          </View>

          <TouchableOpacity style={[styles.editBtn, { borderColor: theme.border }]} onPress={() => setEditVisible(true)} activeOpacity={0.8}>
            <Text style={[styles.editBtnText, { color: theme.text }]}>Modifier le profil</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={[styles.tabs, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
          {TABS.map((tab, i) => (
            <TouchableOpacity key={tab.key} style={[styles.tab, activeTab === i && styles.tabActive]} onPress={() => setActiveTab(i)} activeOpacity={0.8}>
              <tab.Icon size={20} color={activeTab === i ? COLORS.primary : theme.textMuted} strokeWidth={activeTab === i ? 2.4 : 1.8} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Like sub-tabs */}
        {activeTab === 2 && (
          <View style={[styles.subTabs, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
            {LIKE_SUBTABS.map(sub => (
              <TouchableOpacity
                key={sub}
                style={[styles.subTab, likeSubTab === sub && styles.subTabActive]}
                onPress={() => setLikeSubTab(sub)}
                activeOpacity={0.8}
              >
                <Text style={[styles.subTabLabel, { color: likeSubTab === sub ? COLORS.primary : theme.textMuted }, likeSubTab === sub && styles.subTabLabelActive]}>
                  {sub}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Favoris sub-tabs */}
        {activeTab === 3 && (
          <View style={[styles.subTabs, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
            {FAV_SUBTABS.map(sub => (
              <TouchableOpacity
                key={sub}
                style={[styles.subTab, favSubTab === sub && styles.subTabActive]}
                onPress={() => setFavSubTab(sub)}
                activeOpacity={0.8}
              >
                <Text style={[styles.subTabLabel, { color: favSubTab === sub ? COLORS.primary : theme.textMuted }, favSubTab === sub && styles.subTabLabelActive]}>
                  {sub}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Content */}
        {activeTab === 1 ? (
          <ThreadsTab threads={threads?.items} loading={threadsLoading} />
        ) : activeTab === 2 && likeSubTab === 'Fils' ? (
          <ThreadsTab threads={likedThreads?.items} loading={likedThreadsLoading} />
        ) : activeTab === 3 && favSubTab === 'Sons' ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Aucun son</Text>
            <Text style={styles.emptySubtitle}>Sauvegarde des sons pour les retrouver ici</Text>
          </View>
        ) : activeTab === 3 && favSubTab === 'Collections' ? (
          <CollectionsTab
            loading={collectionsLoading}
            items={collections?.items}
            onCreate={async () => {
              // simple prompt-based creation
              const name = await new Promise<string | null>((resolve) => {
                Alert.prompt?.('Nouvelle collection', 'Nom de la collection', [
                  { text: 'Annuler', style: 'cancel', onPress: () => resolve(null) },
                  { text: 'Créer', onPress: (v?: string) => resolve(v ?? '') },
                ]);
              });
              if (!name) return;
              try {
                await api.post('/collections', { name });
                refetchCollections();
              } catch (e: any) {
                Alert.alert('Erreur', e?.message ?? 'Impossible de créer');
              }
            }}
            onOpen={(id, name) => navigation.navigate('CollectionDetail' as any, { collectionId: id, name })}
          />
        ) : activeTab === 4 ? (
          repostsLoading ? (
            <ActivityIndicator color={COLORS.primaryLight} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={(reposts?.items ?? []).map(r => ({ ...r.post, _repostedBy: r.user }))}
              numColumns={3}
              keyExtractor={(p) => `repost-${p.id}`}
              scrollEnabled={false}
              columnWrapperStyle={styles.gridRow}
              renderItem={({ item }) => (
                <GridItem
                  item={item}
                  onPress={() => navigation.navigate('VideoPlayer', { postId: item.id, userId: user?.id })}
                  repostBadge
                />
              )}
              ListEmptyComponent={<EmptyTab tab={4} />}
            />
          )
        ) : gridLoading ? (
          <ActivityIndicator color={COLORS.primaryLight} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={gridData ?? []}
            numColumns={3}
            keyExtractor={(p) => p.id}
            scrollEnabled={false}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item }) => <GridItem item={item} onPress={() => navigation.navigate('VideoPlayer', { postId: item.id, userId: user?.id })} />}
            ListEmptyComponent={<EmptyTab tab={activeTab} />}
          />
        )}
      </ScrollView>
    </View>
  );
}

// In-memory thumbnail cache (persists for app session)
const THUMB_CACHE = new Map<string, string>();

function GridItem({ item, onPress, repostBadge }: { item: Post & { _repostedBy?: any }; onPress: () => void; repostBadge?: boolean }) {
  const precomputed = getThumbUrl(item);
  const [thumb, setThumb] = useState<string | null>(precomputed ?? THUMB_CACHE.get(item.id) ?? null);
  const [loading, setLoading] = useState(!thumb && !!item.video_url);

  useEffect(() => {
    if (thumb || !item.video_url) return;
    // Already cached?
    if (THUMB_CACHE.has(item.id)) {
      setThumb(THUMB_CACHE.get(item.id)!);
      setLoading(false);
      return;
    }
    // Generate lazily from remote URL
    createThumbnail({ url: item.video_url, timeStamp: 0, format: 'jpeg' })
      .then(r => {
        THUMB_CACHE.set(item.id, r.path);
        setThumb(r.path);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [item.id]);

  return (
    <TouchableOpacity style={styles.gridItem} activeOpacity={0.8} onPress={onPress}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.gridThumb} resizeMode="cover" />
      ) : loading ? (
        <View style={[styles.gridThumb, styles.gridThumbFallback]}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : (
        <View style={[styles.gridThumb, styles.gridThumbFallback]}>
          <IcPlay size={28} color={COLORS.primaryLight} />
        </View>
      )}
      <View style={styles.gridOverlay}>
        <IcEye size={12} color={COLORS.white} />
        <Text style={styles.gridViews}>{fmtNum(item.view_count)}</Text>
      </View>
      {repostBadge && (
        <View style={styles.repostMini}>
          <IcRepeat size={9} color={COLORS.white} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function CollectionsTab({ loading, items, onCreate, onOpen }: {
  loading: boolean;
  items?: { id: string; name: string; description: string | null; cover_url: string | null; item_count: number }[];
  onCreate: () => void;
  onOpen: (id: string, name: string) => void;
}) {
  if (loading) return <ActivityIndicator color={COLORS.primaryLight} style={{ marginTop: 40 }} />;
  return (
    <View>
      <TouchableOpacity onPress={onCreate} activeOpacity={0.8} style={styles.collectionCreate}>
        <Text style={styles.collectionCreateText}>+ Nouvelle collection</Text>
      </TouchableOpacity>
      {(!items || items.length === 0) ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Aucune collection</Text>
          <Text style={styles.emptySubtitle}>Crée ta première collection pour organiser tes vidéos</Text>
        </View>
      ) : (
        items.map((c) => (
          <TouchableOpacity key={c.id} style={styles.collectionRow} onPress={() => onOpen(c.id, c.name)} activeOpacity={0.7}>
            <View style={styles.collectionCover}>
              {c.cover_url
                ? <Image source={{ uri: c.cover_url }} style={styles.collectionCoverImg} />
                : <View style={[styles.collectionCoverImg, { backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' }]}><IcHeart size={20} color={COLORS.primaryLight} /></View>
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.collectionName}>{c.name}</Text>
              <Text style={styles.collectionMeta}>{c.item_count} vidéo{c.item_count !== 1 ? 's' : ''}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

function ThreadsTab({ threads, loading }: { threads?: Thread[]; loading: boolean }) {
  if (loading) return <ActivityIndicator color={COLORS.primaryLight} style={{ marginTop: 40 }} />;
  if (!threads?.length) return <EmptyTab tab={1} />;
  return (
    <View>
      {threads.map((t) => (
        <View key={t.id} style={styles.threadItem}>
          <Text style={styles.threadContent}>{t.content}</Text>
          <Text style={styles.threadMeta}>{t.like_count} like · {t.reply_count} réponses</Text>
        </View>
      ))}
    </View>
  );
}

function EmptyTab({ tab }: { tab: number }) {
  const msgs = [
    { title: 'Aucune vidéo', sub: 'Publiez votre première vidéo !' },
    { title: 'Aucun fil', sub: 'Partagez vos pensées !' },
    { title: "Aucun like", sub: 'Aimez des vidéos pour les retrouver ici' },
    { title: 'Aucun favori', sub: 'Sauvegardez du contenu pour le retrouver ici' },
  ];
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>{msgs[tab]?.title}</Text>
      <Text style={styles.emptySubtitle}>{msgs[tab]?.sub}</Text>
    </View>
  );
}

function StatItem({ label, value, theme }: { label: string; value: number; theme: any }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: theme.text }]}>{fmtNum(value)}</Text>
      <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n ?? 0);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 60 },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  topUsername: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold, color: COLORS.text },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  coverWrap: { width: '100%', height: 120, position: 'relative', overflow: 'hidden' },
  heroSection: { alignItems: 'center', paddingTop: SPACING.md, paddingBottom: SPACING.lg, paddingHorizontal: SPACING.lg, gap: 10, marginTop: -30 },

  avatarWrap: { position: 'relative' },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: COLORS.white },
  avatarFallback: {
    backgroundColor: COLORS.primaryBg, borderWidth: 3, borderColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 36, fontWeight: FONT.weight.bold, color: COLORS.primary },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.white,
  },
  verifiedBadge: {
    position: 'absolute', bottom: 0, left: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.white,
  },
  addStoryBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  addStoryBadgeText: { color: COLORS.white, fontSize: 16, fontWeight: FONT.weight.bold, lineHeight: 18 },

  displayName: { fontSize: FONT.size.xxl, fontWeight: FONT.weight.bold, color: COLORS.text, letterSpacing: -0.3 },
  username: { fontSize: FONT.size.sm, color: COLORS.textMuted, marginTop: -6 },
  bio: { fontSize: FONT.size.sm, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },

  statsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, marginTop: 4 },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: FONT.size.xl, fontWeight: FONT.weight.bold, color: COLORS.text },
  statLabel: { fontSize: FONT.size.xs, color: COLORS.textMuted },
  statDivider: { width: 1, height: 28, backgroundColor: COLORS.border },

  editBtn: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg, paddingVertical: 10, marginTop: 4,
  },
  editBtnText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.text },

  tabs: {
    flexDirection: 'row', backgroundColor: COLORS.white,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabLabel: { fontSize: 12, fontWeight: FONT.weight.medium, color: COLORS.textMuted },
  tabLabelActive: { color: COLORS.primary, fontWeight: FONT.weight.semibold },

  subTabs: {
    flexDirection: 'row', borderBottomWidth: 1,
    paddingHorizontal: SPACING.md,
  },
  subTab: { paddingVertical: 9, paddingHorizontal: SPACING.sm, marginRight: 16 },
  subTabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  subTabLabel: { fontSize: 13, fontWeight: FONT.weight.medium, color: COLORS.textMuted },
  subTabLabelActive: { color: COLORS.primary, fontWeight: FONT.weight.semibold },

  gridRow: { gap: 1 },
  gridItem: { flex: 1 / 3, aspectRatio: 9 / 16, position: 'relative', margin: 0.5 },
  gridThumb: { width: '100%', height: '100%' },
  gridThumbFallback: { backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  gridOverlay: {
    position: 'absolute', bottom: 6, left: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  gridViews: {
    fontSize: FONT.size.xs, color: COLORS.white, fontWeight: FONT.weight.semibold,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  repostMini: {
    position: 'absolute', top: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    padding: 2,
  },

  threadItem: {
    backgroundColor: COLORS.white, padding: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  threadContent: { fontSize: FONT.size.base, color: COLORS.text, lineHeight: 22 },
  threadMeta: { fontSize: FONT.size.xs, color: COLORS.textMuted, marginTop: 6 },

  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  collectionCreate: { padding: 14, alignItems: 'center', backgroundColor: COLORS.primaryBg, marginHorizontal: 12, marginTop: 12, borderRadius: 12 },
  collectionCreateText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  collectionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  collectionCover: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden' },
  collectionCoverImg: { width: '100%', height: '100%' },
  collectionName: { fontSize: 15, fontWeight: '600', color: '#111' },
  collectionMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  emptyTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold, color: COLORS.text },
  emptySubtitle: { fontSize: FONT.size.sm, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: SPACING.xl },
});
