/**
 * LiveViewerScreen — Watch a live stream
 * WebRTC viewer + Socket.io chat
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, Alert, ActivityIndicator, Dimensions, StatusBar,
} from 'react-native';
import { RTCPeerConnection, RTCView, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { io, Socket } from 'socket.io-client';
import { useQuery } from '@tanstack/react-query';
import { api, getTokens } from '../../api/client';
import { API_BASE_URL } from '../../constants/theme';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, SPACING, RADIUS } from '../../constants/theme';
import { IcClose, IcHeart, IcUsers, IcSend } from '../../components/ui/Icons';

const { width: W, height: H } = Dimensions.get('window');
const SOCKET_URL = API_BASE_URL.replace('/api', '');
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

type Props = NativeStackScreenProps<RootStackParamList, 'LiveViewer'>;

interface ChatMsg { id?: string; user: { id: string; display_name: string; avatar_url: string | null }; text: string; timestamp: number }
interface LiveSession {
  id: string; title: string; viewer_count: number; chat_enabled: boolean;
  user: { id: string; username: string; display_name: string; avatar_url: string | null };
}

export default function LiveViewerScreen({ route, navigation }: Props) {
  const { sessionId, broadcasterId } = route.params as any;
  const insets = useSafeAreaInsets();
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatText, setChatText] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [connected, setConnected] = useState(false);
  const [liveEnded, setLiveEnded] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const { data: session } = useQuery<LiveSession>({
    queryKey: ['live-session', sessionId],
    queryFn: () => api.get(`/live/${sessionId}`).then(r => r.data),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (session) {
      setViewerCount(session.viewer_count);
      setChatEnabled(session.chat_enabled);
    }
  }, [session]);

  // ── Socket + WebRTC ─────────────────────────────────────────────────────────
  useEffect(() => {
    let pc: RTCPeerConnection;

    (async () => {
      const tokens = await getTokens();
      if (!tokens) return;

      const socket = io(SOCKET_URL, { auth: { token: tokens.access }, transports: ['websocket'] });
      socketRef.current = socket;

      socket.on('connect', () => {
        socket.emit('live:join', sessionId);
        socket.emit('live:viewer:join', { sessionId, broadcasterId });

        // Load recent messages
        api.get(`/live/${sessionId}/messages`).then(r => setMessages(r.data.items)).catch(() => {});
      });

      socket.on('live:ended', () => setLiveEnded(true));

      socket.on('live:comment', (msg: ChatMsg) => {
        setMessages(prev => [...prev.slice(-200), msg]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      });

      // WebRTC: receive offer from broadcaster
      socket.on('webrtc:offer', async ({ sdp }: any) => {
        try {
          pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          pcRef.current = pc;

          // react-native-webrtc: use property callbacks (types don't expose addEventListener)
          (pc as any).ontrack = (event: any) => {
            const stream = event.streams?.[0];
            if (stream) { setRemoteStream(stream); setConnected(true); }
          };

          (pc as any).onicecandidate = (event: any) => {
            if (event.candidate) {
              socket.emit('webrtc:ice', { sessionId, targetId: broadcasterId, candidate: event.candidate });
            }
          };

          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('webrtc:answer', { sessionId, broadcasterId, sdp: answer });
        } catch (err) {
          console.warn('[LiveViewer] webrtc:offer error:', err);
        }
      });

      // ICE from broadcaster
      socket.on('webrtc:ice', async ({ candidate }: any) => {
        if (pcRef.current && candidate) {
          try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
        }
      });

      // Viewer count updates (real-time from backend)
      socket.on('live:viewer:count', (count: number) => setViewerCount(count));
    })();

    return () => {
      socketRef.current?.emit('live:leave', sessionId);
      socketRef.current?.disconnect();
      pcRef.current?.close();
    };
  }, [sessionId, broadcasterId]);

  const sendMessage = () => {
    if (!chatText.trim() || !socketRef.current) return;
    socketRef.current.emit('live:comment', { sessionId, text: chatText.trim() });
    setChatText('');
  };

  if (liveEnded) {
    return (
      <View style={styles.container}>
        <View style={styles.endedOverlay}>
          <Text style={styles.endedText}>Le live est terminé</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Remote stream */}
      {remoteStream ? (
        <RTCView streamURL={remoteStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" zOrder={0} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.waiting]}>
          <ActivityIndicator color={COLORS.primaryLight} size="large" />
          <Text style={styles.waitingText}>Connexion au live...</Text>
        </View>
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.userInfo}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
          <Text style={styles.hostName} numberOfLines={1}>{session?.user.display_name ?? ''}</Text>
        </View>
        <View style={styles.viewerBadge}>
          <IcUsers size={13} color={COLORS.white} />
          <Text style={styles.viewerCount}>{viewerCount}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <IcClose size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Title */}
      <Text style={[styles.liveTitle, { top: insets.top + 60 }]} numberOfLines={2}>
        {session?.title}
      </Text>

      {/* Chat overlay */}
      {chatEnabled && (
        <View style={[styles.chatArea, { paddingBottom: insets.bottom + 70 }]}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m, i) => m.id ?? `${i}`}
            renderItem={({ item: m }) => (
              <View style={styles.chatRow}>
                <Text style={styles.chatUser}>{m.user.display_name} </Text>
                <Text style={styles.chatTxt}>{m.text}</Text>
              </View>
            )}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        </View>
      )}

      {/* Follow + reaction buttons (right side) */}
      <View style={[styles.rightActions, { bottom: insets.bottom + 80 }]}>
        <TouchableOpacity style={styles.actionBtn}>
          <IcHeart size={28} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Chat input */}
      {chatEnabled && (
        <View style={[styles.chatInputRow, { bottom: insets.bottom + 14 }]}>
          <TextInput
            style={styles.chatInput}
            value={chatText}
            onChangeText={setChatText}
            placeholder="Écrire un message..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            onSubmitEditing={sendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
            <IcSend size={16} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  waiting: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  waitingText: { color: COLORS.white, fontSize: FONT.size.base },
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8, zIndex: 10 },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FF3B5C', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.white },
  liveText: { fontSize: 10, fontWeight: '800', color: COLORS.white, letterSpacing: 1 },
  hostName: { fontSize: FONT.size.sm, fontWeight: '700', color: COLORS.white, flex: 1 },
  viewerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4 },
  viewerCount: { fontSize: 12, fontWeight: '700', color: COLORS.white },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  liveTitle: { position: 'absolute', left: 14, right: 80, color: COLORS.white, fontSize: FONT.size.sm, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  chatArea: { position: 'absolute', bottom: 0, left: 0, right: 90, maxHeight: H * 0.4, padding: 14 },
  chatRow: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 4, alignSelf: 'flex-start' },
  chatUser: { fontSize: 12, fontWeight: '700', color: COLORS.primaryLight },
  chatTxt: { fontSize: 12, color: COLORS.white },
  rightActions: { position: 'absolute', right: 14, flexDirection: 'column', gap: 16 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  chatInputRow: { position: 'absolute', left: 14, right: 14, flexDirection: 'row', gap: 8 },
  chatInput: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', color: COLORS.white, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: FONT.size.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 18, color: COLORS.white },
  endedOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  endedText: { fontSize: FONT.size.xl, fontWeight: '700', color: COLORS.white },
  backBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.full, paddingHorizontal: 30, paddingVertical: 12 },
  backBtnText: { color: COLORS.white, fontWeight: '700' },
});
