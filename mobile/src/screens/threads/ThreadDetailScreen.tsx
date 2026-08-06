import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, SPACING, RADIUS } from '../../constants/theme';
import { IcBack, IcSend, IcHeartFill, IcHeart, IcComment, IcShare } from '../../components/ui/Icons';

type Props = NativeStackScreenProps<RootStackParamList, 'ThreadDetail'>;

interface Thread {
  id: string;
  content: string;
  like_count: number;
  reply_count: number;
  is_liked: boolean;
  created_at: string;
  user: { id: string; username: string; display_name: string; avatar_url: string | null; is_verified: boolean };
}

function fmtTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "à l'instant";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}j`;
}

export default function ThreadDetailScreen({ route, navigation }: Props) {
  const { threadId } = route.params as any;
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [replyText, setReplyText] = useState('');

  const { data: thread, isLoading: threadLoading } = useQuery<Thread>({
    queryKey: ['thread', threadId],
    queryFn: () => api.get(`/threads/${threadId}`).then(r => r.data).catch(() => null),
  });

  const { data: replies, isLoading: repliesLoading } = useQuery<{ items: Thread[] }>({
    queryKey: ['thread-replies', threadId],
    queryFn: () => api.get(`/threads/${threadId}/replies`).then(r => r.data).catch(() => ({ items: [] })),
  });

  const replyMutation = useMutation({
    mutationFn: (content: string) => api.post('/threads', { content, reply_to_id: threadId }),
    onSuccess: () => {
      setReplyText('');
      qc.invalidateQueries({ queryKey: ['thread-replies', threadId] });
    },
  });

  const likeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/threads/${id}/like`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['thread', threadId] }),
  });

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <IcBack size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Fil</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={replies?.items ?? []}
        keyExtractor={t => t.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          thread ? (
            <View style={[styles.mainThread, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
              <View style={styles.threadRow}>
                <View style={styles.leftCol}>
                  {thread.user.avatar_url
                    ? <Image source={{ uri: thread.user.avatar_url }} style={styles.avatar} />
                    : <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: theme.primaryBg }]}>
                        <Text style={styles.avatarInit}>{thread.user.display_name[0]?.toUpperCase()}</Text>
                      </View>
                  }
                  <View style={[styles.threadLine, { backgroundColor: theme.borderLight }]} />
                </View>
                <View style={styles.rightCol}>
                  <View style={styles.metaRow}>
                    <Text style={[styles.displayName, { color: theme.text }]}>{thread.user.display_name}</Text>
                    <Text style={[styles.time, { color: theme.textSubtle }]}>{fmtTime(thread.created_at)}</Text>
                  </View>
                  <Text style={[styles.content, { color: theme.text }]}>{thread.content}</Text>
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.action} onPress={() => likeMutation.mutate(thread.id)}>
                      {thread.is_liked ? <IcHeartFill size={18} color="#FF3B5C" /> : <IcHeart size={18} color={theme.textMuted} />}
                      <Text style={[styles.actionCount, { color: thread.is_liked ? '#FF3B5C' : theme.textMuted }]}>{thread.like_count}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.action}>
                      <IcComment size={18} color={theme.textMuted} />
                      <Text style={[styles.actionCount, { color: theme.textMuted }]}>{thread.reply_count}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.action}>
                      <IcShare size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <Text style={[styles.repliesLabel, { color: theme.textMuted, borderTopColor: theme.borderLight }]}>
                Réponses
              </Text>
            </View>
          ) : threadLoading ? <ActivityIndicator color={COLORS.primaryLight} style={{ marginTop: 20 }} /> : null
        }
        renderItem={({ item: t }) => (
          <View style={[styles.replyRow, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
            {t.user.avatar_url
              ? <Image source={{ uri: t.user.avatar_url }} style={styles.avatarSm} />
              : <View style={[styles.avatarSm, styles.avatarFallback, { backgroundColor: theme.primaryBg }]}>
                  <Text style={[styles.avatarInit, { fontSize: 12 }]}>{t.user.display_name[0]?.toUpperCase()}</Text>
                </View>
            }
            <View style={{ flex: 1, gap: 3 }}>
              <View style={styles.metaRow}>
                <Text style={[styles.displayName, { color: theme.text, fontSize: FONT.size.sm }]}>{t.user.display_name}</Text>
                <Text style={[styles.time, { color: theme.textSubtle }]}>{fmtTime(t.created_at)}</Text>
              </View>
              <Text style={[styles.content, { color: theme.text }]}>{t.content}</Text>
              <TouchableOpacity style={styles.action} onPress={() => likeMutation.mutate(t.id)}>
                {t.is_liked ? <IcHeartFill size={15} color="#FF3B5C" /> : <IcHeart size={15} color={theme.textMuted} />}
                {t.like_count > 0 && <Text style={[styles.actionCount, { color: t.is_liked ? '#FF3B5C' : theme.textMuted }]}>{t.like_count}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          !repliesLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>Aucune réponse</Text>
            </View>
          ) : <ActivityIndicator color={COLORS.primaryLight} style={{ marginTop: 20 }} />
        }
      />

      {/* Reply input */}
      <View style={[styles.inputRow, { borderTopColor: theme.borderLight, backgroundColor: theme.surface }]}>
        {user?.avatar_url
          ? <Image source={{ uri: user.avatar_url }} style={styles.avatarSm} />
          : <View style={[styles.avatarSm, styles.avatarFallback, { backgroundColor: theme.primaryBg }]}>
              <Text style={[styles.avatarInit, { fontSize: 12 }]}>{user?.display_name?.[0]?.toUpperCase() ?? 'U'}</Text>
            </View>
        }
        <TextInput
          style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border }]}
          value={replyText}
          onChangeText={setReplyText}
          placeholder={`Répondre à @${thread?.user.username ?? ''}...`}
          placeholderTextColor={theme.textSubtle}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!replyText.trim() || replyMutation.isPending) && { opacity: 0.4 }]}
          onPress={() => replyText.trim() && replyMutation.mutate(replyText.trim())}
          disabled={!replyText.trim() || replyMutation.isPending}
        >
          {replyMutation.isPending ? <ActivityIndicator size="small" color={COLORS.white} /> : <IcSend size={16} color={COLORS.white} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold },
  mainThread: { padding: SPACING.md, borderBottomWidth: 1 },
  threadRow: { flexDirection: 'row', gap: 10 },
  leftCol: { alignItems: 'center', gap: 4 },
  rightCol: { flex: 1, gap: 6 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarSm: { width: 32, height: 32, borderRadius: 16, flexShrink: 0 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInit: { fontSize: 15, fontWeight: FONT.weight.bold, color: COLORS.primary },
  threadLine: { width: 2, flex: 1, minHeight: 20, borderRadius: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  displayName: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  time: { fontSize: FONT.size.xs },
  content: { fontSize: FONT.size.base, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionCount: { fontSize: FONT.size.xs },
  repliesLabel: { fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold, letterSpacing: 0.5, marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1 },
  replyRow: { flexDirection: 'row', gap: 10, paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 0.5 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: FONT.size.sm },
  inputRow: { flexDirection: 'row', gap: 8, padding: SPACING.sm, paddingHorizontal: SPACING.md, borderTopWidth: 1, alignItems: 'flex-end' },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, fontSize: FONT.size.sm, maxHeight: 100, borderWidth: 1 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
});
