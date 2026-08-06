import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, TextInput,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import Video from 'react-native-video';
import { createThumbnail } from 'react-native-create-thumbnail';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { api, getTokens } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, SPACING, RADIUS, API_BASE_URL } from '../../constants/theme';
import { IcBack, IcPlus, IcHash, IcAt, IcGlobe, IcUsers, IcCheck, IcClose } from '../../components/ui/Icons';

type Props = NativeStackScreenProps<RootStackParamList, 'PostComposer'>;

type Visibility = 'PUBLIC' | 'FOLLOWERS' | 'FRIENDS';

const VISIBILITY_OPTIONS: { key: Visibility; label: string; sub: string; Icon: any }[] = [
  { key: 'PUBLIC', label: 'Tout le monde', sub: 'Visible par tous', Icon: IcGlobe },
  { key: 'FOLLOWERS', label: 'Abonnés', sub: 'Visible par tes abonnés', Icon: IcUsers },
  { key: 'FRIENDS', label: 'Amis', sub: 'Abonnements mutuels uniquement', Icon: IcUsers },
];

export default function PostComposerScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [media, setMedia] = useState(route.params.media);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('PUBLIC');
  const [visibilityPickerOpen, setVisibilityPickerOpen] = useState(false);
  const [publishing, setPublishing] = useState<'draft' | 'publish' | null>(null);

  const isVideo = media[0]?.type === 'video';

  const addMoreMedia = useCallback(async () => {
    const result = await launchImageLibrary({
      mediaType: isVideo ? 'mixed' : 'photo',
      selectionLimit: 10 - media.length,
      quality: 0.9,
    });
    if (result.didCancel || !result.assets?.length) return;
    const added = result.assets
      .filter((a) => !!a.uri)
      .map((a) => ({ uri: a.uri!, type: (a.type?.startsWith('video') ? 'video' : 'photo') as 'photo' | 'video' }));
    setMedia((m) => [...m, ...added].slice(0, 10));
  }, [isVideo, media.length]);

  const removeMedia = useCallback((idx: number) => {
    setMedia((m) => m.filter((_, i) => i !== idx));
  }, []);

  const insertToken = useCallback((token: string) => {
    setDescription((d) => (d.endsWith(' ') || d === '' ? d + token : d + ' ' + token));
  }, []);

  const uploadOne = useCallback(async (item: { uri: string; type: 'photo' | 'video' }) => {
    const tokens = await getTokens();
    if (!tokens) throw new Error('Non authentifié');
    const fd = new FormData();
    fd.append('file', {
      uri: item.uri,
      type: item.type === 'video' ? 'video/mp4' : 'image/jpeg',
      name: item.type === 'video' ? 'video.mp4' : 'photo.jpg',
    } as any);
    const endpoint = item.type === 'video' ? '/upload/video' : '/upload/image';
    // Plain fetch — axios with a hand-set multipart Content-Type strips the
    // boundary and breaks upload on iOS; fetch lets it auto-generate one.
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.access}` },
      body: fd as any,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error ?? `Upload échoué (${res.status})`);
    }
    const data = await res.json();
    if (!data.url) throw new Error('URL manquante dans la réponse');
    return data.url as string;
  }, []);

  // Extract a real JPEG frame from the video and upload it — video files
  // can never be used directly as an <Image> thumbnail_url.
  const generateVideoThumbnail = useCallback(async (videoUri: string): Promise<string | undefined> => {
    try {
      const localUri = videoUri.startsWith('file://') ? videoUri : `file://${videoUri}`;
      const thumb = await createThumbnail({ url: localUri, timeStamp: 0, format: 'jpeg' });
      return await uploadOne({ uri: thumb.path, type: 'photo' });
    } catch {
      return undefined;
    }
  }, [uploadOne]);

  const submit = useCallback(async (asDraft: boolean) => {
    if (media.length === 0) return;
    setPublishing(asDraft ? 'draft' : 'publish');
    try {
      const caption = [title.trim(), description.trim()].filter(Boolean).join('\n\n') || undefined;

      if (isVideo) {
        const videoUrl = await uploadOne(media[0]);
        const thumbnailUrl = await generateVideoThumbnail(media[0].uri);
        await api.post('/posts', {
          video_url: videoUrl,
          thumbnail_url: thumbnailUrl ?? undefined,
          caption,
          duration: 0,
          is_public: visibility === 'PUBLIC',
          visibility,
          is_draft: asDraft,
          sound_id: route.params.soundId,
        });
      } else {
        const urls = await Promise.all(media.map(uploadOne));
        await api.post('/posts', {
          video_url: '',
          thumbnail_url: urls[0],
          media_urls: urls,
          caption,
          duration: 0,
          is_public: visibility === 'PUBLIC',
          visibility,
          is_draft: asDraft,
          sound_id: route.params.soundId,
        });
      }

      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['user-posts'] });
      Alert.alert(
        asDraft ? '✓ Enregistré en brouillon' : '✓ Publié !',
        asDraft ? 'Visible uniquement par toi dans ton profil.' : 'Ta publication est en ligne.'
      );
      navigation.popToTop();
    } catch (e: any) {
      Alert.alert('Erreur', e?.response?.data?.error ?? e?.message ?? "Impossible de publier.");
    } finally {
      setPublishing(null);
    }
  }, [media, title, description, visibility, isVideo, uploadOne, qc, navigation]);

  return (
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.7}>
          <IcBack size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nouvelle publication</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Media row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>
          {media.map((m, i) => (
            <View key={m.uri + i} style={styles.mediaThumbWrap}>
              {i === 0 && <View style={styles.coverBadge}><Text style={styles.coverBadgeText}>Couverture</Text></View>}
              {m.type === 'video'
                ? <Video source={{ uri: m.uri }} style={styles.mediaThumb} resizeMode="cover" paused muted />
                : <Image source={{ uri: m.uri }} style={styles.mediaThumb} />
              }
              {media.length > 1 && (
                <TouchableOpacity style={styles.removeMediaBtn} onPress={() => removeMedia(i)}>
                  <IcClose size={12} color={COLORS.white} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {!isVideo && media.length < 10 && (
            <TouchableOpacity style={styles.addMediaBtn} onPress={addMoreMedia} activeOpacity={0.8}>
              <IcPlus size={26} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Title */}
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Ajoute un titre accrocheur"
          placeholderTextColor={COLORS.textPlaceholder}
          maxLength={100}
        />

        {/* Description */}
        <TextInput
          style={styles.descInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Rédiger une description longue peut permettre d'obtenir plus de vues."
          placeholderTextColor={COLORS.textPlaceholder}
          multiline
          maxLength={500}
        />

        <View style={styles.tokenRow}>
          <TouchableOpacity style={styles.tokenBtn} onPress={() => insertToken('#')} activeOpacity={0.7}>
            <IcHash size={18} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.tokenBtn} onPress={() => insertToken('@')} activeOpacity={0.7}>
            <IcAt size={18} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.charCount}>{description.length}/500</Text>
        </View>

        {/* Visibility */}
        <TouchableOpacity style={styles.row} onPress={() => setVisibilityPickerOpen((v) => !v)} activeOpacity={0.7}>
          {(() => { const opt = VISIBILITY_OPTIONS.find((o) => o.key === visibility)!; return (
            <>
              <opt.Icon size={18} color={COLORS.textMuted} />
              <Text style={styles.rowLabel}>Qui peut voir cette publication : {opt.label}</Text>
            </>
          ); })()}
        </TouchableOpacity>

        {visibilityPickerOpen && (
          <View style={styles.visibilityPicker}>
            {VISIBILITY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={styles.visibilityOption}
                onPress={() => { setVisibility(opt.key); setVisibilityPickerOpen(false); }}
                activeOpacity={0.7}
              >
                <opt.Icon size={18} color={visibility === opt.key ? COLORS.primary : COLORS.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.visibilityLabel, visibility === opt.key && { color: COLORS.primary }]}>{opt.label}</Text>
                  <Text style={styles.visibilitySub}>{opt.sub}</Text>
                </View>
                {visibility === opt.key && <IcCheck size={16} color={COLORS.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom actions */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          style={styles.draftBtn}
          onPress={() => submit(true)}
          disabled={!!publishing}
          activeOpacity={0.8}
        >
          {publishing === 'draft' ? <ActivityIndicator color={COLORS.text} /> : <Text style={styles.draftBtnText}>Brouillons</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.publishBtn}
          onPress={() => submit(false)}
          disabled={!!publishing}
          activeOpacity={0.85}
        >
          {publishing === 'publish' ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.publishBtnText}>Publier</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.text },

  content: { padding: SPACING.md, gap: SPACING.md },
  mediaRow: { gap: 10 },
  mediaThumbWrap: { position: 'relative' },
  mediaThumb: { width: 96, height: 96, borderRadius: RADIUS.md },
  coverBadge: {
    position: 'absolute', top: 6, left: 6, zIndex: 2,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: RADIUS.xs, paddingHorizontal: 6, paddingVertical: 2,
  },
  coverBadgeText: { color: COLORS.white, fontSize: 10, fontWeight: FONT.weight.semibold },
  removeMediaBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  addMediaBtn: {
    width: 96, height: 96, borderRadius: RADIUS.md,
    backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center',
  },

  titleInput: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold, color: COLORS.text, paddingVertical: 6 },
  descInput: { fontSize: FONT.size.base, color: COLORS.text, minHeight: 80, textAlignVertical: 'top' },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tokenBtn: {
    width: 34, height: 34, borderRadius: RADIUS.sm, backgroundColor: COLORS.inputBg,
    alignItems: 'center', justifyContent: 'center',
  },
  charCount: { marginLeft: 'auto', fontSize: FONT.size.xs, color: COLORS.textSubtle },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  rowLabel: { fontSize: FONT.size.sm, color: COLORS.text, flex: 1 },

  visibilityPicker: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.borderLight, overflow: 'hidden' },
  visibilityOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  visibilityLabel: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.text },
  visibilitySub: { fontSize: FONT.size.xs, color: COLORS.textMuted, marginTop: 1 },

  bottomBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: SPACING.md, paddingTop: 10,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  draftBtn: {
    flex: 1, height: 46, borderRadius: RADIUS.full,
    backgroundColor: COLORS.inputBg, alignItems: 'center', justifyContent: 'center',
  },
  draftBtnText: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.text },
  publishBtn: {
    flex: 2, height: 46, borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  publishBtnText: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold, color: COLORS.white },
});
