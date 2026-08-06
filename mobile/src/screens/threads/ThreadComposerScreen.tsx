import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Image, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import DocumentPicker, { types, isCancel } from 'react-native-document-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, getTokens } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, SPACING, RADIUS, API_BASE_URL } from '../../constants/theme';
import { IcClose, IcImage, IcVideo, IcSend } from '../../components/ui/Icons';

type Props = NativeStackScreenProps<RootStackParamList, 'ThreadComposer'>;

interface Media {
  uri: string;
  type: 'image' | 'video';
  name: string;
  mimeType: string;
}

interface ExtraImage {
  uri: string;
  name: string;
  mimeType: string;
}

export default function ThreadComposerScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [media, setMedia] = useState<Media | null>(null);
  const [extras, setExtras] = useState<ExtraImage[]>([]);
  const [uploading, setUploading] = useState(false);

  const postMutation = useMutation({
    mutationFn: async (payload: { content: string; media_url?: string; media_type?: string; media_urls?: string[] }) =>
      api.post('/threads', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['threads'] });
      navigation.goBack();
    },
    onError: () => Alert.alert('Erreur', 'Impossible de publier.'),
  });

  const pickImage = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8, selectionLimit: 0 });
    if (result.didCancel || !result.assets?.length) return;
    const assets = result.assets.filter((a) => !!a.uri);
    if (assets.length === 0) return;
    const [first, ...rest] = assets;
    setMedia({ uri: first.uri!, type: 'image', name: first.fileName ?? 'photo.jpg', mimeType: first.type ?? 'image/jpeg' });
    setExtras(rest.map((a, i) => ({ uri: a.uri!, name: a.fileName ?? `photo_${i}.jpg`, mimeType: a.type ?? 'image/jpeg' })));
  };

  const pickVideo = async () => {
    try {
      const res = await DocumentPicker.pickSingle({ type: [types.video] });
      setMedia({ uri: res.uri, type: 'video', name: res.name ?? 'video.mp4', mimeType: res.type ?? 'video/mp4' });
    } catch (e) {
      if (!isCancel(e)) Alert.alert('Erreur', 'Impossible de sélectionner la vidéo.');
    }
  };

  const uploadFile = async (uri: string, mimeType: string, name: string, endpoint: string) => {
    const tokens = await getTokens();
    if (!tokens) throw new Error('Non authentifié');
    const fd = new FormData();
    fd.append('file', { uri, type: mimeType, name } as any);
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
  };

  const handlePublish = async () => {
    if (!text.trim() && !media) return;
    setUploading(true);
    try {
      let media_url: string | undefined;
      let media_type: string | undefined;
      const media_urls: string[] = [];

      if (media) {
        const endpoint = media.type === 'image' ? '/upload/image' : '/upload/video';
        media_url = await uploadFile(media.uri, media.mimeType, media.name, endpoint);
        media_type = media.type;
        if (media_url && media_type === 'image') media_urls.push(media_url);
      }

      for (const extra of extras) {
        const url = await uploadFile(extra.uri, extra.mimeType, extra.name, '/upload/image');
        media_urls.push(url);
      }

      await postMutation.mutateAsync({
        content: text.trim(), media_url, media_type,
        media_urls: media_urls.length > 0 ? media_urls : undefined,
      });
    } catch {
      Alert.alert('Erreur', "Impossible de publier.");
    } finally {
      setUploading(false);
    }
  };

  const canPublish = (text.trim().length > 0 || !!media) && !uploading;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn} activeOpacity={0.7}>
          <IcClose size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nouveau fil</Text>
        <TouchableOpacity
          style={[styles.publishBtn, !canPublish && styles.publishBtnDisabled]}
          onPress={handlePublish}
          disabled={!canPublish}
          activeOpacity={0.8}
        >
          {uploading
            ? <ActivityIndicator size="small" color={COLORS.white} />
            : <Text style={styles.publishBtnText}>Publier</Text>
          }
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Composer row */}
        <View style={styles.composerRow}>
          <View style={styles.avatarCol}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{user?.display_name?.[0]?.toUpperCase() ?? 'U'}</Text>
              </View>
            )}
            {!!text || !!media ? <View style={styles.threadLine} /> : null}
          </View>
          <View style={styles.composerMain}>
            <Text style={styles.displayName}>{user?.display_name ?? ''}</Text>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Quoi de nouveau ?"
              placeholderTextColor={COLORS.textPlaceholder}
              multiline
              maxLength={500}
              autoFocus
            />
            {media && (
              <View style={styles.mediaPreview}>
                {media.type === 'image' ? (
                  <Image source={{ uri: media.uri }} style={styles.mediaImage} resizeMode="cover" />
                ) : (
                  <View style={styles.videoPreview}>
                    <IcVideo size={32} color={COLORS.primary} />
                    <Text style={styles.videoName} numberOfLines={1}>{media.name}</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.removeMedia} onPress={() => { setMedia(null); setExtras([]); }} activeOpacity={0.8}>
                  <IcClose size={14} color={COLORS.white} />
                </TouchableOpacity>
              </View>
            )}
            {extras.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 6 }}>
                {extras.map((ex, i) => (
                  <View key={i} style={{ position: 'relative' }}>
                    <Image source={{ uri: ex.uri }} style={{ width: 80, height: 80, borderRadius: 8 }} />
                    <TouchableOpacity
                      style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => setExtras(prev => prev.filter((_, j) => j !== i))}
                    >
                      <IcClose size={10} color={COLORS.white} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={styles.mediaActions}>
              <TouchableOpacity onPress={pickImage} style={styles.mediaBtn} activeOpacity={0.7}>
                <IcImage size={20} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={pickVideo} style={styles.mediaBtn} activeOpacity={0.7}>
                <IcVideo size={20} color={COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.charCount}>{text.length}/500</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold, color: COLORS.text },
  publishBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  publishBtnDisabled: { opacity: 0.4 },
  publishBtnText: { color: COLORS.white, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },

  body: { padding: SPACING.md },
  composerRow: { flexDirection: 'row', gap: 12 },
  avatarCol: { alignItems: 'center', gap: 4 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { backgroundColor: COLORS.primaryBg, borderWidth: 2, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 16, fontWeight: FONT.weight.bold, color: COLORS.primary },
  threadLine: { width: 2, flex: 1, backgroundColor: COLORS.border, borderRadius: 1, marginTop: 4 },

  composerMain: { flex: 1, gap: 8 },
  displayName: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.text },
  input: { fontSize: FONT.size.base, color: COLORS.text, lineHeight: 22, minHeight: 80, textAlignVertical: 'top' },

  mediaPreview: { position: 'relative', borderRadius: RADIUS.md, overflow: 'hidden', marginTop: 4 },
  mediaImage: { width: '100%', height: 200, borderRadius: RADIUS.md },
  videoPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.md,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.primaryLight,
  },
  videoName: { flex: 1, fontSize: FONT.size.sm, color: COLORS.primary },
  removeMedia: {
    position: 'absolute', top: 8, right: 8,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },

  mediaActions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  mediaBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.sm, backgroundColor: COLORS.primaryBg },
  charCount: { marginLeft: 'auto', fontSize: FONT.size.xs, color: COLORS.textMuted },
});
