import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Alert, ActivityIndicator, ActionSheetIOS, Platform,
  FlatList, Animated, Image,
} from 'react-native';
import DocumentPicker, { types, isCancel } from 'react-native-document-picker';
import { createThumbnail } from 'react-native-create-thumbnail';
import { launchImageLibrary } from 'react-native-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, getTokens } from '../../api/client';
import { API_BASE_URL } from '../../constants';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../../constants/theme';
import { IcVideo, IcCreate, IcClose, IcImage, IcHash, IcAt, IcCheck, IcMusic } from '../../components/ui/Icons';

interface VideoFile {
  uri: string;
  name: string;
  size: number | null;
  type: string;
  isImage: boolean;
}

interface UserSuggestion {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

function parseCaption(text: string): React.ReactNode[] {
  const parts = text.split(/(#\w+|@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('#')) return <Text key={i} style={styles.captionHash}>{part}</Text>;
    if (part.startsWith('@')) return <Text key={i} style={styles.captionMention}>{part}</Text>;
    return <Text key={i} style={styles.captionNormal}>{part}</Text>;
  });
}

export default function UploadScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [media, setMedia] = useState<VideoFile | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  // Mention/hashtag suggestions
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Fetch mention suggestions
  const { data: mentionData } = useQuery<{ users?: UserSuggestion[] }>({
    queryKey: ['mention-search', mentionQuery],
    queryFn: () => api.get('/search', { params: { q: mentionQuery } }).then(r => r.data).catch(() => ({})),
    enabled: mentionQuery.length >= 1,
  });

  const handleCaptionChange = useCallback((text: string, sel?: { start: number }) => {
    setCaption(text);
    const pos = sel?.start ?? text.length;
    setCursorPos(pos);
    // Detect @mention trigger
    const before = text.slice(0, pos);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setShowMentions(true);
    } else {
      setShowMentions(false);
      setMentionQuery('');
    }
  }, []);

  const insertMention = useCallback((username: string) => {
    const before = caption.slice(0, cursorPos);
    const after = caption.slice(cursorPos);
    const mentionStart = before.lastIndexOf('@');
    const newCaption = before.slice(0, mentionStart) + '@' + username + ' ' + after;
    setCaption(newCaption);
    setShowMentions(false);
    setMentionQuery('');
  }, [caption, cursorPos]);

  const insertHashtag = useCallback((tag: string) => {
    setCaption(c => c + (c.endsWith(' ') || c === '' ? '' : ' ') + '#' + tag + ' ');
  }, []);

  const pickFromGallery = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'mixed', selectionLimit: 1, quality: 0.9 });
      if (result.didCancel) return;
      if (result.errorCode === 'permission') {
        Alert.alert('Accès refusé', 'Allez dans Réglages → Nour → Photos pour autoriser l\'accès.'); return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) { await pickFromFiles(); return; }
      const ext = (asset.fileName?.split('.').pop() ?? 'mp4').toLowerCase();
      const isImage = ['jpg','jpeg','png','webp','heic'].includes(ext);
      setMedia({ uri: asset.uri, name: asset.fileName ?? `media.${ext}`, size: asset.fileSize ?? null, type: asset.type ?? (isImage ? 'image/jpeg' : 'video/mp4'), isImage });
    } catch { await pickFromFiles(); }
  };

  const pickFromFiles = async () => {
    try {
      const result = await DocumentPicker.pickSingle({ type: [types.video, types.images], copyTo: 'cachesDirectory' });
      if (!result.uri) return;
      const uri = result.fileCopyUri ?? result.uri;
      const name = result.name ?? 'video.mp4';
      const ext = name.split('.').pop()?.toLowerCase() ?? 'mp4';
      const isImage = ['jpg','jpeg','png','webp','heic'].includes(ext);
      setMedia({ uri, name, size: result.size ?? null, type: result.type ?? (isImage ? 'image/jpeg' : 'video/mp4'), isImage });
    } catch (err) {
      if (isCancel(err)) return;
      Alert.alert('Erreur', 'Impossible de sélectionner le fichier.');
    }
  };

  const pickMultiPhotos = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 0, quality: 0.9 });
      if (result.didCancel || !result.assets?.length) return;
      setUploading(true);
      setUploadStep(`Envoi de ${result.assets.length} photo${result.assets.length > 1 ? 's' : ''}...`);
      const tokens = await getTokens();
      if (!tokens) throw new Error('Non authentifié');
      let done = 0;
      for (const asset of result.assets) {
        if (!asset.uri) continue;
        const fd = new FormData();
        fd.append('file', { uri: asset.uri, type: asset.type ?? 'image/jpeg', name: asset.fileName ?? `photo_${done}.jpg` } as any);
        const up = await fetch(`${API_BASE_URL}/upload/image`, {
          method: 'POST', headers: { Authorization: `Bearer ${tokens.access}` }, body: fd,
        });
        if (!up.ok) throw new Error(`Upload photo ${done + 1} échoué`);
        const { url } = await up.json();
        const full = url.startsWith('http') ? url : `${API_BASE_URL.replace('/api', '')}${url}`;
        await api.post('/posts', {
          video_url: full, thumbnail_url: full,
          caption: caption.trim() || undefined,
          duration: 0, is_public: true,
        });
        done++;
        setUploadProgress(Math.round((done / result.assets.length) * 100));
      }
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['user-posts'] });
      setCaption('');
      Alert.alert('✓ Publié !', `${done} photo${done > 1 ? 's publiées' : ' publiée'} dans le Pour toi.`);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Upload multi-photos échoué');
    } finally {
      setUploading(false);
      setUploadStep('');
      setUploadProgress(0);
    }
  };

  const handlePickPress = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Annuler', 'Vidéo / Photo unique', 'Photos multiples', 'Fichiers'], cancelButtonIndex: 0 },
        (i) => { if (i === 1) pickFromGallery(); if (i === 2) pickMultiPhotos(); if (i === 3) pickFromFiles(); },
      );
    } else { pickFromFiles(); }
  };

  const animateProgress = (to: number) => {
    Animated.timing(progressAnim, { toValue: to, duration: 300, useNativeDriver: false }).start();
  };

  const handlePublish = async () => {
    if (!media?.uri) return;
    setUploading(true);
    setUploadProgress(0);
    animateProgress(0);

    try {
      setUploadStep('Envoi du fichier...');
      animateProgress(15);

      const tokens = await getTokens();
      if (!tokens) throw new Error('Non authentifié');

      // Upload via fetch (plus fiable que XHR sur iOS)
      const formData = new FormData();
      // Ensure correct MIME type for iOS videos
      const mimeType = media.isImage ? 'image/jpeg'
        : media.type?.startsWith('video/') ? media.type : 'video/mp4';
      formData.append('file', { uri: media.uri, type: mimeType, name: media.name } as any);
      const endpoint = media.isImage ? '/upload/image' : '/upload/video';

      setUploadProgress(30);
      animateProgress(30);

      const uploadRes = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        let errMsg = `Erreur ${uploadRes.status}`;
        try { const j = await uploadRes.json(); errMsg = j?.error ?? errMsg; } catch {}
        throw new Error(errMsg);
      }

      const uploadData = await uploadRes.json();
      setUploadProgress(70);
      animateProgress(70);

      if (!uploadData?.url) throw new Error('URL manquante — vérifiez la configuration Cloudinary');
      const videoUrl = uploadData.url.startsWith('http') ? uploadData.url : `${API_BASE_URL.replace('/api', '')}${uploadData.url}`;

      // ── Thumbnail — priorité: backend Cloudinary → local extract → fallback ──
      let thumbnailUrl: string | undefined = uploadData.thumbnail_url ?? undefined;

      if (media.isImage) {
        thumbnailUrl = videoUrl;
      } else if (!thumbnailUrl) {
        // Local frame extraction → upload as image
        try {
          setUploadStep('Extraction de la couverture...');
          animateProgress(75);
          const localUri = media.uri.startsWith('file://') ? media.uri : `file://${media.uri}`;
          const thumb = await createThumbnail({ url: localUri, timeStamp: 0, format: 'jpeg' });
          const thumbUri = thumb.path.startsWith('file://') ? thumb.path : `file://${thumb.path}`;
          const thumbForm = new FormData();
          thumbForm.append('file', { uri: thumbUri, type: 'image/jpeg', name: 'cover.jpg' } as any);
          const thumbRes = await fetch(`${API_BASE_URL}/upload/image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokens.access}` },
            body: thumbForm,
          });
          if (thumbRes.ok) {
            const td = await thumbRes.json();
            if (td?.url) thumbnailUrl = td.url;
          }
        } catch {}

        // Cloudinary auto-thumbnail fallback
        if (!thumbnailUrl && videoUrl.includes('cloudinary.com')) {
          thumbnailUrl = videoUrl
            .replace('/video/upload/', '/video/upload/so_0,q_auto,f_jpg,w_720,h_1280,c_fill/')
            .replace(/\.(mp4|mov|avi|webm|mkv)$/i, '.jpg');
        }
      }

      setUploadStep('Publication...');
      animateProgress(85);

      await api.post('/posts', {
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        caption: caption.trim() || undefined,
        duration: 1,
        is_public: true,
      });

      animateProgress(100);
      setUploadProgress(100);

      setTimeout(() => {
        setMedia(null);
        setCaption('');
        setUploading(false);
        setUploadStep('');
        setUploadProgress(0);
        animateProgress(0);
        qc.invalidateQueries({ queryKey: ['feed'] });
        qc.invalidateQueries({ queryKey: ['user-posts'] });
        Alert.alert('✓ Publié !', 'Ta vidéo est en ligne dans le Pour toi.');
      }, 600);
    } catch (err: any) {
      setUploading(false);
      setUploadStep('');
      setUploadProgress(0);
      animateProgress(0);
      const msg = err?.response?.data?.error ?? err?.message ?? 'Échec de l\'envoi. Vérifie ta connexion.';
      Alert.alert('Erreur', msg);
    }
  };

  const sizeMB = media?.size ? (media.size / 1_000_000).toFixed(1) : null;
  const progressWidth = progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });

  const popularHashtags = ['rappel', 'coran', 'motivation', 'islam', 'dua', 'lifestyle', 'famille'];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nouvelle publication</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ── Media picker ── */}
        <TouchableOpacity style={[styles.picker, !!media && styles.pickerSelected]} onPress={handlePickPress} activeOpacity={0.8} disabled={uploading}>
          {media ? (
            <View style={styles.pickerInfo}>
              <View style={styles.pickerIconWrap}>
                {media.isImage ? <IcImage size={22} color={COLORS.primary} /> : <IcVideo size={22} color={COLORS.primary} />}
              </View>
              <View style={styles.pickerDetails}>
                <Text style={styles.pickerFileName} numberOfLines={1}>{media.name}</Text>
                {sizeMB && <Text style={styles.pickerMeta}>{sizeMB} MB · Appuie pour changer</Text>}
              </View>
              <TouchableOpacity onPress={() => !uploading && setMedia(null)} style={styles.clearBtn} hitSlop={{ top:12, bottom:12, left:12, right:12 }}>
                <IcClose size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.pickerEmpty}>
              <View style={styles.pickerEmptyIconWrap}>
                <IcCreate size={28} color={COLORS.primary} strokeWidth={2} />
              </View>
              <Text style={styles.pickerEmptyLabel}>Ajouter une vidéo ou photo</Text>
              <Text style={styles.pickerEmptyHint}>Galerie · Fichiers · MP4, MOV, JPG, PNG</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ── Progress bar ── */}
        {uploading && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
            </View>
            <Text style={styles.progressText}>{uploadStep} {uploadProgress > 0 ? `${uploadProgress}%` : ''}</Text>
          </View>
        )}

        {/* ── Caption with hashtag/mention support ── */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            ref={inputRef}
            style={styles.textarea}
            value={caption}
            onChangeText={(t) => handleCaptionChange(t)}
            onSelectionChange={(e) => setCursorPos(e.nativeEvent.selection.start)}
            placeholder="Décris ta vidéo... #hashtag @mention"
            placeholderTextColor={COLORS.textPlaceholder}
            multiline
            maxLength={500}
            editable={!uploading}
          />
          {/* Live preview with colored hashtags/mentions */}
          {caption.length > 0 && (
            <View style={styles.captionPreview}>
              <Text style={styles.captionPreviewLabel}>Aperçu :</Text>
              <Text style={styles.captionPreviewText}>{parseCaption(caption)}</Text>
            </View>
          )}
          <Text style={styles.charCount}>{caption.length}/500</Text>
        </View>

        {/* ── @Mention suggestions ── */}
        {showMentions && (mentionData?.users?.length ?? 0) > 0 && (
          <View style={styles.suggestionsBox}>
            {mentionData!.users!.slice(0, 5).map((u) => (
              <TouchableOpacity key={u.id} style={styles.suggestionRow} onPress={() => insertMention(u.username)} activeOpacity={0.7}>
                {u.avatar_url
                  ? <Image source={{ uri: u.avatar_url }} style={styles.suggestionAvatar} />
                  : <View style={[styles.suggestionAvatar, styles.suggestionAvatarFallback]}><Text style={styles.suggestionAvatarText}>{u.display_name[0]?.toUpperCase()}</Text></View>
                }
                <View>
                  <Text style={styles.suggestionName}>{u.display_name}</Text>
                  <Text style={styles.suggestionUsername}>@{u.username}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Quick hashtag chips ── */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Hashtags populaires</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hashtagRow}>
            {popularHashtags.map(tag => (
              <TouchableOpacity key={tag} style={styles.hashChip} onPress={() => insertHashtag(tag)} activeOpacity={0.8}>
                <IcHash size={12} color={COLORS.primary} />
                <Text style={styles.hashChipText}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Tips ── */}
        <View style={styles.tipsBox}>
          <Text style={styles.tipTitle}>Conseils</Text>
          <Text style={styles.tipItem}>· Utilise <Text style={styles.tipHighlight}>#hashtag</Text> pour apparaître dans Explorer</Text>
          <Text style={styles.tipItem}>· Mentionne <Text style={styles.tipHighlight}>@utilisateur</Text> pour les notifier</Text>
          <Text style={styles.tipItem}>· Vidéos verticales (9:16) recommandées</Text>
          <Text style={styles.tipItem}>· Max 100 MB pour un upload rapide</Text>
        </View>

        {/* ── Publish button ── */}
        <TouchableOpacity
          style={[styles.submitBtn, (!media || uploading) && styles.submitBtnDisabled]}
          onPress={handlePublish}
          disabled={!media || uploading}
          activeOpacity={0.85}
        >
          {uploading
            ? <ActivityIndicator color={COLORS.white} size="small" />
            : <Text style={styles.submitBtnText}>Publier</Text>
          }
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: SPACING.md, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
  },
  headerTitle: { fontSize: FONT.size.xl, fontWeight: FONT.weight.bold, color: COLORS.text },
  content: { padding: SPACING.md, gap: SPACING.md },

  picker: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed',
    minHeight: 160, overflow: 'hidden', justifyContent: 'center',
  },
  pickerSelected: { borderStyle: 'solid', borderColor: COLORS.primary },
  pickerEmpty: { alignItems: 'center', gap: 10, padding: SPACING.xl },
  pickerEmptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primaryBg, borderWidth: 2, borderColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  pickerEmptyLabel: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.text },
  pickerEmptyHint: { fontSize: FONT.size.xs, color: COLORS.textMuted, textAlign: 'center' },
  pickerInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.md },
  pickerIconWrap: {
    width: 52, height: 52, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  pickerDetails: { flex: 1 },
  pickerFileName: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.text },
  pickerMeta: { fontSize: FONT.size.xs, color: COLORS.textMuted, marginTop: 2 },
  clearBtn: { padding: 4 },

  progressWrap: { gap: 6 },
  progressTrack: { height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  progressText: { fontSize: FONT.size.xs, color: COLORS.primary, fontWeight: FONT.weight.medium, textAlign: 'center' },

  field: { gap: 8 },
  fieldLabel: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.textMuted },
  textarea: {
    backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: SPACING.md,
    fontSize: FONT.size.base, color: COLORS.text,
    minHeight: 100, textAlignVertical: 'top',
  },
  captionPreview: {
    backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.sm,
    padding: SPACING.sm, gap: 4,
  },
  captionPreviewLabel: { fontSize: FONT.size.xs, color: COLORS.textMuted },
  captionPreviewText: { fontSize: FONT.size.sm, lineHeight: 20 },
  captionNormal: { color: COLORS.text },
  captionHash: { color: COLORS.primary, fontWeight: FONT.weight.semibold },
  captionMention: { color: '#3B82F6', fontWeight: FONT.weight.semibold },
  charCount: { fontSize: FONT.size.xs, color: COLORS.textSubtle, textAlign: 'right' },

  suggestionsBox: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.borderLight, overflow: 'hidden', ...SHADOW.sm,
  },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  suggestionAvatar: { width: 36, height: 36, borderRadius: 18 },
  suggestionAvatarFallback: { backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center' },
  suggestionAvatarText: { fontSize: 14, fontWeight: FONT.weight.bold, color: COLORS.primary },
  suggestionName: { fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold, color: COLORS.text },
  suggestionUsername: { fontSize: FONT.size.xs, color: COLORS.textMuted },

  hashtagRow: { gap: 8, paddingVertical: 4 },
  hashChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.full,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: COLORS.primaryLight,
  },
  hashChipText: { fontSize: FONT.size.sm, color: COLORS.primary, fontWeight: FONT.weight.medium },

  tipsBox: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.md,
    padding: SPACING.md, gap: 4,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  tipTitle: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold, color: COLORS.text, marginBottom: 4 },
  tipItem: { fontSize: FONT.size.xs, color: COLORS.textMuted, lineHeight: 18 },
  tipHighlight: { color: COLORS.primary, fontWeight: FONT.weight.semibold },

  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingVertical: 16, alignItems: 'center', ...SHADOW.green,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: FONT.size.md, fontWeight: FONT.weight.semibold, color: COLORS.white },
});
