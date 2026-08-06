import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Image, TouchableWithoutFeedback,
} from 'react-native';
import Video from 'react-native-video';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { COLORS, SCREEN_HEIGHT } from '../../constants';

const { width: SCREEN_W } = Dimensions.get('window');

interface Post {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  duration: number;
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  };
  sound: { id: string; title: string; artist: string | null } | null;
}

interface Props {
  post: Post;
  isActive: boolean;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function VideoPost({ post, isActive }: Props) {
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState(post.is_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();

  const likeMutation = useMutation({
    mutationFn: () => api.post(`/posts/${post.id}/like`),
    onMutate: () => {
      setLiked((p) => !p);
      setLikeCount((c) => (liked ? c - 1 : c + 1));
    },
    onError: () => {
      setLiked((p) => !p);
      setLikeCount((c) => (liked ? c + 1 : c - 1));
    },
  });

  const handleTap = useCallback(() => setPaused((p) => !p), []);

  return (
    <View style={styles.container}>
      <TouchableWithoutFeedback onPress={handleTap}>
        <View style={StyleSheet.absoluteFill}>
          {isActive ? (
            <Video
              source={{ uri: post.video_url }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              repeat
              paused={paused || !isActive}
              ignoreSilentSwitch="ignore"
              playInBackground={false}
              playWhenInactive={false}
            />
          ) : post.thumbnail_url ? (
            <Image source={{ uri: post.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
          )}
          <View style={styles.gradient} />
        </View>
      </TouchableWithoutFeedback>

      {paused && (
        <View style={styles.pauseIcon} pointerEvents="none">
          <Text style={styles.pauseText}>▶</Text>
        </View>
      )}

      {/* Right actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate('UserProfile', { userId: post.user.id, username: post.user.username })}
        >
          <View style={styles.avatar}>
            {post.user.avatar_url ? (
              <Image source={{ uri: post.user.avatar_url }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarImg, { backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
                  {post.user.display_name[0]?.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={() => likeMutation.mutate()} activeOpacity={0.8}>
          <Text style={[styles.actionIcon, liked && styles.liked]}>♥</Text>
          <Text style={styles.actionCount}>{formatCount(likeCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
          activeOpacity={0.8}
        >
          <Text style={styles.actionIcon}>◻</Text>
          <Text style={styles.actionCount}>{formatCount(post.comment_count)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.8}>
          <Text style={styles.actionIcon}>⤴</Text>
          <Text style={styles.actionCount}>Partager</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View style={styles.bottomInfo}>
        <TouchableOpacity
          onPress={() => navigation.navigate('UserProfile', { userId: post.user.id, username: post.user.username })}
        >
          <Text style={styles.username}>{post.user.display_name || post.user.username}</Text>
        </TouchableOpacity>
        {post.caption ? <Text style={styles.caption} numberOfLines={3}>{post.caption}</Text> : null}
        {post.sound ? (
          <View style={styles.soundRow}>
            <Text style={styles.soundIcon}>♪</Text>
            <Text style={styles.soundText} numberOfLines={1}>
              {post.sound.title}{post.sound.artist ? ` - ${post.sound.artist}` : ''}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const styles = StyleSheet.create({
  container: { width: SCREEN_W, height: SCREEN_HEIGHT, backgroundColor: '#000' },
  gradient: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  pauseIcon: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  pauseText: { fontSize: 60, color: 'rgba(255,255,255,0.7)' },
  actions: {
    position: 'absolute',
    right: 12,
    bottom: 100,
    alignItems: 'center',
    gap: 20,
  },
  actionBtn: { alignItems: 'center', gap: 3 },
  actionIcon: { fontSize: 28, color: COLORS.text },
  liked: { color: '#ef4444' },
  actionCount: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.text,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  bottomInfo: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 80,
    gap: 4,
  },
  username: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  caption: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  soundIcon: { fontSize: 14, color: COLORS.text },
  soundText: { fontSize: 13, color: COLORS.text, flex: 1 },
});
