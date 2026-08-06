import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  Animated, PanResponder, Dimensions, StatusBar, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, Share as RNShare,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, SPACING, RADIUS } from '../../constants/theme';
import { IcClose, IcEye, IcHeart, IcHeartFill, IcShare, IcSend } from '../../components/ui/Icons';

const { width: W, height: H } = Dimensions.get('window');

interface StoryUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: 'image' | 'video';
  duration: number;
  view_count: number;
  like_count: number;
  is_liked: boolean;
  expires_at: string;
  created_at: string;
  user: StoryUser;
  is_viewed: boolean;
  linked_post_id?: string | null;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Stories'>;

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

export default function StoriesScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { userId, queueUserIds } = route.params;

  // Queue of user ids to advance through on swipe-right / end-of-stories (e.g. the Messages story bar).
  const queue = queueUserIds && queueUserIds.length > 0 ? queueUserIds : [userId];
  const [queueIdx, setQueueIdx] = useState(Math.max(0, queue.indexOf(userId)));
  const currentUserId = queue[queueIdx] ?? userId;

  const [stories, setStories] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const progress = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const viewedIds = useRef<Set<string>>(new Set());

  // ── Navigation (refs avoid stale closures inside the progress-bar timer callback) ──
  const goToNextUser = useCallback(() => {
    setQueueIdx(qi => {
      if (qi + 1 >= queue.length) { nav.goBack(); return qi; }
      return qi + 1;
    });
  }, [queue.length, nav]);
  const goToNextUserRef = useRef(goToNextUser);
  useEffect(() => { goToNextUserRef.current = goToNextUser; }, [goToNextUser]);

  const goNext = useCallback(() => {
    setIndex(i => {
      if (i + 1 >= storiesRef.current.length) { goToNextUserRef.current(); return i; }
      return i + 1;
    });
  }, []);
  const goNextRef = useRef(goNext);
  useEffect(() => { goNextRef.current = goNext; }, [goNext]);

  const goPrev = useCallback(() => {
    setIndex(i => Math.max(0, i - 1));
  }, []);

  const storiesRef = useRef<Story[]>([]);
  useEffect(() => { storiesRef.current = stories; }, [stories]);

  // ── Load stories for the current queue user ─────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setIndex(0);
    setReplyText('');
    api.get('/stories', { params: { user_id: currentUserId } })
      .then(r => {
        const data: Story[] = r.data?.stories ?? r.data ?? [];
        if (data.length === 0) { goToNextUserRef.current(); return; }
        setStories(data);
        setLoading(false);
      })
      .catch(() => nav.goBack());
  }, [currentUserId]);

  // ── Mark viewed ──────────────────────────────────────────────────────────────
  const markViewed = useCallback((story: Story) => {
    if (viewedIds.current.has(story.id)) return;
    viewedIds.current.add(story.id);
    api.post(`/stories/${story.id}/view`).catch(() => {});
  }, []);

  // ── Animate progress bar ─────────────────────────────────────────────────────
  const startProgress = useCallback((story: Story) => {
    progress.setValue(0);
    animRef.current?.stop();
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration: (story.duration ?? 5) * 1000,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) goNextRef.current();
    });
  }, [progress]);

  useEffect(() => {
    if (!stories.length || loading) return;
    const story = stories[index];
    markViewed(story);
    if (!paused) startProgress(story);
    return () => animRef.current?.stop();
  }, [index, stories, loading, paused]);

  useEffect(() => {
    if (paused) {
      animRef.current?.stop();
    } else if (stories[index]) {
      startProgress(stories[index]);
    }
  }, [paused]);

  // ── Like ─────────────────────────────────────────────────────────────────────
  const toggleLike = useCallback(() => {
    setStories(prev => prev.map((s, i) => i !== index ? s : {
      ...s, is_liked: !s.is_liked, like_count: s.is_liked ? s.like_count - 1 : s.like_count + 1,
    }));
    const story = storiesRef.current[index];
    if (story) api.post(`/stories/${story.id}/like`).catch(() => {});
  }, [index]);

  // ── Reply — sends a DM tied to this story ───────────────────────────────────
  const sendReply = useCallback(async () => {
    const text = replyText.trim();
    const story = storiesRef.current[index];
    if (!text || !story || sendingReply) return;
    setSendingReply(true);
    try {
      await api.post(`/stories/${story.id}/reply`, { text });
      setReplyText('');
      Alert.alert('Envoyé', 'Ta réponse a été envoyée en message.');
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.response?.data?.error ?? "Impossible d'envoyer la réponse.";
      Alert.alert('Erreur', msg);
    } finally {
      setSendingReply(false);
    }
  }, [replyText, index, sendingReply]);

  // ── Share ────────────────────────────────────────────────────────────────────
  const shareStory = useCallback(() => {
    const story = storiesRef.current[index];
    if (!story) return;
    RNShare.share({ message: `Regarde la story de @${story.user.username} sur Nour`, url: story.media_url }).catch(() => {});
  }, [index]);

  // ── Swipe down to close / swipe right for next user ─────────────────────────
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        (Math.abs(g.dy) > 10 && g.dy > 0 && Math.abs(g.dy) > Math.abs(g.dx)) ||
        (g.dx > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3),
      onPanResponderGrant: () => animRef.current?.stop(),
      onPanResponderMove: (_, g) => {
        if (Math.abs(g.dy) >= Math.abs(g.dx) && g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 90 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3) {
          // Swipe right — jump to the next user in the story bar queue
          goToNextUserRef.current();
          return;
        }
        if (g.dy > 100) {
          Animated.timing(translateY, { toValue: H, duration: 200, useNativeDriver: true }).start(() => nav.goBack());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
          if (storiesRef.current[index]) startProgress(storiesRef.current[index]);
        }
      },
    })
  ).current;

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={COLORS.white} size="large" />
      </View>
    );
  }

  if (!stories.length) return null;

  const story = stories[index];
  const isOwnStory = story.user.id === user?.id;

  return (
    <Animated.View style={[styles.root, { transform: [{ translateY }] }]} {...panResponder.panHandlers}>
      <StatusBar hidden />

      {/* Media */}
      {story.media_type === 'video' ? (
        <Video
          source={{ uri: story.media_url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          paused={paused}
          repeat={false}
          onEnd={goNext}
        />
      ) : (
        <Image source={{ uri: story.media_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}

      {/* Dark gradients overlay */}
      <View style={styles.topGradient} pointerEvents="none" />
      <View style={styles.bottomGradient} pointerEvents="none" />

      {/* Progress bars */}
      <View style={[styles.progressRow, { top: insets.top + 8 }]}>
        {stories.map((s, i) => (
          <View key={s.id} style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: i < index
                    ? '100%'
                    : i === index
                    ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                    : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Top header */}
      <View style={[styles.header, { top: insets.top + 22 }]}>
        <Image
          source={story.user.avatar_url ? { uri: story.user.avatar_url } : { uri: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(story.user.display_name) + '&background=2D7A4F&color=fff' }}
          style={styles.avatar}
        />
        <View style={styles.headerText}>
          <Text style={styles.displayName}>{story.user.display_name}</Text>
          <Text style={styles.timeAgo}>{timeAgo(story.created_at)}</Text>
        </View>
        <TouchableOpacity onPress={() => nav.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <IcClose size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Tap zones — left half = previous, right half = next */}
      <View style={styles.tapZones} pointerEvents="box-none">
        <TouchableOpacity style={styles.tapLeft} activeOpacity={1} onPress={goPrev} />
        <TouchableOpacity style={styles.tapRight} activeOpacity={1} onPress={goNext} />
      </View>

      {/* Bottom */}
      {isOwnStory ? (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.viewCount}>
            <IcEye size={16} color={COLORS.white} />
            <Text style={styles.viewCountText}>{story.view_count ?? 0}</Text>
          </View>
          {story.linked_post_id && (
            <TouchableOpacity
              style={styles.viewVideoBtn}
              onPress={() => nav.navigate('VideoPlayer', { postId: story.linked_post_id! })}
              activeOpacity={0.85}
            >
              <Text style={styles.viewVideoText}>Voir la vidéo</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.replyBar, { paddingBottom: insets.bottom + 12 }]}
        >
          <View style={styles.replyRow}>
            <View style={styles.replyInputWrap}>
              <TextInput
                style={styles.replyInput}
                value={replyText}
                onChangeText={setReplyText}
                placeholder={`Répondre à ${story.user.display_name}...`}
                placeholderTextColor="rgba(255,255,255,0.6)"
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
                onSubmitEditing={sendReply}
              />
            </View>
            {replyText.trim().length > 0 ? (
              <TouchableOpacity onPress={sendReply} disabled={sendingReply} style={styles.replyIconBtn} activeOpacity={0.8}>
                <IcSend size={20} color={COLORS.white} />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity onPress={toggleLike} style={styles.replyIconBtn} activeOpacity={0.8}>
                  {story.is_liked
                    ? <IcHeartFill size={24} color="#FF3B5C" />
                    : <IcHeart size={24} color={COLORS.white} />}
                </TouchableOpacity>
                <TouchableOpacity onPress={shareStory} style={styles.replyIconBtn} activeOpacity={0.8}>
                  <IcShare size={22} color={COLORS.white} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.black,
    width: W,
    height: H,
  },
  loader: {
    flex: 1,
    backgroundColor: COLORS.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topGradient: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 160,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  bottomGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 140,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  progressRow: {
    position: 'absolute', left: SPACING.sm, right: SPACING.sm,
    flexDirection: 'row', gap: 4, zIndex: 20,
  },
  progressTrack: {
    flex: 1, height: 2.5, backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: RADIUS.full, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: COLORS.white,
    borderRadius: RADIUS.full,
  },
  header: {
    position: 'absolute', left: SPACING.md, right: SPACING.md,
    flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 20,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2, borderColor: COLORS.white,
  },
  headerText: { flex: 1 },
  displayName: {
    fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.white,
  },
  timeAgo: {
    fontSize: FONT.size.xs, color: 'rgba(255,255,255,0.7)',
  },
  tapZones: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row', zIndex: 10,
  },
  tapLeft: { flex: 1 },
  tapRight: { flex: 1 },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: SPACING.md, alignItems: 'center', zIndex: 20,
  },
  viewCount: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
  },
  viewCountText: {
    fontSize: FONT.size.sm, color: COLORS.white, fontWeight: FONT.weight.medium,
  },
  viewVideoBtn: {
    marginTop: SPACING.sm,
    paddingVertical: 10, paddingHorizontal: 28,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
  },
  viewVideoText: {
    fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.white,
  },
  replyBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
    paddingHorizontal: SPACING.md,
  },
  replyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  replyInputWrap: {
    flex: 1, height: 42, borderRadius: RADIUS.full,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center', paddingHorizontal: 16,
  },
  replyInput: { color: COLORS.white, fontSize: FONT.size.sm, padding: 0 },
  replyIconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
});
