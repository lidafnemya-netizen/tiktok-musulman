/**
 * Fullscreen player — opened from profile grid.
 * If `userId` param passed, loads that user's posts and enables vertical swipe.
 * Otherwise falls back to single-video mode.
 */
import React, { useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, StatusBar, TouchableOpacity, FlatList, Dimensions } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation';
import { api } from '../../api/client';
import { VideoPlayerItem, FeedPost } from '../../components/video/VideoPlayerItem';
import { CommentsBottomSheet } from '../../components/video/CommentsBottomSheet';
import { IcBack } from '../../components/ui/Icons';
import { COLORS } from '../../constants/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoPlayer'>;

const { height: SCREEN_H } = Dimensions.get('window');

export default function VideoPlayerScreen({ route, navigation }: Props) {
  const { postId, userId, draftsOnly } = route.params;
  const insets = useSafeAreaInsets();
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string>(postId);
  const flatRef = useRef<FlatList<FeedPost>>(null);

  const { data: singlePost } = useQuery<FeedPost>({
    queryKey: ['post', postId],
    queryFn: () => api.get(`/posts/${postId}`).then((r) => r.data),
    enabled: !userId,
  });

  const { data: userPosts } = useQuery<{ items: FeedPost[] }>({
    queryKey: ['user-posts-swipe', userId, draftsOnly],
    queryFn: () => api.get(`/posts/user/${userId}`, { params: draftsOnly ? { drafts_only: 1 } : undefined }).then((r) => r.data),
    enabled: !!userId,
  });

  const posts: FeedPost[] = userId ? (userPosts?.items ?? []) : (singlePost ? [singlePost] : []);
  const initialIndex = useMemo(() => Math.max(0, posts.findIndex((p) => p.id === postId)), [posts, postId]);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0 && viewableItems[0].item) {
      setActiveId(viewableItems[0].item.id);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const renderItem = useCallback(({ item }: { item: FeedPost }) => (
    <View style={{ height: SCREEN_H }}>
      <VideoPlayerItem
        post={item}
        isVisible={activeId === item.id && commentsPostId === null}
        onComment={() => setCommentsPostId(item.id)}
      />
    </View>
  ), [activeId, commentsPostId]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.8}
      >
        <IcBack size={24} color={COLORS.white} />
      </TouchableOpacity>

      {posts.length > 0 && (
        <FlatList
          ref={flatRef}
          data={posts}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_H, offset: SCREEN_H * i, index: i })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          removeClippedSubviews
          windowSize={3}
          maxToRenderPerBatch={2}
        />
      )}

      <CommentsBottomSheet
        postId={commentsPostId}
        onClose={() => setCommentsPostId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  backBtn: {
    position: 'absolute', left: 14, zIndex: 100,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
});
