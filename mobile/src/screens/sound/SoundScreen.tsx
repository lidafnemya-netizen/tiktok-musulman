import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { useTheme } from '../../hooks/useTheme';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../../constants/theme';
import { IcBack, IcMusic, IcHeart, IcPlay, IcSave } from '../../components/ui/Icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Sound'>;

interface SoundDetail {
  id: string;
  title: string;
  artist: string | null;
  url: string | null;
  use_count: number;
  posts: Array<{
    id: string;
    thumbnail_url: string | null;
    like_count: number;
    view_count: number;
    user: { username: string };
  }>;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n ?? 0);
}

export default function SoundScreen({ route, navigation }: Props) {
  const { soundId, title, artist } = route.params as any;
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const { data, isLoading } = useQuery<SoundDetail>({
    queryKey: ['sound', soundId],
    queryFn: () => api.get(`/sounds/${soundId}`).then(r => r.data).catch(() => ({
      id: soundId, title, artist, url: null, use_count: 0, posts: [],
    })),
  });

  const sound = data ?? { id: soundId, title, artist, url: null, use_count: 0, posts: [] };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <IcBack size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Son</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={sound.posts}
        keyExtractor={p => p.id}
        numColumns={3}
        contentContainerStyle={{ gap: 1 }}
        columnWrapperStyle={{ gap: 1 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={[styles.soundCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <View style={[styles.soundIcon, { backgroundColor: theme.primaryBg }]}>
              <IcMusic size={32} color={COLORS.primary} />
            </View>
            <View style={styles.soundInfo}>
              <Text style={[styles.soundTitle, { color: theme.text }]} numberOfLines={2}>{sound.title}</Text>
              {sound.artist && <Text style={[styles.soundArtist, { color: theme.textMuted }]}>{sound.artist}</Text>}
              <View style={styles.soundStats}>
                <IcHeart size={14} color={COLORS.primary} />
                <Text style={[styles.soundStatText, { color: theme.textMuted }]}>{fmtNum(sound.use_count)} vidéos</Text>
              </View>
            </View>
          </View>
        }
        renderItem={({ item: p }) => (
          <TouchableOpacity
            style={styles.cell}
            onPress={() => navigation.navigate('PostDetail', { postId: p.id })}
            activeOpacity={0.85}
          >
            {p.thumbnail_url
              ? <Image source={{ uri: p.thumbnail_url }} style={styles.cellImg} resizeMode="cover" />
              : <View style={[styles.cellImg, styles.cellFallback]}><IcPlay size={20} color={COLORS.primaryLight} /></View>
            }
            <View style={styles.cellOverlay}>
              <IcHeart size={10} color={COLORS.white} />
              <Text style={styles.cellCount}>{fmtNum(p.like_count)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          isLoading
            ? <ActivityIndicator color={COLORS.primaryLight} style={{ marginTop: 40 }} />
            : <Text style={[styles.empty, { color: theme.textMuted }]}>Aucune vidéo avec ce son</Text>
        }
      />
    </View>
  );
}

const CELL = 124;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold },

  soundCard: {
    flexDirection: 'row', gap: 16, padding: SPACING.md,
    margin: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, ...SHADOW.sm,
  },
  soundIcon: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  soundInfo: { flex: 1, gap: 4, justifyContent: 'center' },
  soundTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold, lineHeight: 22 },
  soundArtist: { fontSize: FONT.size.sm },
  soundStats: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  soundStatText: { fontSize: FONT.size.xs },

  cell: { width: CELL, height: CELL * (16 / 9), backgroundColor: '#111' },
  cellImg: { width: '100%', height: '100%' },
  cellFallback: { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  cellOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 4, backgroundColor: 'rgba(0,0,0,0.4)',
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  cellCount: { fontSize: 10, color: COLORS.white },
  empty: { textAlign: 'center', marginTop: 40, fontSize: FONT.size.base },
});
