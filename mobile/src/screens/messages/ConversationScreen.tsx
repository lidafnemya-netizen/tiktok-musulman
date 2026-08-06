import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, Image,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Pressable, Animated, Modal, Alert,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import { RootStackParamList } from '../../navigation';
import { api, getTokens } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useTheme } from '../../hooks/useTheme';
import { COLORS, SPACING, WS_URL, FONT, RADIUS, API_BASE_URL } from '../../constants';
import {
  IcSend, IcCornerUpLeft, IcTrash, IcClose, IcImage,
  IcHeart, IcThumbsUp, IcSmile, IcFrown, IcStar,
} from '../../components/ui/Icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Conversation'>;

interface Message {
  id: string;
  content: string;
  media_url?: string | null;
  created_at: string;
  reactions?: Record<string, string>; // userId → reaction key
  reply_to?: { id: string; content: string; sender_name: string } | null;
  sender: { id: string; username: string; display_name: string; avatar_url: string | null };
}

const REACTIONS = ['heart', 'like', 'haha', 'wow', 'sad'] as const;
const REACTION_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  heart: IcHeart, like: IcThumbsUp, haha: IcSmile, wow: IcStar, sad: IcFrown,
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export default function ConversationScreen({ route, navigation }: Props) {
  const { conversationId, otherUser } = route.params;
  const { user } = useAuthStore();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactingTo, setReactingTo] = useState<Message | null>(null);
  const [myReactions, setMyReactions] = useState<Record<string, string>>({});
  const [sendingImage, setSendingImage] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const flatRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  const { isLoading, isError, data: msgData } = useQuery<{ items: Message[] }>({
    queryKey: ['messages', conversationId],
    queryFn: () => api.get(`/messages/conversations/${conversationId}/messages`).then(r => r.data).catch(() => ({ items: [] })),
    retry: 1,
  });

  useEffect(() => {
    if (msgData?.items) {
      const sorted = [...msgData.items].reverse();
      setMessages(sorted);
      // Load my reactions
      const rx: Record<string, string> = {};
      sorted.forEach(m => {
        if (m.reactions && user?.id && m.reactions[user.id]) {
          rx[m.id] = m.reactions[user.id];
        }
      });
      setMyReactions(rx);
    }
  }, [msgData, user?.id]);

  useEffect(() => {
    navigation.setOptions({
      title: otherUser.display_name,
      headerStyle: { backgroundColor: theme.surface },
      headerTintColor: theme.text,
    });

    let socket: Socket;
    (async () => {
      const tokens = await getTokens();
      if (!tokens) return;
      socket = io(WS_URL, { auth: { token: tokens.access }, transports: ['websocket'] });
      socket.emit('join:conversation', conversationId);
      socket.on('message:new', (msg: Message) => {
        setMessages(prev => {
          if (prev.find(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      });
      socket.on('message:reaction', ({ msgId, userId, emoji }: { msgId: string; userId: string; emoji: string }) => {
        setMessages(prev => prev.map(m =>
          m.id === msgId
            ? { ...m, reactions: { ...(m.reactions ?? {}), [userId]: emoji } }
            : m
        ));
      });
      socketRef.current = socket;
    })();

    return () => {
      socketRef.current?.emit('leave:conversation', conversationId);
      socketRef.current?.disconnect();
    };
  }, [conversationId, theme.surface, theme.text]);

  const sendMutation = useMutation({
    mutationFn: (payload: { content: string; reply_to_id?: string; media_url?: string }) =>
      api.post(`/messages/conversations/${conversationId}/messages`, payload),
    onSuccess: res => {
      setMessages(prev => [...prev, res.data]);
      setText('');
      setReplyTo(null);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    },
    onError: () => Alert.alert('Erreur', "Impossible d'envoyer le message."),
  });

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate({ content: trimmed, reply_to_id: replyTo?.id });
  }, [text, replyTo, sendMutation]);

  const handlePickImage = useCallback(async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.9 });
    if (result.didCancel || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    setSendingImage(true);
    try {
      const tokens = await getTokens();
      if (!tokens) throw new Error('Non authentifié');
      const fd = new FormData();
      fd.append('file', { uri: asset.uri, type: asset.type ?? 'image/jpeg', name: asset.fileName ?? 'photo.jpg' } as any);
      const up = await fetch(`${API_BASE_URL}/upload/image`, {
        method: 'POST', headers: { Authorization: `Bearer ${tokens.access}` }, body: fd,
      });
      if (!up.ok) throw new Error('Upload échoué');
      const { url } = await up.json();
      if (!url) throw new Error('URL manquante');
      sendMutation.mutate({ content: 'Photo', media_url: url, reply_to_id: replyTo?.id });
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? "Impossible d'envoyer la photo.");
    } finally {
      setSendingImage(false);
    }
  }, [replyTo, sendMutation]);

  const handleReact = useCallback(async (emoji: string) => {
    if (!reactingTo || !user?.id) return;
    const msgId = reactingTo.id;
    const prev = myReactions[msgId];
    const newEmoji = prev === emoji ? '' : emoji;

    setMyReactions(r => ({ ...r, [msgId]: newEmoji }));
    setMessages(msgs => msgs.map(m =>
      m.id === msgId
        ? { ...m, reactions: { ...(m.reactions ?? {}), [user.id]: newEmoji } }
        : m
    ));
    setReactingTo(null);

    try {
      await api.post(`/messages/conversations/${conversationId}/messages/${msgId}/react`, { emoji: newEmoji });
      socketRef.current?.emit('message:reaction', { conversationId, msgId, emoji: newEmoji });
    } catch {}
  }, [reactingTo, myReactions, user?.id, conversationId]);

  const handleDelete = useCallback(async (msgId: string) => {
    Alert.alert('Supprimer', 'Supprimer ce message ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: async () => {
          setMessages(msgs => msgs.map(m =>
            m.id === msgId ? { ...m, content: '[DELETED]' } : m
          ));
          try { await api.delete(`/messages/conversations/${conversationId}/messages/${msgId}`); } catch {}
        },
      },
    ]);
    setReactingTo(null);
  }, [conversationId]);

  const renderItem = useCallback(({ item: m }: { item: Message }) => {
    const isMe = m.sender.id === user?.id;
    const deleted = m.content === '[DELETED]' || m.content === '[HIDDEN]';
    const myRx = myReactions[m.id];

    // Collect visible reactions
    const rxList = m.reactions ? Object.entries(m.reactions).filter(([, e]) => e) : [];

    return (
      <Pressable
        onLongPress={() => !deleted && setReactingTo(m)}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.bubbleRow,
          isMe ? styles.bubbleRowMe : styles.bubbleRowThem,
          pressed && { opacity: 0.85 },
        ]}
      >
        {/* Reply preview */}
        {m.reply_to && (
          <View style={[styles.replyPreview, { borderLeftColor: COLORS.primary, backgroundColor: theme.card }]}>
            <Text style={[styles.replyName, { color: COLORS.primary }]} numberOfLines={1}>
              {m.reply_to.sender_name}
            </Text>
            <Text style={[styles.replyText, { color: theme.textMuted }]} numberOfLines={1}>
              {m.reply_to.content}
            </Text>
          </View>
        )}

        <View style={[
          styles.bubble,
          isMe ? [styles.bubbleMe, { backgroundColor: COLORS.primary }]
               : [styles.bubbleThem, { backgroundColor: theme.card, borderColor: theme.borderLight, borderWidth: 1 }],
          deleted && { opacity: 0.55 },
        ]}>
          {m.media_url && !deleted && (
            <Image source={{ uri: m.media_url }} style={styles.bubbleImage} resizeMode="cover" />
          )}
          {(!m.media_url || deleted) && (
            <Text style={[styles.bubbleText, { color: isMe ? '#fff' : theme.text }]}>
              {deleted ? 'Message supprimé' : m.content}
            </Text>
          )}
          <Text style={[styles.timeText, { color: isMe ? 'rgba(255,255,255,0.6)' : theme.textMuted }]}>
            {fmtTime(m.created_at)}
          </Text>
        </View>

        {/* Reactions display */}
        {rxList.length > 0 && (
          <View style={[styles.rxRow, isMe ? styles.rxRowMe : styles.rxRowThem]}>
            {rxList.slice(0, 5).map(([uid, key]) => {
              const RxIcon = REACTION_ICONS[key] ?? IcHeart;
              return <RxIcon key={uid} size={13} color={COLORS.primary} />;
            })}
            {rxList.length > 5 && (
              <Text style={[styles.rxCount, { color: theme.textMuted }]}>+{rxList.length - 5}</Text>
            )}
          </View>
        )}

        {/* Swipe-to-reply hint (right side for them, left for me) */}
        {!deleted && (
          <TouchableOpacity
            style={[styles.replyBtn, isMe ? styles.replyBtnMe : styles.replyBtnThem]}
            onPress={() => { setReplyTo(m); inputRef.current?.focus(); }}
            activeOpacity={0.7}
          >
            <IcCornerUpLeft size={14} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </Pressable>
    );
  }, [user?.id, myReactions, theme]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      {/* Reaction picker modal */}
      <Modal visible={!!reactingTo} transparent animationType="fade" onRequestClose={() => setReactingTo(null)}>
        <Pressable style={styles.rxBackdrop} onPress={() => setReactingTo(null)}>
          <View style={[styles.rxPicker, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {REACTIONS.map(key => {
              const RxIcon = REACTION_ICONS[key];
              const active = reactingTo && myReactions[reactingTo.id] === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.rxBtn, active && { backgroundColor: theme.primaryBg }]}
                  onPress={() => handleReact(key)}
                  activeOpacity={0.7}
                >
                  <RxIcon size={22} color={active ? COLORS.primary : theme.text} />
                </TouchableOpacity>
              );
            })}
            {reactingTo?.sender.id === user?.id && (
              <TouchableOpacity style={styles.rxBtn} onPress={() => handleDelete(reactingTo!.id)} activeOpacity={0.7}>
                <IcTrash size={18} color="#FF3B30" />
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primaryLight} /></View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={{ color: COLORS.primary, fontSize: 15, fontWeight: '600', textAlign: 'center', paddingHorizontal: 32 }}>
            Impossible de charger la conversation. Vérifie ta connexion.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={[styles.list, { paddingBottom: replyTo ? 100 : 16 }]}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                Envoie ton premier message
              </Text>
            </View>
          }
        />
      )}

      {/* Reply banner */}
      {replyTo && (
        <View style={[styles.replyBanner, { backgroundColor: theme.card, borderTopColor: theme.borderLight }]}>
          <View style={styles.replyBannerLeft}>
            <IcCornerUpLeft size={14} color={COLORS.primary} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.replyBannerName, { color: COLORS.primary }]} numberOfLines={1}>
                {replyTo.sender.display_name}
              </Text>
              <Text style={[styles.replyBannerText, { color: theme.textMuted }]} numberOfLines={1}>
                {replyTo.content}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 4 }}>
            <IcClose size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input row */}
      <View style={[styles.inputRow, {
        backgroundColor: theme.surface,
        borderTopColor: theme.borderLight,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
      }]}>
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={handlePickImage}
          disabled={sendingImage}
          activeOpacity={0.7}
        >
          {sendingImage
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <IcImage size={22} color={COLORS.primary} />
          }
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          style={[styles.input, {
            backgroundColor: theme.card,
            color: theme.text,
            borderColor: theme.border,
          }]}
          value={text}
          onChangeText={setText}
          placeholder="Message..."
          placeholderTextColor={theme.textMuted}
          multiline
          maxLength={2000}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sendMutation.isPending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sendMutation.isPending}
          activeOpacity={0.8}
        >
          {sendMutation.isPending
            ? <ActivityIndicator size="small" color="#fff" />
            : <IcSend size={18} color="#fff" />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, gap: 4 },

  bubbleRow: { maxWidth: '80%', marginVertical: 2 },
  bubbleRowMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleRowThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },

  bubble: {
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
    borderBottomRightRadius: 4,
  },
  bubbleMe: { borderBottomRightRadius: 4, borderBottomLeftRadius: 18 },
  bubbleThem: { borderBottomRightRadius: 18, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleImage: { width: 200, height: 200, borderRadius: 12 },
  timeText: { fontSize: 10, marginTop: 2, textAlign: 'right' },

  replyPreview: {
    borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4,
    marginBottom: 4, borderRadius: 4,
  },
  replyName: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  replyText: { fontSize: 12 },

  rxRow: { flexDirection: 'row', gap: 2, marginTop: 3 },
  rxRowMe: { alignSelf: 'flex-end' },
  rxRowThem: { alignSelf: 'flex-start' },
  rxEmoji: { fontSize: 14 },
  rxCount: { fontSize: 11, alignSelf: 'center' },

  replyBtn: { position: 'absolute', top: '50%', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  replyBtnMe: { left: -32 },
  replyBtnThem: { right: -32 },

  replyBanner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 8,
    borderTopWidth: 1, gap: 8,
  },
  replyBannerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  replyBannerName: { fontSize: 12, fontWeight: '700' },
  replyBannerText: { fontSize: 12 },

  inputRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: SPACING.md, paddingTop: 8,
    borderTopWidth: 1, alignItems: 'flex-end',
  },
  input: {
    flex: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, maxHeight: 120, borderWidth: 1,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  attachBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },

  rxBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  rxPicker: {
    flexDirection: 'row', borderRadius: 20, padding: 8, gap: 4,
    borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12,
  },
  rxBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rxBtnEmoji: { fontSize: 24 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: FONT.size.sm },
});
