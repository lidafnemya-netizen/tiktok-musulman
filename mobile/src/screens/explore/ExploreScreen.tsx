import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList,
  TouchableOpacity, Image, ActivityIndicator, ScrollView, Dimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, SPACING, RADIUS } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { IcSearch, IcClose, IcHeart, IcPlay } from '../../components/ui/Icons';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface UserResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  follower_count: number;
  is_verified: boolean;
}

interface Post {
  id: string;
  thumbnail_url: string | null;
  caption: string | null;
  like_count: number;
  view_count: number;
  user: { id: string; username: string; display_name: string };
}

const CATEGORIES = [
  { id: 'all', label: 'Tout' },
  { id: 'rappel', label: 'Rappel' },
  { id: 'coran', label: 'Coran' },
  { id: 'motivation', label: 'Motivation' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'famille', label: 'Famille' },
  { id: 'science', label: 'Science' },
];

const { width: W } = Dimensions.get('window');
const CELL = (W - 2) / 3;

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchTab, setSearchTab] = useState<'videos' | 'users'>('videos');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: searchData, isLoading: searchLoading } = useQuery<{ users?: UserResult[]; posts?: Post[] }>({
    queryKey: ['search', debouncedQ],
    queryFn: () => api.get('/search', { params: { q: debouncedQ } }).then((r) => r.data).catch(() => ({})),
    enabled: debouncedQ.length > 1,
  });

  const { data: trending, isLoading: trendingLoading } = useQuery<{ items?: Post[] }>({
    queryKey: ['trending', activeCategory],
    queryFn: () =>
      api.get('/posts/trending', {
        params: activeCategory !== 'all' ? { category: activeCategory, limit: 30 } : { limit: 30 },
      }).then((r) => r.data).catch(() => ({ items: [] })),
    enabled: debouncedQ.length < 2,
  });

  const handleChange = (v: string) => {
    setQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedQ(v), 350);
  };

  const isSearching = debouncedQ.length > 1;

  const renderGridItem = useCallback(({ item: p }: { item: Post }) => (
    <TouchableOpacity
      style={styles.cell}
      onPress={() => navigation.navigate('PostDetail', { postId: p.id })}
      activeOpacity={0.85}
    >
      {p.thumbnail_url ? (
        <Image source={{ uri: p.thumbnail_url }} style={styles.cellImg} resizeMode="cover" />
      ) : (
        <View style={[styles.cellImg, styles.cellFallback]}>
          <IcPlay size={28} color={COLORS.primaryLight} />
        </View>
      )}
      <View style={styles.cellOverlay}>
        <IcHeart size={11} color={COLORS.white} />
        <Text style={styles.cellCount}>{fmtNum(p.like_count)}</Text>
      </View>
    </TouchableOpacity>
  ), [navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: theme.bg }]}>
      {/* Search bar */}
      <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        <View style={[styles.searchBar, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
          <IcSearch size={18} color={theme.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            value={query}
            onChangeText={handleChange}
            placeholder="Rechercher vidéos, utilisateurs..."
            placeholderTextColor={theme.textPlaceholder}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setDebouncedQ(''); }} activeOpacity={0.7}>
              <IcClose size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isSearching ? (
        <View style={{ flex: 1 }}>
          {/* Search tabs */}
          <View style={[styles.searchTabs, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
            <TouchableOpacity style={[styles.searchTab, searchTab === 'videos' && styles.searchTabActive]} onPress={() => setSearchTab('videos')} activeOpacity={0.8}>
              <Text style={[styles.searchTabText, searchTab === 'videos' && styles.searchTabTextActive]}>Vidéos ({searchData?.posts?.length ?? 0})</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.searchTab, searchTab === 'users' && styles.searchTabActive]} onPress={() => setSearchTab('users')} activeOpacity={0.8}>
              <Text style={[styles.searchTabText, searchTab === 'users' && styles.searchTabTextActive]}>Comptes ({searchData?.users?.length ?? 0})</Text>
            </TouchableOpacity>
          </View>

          {searchLoading ? (
            <ActivityIndicator color={COLORS.primaryLight} style={{ marginTop: 40 }} />
          ) : searchTab === 'users' ? (
            <FlatList
              data={searchData?.users ?? []}
              keyExtractor={(u) => u.id}
              contentContainerStyle={[styles.listContent, { backgroundColor: theme.bg }]}
              renderItem={({ item: u }) => (
                <TouchableOpacity
                  style={[styles.userRow, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}
                  onPress={() => navigation.navigate('UserProfile', { userId: u.id, username: u.username })}
                  activeOpacity={0.7}
                >
                  {u.avatar_url ? (
                    <Image source={{ uri: u.avatar_url }} style={styles.userAvatar} />
                  ) : (
                    <View style={[styles.userAvatar, styles.userAvatarFallback]}>
                      <Text style={styles.userAvatarInitial}>{u.display_name[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.userInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.displayName, { color: theme.text }]}>{u.display_name}</Text>
                      {u.is_verified && <View style={styles.verifiedDot} />}
                    </View>
                    <Text style={[styles.username, { color: theme.textMuted }]}>@{u.username} · {fmtNum(u.follower_count)} abonnés</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<EmptySearch />}
            />
          ) : (
            <FlatList
              data={searchData?.posts ?? []}
              keyExtractor={(p) => p.id}
              numColumns={3}
              contentContainerStyle={{ gap: 1 }}
              columnWrapperStyle={{ gap: 1 }}
              renderItem={renderGridItem}
              ListEmptyComponent={<EmptySearch />}
            />
          )}
        </View>
      ) : (
        <FlatList
          data={trending?.items ?? []}
          keyExtractor={(p) => p.id}
          numColumns={3}
          contentContainerStyle={{ gap: 1, flexGrow: 1, backgroundColor: theme.bg }}
          columnWrapperStyle={{ gap: 1 }}
          ListHeaderComponent={
            <View style={{ backgroundColor: theme.surface }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.catsRow, { backgroundColor: theme.surface }]}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catChip, { backgroundColor: theme.card, borderColor: theme.border }, activeCategory === cat.id && styles.catChipActive]}
                    onPress={() => setActiveCategory(cat.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.catLabel, { color: theme.textMuted }, activeCategory === cat.id && styles.catLabelActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          }
          renderItem={renderGridItem}
          ListEmptyComponent={
            trendingLoading ? (
              <ActivityIndicator color={COLORS.primaryLight} style={{ marginTop: 60 }} />
            ) : (
              <View style={[styles.emptyWrap, { backgroundColor: theme.bg }]}>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Aucun contenu</Text>
                <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>Revenez bientôt</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

function EmptySearch() {
  const theme = useTheme();
  return (
    <View style={[styles.emptyWrap, { backgroundColor: theme.bg }]}>
      <IcSearch size={40} color={COLORS.primaryLight} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>Aucun résultat</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textMuted }]}>Essayez d'autres termes</Text>
    </View>
  );
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n ?? 0);
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  searchWrap: {
    padding: SPACING.sm, paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.inputBg, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: FONT.size.base },

  searchTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  searchTab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  searchTabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  searchTabText: { fontSize: FONT.size.sm, color: COLORS.textMuted },
  searchTabTextActive: { color: COLORS.primary, fontWeight: FONT.weight.semibold },

  listContent: { padding: SPACING.sm, gap: 8 },
  userRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  userAvatar: { width: 48, height: 48, borderRadius: 24 },
  userAvatarFallback: { backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  userAvatarInitial: { fontSize: 18, fontWeight: FONT.weight.bold, color: COLORS.primary },
  userInfo: { flex: 1 },
  displayName: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.text },
  username: { fontSize: FONT.size.xs, color: COLORS.textMuted, marginTop: 1 },
  verifiedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },

  catsRow: { padding: SPACING.sm, paddingHorizontal: SPACING.md, gap: 8, backgroundColor: COLORS.white },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full,
    backgroundColor: COLORS.bg, borderWidth: 1.5, borderColor: COLORS.border,
  },
  catChipActive: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  catLabel: { fontSize: FONT.size.sm, fontWeight: FONT.weight.medium, color: COLORS.textMuted },
  catLabelActive: { color: COLORS.primary, fontWeight: FONT.weight.semibold },

  cell: { width: CELL, height: CELL * (16 / 9), backgroundColor: '#111' },
  cellImg: { width: '100%', height: '100%' },
  cellFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' },
  cellOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 4, backgroundColor: 'rgba(0,0,0,0.4)',
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  cellCount: { fontSize: FONT.size.xs, color: COLORS.white },

  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10, backgroundColor: COLORS.bg },
  emptyTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold, color: COLORS.text },
  emptySubtitle: { fontSize: FONT.size.sm, color: COLORS.textMuted },
});
