import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator,
  Modal, ScrollView, Image, Share, Linking, Alert,
  Dimensions, Clipboard, Platform, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { api } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useTheme as useAppTheme } from '../../hooks/useTheme';
import { COLORS, FONT, SPACING, RADIUS } from '../../constants/theme';
import {
  IcClose, IcRepeat, IcFlag, IcDownload, IcLink, IcSave, IcMail, IcSearch,
  IcInstagram, IcWhatsApp, IcPin, IcTrash, IcEdit,
} from '../ui/Icons';

const { height: H } = Dimensions.get('window');
const HAPTIC = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false };
const APP_URL = 'https://nour.app';

interface Contact {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  conversation_id: string | null;
}

interface Post {
  id: string;
  share_count: number;
  video_url?: string;
  thumbnail_url?: string | null;
  media_urls?: string[];
  caption?: string | null;
  is_pinned?: boolean;
  user?: { id?: string; display_name?: string };
}

interface Props {
  post: Post;
  visible: boolean;
  onClose: () => void;
  onNotInterested?: () => void;
}

export default function ShareSheet({ post, visible, onClose, onNotInterested }: Props) {
  const theme = useAppTheme();
  const qc = useQueryClient();
  const nav = useNavigation<any>();
  const { user: currentUser } = useAuthStore();
  const isOwnPost = !!currentUser && post.user?.id === currentUser.id;
  const slideAnim = useRef(new Animated.Value(H)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [reposted, setReposted] = useState(false);
  const [reportMode, setReportMode] = useState(false);
  const [reportText, setReportText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption ?? '');
  const [pinned, setPinned] = useState(!!post.is_pinned);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setReportMode(false);
      setReportText('');
      setEditMode(false);
      setEditCaption(post.caption ?? '');
      setPinned(!!post.is_pinned);
      setSearchMode(false);
      setSearchQuery('');
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 200 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: H, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const { data: contactsData } = useQuery<{ items: Contact[] }>({
    queryKey: ['share-contacts'],
    queryFn: () => api.get('/posts/share-contacts').then(r => r.data).catch(() => ({ items: [] })),
    enabled: visible,
    staleTime: 60_000,
  });

  const repostMutation = useMutation({
    mutationFn: () => api.post(`/posts/${post.id}/repost`).then(r => r.data),
    onSuccess: (data) => {
      setReposted(data.reposted);
      ReactNativeHapticFeedback.trigger('impactMedium', HAPTIC);
      // Don't invalidate 'feed' — it would re-fetch and reorder/replace what's
      // currently on screen mid-scroll. Repost is a local toggle only.
      qc.invalidateQueries({ queryKey: ['post', post.id] });
    },
  });

  const notInterestedMutation = useMutation({
    mutationFn: () => api.post(`/posts/${post.id}/not-interested`).then(r => r.data),
    onSuccess: () => {
      ReactNativeHapticFeedback.trigger('impactLight', HAPTIC);
      onClose();
      onNotInterested?.();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/posts/${post.id}`).then(r => r.data),
    onSuccess: () => {
      ReactNativeHapticFeedback.trigger('notificationSuccess', HAPTIC);
      qc.invalidateQueries({ queryKey: ['user-posts'] });
      qc.invalidateQueries({ queryKey: ['user-posts-public'] });
      onClose();
      if (nav?.canGoBack?.()) nav.goBack();
    },
    onError: () => Alert.alert('Erreur', 'Impossible de supprimer cette publication.'),
  });

  const pinMutation = useMutation({
    mutationFn: () => api.post(`/posts/${post.id}/pin`).then(r => r.data),
    onSuccess: (data) => {
      setPinned(data.pinned);
      ReactNativeHapticFeedback.trigger('notificationSuccess', HAPTIC);
      qc.invalidateQueries({ queryKey: ['user-posts'] });
      qc.invalidateQueries({ queryKey: ['user-posts-public'] });
    },
    onError: (e: any) => Alert.alert('Erreur', e?.response?.data?.error ?? 'Impossible d\'épingler cette publication.'),
  });

  const editMutation = useMutation({
    mutationFn: () => api.patch(`/posts/${post.id}`, { caption: editCaption.trim() }).then(r => r.data),
    onSuccess: () => {
      ReactNativeHapticFeedback.trigger('notificationSuccess', HAPTIC);
      qc.invalidateQueries({ queryKey: ['user-posts'] });
      qc.invalidateQueries({ queryKey: ['user-posts-public'] });
      qc.invalidateQueries({ queryKey: ['post', post.id] });
      setEditMode(false);
      onClose();
    },
    onError: () => Alert.alert('Erreur', 'Impossible de modifier cette publication.'),
  });

  const confirmDelete = () => {
    Alert.alert(
      'Supprimer la publication',
      'Cette action est définitive. La publication sera supprimée de ton profil et du fil.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ],
    );
  };

  const addToStoryMutation = useMutation({
    mutationFn: () => {
      const isVideo = !!post.video_url;
      const mediaUrl = isVideo ? post.video_url : (post.thumbnail_url ?? post.media_urls?.[0] ?? '');
      const mediaType = isVideo ? 'video' : 'image';
      return api.post('/stories', { media_url: mediaUrl, media_type: mediaType, linked_post_id: post.id }).then(r => r.data);
    },
    onSuccess: () => {
      ReactNativeHapticFeedback.trigger('notificationSuccess', HAPTIC);
      Alert.alert('Story ajoutée', 'La vidéo a été ajoutée à votre story pour 24h.');
      onClose();
    },
    onError: () => Alert.alert('Erreur', 'Impossible d\'ajouter à la story.'),
  });

  const reportMutation = useMutation({
    mutationFn: (description: string) =>
      api.post('/support/tickets', {
        subject: `Signalement de post — ${post.id}`,
        description: `Post ID: ${post.id}\n\n${description}`,
      }).then(r => r.data),
    onSuccess: () => {
      ReactNativeHapticFeedback.trigger('notificationSuccess', HAPTIC);
      Alert.alert('Signalement envoyé', 'Notre équipe examinera votre signalement. Merci.');
      setReportMode(false);
      setReportText('');
      onClose();
    },
    onError: () => Alert.alert('Erreur', 'Impossible d\'envoyer le signalement.'),
  });

  const shareLink = `${APP_URL}/post/${post.id}`;

  const sendToContact = async (contact: Contact) => {
    ReactNativeHapticFeedback.trigger('impactLight', HAPTIC);
    if (!contact.conversation_id) {
      Alert.alert('Impossible', 'Commencez une conversation avec cet utilisateur d\'abord.');
      return;
    }
    try {
      await api.post(`/messages/${contact.conversation_id}`, {
        content: `${post.user?.display_name ?? 'Vidéo'}\n${shareLink}`,
      });
      ReactNativeHapticFeedback.trigger('notificationSuccess', HAPTIC);
      onClose();
    } catch {
      Alert.alert('Erreur', 'Impossible d\'envoyer le message.');
    }
  };

  const openWhatsApp = () => {
    const msg = encodeURIComponent(`Regarde cette vidéo\n${shareLink}`);
    Linking.openURL(`whatsapp://send?text=${msg}`).catch(() =>
      Alert.alert('WhatsApp', 'WhatsApp n\'est pas installé.')
    );
  };

  const openSMS = () => {
    const msg = encodeURIComponent(`Regarde cette vidéo ${shareLink}`);
    Linking.openURL(Platform.OS === 'ios' ? `sms:&body=${msg}` : `sms:?body=${msg}`).catch(() => null);
  };

  const openInstagram = () => {
    Clipboard.setString(shareLink);
    Linking.openURL('instagram://app').catch(() =>
      Alert.alert('Instagram', 'Instagram n\'est pas installé. Lien copié dans le presse-papier.')
    );
  };

  const copyLink = () => {
    Clipboard.setString(shareLink);
    ReactNativeHapticFeedback.trigger('impactLight', HAPTIC);
    Alert.alert('Lien copié !', shareLink);
  };

  const contacts = contactsData?.items ?? [];

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View style={[styles.sheet, { backgroundColor: theme.surface, transform: [{ translateY: slideAnim }] }]}>
          {/* Handle */}
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: theme.borderLight }]} />
          </View>

          {reportMode ? (
            /* Report sub-screen */
            <View style={styles.reportPane}>
              <View style={styles.reportHeader}>
                <TouchableOpacity onPress={() => setReportMode(false)} activeOpacity={0.7}>
                  <IcClose size={20} color={theme.textMuted} />
                </TouchableOpacity>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>Signaler</Text>
                <View style={{ width: 28 }} />
              </View>
              <Text style={[styles.reportHint, { color: theme.textMuted }]}>
                Décrivez le problème. Notre équipe le traitera dans les plus brefs délais.
              </Text>
              <TextInput
                style={[styles.reportInput, { borderColor: theme.borderLight, color: theme.text, backgroundColor: theme.card }]}
                placeholder="Ex : contenu inapproprié, trompeur…"
                placeholderTextColor={theme.textMuted}
                multiline
                value={reportText}
                onChangeText={setReportText}
                maxLength={500}
              />
              <Text style={[styles.reportCount, { color: theme.textMuted }]}>{reportText.length}/500</Text>
              <TouchableOpacity
                style={[styles.reportSendBtn, { backgroundColor: COLORS.primary, opacity: reportText.trim().length < 10 ? 0.5 : 1 }]}
                onPress={() => reportMutation.mutate(reportText.trim())}
                disabled={reportText.trim().length < 10 || reportMutation.isPending}
                activeOpacity={0.8}
              >
                <Text style={styles.reportSendText}>Envoyer le signalement</Text>
              </TouchableOpacity>
              <View style={{ height: 24 }} />
            </View>
          ) : editMode ? (
            /* Edit sub-screen — caption (title/description/hashtags are all part of it) */
            <View style={styles.reportPane}>
              <View style={styles.reportHeader}>
                <TouchableOpacity onPress={() => setEditMode(false)} activeOpacity={0.7}>
                  <IcClose size={20} color={theme.textMuted} />
                </TouchableOpacity>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>Modifier la publication</Text>
                <View style={{ width: 28 }} />
              </View>
              <Text style={[styles.reportHint, { color: theme.textMuted }]}>
                Titre, description et hashtags.
              </Text>
              <TextInput
                style={[styles.reportInput, { borderColor: theme.borderLight, color: theme.text, backgroundColor: theme.card }]}
                placeholder="Titre, description, #hashtags…"
                placeholderTextColor={theme.textMuted}
                multiline
                value={editCaption}
                onChangeText={setEditCaption}
                maxLength={500}
                autoFocus
              />
              <Text style={[styles.reportCount, { color: theme.textMuted }]}>{editCaption.length}/500</Text>
              <TouchableOpacity
                style={[styles.reportSendBtn, { backgroundColor: COLORS.primary }]}
                onPress={() => editMutation.mutate()}
                disabled={editMutation.isPending}
                activeOpacity={0.8}
              >
                {editMutation.isPending
                  ? <ActivityIndicator color={COLORS.white} />
                  : <Text style={styles.reportSendText}>Enregistrer</Text>}
              </TouchableOpacity>
              <View style={{ height: 24 }} />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">
              {/* Header — search left, close right */}
              <View style={styles.sheetHeader}>
                <TouchableOpacity onPress={() => setSearchMode(m => !m)} style={styles.closeBtn} activeOpacity={0.7}>
                  <IcSearch size={19} color={theme.textMuted} />
                </TouchableOpacity>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>Envoyer à</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                  <IcClose size={20} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              {searchMode && (
                <View style={[styles.searchWrap, { backgroundColor: theme.card, borderColor: theme.borderLight }]}>
                  <IcSearch size={16} color={theme.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: theme.text }]}
                    placeholder="Rechercher un utilisateur"
                    placeholderTextColor={theme.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoFocus
                  />
                </View>
              )}

              {/* Amis / conversations récentes */}
              {contacts.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.contactsRow}
                >
                  {contacts
                    .filter(c => !searchQuery.trim() || c.display_name.toLowerCase().includes(searchQuery.trim().toLowerCase()) || c.username.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                    .map(c => (
                      <ContactCircle key={c.id} contact={c} onPress={() => sendToContact(c)} theme={theme} />
                    ))}
                </ScrollView>
              )}

              <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

              {/* App share row */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.appRow}>
                <ActionCircle
                  label={reposted ? 'Republié' : 'Republier'}
                  icon={<IcRepeat size={22} color={reposted ? COLORS.primary : theme.text} />}
                  bg={reposted ? COLORS.primaryBg : theme.card}
                  borderColor={reposted ? COLORS.primary : 'transparent'}
                  onPress={() => repostMutation.mutate()}
                />
                <ActionCircle
                  label="Copier le lien"
                  icon={<IcLink size={22} color={theme.text} />}
                  bg={theme.card}
                  onPress={copyLink}
                />
                <ActionCircle
                  label="WhatsApp"
                  icon={<IcWhatsApp size={22} color="#fff" />}
                  bg="#25D366"
                  onPress={openWhatsApp}
                />
                <ActionCircle
                  label="Message"
                  icon={<IcMail size={22} color="#fff" />}
                  bg="#34C759"
                  onPress={openSMS}
                />
                <ActionCircle
                  label="Instagram"
                  icon={<IcInstagram size={22} color="#fff" />}
                  bg="#C13584"
                  onPress={openInstagram}
                />
              </ScrollView>

              <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />

              {/* Bottom actions — single row, icon + label only */}
              <View style={styles.bottomRow4}>
                <ActionColumn
                  icon={<IcDownload size={21} color={theme.text} />}
                  label="Télécharger"
                  onPress={async () => {
                    const url = post.video_url ?? post.thumbnail_url;
                    if (!url) return;
                    ReactNativeHapticFeedback.trigger('impactLight', HAPTIC);
                    try {
                      const type = post.video_url ? 'video' : 'photo';
                      await CameraRoll.saveAsset(url, { type });
                      ReactNativeHapticFeedback.trigger('notificationSuccess', HAPTIC);
                      Alert.alert('Téléchargé', 'Sauvegardé dans votre galerie Photos.');
                    } catch (err: any) {
                      const msg = err?.message ?? '';
                      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('denied')) {
                        Alert.alert('Permission requise', 'Autorisez l\'accès aux Photos dans Réglages > Confidentialité > Photos.');
                      } else {
                        Linking.openURL(post.video_url ?? post.thumbnail_url ?? '').catch(() =>
                          Alert.alert('Erreur', 'Impossible de télécharger.')
                        );
                      }
                    }
                  }}
                  theme={theme}
                />
                <ActionColumn
                  icon={<IcFlag size={21} color={theme.text} />}
                  label="Signaler"
                  onPress={() => setReportMode(true)}
                  theme={theme}
                />
                <ActionColumn
                  icon={<IcClose size={21} color={COLORS.error} />}
                  label="Pas intéressé"
                  onPress={() => notInterestedMutation.mutate()}
                  loading={notInterestedMutation.isPending}
                  theme={theme}
                  destructive
                />
                <ActionColumn
                  icon={<IcSave size={21} color={theme.text} />}
                  label="Story"
                  onPress={() => addToStoryMutation.mutate()}
                  loading={addToStoryMutation.isPending}
                  theme={theme}
                />
              </View>

              {isOwnPost && (
                <>
                  <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />
                  <View style={styles.bottomRow4}>
                    <ActionColumn
                      icon={<IcPin size={21} color={pinned ? COLORS.primary : theme.text} />}
                      label={pinned ? 'Désépingler' : 'Épingler'}
                      onPress={() => pinMutation.mutate()}
                      loading={pinMutation.isPending}
                      theme={theme}
                    />
                    <ActionColumn
                      icon={<IcEdit size={21} color={theme.text} />}
                      label="Modifier"
                      onPress={() => setEditMode(true)}
                      theme={theme}
                    />
                    <ActionColumn
                      icon={<IcTrash size={21} color={COLORS.error} />}
                      label="Supprimer"
                      onPress={confirmDelete}
                      loading={deleteMutation.isPending}
                      theme={theme}
                      destructive
                    />
                  </View>
                </>
              )}

              <View style={{ height: 36 }} />
            </ScrollView>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ContactCircle({ contact, onPress, theme }: { contact: Contact; onPress: () => void; theme: ReturnType<typeof useAppTheme> }) {
  const initials = contact.display_name[0]?.toUpperCase() ?? '?';
  return (
    <TouchableOpacity style={styles.contactItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.contactAvatar, { borderColor: theme.borderLight }]}>
        {contact.avatar_url ? (
          <Image source={{ uri: contact.avatar_url }} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{initials}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.contactName, { color: theme.textMuted }]} numberOfLines={1}>
        {contact.display_name}
      </Text>
    </TouchableOpacity>
  );
}

function ActionCircle({
  label, icon, bg, onPress, borderColor,
}: {
  label: string; icon: React.ReactNode; bg: string;
  onPress: () => void; borderColor?: string;
}) {
  const theme = useAppTheme();
  return (
    <TouchableOpacity style={styles.actionItem} onPress={onPress} activeOpacity={0.75}>
      <View style={[
        styles.actionCircle,
        { backgroundColor: bg, borderWidth: borderColor && borderColor !== 'transparent' ? 2 : 0, borderColor: borderColor ?? 'transparent' },
      ]}>
        {icon}
      </View>
      <Text style={[styles.actionLabel, { color: theme.textMuted }]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActionColumn({
  icon, label, onPress, theme, loading, destructive,
}: {
  icon: React.ReactNode; label: string; onPress: () => void;
  theme: ReturnType<typeof useAppTheme>; loading?: boolean; destructive?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.actionCol} onPress={onPress} activeOpacity={0.75} disabled={loading}>
      <View style={[styles.actionColIcon, { backgroundColor: destructive ? '#FEF2F2' : theme.card }]}>
        {loading ? <ActivityIndicator size="small" color={theme.primary} /> : icon}
      </View>
      <Text style={[styles.actionColLabel, { color: destructive ? COLORS.error : theme.text }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: H * 0.78,
    overflow: 'hidden',
  },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 10,
  },
  sheetTitle: { fontSize: FONT.size.lg, fontWeight: '700' },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: SPACING.md, marginBottom: 8,
    borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: FONT.size.sm, padding: 0 },
  contactsRow: { paddingVertical: 12, gap: 16, paddingHorizontal: SPACING.md },
  contactItem: { alignItems: 'center', width: 64, gap: 6 },
  contactAvatar: {
    width: 56, height: 56, borderRadius: 28, overflow: 'hidden',
    borderWidth: 1.5,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryBg },
  avatarInitial: { fontSize: 20, fontWeight: '700', color: COLORS.primary },
  contactName: { fontSize: 11, textAlign: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 6, marginHorizontal: SPACING.md },
  appRow: { paddingVertical: 12, gap: 14, paddingHorizontal: SPACING.md },
  actionItem: { alignItems: 'center', width: 68, gap: 8 },
  actionCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 11, textAlign: 'center', lineHeight: 14 },
  bottomRow4: { flexDirection: 'row', paddingHorizontal: SPACING.md, paddingVertical: 14 },
  actionCol: { flex: 1, alignItems: 'center', gap: 6 },
  actionColIcon: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  actionColLabel: { fontSize: 11, fontWeight: '500', textAlign: 'center' },

  // Report
  reportPane: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  reportHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12,
  },
  reportHint: { fontSize: FONT.size.sm, lineHeight: 20, marginBottom: 14 },
  reportInput: {
    borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.sm,
    fontSize: FONT.size.base, minHeight: 100, textAlignVertical: 'top',
  },
  reportCount: { fontSize: FONT.size.xs, textAlign: 'right', marginTop: 4 },
  reportSendBtn: {
    marginTop: 16, borderRadius: RADIUS.full, paddingVertical: 14,
    alignItems: 'center',
  },
  reportSendText: { color: '#fff', fontSize: FONT.size.base, fontWeight: '700' },
});
