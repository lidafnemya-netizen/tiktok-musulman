import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Animated, PanResponder, Dimensions, KeyboardAvoidingView,
  Platform, ActivityIndicator, Image, Modal, Alert, ActionSheetIOS,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../hooks/useTheme';
import { COLORS, FONT, SPACING, RADIUS } from '../../constants/theme';
import { IcClose, IcSend, IcHeartFill, IcHeart, IcComment, IcMore, IcFilterSort } from '../ui/Icons';

const { height: H } = Dimensions.get('window');
const SHEET_HEIGHT = H * 0.55;
const DRAG_THRESHOLD = 80;

interface Comment {
  id: string;
  content: string;
  like_count: number;
  reply_count: number;
  is_liked?: boolean;
  created_at: string;
  user: { id: string; username: string; display_name: string; avatar_url: string | null };
}

function fmtTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'maintenant';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}j`;
}

interface Props {
  postId: string | null;
  onClose: () => void;
}

export function CommentsBottomSheet({ postId, onClose }: Props) {
  const theme = useTheme();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const inputRef = useRef<any>(null);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  // Auto-focus input when replying
  React.useEffect(() => {
    if (replyTo) {
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [replyTo]);
  const lastY = useRef(0);

  // Animate in/out
  useEffect(() => {
    if (postId) {
      Animated.spring(translateY, {
        toValue: 0, useNativeDriver: true,
        tension: 65, friction: 11,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT, duration: 220, useNativeDriver: true,
      }).start();
    }
  }, [postId]);

  const close = useCallback(() => {
    Animated.timing(translateY, {
      toValue: SHEET_HEIGHT, duration: 200, useNativeDriver: true,
    }).start(onClose);
  }, [onClose, translateY]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
    onPanResponderMove: (_, g) => {
      if (g.dy > 0) translateY.setValue(g.dy);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy > DRAG_THRESHOLD || g.vy > 0.5) {
        close();
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
      }
    },
  })).current;

  // Allow swipe-down-to-close from anywhere in the list, but only when scrolled to the top
  const listScrollY = useRef(0);
  const listPanResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponderCapture: (_, g) => listScrollY.current <= 0 && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => {
      if (g.dy > 0) translateY.setValue(g.dy);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy > DRAG_THRESHOLD || g.vy > 0.5) {
        close();
      } else {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
      }
    },
  })).current;

  const [limit, setLimit] = useState(20);
  const { data, isLoading } = useQuery<{ items: Comment[]; next_cursor: string | null }>({
    queryKey: ['comments', postId, limit],
    queryFn: () => api.get(`/comments/post/${postId}`, { params: { limit } }).then(r => r.data),
    enabled: !!postId,
  });

  const addMutation = useMutation({
    mutationFn: (content: string) => api.post(`/comments/post/${postId}`, {
      content,
      parent_id: replyTo?.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', postId] });
      setText('');
      setReplyTo(null);
    },
  });

  if (!postId) return null;

  return (
    <Modal visible={!!postId} transparent animationType="none" onRequestClose={close}>
      {/* Backdrop */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={close} />

      <KeyboardAvoidingView
        style={styles.kvWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[styles.sheet, { backgroundColor: theme.surface, transform: [{ translateY }] }]}
        >
          {/* Handle bar */}
          <View {...panResponder.panHandlers} style={styles.handleArea}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>
                  {data?.items?.length ? `${data.items.length} commentaires` : 'Commentaires'}
                </Text>
                <IcFilterSort size={16} color={theme.textMuted} />
              </View>
              <TouchableOpacity onPress={close} style={styles.closeBtn}>
                <IcClose size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Comments list */}
          {isLoading ? (
            <View style={styles.center}><ActivityIndicator color={COLORS.primaryLight} /></View>
          ) : (
            <FlatList
              {...listPanResponder.panHandlers}
              data={data?.items ?? []}
              keyExtractor={c => c.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onScroll={(e) => { listScrollY.current = e.nativeEvent.contentOffset.y; }}
              renderItem={({ item: c }) => (
                <CommentRow
                  comment={c}
                  theme={theme}
                  currentUserId={user?.id}
                  onReply={(username?: string) => setReplyTo({ id: c.id, username: username ?? c.user.username })}
                  onDelete={() => {
                    api.delete(`/comments/${c.id}`).then(() => {
                      qc.invalidateQueries({ queryKey: ['comments', postId] });
                    }).catch(() => {});
                  }}
                  postId={postId!}
                />
              )}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>Soyez le premier à commenter</Text>
                </View>
              }
              ListFooterComponent={
                data?.next_cursor ? (
                  <TouchableOpacity
                    style={styles.loadMore}
                    onPress={() => setLimit(l => l + 20)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.loadMoreText, { color: COLORS.primary }]}>Voir plus de commentaires</Text>
                  </TouchableOpacity>
                ) : null
              }
            />
          )}

          {/* Input */}
          <View style={[styles.inputRow, { borderTopColor: theme.borderLight, backgroundColor: theme.surface, paddingBottom: Math.max(insets.bottom, 12) }]}>
            {replyTo && (
              <View style={[styles.replyBanner, { backgroundColor: theme.inputBg }]}>
                <Text style={[styles.replyBannerText, { color: theme.textMuted }]}>
                  Répondre à <Text style={{ color: COLORS.primary }}>@{replyTo.username}</Text>
                </Text>
                <TouchableOpacity onPress={() => setReplyTo(null)}>
                  <IcClose size={14} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.inputInner}>
              {user?.avatar_url
                ? <Image source={{ uri: user.avatar_url }} style={styles.myAvatar} />
                : (
                  <View style={[styles.myAvatar, styles.myAvatarFallback, { backgroundColor: theme.primaryBg }]}>
                    <Text style={styles.myAvatarInitial}>{user?.display_name?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                )
              }
              <TextInput
                ref={inputRef}
                style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
                value={text}
                onChangeText={setText}
                placeholder={replyTo ? `Répondre à @${replyTo.username}...` : 'Ajouter un commentaire...'}
                placeholderTextColor={theme.textSubtle}
                multiline
                maxLength={500}
              />
              {text.trim().length > 0 && (
                <TouchableOpacity
                  style={styles.sendBtn}
                  onPress={() => text.trim() && addMutation.mutate(text.trim())}
                  disabled={addMutation.isPending}
                >
                  {addMutation.isPending
                    ? <ActivityIndicator size="small" color={COLORS.white} />
                    : <IcSend size={17} color={COLORS.white} />
                  }
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function CommentRow({
  comment: c, theme, currentUserId, onReply, onDelete, postId,
}: {
  comment: Comment; theme: any; currentUserId?: string;
  onReply: (username?: string) => void; onDelete: () => void; postId: string;
}) {
  const [liked, setLiked] = useState(c.is_liked ?? false);
  const [count, setCount] = useState(c.like_count);
  const [showReplies, setShowReplies] = useState(false);
  const qc = useQueryClient();
  const { data: repliesData, isLoading: repliesLoading } = useQuery<{ items: Comment[] }>({
    queryKey: ['comment-replies', c.id],
    queryFn: () => api.get(`/comments/${c.id}/replies`).then(r => r.data),
    enabled: showReplies,
  });
  const isOwn = currentUserId === c.user.id;

  const handleLike = () => {
    const wasLiked = liked;
    setLiked(l => !l);
    setCount(n => wasLiked ? n - 1 : n + 1);
    ReactNativeHapticFeedback.trigger(wasLiked ? 'impactLight' : 'impactMedium', { enableVibrateFallback: true });
    api.post(`/comments/${c.id}/like`).catch(() => {
      setLiked(wasLiked);
      setCount(c.like_count);
    });
  };

  const handleMore = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: isOwn ? ['Répondre', 'Supprimer', 'Annuler'] : ['Répondre', 'Annuler'],
          cancelButtonIndex: isOwn ? 2 : 1,
          destructiveButtonIndex: isOwn ? 1 : undefined,
        },
        (i) => {
          if (i === 0) onReply();
          if (isOwn && i === 1) {
            Alert.alert('Supprimer', 'Supprimer ce commentaire ?', [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Supprimer', style: 'destructive', onPress: onDelete },
            ]);
          }
        },
      );
    } else {
      Alert.alert('Commentaire', '', [
        { text: 'Répondre', onPress: onReply },
        ...(isOwn ? [{ text: 'Supprimer', style: 'destructive' as const, onPress: onDelete }] : []),
        { text: 'Annuler', style: 'cancel' },
      ]);
    }
  };

  return (
    <View style={styles.comment}>
      {c.user.avatar_url
        ? <Image source={{ uri: c.user.avatar_url }} style={styles.avatar} />
        : <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.primaryBg }]}>
            <Text style={styles.avatarInitial}>{c.user.display_name[0]?.toUpperCase()}</Text>
          </View>
      }
      <View style={styles.commentBody}>
        <Text style={[styles.commentUser, { color: COLORS.primary }]}>@{c.user.username}</Text>
        <Text style={[styles.commentText, { color: theme.text }]}>{c.content}</Text>
        <View style={styles.commentMeta}>
          <Text style={[styles.commentTime, { color: theme.textSubtle }]}>{fmtTime(c.created_at)}</Text>
          <TouchableOpacity onPress={() => onReply()} activeOpacity={0.7}>
            <Text style={[styles.commentTime, { color: theme.textMuted }]}>Répondre</Text>
          </TouchableOpacity>
          {c.reply_count > 0 && (
            <TouchableOpacity onPress={() => setShowReplies(v => !v)} activeOpacity={0.7}>
              <Text style={[styles.commentTime, { color: COLORS.primary }]}>
                {showReplies ? 'Masquer' : `${c.reply_count} réponse${c.reply_count > 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Replies inline */}
        {showReplies && (
          <View style={styles.repliesWrap}>
            {repliesLoading
              ? <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 6 }} />
              : repliesData?.items.map(r => (
                  <View key={r.id} style={styles.replyItem}>
                    {r.user.avatar_url
                      ? <Image source={{ uri: r.user.avatar_url }} style={styles.replyAvatar} />
                      : <View style={[styles.replyAvatar, styles.avatarFallback, { backgroundColor: theme.primaryBg }]}>
                          <Text style={[styles.avatarInitial, { fontSize: 10 }]}>{r.user.display_name[0]?.toUpperCase()}</Text>
                        </View>
                    }
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={[styles.commentUser, { color: COLORS.primary, fontSize: 11 }]}>@{r.user.username}</Text>
                      <Text style={[styles.commentText, { color: theme.text, fontSize: FONT.size.xs }]}>{r.content}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                        <Text style={[styles.commentTime, { color: theme.textSubtle }]}>{fmtTime(r.created_at)}</Text>
                        <TouchableOpacity onPress={() => onReply(r.user.username)} activeOpacity={0.7}>
                          <Text style={[styles.commentTime, { color: theme.textMuted }]}>Répondre</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    {(r.like_count ?? 0) > 0 && (
                      <View style={{ alignItems: 'center', gap: 2 }}>
                        <IcHeart size={13} color={theme.textMuted} />
                        <Text style={{ fontSize: 9, color: theme.textMuted }}>{r.like_count}</Text>
                      </View>
                    )}
                  </View>
                ))
            }
          </View>
        )}
      </View>
      <View style={styles.commentActions}>
        <TouchableOpacity style={styles.likeBtn} onPress={handleLike} activeOpacity={0.7}>
          {liked ? <IcHeartFill size={16} color="#FF3B5C" /> : <IcHeart size={16} color={theme.textMuted} />}
          {count > 0 && <Text style={[styles.likeCount, { color: liked ? '#FF3B5C' : theme.textMuted }]}>{count}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleMore} activeOpacity={0.7} style={{ padding: 4 }}>
          <IcMore size={16} color={theme.textSubtle} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent' },
  kvWrapper: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 20,
  },
  handleArea: { paddingTop: 10, paddingHorizontal: SPACING.md, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  closeBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 30 },
  list: { padding: SPACING.md, gap: 14, paddingBottom: 10 },
  empty: { alignItems: 'center', paddingTop: 30 },
  emptyText: { fontSize: FONT.size.sm },
  loadMore: { alignItems: 'center', paddingVertical: 14 },
  loadMoreText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },

  comment: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatar: { width: 34, height: 34, borderRadius: 17, flexShrink: 0 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 13, fontWeight: FONT.weight.bold, color: COLORS.primary },
  commentBody: { flex: 1, gap: 2 },
  commentUser: { fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold },
  commentText: { fontSize: FONT.size.sm, lineHeight: 20 },
  commentMeta: { flexDirection: 'row', gap: 12, marginTop: 2 },
  commentTime: { fontSize: 11 },
  commentActions: { alignItems: 'center', gap: 6 },
  likeBtn: { alignItems: 'center', gap: 2, paddingLeft: 4 },
  likeCount: { fontSize: 10 },

  repliesWrap: { marginTop: 8, gap: 8, paddingLeft: 4 },
  replyItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  replyAvatar: { width: 26, height: 26, borderRadius: 13, flexShrink: 0 },

  inputRow: {
    flexDirection: 'column', padding: SPACING.sm,
    paddingHorizontal: SPACING.md, borderTopWidth: 1,
  },
  inputInner: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  myAvatar: { width: 32, height: 32, borderRadius: 16, flexShrink: 0 },
  myAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
  myAvatarInitial: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 8,
  },
  replyBannerText: { fontSize: FONT.size.xs },
  input: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    fontSize: FONT.size.sm, maxHeight: 100, borderWidth: 1,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOff: { opacity: 0.4 },
});
