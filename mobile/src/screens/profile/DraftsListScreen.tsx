import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { FONT, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { useAuthStore } from '../../stores/authStore';
import { IcBack, IcPlay, IcCheck, IcTrash } from '../../components/ui/Icons';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Draft {
  id: string;
  thumbnail_url: string | null;
  video_url: string;
  created_at: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

async function fetchSizeMB(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const len = res.headers.get('content-length');
    return len ? parseInt(len, 10) / 1_000_000 : 0;
  } catch {
    return 0;
  }
}

export default function DraftsListScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [totalMB, setTotalMB] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery<{ items: Draft[] }>({
    queryKey: ['user-drafts', user?.id],
    queryFn: () => api.get(`/posts/user/${user?.id}`, { params: { drafts_only: 1 } }).then((r) => r.data),
    enabled: !!user?.id,
  });

  const drafts = data?.items ?? [];

  useEffect(() => {
    if (!drafts.length) { setTotalMB(0); return; }
    let cancelled = false;
    Promise.all(drafts.map((d) => fetchSizeMB(d.video_url))).then((sizes) => {
      if (!cancelled) setTotalMB(sizes.reduce((a, b) => a + b, 0));
    });
    return () => { cancelled = true; };
  }, [drafts.map((d) => d.id).join(',')]);

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selected.size === 0) return;
    Alert.alert(
      'Supprimer les brouillons',
      `Supprimer ${selected.size} brouillon${selected.size > 1 ? 's' : ''} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            await Promise.all([...selected].map((id) => api.delete(`/posts/${id}`).catch(() => {})));
            setSelected(new Set());
            setSelectMode(false);
            qc.invalidateQueries({ queryKey: ['user-drafts'] });
            qc.invalidateQueries({ queryKey: ['user-posts'] });
            refetch();
          },
        },
      ],
    );
  };

  const openDraft = (id: string) => {
    if (selectMode) { toggleSelect(id); return; }
    navigation.navigate('DraftEdit', { postId: id });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={{ height: insets.top, backgroundColor: theme.surface }} />
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.7}>
          <IcBack size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {drafts.length} brouillon{drafts.length > 1 ? 's' : ''}{totalMB !== null && totalMB > 0 ? ` · ${totalMB.toFixed(1)}MB` : ''}
        </Text>
        <TouchableOpacity
          onPress={() => { setSelectMode((s) => !s); setSelected(new Set()); }}
          style={styles.headerBtn}
          activeOpacity={0.7}
        >
          <Text style={[styles.selectText, { color: theme.tabActive }]}>{selectMode ? 'Terminé' : 'Sélection...'}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.tabActive} style={{ marginTop: 40 }} />
      ) : drafts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Aucun brouillon</Text>
        </View>
      ) : (
        <FlatList
          data={drafts}
          numColumns={3}
          keyExtractor={(d) => d.id}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.cell} activeOpacity={0.85} onPress={() => openDraft(item.id)}>
              {item.thumbnail_url ? (
                <Image source={{ uri: item.thumbnail_url }} style={styles.cellImg} resizeMode="cover" />
              ) : (
                <View style={[styles.cellImg, styles.cellFallback, { backgroundColor: theme.primaryBg }]}>
                  <IcPlay size={24} color={theme.tabActive} />
                </View>
              )}
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeText}>{formatDate(item.created_at)}</Text>
              </View>
              {selectMode && (
                <View style={[styles.checkbox, selected.has(item.id) && { backgroundColor: theme.tabActive, borderColor: theme.tabActive }]}>
                  {selected.has(item.id) && <IcCheck size={12} color="#fff" strokeWidth={3} />}
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {selectMode && selected.size > 0 && (
        <TouchableOpacity style={styles.deleteBar} activeOpacity={0.8} onPress={handleDeleteSelected}>
          <IcTrash size={18} color="#fff" />
          <Text style={styles.deleteBarText}>Supprimer ({selected.size})</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.sm, paddingVertical: 10, borderBottomWidth: 1,
  },
  headerBtn: { minWidth: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold, flex: 1, textAlign: 'center' },
  selectText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  grid: { padding: 2 },
  row: { gap: 2 },
  cell: { flex: 1 / 3, aspectRatio: 9 / 16, position: 'relative', margin: 1 },
  cellImg: { width: '100%', height: '100%' },
  cellFallback: { alignItems: 'center', justifyContent: 'center' },
  dateBadge: {
    position: 'absolute', top: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  dateBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  checkbox: {
    position: 'absolute', top: 6, right: 6,
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBar: {
    position: 'absolute', bottom: 24, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#D64545', borderRadius: 24,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  deleteBarText: { color: '#fff', fontWeight: '700', fontSize: FONT.size.sm },
});
