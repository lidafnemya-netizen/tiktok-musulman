import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, SPACING, RADIUS } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { IcClose, IcHash, IcCheck } from '../../components/ui/Icons';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'DraftEdit'>;

interface DraftPost {
  id: string;
  thumbnail_url: string | null;
  video_url: string;
  caption: string | null;
  visibility: 'PUBLIC' | 'FOLLOWERS' | 'FRIENDS';
}

interface UserSuggestion { id: string; username: string; display_name: string; avatar_url: string | null }

function parseCaption(text: string): React.ReactNode[] {
  const parts = text.split(/(#\w+|@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('#')) return <Text key={i} style={styles.captionHash}>{part}</Text>;
    if (part.startsWith('@')) return <Text key={i} style={styles.captionMention}>{part}</Text>;
    return <Text key={i} style={styles.captionNormal}>{part}</Text>;
  });
}

const VISIBILITY_LABELS: Record<DraftPost['visibility'], string> = {
  PUBLIC: 'Tout le monde peut voir ceci',
  FOLLOWERS: 'Abonnés uniquement',
  FRIENDS: 'Amis uniquement',
};

export default function DraftEditScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { postId } = route.params;
  const qc = useQueryClient();

  const { data: draft, isLoading } = useQuery<DraftPost>({
    queryKey: ['draft', postId],
    queryFn: () => api.get(`/posts/${postId}`).then((r) => r.data),
  });

  const [caption, setCaption] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [visibility, setVisibility] = useState<DraftPost['visibility']>('PUBLIC');
  const [publishing, setPublishing] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const inputRef = useRef<TextInput>(null);

  if (draft && !hydrated) {
    setCaption(draft.caption ?? '');
    setVisibility(draft.visibility);
    setHydrated(true);
  }

  const { data: mentionData } = useQuery<{ users?: UserSuggestion[] }>({
    queryKey: ['mention-search', mentionQuery],
    queryFn: () => api.get('/search', { params: { q: mentionQuery } }).then((r) => r.data).catch(() => ({})),
    enabled: mentionQuery.length >= 1,
  });

  const handleCaptionChange = useCallback((text: string, sel?: { start: number }) => {
    setCaption(text);
    const pos = sel?.start ?? text.length;
    setCursorPos(pos);
    const before = text.slice(0, pos);
    const match = before.match(/@(\w*)$/);
    if (match) { setMentionQuery(match[1]); setShowMentions(true); }
    else { setShowMentions(false); setMentionQuery(''); }
  }, []);

  const insertMention = useCallback((username: string) => {
    const before = caption.slice(0, cursorPos);
    const after = caption.slice(cursorPos);
    const mentionStart = before.lastIndexOf('@');
    setCaption(before.slice(0, mentionStart) + '@' + username + ' ' + after);
    setShowMentions(false);
    setMentionQuery('');
  }, [caption, cursorPos]);

  const insertHashtag = useCallback((tag: string) => {
    setCaption((c) => c + (c.endsWith(' ') || c === '' ? '' : ' ') + '#' + tag + ' ');
  }, []);

  const popularHashtags = ['rappel', 'coran', 'motivation', 'islam', 'dua', 'lifestyle', 'famille'];

  const handlePublish = async (asDraft: boolean) => {
    if (!draft) return;
    setPublishing(true);
    try {
      await api.patch(`/posts/${draft.id}`, { caption: caption.trim() || undefined, visibility });
      if (!asDraft) {
        await api.post(`/posts/${draft.id}/publish`);
      }
      qc.invalidateQueries({ queryKey: ['user-drafts'] });
      qc.invalidateQueries({ queryKey: ['user-posts'] });
      qc.invalidateQueries({ queryKey: ['feed'] });
      Alert.alert(asDraft ? '✓ Brouillon enregistré' : '✓ Publié !', asDraft ? '' : 'Ta vidéo est en ligne.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.error ?? e?.message ?? "Échec de l'envoi.");
    } finally {
      setPublishing(false);
    }
  };

  if (isLoading || !draft) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={theme.tabActive} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.7}>
          <IcClose size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Modifier</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.previewRow}>
          {draft.thumbnail_url ? (
            <Image source={{ uri: draft.thumbnail_url }} style={styles.preview} />
          ) : (
            <View style={[styles.preview, { backgroundColor: theme.primaryBg }]} />
          )}
          <Text style={[styles.previewHint, { color: theme.textMuted }]}>Aperçu du brouillon</Text>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Description</Text>
          <TextInput
            ref={inputRef}
            style={[styles.textarea, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            value={caption}
            onChangeText={(t) => handleCaptionChange(t)}
            onSelectionChange={(e) => setCursorPos(e.nativeEvent.selection.start)}
            placeholder="Décris ta vidéo... #hashtag @mention"
            placeholderTextColor={theme.textPlaceholder}
            multiline
            maxLength={500}
          />
          {caption.length > 0 && (
            <View style={[styles.captionPreview, { backgroundColor: theme.primaryBg }]}>
              <Text style={styles.captionPreviewText}>{parseCaption(caption)}</Text>
            </View>
          )}
        </View>

        {showMentions && (mentionData?.users?.length ?? 0) > 0 && (
          <View style={[styles.suggestionsBox, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
            {mentionData!.users!.slice(0, 5).map((u) => (
              <TouchableOpacity key={u.id} style={styles.suggestionRow} onPress={() => insertMention(u.username)} activeOpacity={0.7}>
                <Text style={[styles.suggestionName, { color: theme.text }]}>{u.display_name} <Text style={{ color: theme.textMuted }}>@{u.username}</Text></Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hashtagRow}>
          {popularHashtags.map((tag) => (
            <TouchableOpacity key={tag} style={[styles.hashChip, { backgroundColor: theme.primaryBg, borderColor: theme.primaryLight }]} onPress={() => insertHashtag(tag)} activeOpacity={0.8}>
              <IcHash size={12} color={theme.tabActive} />
              <Text style={[styles.hashChipText, { color: theme.tabActive }]}>{tag}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>Visibilité</Text>
          {(['PUBLIC', 'FOLLOWERS', 'FRIENDS'] as const).map((v) => (
            <TouchableOpacity key={v} style={styles.visRow} onPress={() => setVisibility(v)} activeOpacity={0.7}>
              <View style={[styles.radio, { borderColor: theme.border }, visibility === v && { borderColor: theme.tabActive }]}>
                {visibility === v && <View style={[styles.radioDot, { backgroundColor: theme.tabActive }]} />}
              </View>
              <Text style={[styles.visLabel, { color: theme.text }]}>{VISIBILITY_LABELS[v]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footerRow}>
          <TouchableOpacity
            style={[styles.draftBtn, { borderColor: theme.border }]}
            onPress={() => handlePublish(true)}
            disabled={publishing}
            activeOpacity={0.8}
          >
            <Text style={[styles.draftBtnText, { color: theme.text }]}>Brouillons</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.publishBtn, publishing && { opacity: 0.6 }]}
            onPress={() => handlePublish(false)}
            disabled={publishing}
            activeOpacity={0.85}
          >
            {publishing
              ? <ActivityIndicator color={COLORS.white} size="small" />
              : <><IcCheck size={16} color={COLORS.white} strokeWidth={3} /><Text style={styles.publishBtnText}>Publier</Text></>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold },
  content: { padding: SPACING.md, gap: SPACING.md },

  previewRow: { alignItems: 'center', gap: 6 },
  preview: { width: 90, height: 160, borderRadius: RADIUS.md },
  previewHint: { fontSize: FONT.size.xs },

  field: { gap: 8 },
  fieldLabel: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  textarea: {
    borderWidth: 1.5, borderRadius: RADIUS.md, padding: SPACING.md,
    fontSize: FONT.size.base, minHeight: 100, textAlignVertical: 'top',
  },
  captionPreview: { borderRadius: RADIUS.sm, padding: SPACING.sm },
  captionPreviewText: { fontSize: FONT.size.sm, lineHeight: 20 },
  captionNormal: { color: COLORS.text },
  captionHash: { color: COLORS.primary, fontWeight: FONT.weight.semibold },
  captionMention: { color: '#3B82F6', fontWeight: FONT.weight.semibold },

  suggestionsBox: { borderRadius: RADIUS.md, borderWidth: 1, overflow: 'hidden' },
  suggestionRow: { padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  suggestionName: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },

  hashtagRow: { gap: 8, paddingVertical: 4 },
  hashChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: RADIUS.full, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1,
  },
  hashChipText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.medium },

  visRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  visLabel: { fontSize: FONT.size.sm },

  footerRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  draftBtn: { flex: 1, borderWidth: 1.5, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center' },
  draftBtnText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  publishBtn: {
    flex: 1.4, flexDirection: 'row', gap: 6, backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  publishBtnText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold, color: COLORS.white },
});
