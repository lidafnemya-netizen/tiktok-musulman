import React, { useState, useEffect } from 'react';
import { createThumbnail } from 'react-native-create-thumbnail';
import {
  View, Text, StyleSheet, Image, TouchableOpacity,
  FlatList, ActivityIndicator, Alert, Dimensions, ActionSheetIOS, Platform,
  Share, Linking, Modal, Switch,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../hooks/useTheme';
import { api } from '../../api/client';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../../constants/theme';
import { IcBack, IcFollow, IcFollowing, IcMail, IcHeart, IcPlay, IcCheck, IcMore, IcShare, IcRepeat, IcEye, IcBell, IcClose } from '../../components/ui/Icons';
import { Skeleton } from '../../components/ui/Skeleton';

type Props = NativeStackScreenProps<RootStackParamList, 'UserProfile'>;

interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_following: boolean;
  follower_count: number;
  following_count: number;
  post_count: number;
  like_count: number;
  gender: 'MALE' | 'FEMALE';
  active_live_session_id: string | null;
  has_unseen_story?: boolean;
}

interface Post {
  id: string;
  thumbnail_url: string | null;
  video_url?: string;
  view_count: number;
  like_count: number;
  caption: string | null;
}

function getThumbUrl(post: Pick<Post, 'thumbnail_url' | 'video_url'>): string | null {
  if (post.thumbnail_url) return post.thumbnail_url;
  const v = post.video_url;
  if (!v) return null;
  if (v.includes('cloudinary.com')) {
    return v
      .replace('/video/upload/', '/video/upload/so_0,q_auto,f_jpg/')
      .replace(/\.(mp4|mov|avi|webm|mkv)$/i, '.jpg');
  }
  return null;
}

const { width: W } = Dimensions.get('window');
const CELL = (W - 2) / 3;

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n ?? 0);
}

export default function UserProfileScreen({ route, navigation }: Props) {
  const { username, userId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const theme = useTheme();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<0 | 1>(0);
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);

  const { data: profile, isLoading } = useQuery<Profile>({
    queryKey: ['profile', username],
    queryFn: () => api.get(`/users/${username}`).then(r => r.data),
    refetchOnWindowFocus: true,
  });

  const { data: postsData, isLoading: postsLoading } = useQuery<{ items: Post[] }>({
    queryKey: ['user-posts-public', userId || profile?.id],
    queryFn: () => api.get(`/posts/user/${userId || profile?.id}`).then(r => r.data).catch(() => ({ items: [] })),
    enabled: !!(userId || profile?.id),
  });

  const { data: repostsData, isLoading: repostsLoading } = useQuery<{ items: (Post & { _repostedBy?: any })[] }>({
    queryKey: ['user-reposts-public', userId || profile?.id],
    queryFn: () => api.get(`/posts/user/${userId || profile?.id}/reposts`).then(r => r.data).catch(() => ({ items: [] })),
    enabled: !!(userId || profile?.id) && activeTab === 1,
  });

  const followMutation = useMutation({
    mutationFn: () => api.post(`/users/${profile?.id}/follow`),
    onMutate: () => {
      qc.setQueryData(['profile', username], (old: any) => old ? {
        ...old,
        is_following: !old.is_following,
        follower_count: old.is_following ? old.follower_count - 1 : old.follower_count + 1,
      } : old);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['profile', username] }),
  });

  const handleOptions = () => {
    const options = ['Signaler', 'Bloquer', 'Ne plus voir dans le feed', 'Annuler'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 3, destructiveButtonIndex: 1 },
        (i) => {
          if (i === 0) {
            Alert.alert('Signalement envoyé', 'Merci, nous examinerons ce profil.');
            api.post('/reports', { target_type: 'user', target_id: profile?.id, reason: 'inappropriate' }).catch(() => {});
          } else if (i === 1) {
            Alert.alert('Bloquer', `Bloquer @${profile?.username} ?`, [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Bloquer', style: 'destructive', onPress: () => {
                api.post(`/users/${profile?.id}/block`).catch(() => {});
                navigation.goBack();
              }},
            ]);
          } else if (i === 2) {
            Alert.alert('Masqué', `Tu ne verras plus @${profile?.username} dans ton feed.`);
            api.post(`/users/${profile?.id}/hide`).catch(() => {});
          }
        },
      );
    } else {
      Alert.alert('Options', '', [
        { text: 'Signaler', onPress: () => { api.post('/reports', { target_type: 'user', target_id: profile?.id, reason: 'inappropriate' }).catch(() => {}); Alert.alert('Signalement envoyé'); }},
        { text: 'Bloquer', style: 'destructive', onPress: () => { api.post(`/users/${profile?.id}/block`).catch(() => {}); navigation.goBack(); }},
        { text: 'Ne plus voir dans le feed', onPress: () => Alert.alert('Masqué') },
        { text: 'Annuler', style: 'cancel' },
      ]);
    }
  };

  const handleMessage = async () => {
    if (!user || !profile) return;
    // Cross-gender blocked by backend; same gender goes through directly
    if (user.gender !== profile.gender) {
      Alert.alert(
        'Messagerie restreinte',
        'La messagerie directe entre hommes et femmes non mahrams n\'est pas autorisée sur Nour.',
        [{ text: 'Compris' }],
      );
      return;
    }
    try {
      const { data } = await api.post('/messages/direct', { recipient_id: profile.id });
      navigation.navigate('Conversation', {
        conversationId: data.conversation_id,
        otherUser: { id: profile.id, display_name: profile.display_name },
      });
    } catch (e: any) {
      // If a prior request exists in non-accepted state, retry won't fail now (backend fixed)
      Alert.alert('Erreur', e?.response?.data?.message ?? 'Impossible d\'ouvrir la conversation.');
    }
  };

  const handleShare = () => {
    if (!profile) return;
    Share.share({
      message: `Découvre @${profile.username} sur Nour !\nhttps://nour.app/u/${profile.username}`,
      url: `https://nour.app/u/${profile.username}`,
    });
  };

  const handleLivePress = () => {
    if (!profile?.active_live_session_id) return;
    navigation.navigate('LiveViewer', { sessionId: profile.active_live_session_id, broadcasterId: profile.id });
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={{ height: insets.top, backgroundColor: theme.surface }} />
        {/* Skeleton header */}
        <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
          <Skeleton width={24} height={24} borderRadius={12} />
          <Skeleton width={120} height={16} borderRadius={8} />
          <Skeleton width={24} height={24} borderRadius={12} />
        </View>
        {/* Cover skeleton */}
        <Skeleton width="100%" height={120} borderRadius={0} />
        {/* Hero skeleton */}
        <View style={[{ backgroundColor: theme.surface, padding: 16, gap: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <Skeleton width={80} height={80} borderRadius={40} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton width={140} height={18} borderRadius={9} />
              <Skeleton width={100} height={13} borderRadius={7} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <Skeleton width={60} height={32} borderRadius={8} />
            <Skeleton width={60} height={32} borderRadius={8} />
            <Skeleton width={60} height={32} borderRadius={8} />
          </View>
          <Skeleton width="100%" height={40} borderRadius={20} />
        </View>
        {/* Grid skeleton */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1, marginTop: 1 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} width={CELL} height={CELL * 1.5} borderRadius={0} />
          ))}
        </View>
      </View>
    );
  }

  if (!profile) return null;
  const isOwnProfile = user?.id === profile.id;
  const posts = postsData?.items ?? [];
  const reposts = repostsData?.items ?? [];
  const displayPosts = activeTab === 0 ? posts : reposts;
  const displayLoading = activeTab === 0 ? postsLoading : repostsLoading;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={{ height: insets.top, backgroundColor: theme.surface }} />
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <IcBack size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>@{profile.username}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {!isOwnProfile && profile.is_following && (
            <TouchableOpacity onPress={() => setNotifSheetOpen(true)} style={styles.backBtn} activeOpacity={0.7}>
              <IcBell size={20} color={theme.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleShare} style={styles.backBtn} activeOpacity={0.7}>
            <IcShare size={20} color={theme.text} />
          </TouchableOpacity>
          {!isOwnProfile && (
            <TouchableOpacity onPress={handleOptions} style={styles.backBtn} activeOpacity={0.7}>
              <IcMore size={22} color={theme.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <NotificationSubscriptionSheet
        visible={notifSheetOpen}
        onClose={() => setNotifSheetOpen(false)}
        userId={profile.id}
        theme={theme}
      />

      <FlatList
        data={displayPosts}
        keyExtractor={p => p.id}
        numColumns={3}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 1, paddingBottom: 40 }}
        columnWrapperStyle={{ gap: 1 }}
        ListHeaderComponent={
          <View style={[styles.hero, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
            {/* Avatar — red ring if live, dark green ring if an unseen story */}
            <TouchableOpacity
              style={[
                styles.avatarWrap,
                profile.active_live_session_id && styles.avatarLiveRing,
                !profile.active_live_session_id && profile.has_unseen_story && styles.avatarStoryRing,
              ]}
              activeOpacity={profile.active_live_session_id || profile.has_unseen_story ? 0.8 : 1}
              onPress={
                profile.active_live_session_id
                  ? handleLivePress
                  : profile.has_unseen_story
                  ? () => navigation.navigate('Stories', { userId: profile.id })
                  : undefined
              }
            >
              {profile.avatar_url
                ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                : <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.primaryBg }]}>
                    <Text style={styles.avatarInitial}>{profile.display_name[0]?.toUpperCase()}</Text>
                  </View>
              }
              {profile.active_live_session_id && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>EN DIRECT</Text>
                </View>
              )}
              {profile.is_verified && !profile.active_live_session_id && (
                <View style={styles.verifiedBadge}>
                  <IcCheck size={9} color={COLORS.white} strokeWidth={3} />
                </View>
              )}
            </TouchableOpacity>

            <Text style={[styles.displayName, { color: theme.text }]}>{profile.display_name}</Text>
            <Text style={[styles.username, { color: theme.textMuted }]}>@{profile.username}</Text>

            {/* Stats */}
            <View style={styles.statsRow}>
              <StatItem label="Abonnés" value={profile.follower_count} theme={theme} />
              <StatItem label="Abonnements" value={profile.following_count} theme={theme} />
              <StatItem label="J'aime" value={profile.like_count} theme={theme} />
            </View>

            {/* Actions */}
            {!isOwnProfile && (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.followBtn, profile.is_following && { backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border }]}
                  onPress={() => followMutation.mutate()}
                  disabled={followMutation.isPending}
                  activeOpacity={0.8}
                >
                  {profile.is_following
                    ? <IcFollowing size={15} color={theme.textMuted} />
                    : <IcFollow size={15} color={COLORS.white} />
                  }
                  <Text style={[styles.followText, profile.is_following && { color: theme.textMuted }]}>
                    {profile.is_following ? 'Abonné' : 'Suivre'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.messageBtn, { borderColor: COLORS.primary, backgroundColor: theme.surface }]}
                  onPress={handleMessage}
                  activeOpacity={0.8}
                >
                  <IcMail size={15} color={COLORS.primary} />
                  <Text style={[styles.messageBtnText, { color: COLORS.primary }]}>Message</Text>
                </TouchableOpacity>
              </View>
            )}

            {profile.bio ? <BioText bio={profile.bio} theme={theme} /> : null}

            {/* Tabs */}
            <View style={styles.tabsRow}>
              <TouchableOpacity
                style={[styles.tabItem, activeTab === 0 && { borderBottomColor: COLORS.primary }]}
                onPress={() => setActiveTab(0)} activeOpacity={0.8}
              >
                <IcPlay size={20} color={activeTab === 0 ? COLORS.primary : theme.textMuted} strokeWidth={activeTab === 0 ? 2.4 : 1.8} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabItem, activeTab === 1 && { borderBottomColor: COLORS.primary }]}
                onPress={() => setActiveTab(1)} activeOpacity={0.8}
              >
                <IcRepeat size={20} color={activeTab === 1 ? COLORS.primary : theme.textMuted} strokeWidth={activeTab === 1 ? 2.4 : 1.8} />
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item: p }) => (
          <LazyVideoCell
            post={p}
            theme={theme}
            showRepostBadge={activeTab === 1}
            onPress={() => navigation.navigate('VideoPlayer', { postId: p.id })}
          />
        )}
        ListEmptyComponent={
          displayLoading ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1 }}>
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} width={CELL} height={CELL * 1.5} borderRadius={0} />
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>Aucune publication</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const USER_THUMB_CACHE = new Map<string, string>();

function LazyVideoCell({ post: p, theme, onPress, showRepostBadge }: { post: Post; theme: any; onPress: () => void; showRepostBadge?: boolean }) {
  const precomputed = getThumbUrl(p);
  const [thumb, setThumb] = useState<string | null>(precomputed ?? USER_THUMB_CACHE.get(p.id) ?? null);
  const [loading, setLoading] = useState(!thumb && !!p.video_url);

  useEffect(() => {
    if (thumb || !p.video_url) return;
    if (USER_THUMB_CACHE.has(p.id)) { setThumb(USER_THUMB_CACHE.get(p.id)!); setLoading(false); return; }
    createThumbnail({ url: p.video_url, timeStamp: 0, format: 'jpeg' })
      .then(r => { USER_THUMB_CACHE.set(p.id, r.path); setThumb(r.path); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [p.id]);

  return (
    <TouchableOpacity style={[styles.cell, { backgroundColor: theme.surface }]} onPress={onPress} activeOpacity={0.85}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.cellImg} resizeMode="cover" />
      ) : loading ? (
        <View style={[styles.cellImg, styles.cellFallback, { backgroundColor: theme.card }]}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : (
        <View style={[styles.cellImg, styles.cellFallback, { backgroundColor: theme.card }]}>
          <IcPlay size={24} color={COLORS.primaryLight} />
        </View>
      )}
      <View style={styles.cellOverlay}>
        <IcEye size={11} color={COLORS.white} />
        <Text style={styles.cellCount}>{fmtNum(p.view_count)}</Text>
      </View>
      {showRepostBadge && (
        <View style={styles.repostMini}>
          <IcRepeat size={11} color={COLORS.white} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const URL_REGEX = /https?:\/\/[^\s]+/g;

function BioText({ bio, theme }: { bio: string; theme: any }) {
  const parts: { text: string; isLink: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_REGEX.source, 'g');
  while ((match = re.exec(bio)) !== null) {
    if (match.index > lastIndex) parts.push({ text: bio.slice(lastIndex, match.index), isLink: false });
    parts.push({ text: match[0], isLink: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < bio.length) parts.push({ text: bio.slice(lastIndex), isLink: false });

  return (
    <Text style={[styles.bio, { color: theme.textMuted }]}>
      {parts.map((p, i) =>
        p.isLink
          ? <Text key={i} style={{ color: COLORS.primary, textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL(p.text).catch(() => {})}>{p.text}</Text>
          : <Text key={i}>{p.text}</Text>
      )}
    </Text>
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

interface NotifSettings { notify_post: boolean; notify_live: boolean; notify_story: boolean }

function NotificationSubscriptionSheet({ visible, onClose, userId, theme }: {
  visible: boolean; onClose: () => void; userId: string; theme: any;
}) {
  const { data, isLoading } = useQuery<NotifSettings>({
    queryKey: ['follow-notifications', userId],
    queryFn: () => api.get(`/users/${userId}/follow-notifications`).then(r => r.data),
    enabled: visible,
  });
  const [settings, setSettings] = useState<NotifSettings | null>(null);
  useEffect(() => { if (data) setSettings(data); }, [data]);

  const patchMutation = useMutation({
    mutationFn: (next: Partial<NotifSettings>) => api.patch(`/users/${userId}/follow-notifications`, next),
  });

  const toggle = (key: keyof NotifSettings, value: boolean) => {
    setSettings(s => s ? { ...s, [key]: value } : s);
    patchMutation.mutate({ [key]: value });
  };

  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={sheetStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[sheetStyles.sheet, { backgroundColor: theme.surface }]}>
        <View style={[sheetStyles.handle, { backgroundColor: theme.border }]} />
        <View style={sheetStyles.header}>
          <Text style={[sheetStyles.title, { color: theme.text }]}>Notifications</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <IcClose size={20} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
        {isLoading || !settings ? (
          <ActivityIndicator color={COLORS.primaryLight} style={{ marginVertical: 30 }} />
        ) : (
          <>
            <NotifRow label="Publications" value={settings.notify_post} onChange={(v) => toggle('notify_post', v)} theme={theme} />
            <NotifRow label="Live" value={settings.notify_live} onChange={(v) => toggle('notify_live', v)} theme={theme} />
            <NotifRow label="Stories" value={settings.notify_story} onChange={(v) => toggle('notify_story', v)} theme={theme} />
          </>
        )}
      </View>
    </Modal>
  );
}

function NotifRow({ label, value, onChange, theme }: { label: string; value: boolean; onChange: (v: boolean) => void; theme: any }) {
  return (
    <View style={sheetStyles.row}>
      <Text style={[sheetStyles.rowLabel, { color: theme.text }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.tabActive, false: theme.border }} />
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 34, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  rowLabel: { fontSize: FONT.size.base },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },

  hero: {
    alignItems: 'center', paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg, gap: SPACING.sm,
    borderBottomWidth: 1,
  },
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatarLiveRing: { padding: 3, borderRadius: 50, borderWidth: 3, borderColor: '#FF3B30' },
  avatarStoryRing: { padding: 3, borderRadius: 50, borderWidth: 3, borderColor: COLORS.primary },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarFallback: { borderWidth: 3, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 34, fontWeight: FONT.weight.bold, color: COLORS.primary },
  verifiedBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.primary, borderWidth: 2, borderColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  liveBadge: {
    position: 'absolute', bottom: -10, left: '50%', transform: [{ translateX: -28 }],
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FF3B30', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1.5, borderColor: COLORS.white,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.white },
  liveText: { fontSize: 9, fontWeight: FONT.weight.bold, color: COLORS.white, letterSpacing: 0.3 },

  displayName: { fontSize: FONT.size.xxl, fontWeight: FONT.weight.bold, letterSpacing: -0.3 },
  username: { fontSize: FONT.size.sm, marginTop: -6 },
  bio: { fontSize: FONT.size.sm, textAlign: 'center', lineHeight: 20 },

  statsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, marginTop: 4 },
  statItem: { alignItems: 'center', gap: 2, minWidth: 70 },
  statValue: { fontSize: FONT.size.xl, fontWeight: FONT.weight.bold },
  statLabel: { fontSize: FONT.size.xs },
  statDivider: { width: 1, height: 30 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  followBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
    paddingHorizontal: 28, paddingVertical: 10, ...SHADOW.green,
  },
  followText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.white },
  messageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: RADIUS.full, paddingHorizontal: 20, paddingVertical: 10,
    borderWidth: 1.5,
  },
  messageBtnText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },

  tabsRow: {
    flexDirection: 'row', width: '100%', marginTop: 10,
  },
  tabItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabItemText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  repostMini: {
    position: 'absolute', top: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: 2,
  },

  cell: { width: CELL, height: CELL * (16 / 9) },
  cellImg: { width: '100%', height: '100%' },
  cellFallback: { alignItems: 'center', justifyContent: 'center' },
  cellOverlay: {
    position: 'absolute', bottom: 6, left: 6,
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  cellCount: {
    fontSize: 10, color: COLORS.white, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: FONT.size.base },
});
