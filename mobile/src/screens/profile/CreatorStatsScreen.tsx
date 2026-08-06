import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation';
import { api } from '../../api/client';
import { useTheme } from '../../hooks/useTheme';
import { COLORS, FONT, SPACING } from '../../constants/theme';
import { IcBack, IcPlay, IcHeart, IcUsers } from '../../components/ui/Icons';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatorStats'>;

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

interface Stats {
  total_views: number;
  total_likes: number;
  total_followers: number;
  total_posts: number;
  views_last_7d: number;
  likes_last_7d: number;
  followers_last_7d: number;
}

export default function CreatorStatsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const { data, isLoading } = useQuery<Stats>({
    queryKey: ['creator-stats'],
    queryFn: () =>
      api.get('/users/me/stats').then(r => r.data).catch(() => ({
        total_views: 0, total_likes: 0, total_followers: 0, total_posts: 0,
        views_last_7d: 0, likes_last_7d: 0, followers_last_7d: 0,
      })),
  });

  const cards = data
    ? [
        { label: 'Vues', total: data.total_views, delta: data.views_last_7d, Icon: IcPlay },
        { label: 'Likes', total: data.total_likes, delta: data.likes_last_7d, Icon: IcHeart },
        { label: 'Abonnés', total: data.total_followers, delta: data.followers_last_7d, Icon: IcUsers },
      ]
    : [];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: theme.borderLight, backgroundColor: theme.surface }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <IcBack size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Statistiques</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primaryLight} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>7 derniers jours</Text>
          <View style={styles.cardGrid}>
            {cards.map(({ label, total, delta, Icon }) => (
              <View key={label} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
                <View style={styles.cardIconRow}>
                  <Icon size={18} color={COLORS.primary} />
                  <Text style={[styles.cardLabel, { color: theme.textMuted }]}>{label}</Text>
                </View>
                <Text style={[styles.cardTotal, { color: theme.text }]}>{fmtNum(total)}</Text>
                <Text style={[styles.cardDelta, { color: delta >= 0 ? '#34C759' : '#FF3B30' }]}>
                  {delta >= 0 ? '+' : ''}{fmtNum(delta)} cette semaine
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.summaryBox, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            <Text style={[styles.summaryTitle, { color: theme.text }]}>Résumé du compte</Text>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.textMuted }]}>Vidéos publiées</Text>
              <Text style={[styles.summaryVal, { color: theme.text }]}>{data?.total_posts ?? 0}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.textMuted }]}>Total vues</Text>
              <Text style={[styles.summaryVal, { color: theme.text }]}>{fmtNum(data?.total_views ?? 0)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.textMuted }]}>Total likes</Text>
              <Text style={[styles.summaryVal, { color: theme.text }]}>{fmtNum(data?.total_likes ?? 0)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryKey, { color: theme.textMuted }]}>Abonnés</Text>
              <Text style={[styles.summaryVal, { color: theme.text }]}>{fmtNum(data?.total_followers ?? 0)}</Text>
            </View>
          </View>
        </ScrollView>
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
  title: { fontSize: 17, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: SPACING.md, gap: 16 },
  sectionLabel: { fontSize: FONT.size.sm, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    flex: 1, minWidth: '45%', borderRadius: 14, padding: SPACING.md,
    borderWidth: 1, gap: 6,
  },
  cardIconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardLabel: { fontSize: FONT.size.sm, fontWeight: '500' },
  cardTotal: { fontSize: 26, fontWeight: '800' },
  cardDelta: { fontSize: FONT.size.xs, fontWeight: '600' },
  summaryBox: { borderRadius: 14, padding: SPACING.md, borderWidth: 1, gap: 14 },
  summaryTitle: { fontSize: FONT.size.base, fontWeight: '700', marginBottom: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryKey: { fontSize: FONT.size.sm },
  summaryVal: { fontSize: FONT.size.sm, fontWeight: '700' },
});
