import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  Image, ActivityIndicator, Animated, Pressable, PanResponder,
  Modal, Alert, Easing, ScrollView,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import Video, { VideoRef } from 'react-native-video';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'react-native-linear-gradient';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, RADIUS } from '../../constants/theme';
import {
  IcHeartFill, IcHeart, IcComment, IcShare, IcSave, IcSaveFill,
  IcMusic, IcPlay, IcPause, IcCheck, IcMaximize, IcRepeat,
  IcClose, IcProfile,
} from '../ui/Icons';
import ShareSheet from './ShareSheet';
import UserProfileScreen from '../../screens/profile/UserProfileScreen';

const { width: W, height: H } = Dimensions.get('window');

export interface FeedPost {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  media_urls?: string[];
  caption: string | null;
  duration: number;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  is_liked: boolean;
  is_saved?: boolean;
  is_pinned?: boolean;
  user: {
    id: string; username: string; display_name: string;
    avatar_url: string | null; is_verified: boolean; is_following?: boolean;
    has_unseen_story?: boolean;
  };
  sound: {
    id: string; title: string; artist: string | null; url?: string;
    origin_user?: { id: string; username: string; avatar_url: string | null } | null;
  } | null;
  reposted_by?: { id: string; username: string; avatar_url: string | null } | null;
}

interface Props {
  post: FeedPost;
  isVisible: boolean;
  onComment: () => void;
  onNotInterested?: () => void;
  /** Height allocated for this item (screen H minus tab bar) */
  itemHeight?: number;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function VideoPlayerItem({ post, isVisible, onComment, onNotInterested, itemHeight }: Props) {
  const ITEM_H = itemHeight ?? H;
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const videoRef = useRef<VideoRef>(null);

  // Playback state
  const [liked, setLiked] = useState(post.is_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [saved, setSaved] = useState(post.is_saved ?? false);
  const [following, setFollowing] = useState(post.user.is_following ?? false);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(!isVisible);
  const [rate, setRate] = useState(1);
  const [buffering, setBuffering] = useState(true);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [progress, setProgress] = useState(0); // 0–1
  const [soundSheetVisible, setSoundSheetVisible] = useState(false);
  const [isHorizontal, setIsHorizontal] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fsPaused, setFsPaused] = useState(false);
  const [fsShowControls, setFsShowControls] = useState(true);
  const [fsProgress, setFsProgress] = useState(0);
  const fsHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsVideoRef = useRef<VideoRef>(null);

  const openFullscreen = useCallback(() => {
    setPaused(true);
    setFsPaused(false);
    setFsShowControls(true);
    setFullscreen(true);
  }, []);

  const closeFullscreen = useCallback(() => {
    setFullscreen(false);
    setPaused(!isVisible);
  }, [isVisible]);

  const toggleFsControls = useCallback(() => {
    setFsShowControls(v => {
      const next = !v;
      if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current);
      if (next) fsHideTimerRef.current = setTimeout(() => setFsShowControls(false), 3000);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    fsHideTimerRef.current = setTimeout(() => setFsShowControls(false), 3000);
    return () => { if (fsHideTimerRef.current) clearTimeout(fsHideTimerRef.current); };
  }, [fullscreen]);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);

  // Vinyl spinning animation
  const vinylRotation = useRef(new Animated.Value(0)).current;
  const vinylAnim = useRef<Animated.CompositeAnimation | null>(null);

  // Long-press zone tracking
  const longPressZoneRef = useRef<'left' | 'middle' | 'right' | null>(null);
  const pausedBeforeLongRef = useRef(false);

  // Double-tap like (instant — no delay on double tap)
  const lastTapRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartAnim = useRef(new Animated.Value(0)).current;
  const heartScale = useRef(new Animated.Value(0.3)).current;
  const [heartPos, setHeartPos] = useState({ x: W / 2 - 50, y: H / 2 - 80 });

  // Pause indicator
  const pauseAnim = useRef(new Animated.Value(0)).current;

  // Speed indicator
  const speedAnim = useRef(new Animated.Value(0)).current;

  // Seek state
  const [seeking, setSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState(0);
  const totalDurationRef = useRef(post.duration || 0);

  const seekPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // Never give up the gesture to the parent (prevent profilePanResponder stealing it)
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => {
      setSeeking(true);
      const pct = Math.max(0, Math.min(1, evt.nativeEvent.pageX / W));
      const time = pct * totalDurationRef.current;
      setSeekTime(time);
      setProgress(pct);
      videoRef.current?.seek(time);
    },
    onPanResponderMove: (evt) => {
      const pct = Math.max(0, Math.min(1, evt.nativeEvent.pageX / W));
      const time = pct * totalDurationRef.current;
      setSeekTime(time);
      setProgress(pct);
      videoRef.current?.seek(time);
    },
    onPanResponderRelease: () => setSeeking(false),
    onPanResponderTerminate: () => setSeeking(false),
  })).current;

  // Profile panel (slides in from right on left-swipe)
  const panelX = useRef(new Animated.Value(W)).current;
  const panelBackdrop = useRef(new Animated.Value(0)).current;
  const [panelOpen, setPanelOpen] = useState(false);
  // RN can send both onPanResponderRelease AND onPanResponderTerminate for the
  // same gesture (the latter fires once the newly-pushed screen steals the
  // responder mid-animation) — guard so the commit only ever runs once per swipe.
  const gestureCommittedRef = useRef(false);

  const openProfilePanel = useCallback(() => {
    if (gestureCommittedRef.current) return;
    gestureCommittedRef.current = true;
    // Swipe commit → the panel (which was already following the finger) snaps
    // fully into place, then immediately hands off to the real profile screen —
    // no intermediate summary step, no extra tap required.
    Animated.parallel([
      Animated.spring(panelX, { toValue: 0, useNativeDriver: true, damping: 26, stiffness: 300, mass: 0.9 }),
      Animated.timing(panelBackdrop, { toValue: 0.55, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setPanelOpen(false);
      nav.navigate('UserProfile', { userId: post.user.id, username: post.user.username });
    });
  }, [panelX, panelBackdrop, nav, post.user.id, post.user.username]);

  const closeProfilePanel = useCallback(() => {
    if (gestureCommittedRef.current) return;
    gestureCommittedRef.current = true;
    Animated.parallel([
      Animated.spring(panelX, { toValue: W, useNativeDriver: true, damping: 26, stiffness: 320, mass: 0.9 }),
      Animated.timing(panelBackdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setPanelOpen(false));
  }, [panelX, panelBackdrop]);

  const profilePanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (evt, g) => {
      // Only trigger from right half of screen, clear leftward swipe, not vertical
      const startX = evt.nativeEvent.pageX - g.dx;
      return startX > W * 0.4 && g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.3;
    },
    onPanResponderGrant: () => {
      // Show panel immediately as gesture starts
      gestureCommittedRef.current = false;
      setPanelOpen(true);
      panelX.setValue(W);
    },
    onPanResponderMove: (_, g) => {
      if (g.dx < 0) {
        const x = Math.max(W * 0.15, W + g.dx);
        panelX.setValue(x);
        panelBackdrop.setValue(Math.min(0.55, (-g.dx / (W * 0.85)) * 0.55));
      }
    },
    onPanResponderRelease: (_, g) => {
      if (-g.dx > W * 0.25 || g.vx < -0.5) {
        openProfilePanel();
      } else {
        closeProfilePanel();
      }
    },
    onPanResponderTerminate: (_, g) => {
      if (-g.dx > W * 0.25) openProfilePanel(); else closeProfilePanel();
    },
  })).current;

  // Watch time tracking
  const watchStartRef = useRef<number | null>(null);
  const watchAccumRef = useRef(0);

  useEffect(() => {
    setPaused(!isVisible);
    if (isVisible) {
      watchStartRef.current = Date.now();
    } else {
      if (watchStartRef.current) {
        watchAccumRef.current += (Date.now() - watchStartRef.current) / 1000;
        watchStartRef.current = null;
        if (watchAccumRef.current > 0.5) {
          api.post(`/posts/${post.id}/view`, {
            watch_time: Math.round(watchAccumRef.current),
            completed: watchAccumRef.current >= (post.duration ?? 15) * 0.8,
          }).catch(() => {});
          watchAccumRef.current = 0;
        }
      }
    }
  }, [isVisible]);

  // Vinyl spin control
  useEffect(() => {
    if (!paused && isVisible) {
      vinylAnim.current = Animated.loop(
        Animated.timing(vinylRotation, {
          toValue: 1, duration: 4000,
          easing: Easing.linear, useNativeDriver: true,
        })
      );
      vinylAnim.current.start();
    } else {
      vinylAnim.current?.stop();
    }
    return () => { vinylAnim.current?.stop(); };
  }, [paused, isVisible]);

  const vinylSpin = vinylRotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const likedRef = useRef(liked);
  useEffect(() => { likedRef.current = liked; }, [liked]);

  const likeMutation = useMutation({
    mutationFn: () => api.post(`/posts/${post.id}/like`),
    onError: () => { setLiked(post.is_liked); setLikeCount(post.like_count); },
  });

  const saveMutation = useMutation({
    mutationFn: () => api.post(`/favorites/posts/${post.id}`),
    onMutate: () => setSaved(s => !s),
    onError: () => setSaved(post.is_saved ?? false),
  });

  const followMutation = useMutation({
    mutationFn: () => api.post(`/users/${post.user.id}/follow`),
    onMutate: () => setFollowing(f => !f),
    onError: () => setFollowing(post.user.is_following ?? false),
  });

  // ── Heart animation (always plays on double-tap) — TikTok style ──────────
  const heartY = useRef(new Animated.Value(0)).current;
  const animateHeart = useCallback((x: number, y: number) => {
    setHeartPos({ x: x - 56, y: y - 100 });
    heartAnim.setValue(1);
    heartScale.setValue(0.1);
    heartY.setValue(0);
    Animated.parallel([
      // Bounce scale: 0.1 → 1.2 → 1.0
      Animated.sequence([
        Animated.spring(heartScale, { toValue: 1.25, useNativeDriver: true, tension: 180, friction: 6 }),
        Animated.spring(heartScale, { toValue: 1.0, useNativeDriver: true, tension: 200, friction: 8 }),
      ]),
      // Float up slightly
      Animated.sequence([
        Animated.delay(400),
        Animated.timing(heartY, { toValue: -30, duration: 500, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      ]),
      // Fade out after 600ms
      Animated.sequence([
        Animated.delay(550),
        Animated.timing(heartAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();
  }, [heartAnim, heartScale, heartY]);

  // ── Trigger like (on double-tap) — single like per video ─────────────────
  const triggerLike = useCallback((x: number, y: number) => {
    animateHeart(x, y);
    ReactNativeHapticFeedback.trigger('impactMedium', { enableVibrateFallback: true });
    // Only call API / update state if not already liked
    if (!likedRef.current) {
      setLiked(true);
      setLikeCount(c => c + 1);
      likedRef.current = true;
      likeMutation.mutate();
    }
  }, [animateHeart, likeMutation]);

  // ── Pause indicator ───────────────────────────────────────────────────────
  const showPauseIndicator = useCallback(() => {
    pauseAnim.setValue(1);
    Animated.timing(pauseAnim, { toValue: 0, duration: 700, delay: 300, useNativeDriver: true }).start();
  }, [pauseAnim]);

  // ── Speed indicator ───────────────────────────────────────────────────────
  const showSpeedIndicator = useCallback(() => {
    speedAnim.setValue(1);
  }, [speedAnim]);

  const hideSpeedIndicator = useCallback(() => {
    Animated.timing(speedAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [speedAnim]);

  // ── Tap handler (shared across all zones) ────────────────────────────────
  // Double tap = instant like; single tap = toggle pause (after 300ms)
  const handleZoneTap = useCallback((x: number, y: number) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap — fire immediately, cancel pending single-tap
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      triggerLike(x, y);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        lastTapRef.current = 0;
        setPaused(p => { showPauseIndicator(); return !p; });
      }, 200);
    }
  }, [triggerLike, showPauseIndicator]);

  // ── Long press handlers ───────────────────────────────────────────────────
  const handleLongPress = useCallback((zone: 'left' | 'middle' | 'right') => {
    // Cancel any pending single-tap
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }
    lastTapRef.current = 0;
    longPressZoneRef.current = zone;

    if (zone === 'middle') {
      pausedBeforeLongRef.current = paused;
      setPaused(true);
      ReactNativeHapticFeedback.trigger('impactMedium', { enableVibrateFallback: true });
      setShareSheetVisible(true);
    } else if (zone === 'left' || zone === 'right') {
      setRate(2);
      showSpeedIndicator();
    }
  }, [paused, showPauseIndicator, showSpeedIndicator]);

  const handlePressOut = useCallback((zone: 'left' | 'middle' | 'right') => {
    if (longPressZoneRef.current === zone) {
      longPressZoneRef.current = null;
      if (zone === 'left' || zone === 'right') {
        setRate(1);
        hideSpeedIndicator();
      } else {
        setPaused(pausedBeforeLongRef.current);
      }
    }
  }, [hideSpeedIndicator]);

  const goToProfile = () => nav.navigate('UserProfile', { userId: post.user.id, username: post.user.username });

  const isVideo = post.video_url && post.video_url !== '' &&
    (post.video_url.startsWith('http') || post.video_url.startsWith('file'));
  const imageUrls = !isVideo
    ? (post.media_urls && post.media_urls.length > 0 ? post.media_urls : (post.thumbnail_url ? [post.thumbnail_url] : []))
    : [];
  const [imageIndex, setImageIndex] = useState(0);

  const soundOriginUser = post.sound?.origin_user && post.sound.origin_user.id !== post.user.id
    ? post.sound.origin_user
    : null;
  const soundAvatarUrl = soundOriginUser ? soundOriginUser.avatar_url : post.user.avatar_url;

  // ── Like button toggle (left heart icon) ─────────────────────────────────
  const handleLikePress = useCallback(() => {
    const wasLiked = likedRef.current;
    setLiked(l => !l);
    setLikeCount(c => wasLiked ? c - 1 : c + 1);
    likedRef.current = !wasLiked;
    ReactNativeHapticFeedback.trigger(wasLiked ? 'impactLight' : 'impactMedium', { enableVibrateFallback: true });
    likeMutation.mutate();
  }, [likeMutation]);

  return (
    <Animated.View
      style={[styles.container, { height: ITEM_H }]}
      {...profilePanResponder.panHandlers}
    >
      {/* LAYER 1 — Thumbnail / image carousel */}
      {!isVideo && imageUrls.length > 1 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={StyleSheet.absoluteFill}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / W);
            setImageIndex(Math.max(0, Math.min(idx, imageUrls.length - 1)));
          }}
        >
          {imageUrls.map((url, i) => (
            <Image key={url + i} source={{ uri: url }} style={{ width: W, height: ITEM_H }} resizeMode="cover" />
          ))}
        </ScrollView>
      ) : (post.thumbnail_url || imageUrls[0]) ? (
        <Image source={{ uri: post.thumbnail_url ?? imageUrls[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]} />
      )}

      {/* Dot pagination for multi-image posts */}
      {!isVideo && imageUrls.length > 1 && (
        <View style={styles.imageDots} pointerEvents="none">
          {imageUrls.map((_, i) => (
            <View key={i} style={[styles.imageDot, i === imageIndex && styles.imageDotActive]} />
          ))}
        </View>
      )}

      {/* LAYER 2 — Video */}
      {isVideo && (
        <Video
          ref={videoRef}
          source={{ uri: post.video_url }}
          style={StyleSheet.absoluteFill}
          resizeMode={isHorizontal ? 'contain' : 'cover'}
          repeat
          paused={paused}
          muted={muted}
          rate={rate}
          onBuffer={({ isBuffering }) => setBuffering(isBuffering)}
          onLoad={({ duration, naturalSize }: any) => {
            setBuffering(false);
            if (duration > 0) totalDurationRef.current = duration;
            if (naturalSize?.width && naturalSize?.height) {
              setIsHorizontal(naturalSize.width > naturalSize.height);
            }
          }}
          onError={() => { setBuffering(false); }}
          onProgress={({ currentTime, seekableDuration }) => {
            if (!seeking && seekableDuration > 0) {
              setProgress(currentTime / seekableDuration);
              setSeekTime(currentTime);
            }
          }}
          onEnd={() => {
            // Auto-replay: seek back to start
            videoRef.current?.seek(0);
            setProgress(0);
            setSeekTime(0);
          }}
          ignoreSilentSwitch="ignore"
          playInBackground={false}
          playWhenInactive={false}
          bufferConfig={{ minBufferMs: 1500, maxBufferMs: 10000, bufferForPlaybackMs: 500, bufferForPlaybackAfterRebufferMs: 1000 }}
        />
      )}

      {/* LAYER 3 — Gesture zones (behind UI elements) */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={styles.zonesRow} pointerEvents="box-none">
          {/* Left zone — long press = 2x speed */}
          <Pressable
            style={styles.zoneLeft}
            onPress={e => handleZoneTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
            onLongPress={() => handleLongPress('left')}
            onPressOut={() => handlePressOut('left')}
            delayLongPress={200}
          />
          {/* Middle zone — long press = pause while held */}
          <Pressable
            style={styles.zoneMiddle}
            onPress={e => handleZoneTap(e.nativeEvent.locationX + W * 0.35, e.nativeEvent.locationY)}
            onLongPress={() => handleLongPress('middle')}
            onPressOut={() => handlePressOut('middle')}
            delayLongPress={200}
          />
          {/* Right zone — long press = 2x speed */}
          <Pressable
            style={styles.zoneRight}
            onPress={e => handleZoneTap(e.nativeEvent.locationX + W * 0.65, e.nativeEvent.locationY)}
            onLongPress={() => handleLongPress('right')}
            onPressOut={() => handlePressOut('right')}
            delayLongPress={200}
          />
        </View>
      </View>

      {/* Buffering */}
      {buffering && isVideo && (
        <View style={styles.bufferWrap} pointerEvents="none">
          <ActivityIndicator color={COLORS.white} size="large" />
        </View>
      )}

      {/* Pause indicator */}
      <Animated.View style={[styles.pauseIndicator, { opacity: pauseAnim }]} pointerEvents="none">
        <View style={styles.pauseCircle}>
          {paused
            ? <IcPlay size={32} color={COLORS.white} />
            : <View style={styles.pauseBars}><View style={styles.pauseBar} /><View style={styles.pauseBar} /></View>
          }
        </View>
      </Animated.View>

      {/* speed indicator hidden per design */}

      {/* Floating heart on double-tap — TikTok bounce */}
      <Animated.View
        pointerEvents="none"
        style={[styles.floatingHeart, {
          left: heartPos.x, top: heartPos.y,
          opacity: heartAnim,
          transform: [{ scale: heartScale }, { translateY: heartY }],
        }]}
      >
        <IcHeartFill size={112} color="#FF3B5C" />
      </Animated.View>

      {/* Seekable progress bar — video only, interactive, above tab bar */}
      {isVideo && (
        <View style={styles.seekBarHit} {...seekPanResponder.panHandlers}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            {/* Thumb */}
            <View style={[styles.progressThumb, { left: `${Math.round(progress * 100)}%` }]} />
          </View>
        </View>
      )}

      {/* Time display while seeking */}
      {isVideo && seeking && (
        <View style={styles.seekTimeBubble} pointerEvents="none">
          <Text style={styles.seekTimeText}>
            {fmtDuration(seekTime)} / {fmtDuration(totalDurationRef.current)}
          </Text>
        </View>
      )}

      {/* Plein écran — videos horizontales uniquement */}
      {isHorizontal && (
        <TouchableOpacity
          style={styles.fullscreenBtn}
          onPress={openFullscreen}
          activeOpacity={0.85}
        >
          <IcMaximize size={14} color={COLORS.white} />
          <Text style={styles.fullscreenText}>Plein écran</Text>
        </TouchableOpacity>
      )}

      {/* Bottom gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
      />

      {/* Repost indicator — bottom left, above username */}
      {post.reposted_by && (
        <View style={styles.repostBadge}>
          <IcRepeat size={11} color={COLORS.white} />
          {post.reposted_by.avatar_url ? (
            <Image source={{ uri: post.reposted_by.avatar_url }} style={styles.repostAvatar} />
          ) : (
            <View style={[styles.repostAvatar, styles.repostAvatarFallback]}>
              <Text style={styles.repostAvatarInitial}>{post.reposted_by.username[0]?.toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.repostText}>@{post.reposted_by.username}</Text>
        </View>
      )}

      {/* Bottom left — username + caption */}
      <View style={styles.bottomLeft}>
        <TouchableOpacity onPress={goToProfile} activeOpacity={0.8} style={styles.usernameRow}>
          <Text style={styles.username}>{post.user.display_name || post.user.username}</Text>
          {post.user.is_verified && (
            <View style={styles.verifiedBadge}>
              <IcCheck size={9} color={COLORS.white} strokeWidth={3} />
            </View>
          )}
        </TouchableOpacity>
        {post.caption ? (
          <TouchableOpacity onPress={() => setCaptionExpanded(e => !e)} activeOpacity={0.9}>
            <CaptionText
              text={post.caption}
              expanded={captionExpanded}
            />
          </TouchableOpacity>
        ) : null}
        {null /* sound row hidden per design */}
      </View>

      {/* Right actions */}
      <View style={styles.rightActions}>
        {/* Avatar + follow — dark green ring when the poster has an unseen story */}
        <TouchableOpacity
          style={[styles.avatarWrap, post.user.has_unseen_story && styles.avatarStoryRing]}
          onPress={() => post.user.has_unseen_story ? nav.navigate('Stories', { userId: post.user.id }) : goToProfile()}
          activeOpacity={0.85}
        >
          {post.user.avatar_url
            ? <Image source={{ uri: post.user.avatar_url }} style={styles.avatar} />
            : <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{post.user.display_name[0]?.toUpperCase()}</Text>
              </View>
          }
          {!following && (
            <TouchableOpacity
              style={styles.followDot}
              onPress={() => { ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true }); followMutation.mutate(); }}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={styles.followDotText}>+</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        {/* Like */}
        <ActionBtn
          icon={liked ? <IcHeartFill size={32} color="#FF3B5C" /> : <IcHeart size={32} color={COLORS.white} />}
          count={fmt(likeCount)}
          onPress={handleLikePress}
          countColor={liked ? '#FF3B5C' : COLORS.white}
        />

        {/* Comment */}
        <ActionBtn icon={<IcComment size={30} color={COLORS.white} />} count={fmt(post.comment_count)} onPress={onComment} />

        {/* Save */}
        <ActionBtn
          icon={saved ? <IcSaveFill size={28} color={COLORS.primary} /> : <IcSave size={28} color={COLORS.white} />}
          count={''}
          onPress={() => saveMutation.mutate()}
        />

        {/* Share */}
        <ActionBtn
          icon={<IcShare size={28} color={COLORS.white} />}
          count={fmt(post.share_count || 0)}
          onPress={() => {
            ReactNativeHapticFeedback.trigger('impactLight', { enableVibrateFallback: true, ignoreAndroidSystemSettings: false });
            setShareSheetVisible(true);
          }}
        />

        {/* Sound bubble — owner's avatar for original audio, or the sound's original creator if reused */}
        <TouchableOpacity
          style={styles.vinylWrap}
          activeOpacity={0.85}
          onPress={() => (post.sound ? setSoundSheetVisible(true) : goToProfile())}
        >
          <Animated.View style={[styles.vinylOuter, { transform: [{ rotate: vinylSpin }] }]}>
            <View style={styles.vinylRing} />
            <View style={styles.vinylCenter}>
              {soundAvatarUrl ? (
                <Image source={{ uri: soundAvatarUrl }} style={{ width: '100%', height: '100%' }} />
              ) : (
                <View style={[styles.vinylCenter, { backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' }]}>
                  <IcMusic size={12} color={COLORS.primary} />
                </View>
              )}
            </View>
            <View style={styles.vinylHole} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Sound Sheet */}
      {post.sound && (
        <SoundSheet
          visible={soundSheetVisible}
          sound={post.sound}
          onClose={() => setSoundSheetVisible(false)}
          onNavigateSound={() => {
            setSoundSheetVisible(false);
            nav.navigate('Sound', { soundId: post.sound!.id, title: post.sound!.title, artist: post.sound!.artist });
          }}
          onUseSound={() => {
            setSoundSheetVisible(false);
            nav.navigate('Create' as any);
          }}
          creator={soundOriginUser}
          onViewCreator={soundOriginUser ? () => {
            setSoundSheetVisible(false);
            nav.navigate('UserProfile', { userId: soundOriginUser.id, username: soundOriginUser.username });
          } : undefined}
        />
      )}
      {/* Share Sheet */}
      <ShareSheet
        post={post}
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
        onNotInterested={onNotInterested}
      />

      {/* Custom fullscreen — rotates the video sideways in-app, no OS rotation, no nav/bars */}
      {fullscreen && (
        <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={closeFullscreen}>
          <View style={styles.fsRoot}>
            <View style={[styles.fsInner, { width: H, height: W }]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={toggleFsControls}>
                <Video
                  ref={fsVideoRef}
                  source={{ uri: post.video_url }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                  paused={fsPaused}
                  repeat
                  onLoad={() => fsVideoRef.current?.seek(progress * totalDurationRef.current)}
                  onProgress={({ currentTime, seekableDuration }) => {
                    if (seekableDuration > 0) setFsProgress(currentTime / seekableDuration);
                  }}
                />
              </Pressable>
              {fsShowControls && (
                <>
                  <TouchableOpacity style={styles.fsCloseBtn} onPress={closeFullscreen} activeOpacity={0.8}>
                    <IcClose size={22} color={COLORS.white} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.fsPlayBtn}
                    onPress={() => setFsPaused(p => !p)}
                    activeOpacity={0.8}
                  >
                    {fsPaused
                      ? <IcPlay size={30} color={COLORS.white} />
                      : <IcPause size={30} color={COLORS.white} />}
                  </TouchableOpacity>
                  <View style={styles.fsProgressTrack}>
                    <View style={[styles.fsProgressFill, { width: `${Math.round(fsProgress * 100)}%` }]} />
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* Real profile screen — slides in from right on left-swipe, following the finger */}
      {panelOpen && (
        <>
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: panelBackdrop }]}
            pointerEvents="box-none"
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closeProfilePanel} />
          </Animated.View>
          <Animated.View
            style={[styles.profilePanel, { transform: [{ translateX: panelX }] }]}
          >
            <UserProfileScreen
              route={{ key: 'embedded-profile', name: 'UserProfile', params: { userId: post.user.id, username: post.user.username } } as any}
              navigation={{
                goBack: closeProfilePanel,
                navigate: (screen: string, params?: any) => { closeProfilePanel(); nav.navigate(screen as any, params); },
              } as any}
            />
          </Animated.View>
        </>
      )}
    </Animated.View>
  );
}

// ── Sound Sheet ─────────────────────────────────────────────────────────────
function SoundSheet({
  visible, sound, onClose, onNavigateSound, onUseSound, creator, onViewCreator,
}: {
  visible: boolean;
  sound: { id: string; title: string; artist: string | null; url?: string };
  onClose: () => void;
  onNavigateSound: () => void;
  onUseSound: () => void;
  creator?: { id: string; username: string; avatar_url: string | null } | null;
  onViewCreator?: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => { if (!visible) setPlaying(false); }, [visible]);
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {sound.url && (
        <Video source={{ uri: sound.url }} paused={!playing} repeat
          style={{ width: 0, height: 0 }} onEnd={() => setPlaying(false)} />
      )}
      <TouchableOpacity style={soundStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={soundStyles.sheet}>
        <View style={soundStyles.handle} />
        {/* Sound info */}
        <View style={soundStyles.soundInfo}>
          <TouchableOpacity
            style={soundStyles.soundIcon}
            activeOpacity={0.8}
            disabled={!sound.url}
            onPress={() => setPlaying(p => !p)}
          >
            {playing ? <IcClose size={20} color={COLORS.primary} /> : <IcPlay size={20} color={COLORS.primary} />}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={soundStyles.soundTitle} numberOfLines={1}>{sound.title}</Text>
            {sound.artist && <Text style={soundStyles.soundArtist} numberOfLines={1}>{sound.artist}</Text>}
          </View>
        </View>

        {creator && onViewCreator && (
          <TouchableOpacity style={soundStyles.creatorRow} onPress={onViewCreator} activeOpacity={0.7}>
            {creator.avatar_url
              ? <Image source={{ uri: creator.avatar_url }} style={soundStyles.creatorAvatar} />
              : <View style={[soundStyles.creatorAvatar, { backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{creator.username[0]?.toUpperCase()}</Text>
                </View>
            }
            <Text style={soundStyles.creatorText}>Son original de @{creator.username}</Text>
          </TouchableOpacity>
        )}

        <View style={soundStyles.divider} />

        {/* Options */}
        <TouchableOpacity style={soundStyles.option} onPress={onUseSound} activeOpacity={0.7}>
          <IcPlay size={20} color={COLORS.text} />
          <Text style={soundStyles.optionText}>Utiliser ce son</Text>
        </TouchableOpacity>
        <TouchableOpacity style={soundStyles.option} onPress={onNavigateSound} activeOpacity={0.7}>
          <IcHeart size={20} color={COLORS.text} />
          <Text style={soundStyles.optionText}>Voir toutes les vidéos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={soundStyles.option} onPress={() => { Alert.alert('Bientôt', 'Téléchargement disponible prochainement.'); onClose(); }} activeOpacity={0.7}>
          <IcSave size={20} color={COLORS.text} />
          <Text style={soundStyles.optionText}>Télécharger</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[soundStyles.option, { marginTop: 8 }]} onPress={onClose} activeOpacity={0.7}>
          <Text style={[soundStyles.optionText, { color: COLORS.textMuted, textAlign: 'center', flex: 1 }]}>Annuler</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const soundStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 34, paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 16 },
  soundInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  soundIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  soundTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.text },
  soundArtist: { fontSize: FONT.size.sm, color: COLORS.textMuted, marginTop: 2 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  creatorAvatar: { width: 22, height: 22, borderRadius: 11, overflow: 'hidden' },
  creatorText: { fontSize: FONT.size.xs, color: COLORS.textMuted },
  divider: { height: 1, backgroundColor: COLORS.borderLight, marginBottom: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  optionText: { fontSize: FONT.size.base, color: COLORS.text },
});

function CaptionText({ text, expanded }: { text: string; expanded: boolean }) {
  const parts = text.split(/(\s+)/);
  return (
    <Text style={styles.caption} numberOfLines={expanded ? undefined : 2}>
      {parts.map((part, i) =>
        part.startsWith('#') || part.startsWith('@')
          ? <Text key={i} style={styles.captionTag}>{part}</Text>
          : part
      )}
    </Text>
  );
}

function ActionBtn({
  icon, count, onPress, countColor = COLORS.white,
}: { icon: React.ReactNode; count?: string; onPress: () => void; countColor?: string }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 300, friction: 10 }),
    ]).start();
    onPress();
  };
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={handlePress} activeOpacity={1}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {icon}
      </Animated.View>
      {count !== undefined && count !== '' && (
        <Text style={[styles.actionCount, { color: countColor }]}>{count}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { width: W, height: H, backgroundColor: '#000', overflow: 'hidden' }, // H overridden by inline
  fallback: { backgroundColor: '#0A0A0A' },
  imageDots: {
    position: 'absolute', bottom: 48, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5,
  },
  imageDot: {
    width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.4)',
  },
  imageDotActive: { backgroundColor: COLORS.primaryLight, width: 6, height: 6, borderRadius: 3 },

  // Gesture zones
  zonesRow: { flex: 1, flexDirection: 'row' },
  zoneLeft: { width: W * 0.35, height: '100%' },
  zoneMiddle: { width: W * 0.30, height: '100%' },
  zoneRight: { width: W * 0.35, height: '100%' },

  bufferWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },

  pauseIndicator: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none',
  },
  pauseCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  pauseBars: { flexDirection: 'row', gap: 6 },
  pauseBar: { width: 6, height: 26, backgroundColor: COLORS.white, borderRadius: 3 },

  speedBadge: {
    position: 'absolute', top: '45%', alignSelf: 'center',
    left: W / 2 - 32,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: RADIUS.full,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  speedText: { fontSize: 24, fontWeight: '800', color: COLORS.white },

  floatingHeart: { position: 'absolute', width: 112, height: 112 },

  muteBtn: {
    position: 'absolute', top: 54, right: 14,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },

  repostBadge: {
    position: 'absolute', bottom: 200, left: 14,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  repostAvatar: { width: 16, height: 16, borderRadius: 8, overflow: 'hidden' },
  repostAvatarFallback: { backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  repostAvatarInitial: { fontSize: 8, fontWeight: '700', color: COLORS.primary },
  repostText: { fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  bottomLeft: { position: 'absolute', bottom: 26, left: 14, right: 90, gap: 5 },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  username: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold, color: COLORS.white },
  verifiedBadge: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  caption: { fontSize: FONT.size.sm, color: 'rgba(255,255,255,0.92)', lineHeight: 20 },
  captionTag: { color: COLORS.primaryLight, fontWeight: FONT.weight.semibold },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  soundText: { fontSize: FONT.size.xs, color: 'rgba(255,255,255,0.85)', flexShrink: 1 },

  rightActions: { position: 'absolute', right: 10, top: '50%', marginTop: -40, alignItems: 'center', gap: 20 },
  avatarWrap: { position: 'relative', marginBottom: 6 },
  avatarStoryRing: { padding: 2.5, borderRadius: 30, borderWidth: 2.5, borderColor: COLORS.primary },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
  },
  avatarFallback: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: { fontSize: 20, fontWeight: FONT.weight.bold, color: COLORS.primary },
  followDot: {
    position: 'absolute', bottom: -10, left: '50%',
    transform: [{ translateX: -12 }],
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.error, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#000',
  },
  followDotText: { color: COLORS.white, fontSize: 16, fontWeight: FONT.weight.bold, lineHeight: 22 },
  actionBtn: { alignItems: 'center', gap: 5 },
  actionCount: { fontSize: 13, fontWeight: FONT.weight.bold, color: COLORS.white,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },

  // Vinyl disc
  vinylWrap: { alignItems: 'center', marginTop: 4 },
  vinylOuter: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#111',
  },
  vinylRing: {
    display: 'none',
  },
  vinylCenter: {
    width: 28, height: 28, borderRadius: 14, overflow: 'hidden',
  },
  vinylHole: {
    position: 'absolute', width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },

  // Seek bar — 20px above bottom, 48px touch zone, 3px bar
  seekBarHit: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 48, justifyContent: 'flex-end',
    zIndex: 50, elevation: 50,
  },
  progressBg: {
    height: 3, backgroundColor: 'rgba(255,255,255,0.22)',
    position: 'relative', borderRadius: 99,
  },
  progressFill: {
    position: 'absolute', top: 0, left: 0, height: '100%',
    backgroundColor: COLORS.white, borderRadius: 99,
  },
  progressThumb: {
    position: 'absolute', top: -3.5, width: 9, height: 9,
    borderRadius: 4.5, backgroundColor: COLORS.white,
    marginLeft: -4.5, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.4, shadowRadius: 3,
  },
  seekTimeBubble: {
    position: 'absolute', bottom: 62, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  seekTimeText: { fontSize: 12, color: COLORS.white, fontWeight: FONT.weight.semibold },

  fullscreenBtn: {
    position: 'absolute', bottom: 72, alignSelf: 'center',
    left: W / 2 - 68,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.60)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  fullscreenText: { fontSize: 13, fontWeight: '500', color: COLORS.white },

  // Custom fullscreen — content rotated 90deg to fill the portrait screen sideways
  fsRoot: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  fsInner: { transform: [{ rotate: '90deg' }] },
  fsCloseBtn: {
    position: 'absolute', top: 20, left: 20, zIndex: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  fsPlayBtn: {
    position: 'absolute', top: '50%', left: '50%',
    marginTop: -30, marginLeft: -30,
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  fsProgressTrack: {
    position: 'absolute', bottom: 20, left: 20, right: 20,
    height: 3, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.25)',
  },
  fsProgressFill: {
    height: '100%', borderRadius: 99, backgroundColor: COLORS.white,
  },

  // Profile panel
  profilePanel: {
    position: 'absolute', top: 0, right: 0, bottom: 0,
    width: W,
    overflow: 'hidden',
  },
});

