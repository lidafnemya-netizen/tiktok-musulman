/**
 * BookCard — fullscreen book display (like TikTok video but for books)
 * Shows cover, title, author, summary with smooth reading
 */
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  Image, ScrollView, Animated,
} from 'react-native';
import { LinearGradient } from 'react-native-linear-gradient';
import { useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, RADIUS } from '../../constants/theme';
import { IcHeartFill, IcHeart, IcSave, IcShare, IcProfile, IcBook } from '../ui/Icons';
import { Share } from 'react-native';

const { width: W, height: H } = Dimensions.get('window');

export interface BookItem {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  summary: string;
  category: string;
  like_count: number;
  view_count: number;
  is_liked: boolean;
  user: { id: string; username: string; display_name: string; avatar_url: string | null };
}

interface Props {
  book: BookItem;
  isVisible: boolean;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n ?? 0);
}

export function BookCard({ book, isVisible }: Props) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [liked, setLiked] = useState(book.is_liked);
  const [likeCount, setLikeCount] = useState(book.like_count);
  const [expanded, setExpanded] = useState(false);

  const likeMutation = useMutation({
    mutationFn: () => api.post(`/books/${book.id}/like`),
    onMutate: () => { setLiked(l => !l); setLikeCount(c => liked ? c - 1 : c + 1); },
    onError: () => { setLiked(book.is_liked); setLikeCount(book.like_count); },
  });

  return (
    <View style={styles.container}>
      {/* Background cover */}
      {book.cover_url
        ? <Image source={{ uri: book.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={6} />
        : <View style={[StyleSheet.absoluteFill, styles.coverFallback]} />
      }

      {/* Gradient overlay */}
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.gradient} pointerEvents="none" />

      {/* Book badge */}
      <View style={styles.bookBadge}>
        <IcBook size={12} color={COLORS.gold} />
        <Text style={styles.bookBadgeText}>Livre</Text>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Cover */}
        <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.9} style={styles.coverWrap}>
          {book.cover_url
            ? <Image source={{ uri: book.cover_url }} style={styles.cover} resizeMode="cover" />
            : <View style={styles.coverFallbackCard}>
                <Text style={styles.coverTitle} numberOfLines={3}>{book.title}</Text>
              </View>
          }
        </TouchableOpacity>

        {/* Text info */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>{book.title}</Text>
          {book.author && <Text style={styles.author}>par {book.author}</Text>}
          <Text style={[styles.summary, expanded && styles.summaryExpanded]} onPress={() => setExpanded(e => !e)}>
            {book.summary}
          </Text>
          {!expanded && <Text style={styles.readMore}>Lire plus...</Text>}
          <View style={styles.catBadge}>
            <Text style={styles.catText}>{book.category}</Text>
          </View>
        </View>
      </View>

      {/* Right actions */}
      <View style={styles.rightActions}>
        {/* Author avatar */}
        <TouchableOpacity style={styles.avatarWrap} onPress={() => nav.navigate('UserProfile', { userId: book.user.id, username: book.user.username })} activeOpacity={0.85}>
          {book.user.avatar_url
            ? <Image source={{ uri: book.user.avatar_url }} style={styles.avatar} />
            : <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{book.user.display_name[0]?.toUpperCase()}</Text></View>
          }
          <View style={styles.followDot}><Text style={styles.followDotText}>+</Text></View>
        </TouchableOpacity>

        {/* Like */}
        <ActionBtn
          icon={liked ? <IcHeartFill size={30} color="#FF3B5C" /> : <IcHeart size={30} color={COLORS.white} />}
          count={fmt(likeCount)}
          onPress={() => likeMutation.mutate()}
          countColor={liked ? '#FF3B5C' : COLORS.white}
        />

        {/* Save */}
        <ActionBtn icon={<IcSave size={26} color={COLORS.white} />} onPress={() => {}} />

        {/* Share */}
        <ActionBtn
          icon={<IcShare size={26} color={COLORS.white} />}
          onPress={() => Share.share({ message: `Lis "${book.title}" sur Nour\nhttps://nour.app/book/${book.id}` })}
        />
      </View>
    </View>
  );
}

function ActionBtn({ icon, count, onPress, countColor = COLORS.white }: { icon: React.ReactNode; count?: string; onPress: () => void; countColor?: string }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
      {icon}
      {count !== undefined && <Text style={[styles.actionCount, { color: countColor }]}>{count}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { width: W, height: H, backgroundColor: '#1a0a00' },
  coverFallback: { backgroundColor: '#2a1a00' },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: H * 0.7 },
  bookBadge: { position: 'absolute', top: 60, left: 16, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.gold },
  bookBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.gold },
  content: { position: 'absolute', bottom: 90, left: 16, right: 90, gap: 14 },
  coverWrap: { alignSelf: 'flex-start' },
  cover: { width: 100, height: 140, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  coverFallbackCard: { width: 100, height: 140, borderRadius: 8, backgroundColor: COLORS.gold + '40', borderWidth: 2, borderColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', padding: 8 },
  coverTitle: { fontSize: 11, fontWeight: '700', color: COLORS.white, textAlign: 'center' },
  info: { gap: 4 },
  title: { fontSize: FONT.size.lg, fontWeight: '800', color: COLORS.white, lineHeight: 24 },
  author: { fontSize: FONT.size.sm, color: COLORS.gold, fontStyle: 'italic' },
  summary: { fontSize: FONT.size.sm, color: 'rgba(255,255,255,0.88)', lineHeight: 20, maxHeight: 60, overflow: 'hidden' },
  summaryExpanded: { maxHeight: undefined },
  readMore: { fontSize: FONT.size.xs, color: COLORS.gold, fontWeight: '600' },
  catBadge: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginTop: 4 },
  catText: { fontSize: 11, color: COLORS.white, fontWeight: '600' },
  rightActions: { position: 'absolute', right: 12, bottom: 96, alignItems: 'center', gap: 22 },
  avatarWrap: { position: 'relative', marginBottom: 4 },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: COLORS.white },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primaryBg, borderWidth: 2, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 18, fontWeight: FONT.weight.bold, color: COLORS.primary },
  followDot: { position: 'absolute', bottom: -8, left: '50%', transform: [{ translateX: -10 }], width: 20, height: 20, borderRadius: 10, backgroundColor: '#FF3B5C', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.white },
  followDotText: { color: COLORS.white, fontSize: 13, fontWeight: FONT.weight.bold, lineHeight: 18 },
  actionBtn: { alignItems: 'center', gap: 3 },
  actionCount: { fontSize: 12, fontWeight: FONT.weight.semibold, color: COLORS.white },
});
