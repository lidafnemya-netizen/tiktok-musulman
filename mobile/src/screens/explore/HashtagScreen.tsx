import React from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, Image,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation';
import { api } from '../../api/client';
import { useTheme } from '../../hooks/useTheme';
import { COLORS, FONT, SPACING } from '../../constants/theme';
import { IcBack, IcHash, IcPlay } from '../../components/ui/Icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Hashtag'>;

interface Post {
  id: string;
  thumbnail_url: string | null;
  video_url?: string;
  view_count: number;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

export default function HashtagScreen({ route, navigation }: Props) {
  const { tag } = route.params;
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const { data, isLoading } = useQuery<{ items: Post[]; total: number }>({
    queryKey: ['hashtag', tag],
    queryFn: () => api.get(`/posts/hashtag/${tag}`).then(r => r.data).catch(() => ({ items: [], total: 0 })),
  });

  const posts = data?.items ?? [];
  const CELL = (require('react-native').Dimensions.get('window').width - 2) / 3;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.borderLight, backgroundColor: theme.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <IcBack size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.hashIconWrap}>
            <IcHash size={20} color={COLORS.primary} />
          </View>
          <Text style={[styles.tag, { color: theme.text }]}>#{tag}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Stats */}
      {data && (
        <View style={[styles.statsBar, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
          <IcPlay size={14} color={theme.textMuted} />
          <Text style={[styles.statsText, { color: theme.textMuted }]}>
            {fmtNum(data.total)} vidéo{data.total > 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primaryLight} size="large" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={p => p.id}
          numColumns={3}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.cell, { width: CELL, height: CELL * 16 / 9 }]}
              onPress={() => navigation.navigate('VideoPlayer', { postId: item.id })}
              activeOpacity={0.85}
            >
              {item.thumbnail_url ? (
                <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.card }]} />
              )}
              <View style={styles.viewsOverlay}>
                <IcPlay size={10} color="#fff" />
                <Text style={styles.viewsText}>{fmtNum(item.view_count)}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>Aucune vidéo pour #{tag}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm, paddingVertical: 12, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hashIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  tag: { fontSize: 18, fontWeight: '700' },
  statsBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.md, paddingVertical: 10, borderBottomWidth: 1,
  },
  statsText: { fontSize: FONT.size.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { gap: 1 },
  cell: { position: 'relative', margin: 0.5, backgroundColor: '#111', overflow: 'hidden' },
  viewsOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    padding: 4, backgroundColor: 'rgba(0,0,0,0.4)',
  },
  viewsText: { fontSize: 10, color: '#fff', fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: FONT.size.base },
});
