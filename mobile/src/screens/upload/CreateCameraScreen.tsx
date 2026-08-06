import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import Video from 'react-native-video';
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { api, getTokens } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, SPACING, RADIUS, API_BASE_URL } from '../../constants/theme';
import {
  IcClose, IcMusic, IcRefresh, IcZap, IcMaximize, IcImage,
} from '../../components/ui/Icons';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateCamera'>;

interface CapturedMedia {
  uri: string;
  type: 'photo' | 'video';
}

interface SoundOption {
  id: string;
  title: string;
  artist: string | null;
}

export default function CreateCameraScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'camera' | 'live'>('camera');
  const [captured, setCaptured] = useState<CapturedMedia[]>([]);
  const [selectedSound, setSelectedSound] = useState<SoundOption | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [useFrontCam, setUseFrontCam] = useState(false);
  const [soundPickerOpen, setSoundPickerOpen] = useState(false);

  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice(useFrontCam ? 'front' : 'back');
  const { hasPermission: hasCamPermission, requestPermission: requestCamPermission } = useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } = useMicrophonePermission();

  useEffect(() => {
    if (!hasCamPermission) requestCamPermission();
    if (!hasMicPermission) requestMicPermission();
  }, []);

  const close = useCallback(() => navigation.goBack(), [navigation]);

  const takePhoto = useCallback(async () => {
    if (!cameraRef.current) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePhoto({ flash: flashOn ? 'on' : 'off' });
      setCaptured([{ uri: `file://${photo.path}`, type: 'photo' }]);
    } catch {
      Alert.alert('Erreur', "Impossible de prendre la photo.");
    } finally {
      setCapturing(false);
    }
  }, [flashOn]);

  const startVideo = useCallback(() => {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    cameraRef.current.startRecording({
      flash: flashOn ? 'on' : 'off',
      onRecordingFinished: (video) => {
        setIsRecording(false);
        setCaptured([{ uri: `file://${video.path}`, type: 'video' }]);
      },
      onRecordingError: () => {
        setIsRecording(false);
        Alert.alert('Erreur', "Impossible d'enregistrer la vidéo.");
      },
    });
  }, [flashOn, isRecording]);

  const stopVideo = useCallback(async () => {
    if (!cameraRef.current || !isRecording) return;
    try {
      await cameraRef.current.stopRecording();
    } catch {
      setIsRecording(false);
    }
  }, [isRecording]);

  const pickFromGallery = useCallback(async () => {
    const result = await launchImageLibrary({ mediaType: 'mixed', selectionLimit: 10, quality: 0.9 });
    if (result.didCancel || !result.assets?.length) return;
    const items = result.assets
      .filter((a) => !!a.uri)
      .map((a) => ({ uri: a.uri!, type: (a.type?.startsWith('video') ? 'video' : 'photo') as 'photo' | 'video' }));
    if (items.length === 0) return;
    // Stay on this page — Story / Continuer appear next, same as a fresh capture.
    setCaptured(items);
  }, []);

  const retake = useCallback(() => setCaptured([]), []);

  const goToStory = useCallback(async () => {
    const first = captured[0];
    if (!first) return;
    setCapturing(true);
    try {
      const tokens = await getTokens();
      if (!tokens) throw new Error('Non authentifié');
      const fd = new FormData();
      fd.append('file', { uri: first.uri, type: first.type === 'video' ? 'video/mp4' : 'image/jpeg', name: `story.${first.type === 'video' ? 'mp4' : 'jpg'}` } as any);
      const upRes = await fetch(`${API_BASE_URL}/upload/${first.type === 'video' ? 'video' : 'image'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.access}` },
        body: fd as any,
      });
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({}));
        throw new Error(err?.error ?? `Upload échoué (${upRes.status})`);
      }
      const upData = await upRes.json();
      const url = upData.url;
      if (!url) throw new Error('Upload échoué');
      await api.post('/stories', { media_url: url, media_type: first.type === 'video' ? 'video' : 'image' });
      Alert.alert('Story publiée', 'Visible 24h sur ton profil.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? "Impossible de publier la story.");
    } finally {
      setCapturing(false);
    }
  }, [captured, navigation]);

  const goToComposer = useCallback(() => {
    if (captured.length === 0) return;
    navigation.replace('PostComposer', { media: captured, soundId: selectedSound?.id });
  }, [captured, navigation, selectedSound]);

  if (mode === 'live') {
    navigation.replace('GoLive');
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Preview area — live camera before capture, captured media after */}
      <View style={StyleSheet.absoluteFill}>
        {captured.length > 0 ? (
          captured[0].type === 'video' ? (
            <Video source={{ uri: captured[0].uri }} style={StyleSheet.absoluteFill} resizeMode="cover" repeat muted={false} />
          ) : (
            <Image source={{ uri: captured[0].uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )
        ) : hasCamPermission && device ? (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={mode === 'camera' && captured.length === 0}
            photo
            video
            audio={hasMicPermission}
            torch={flashOn && device.hasTorch ? 'on' : 'off'}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.cameraPlaceholder]}>
            {!hasCamPermission ? (
              <>
                <Text style={styles.permissionText}>Autorise l'accès à la caméra pour filmer.</Text>
                <TouchableOpacity style={styles.permissionBtn} onPress={requestCamPermission} activeOpacity={0.8}>
                  <Text style={styles.permissionBtnText}>Autoriser la caméra</Text>
                </TouchableOpacity>
              </>
            ) : (
              <ActivityIndicator color={COLORS.white} size="large" />
            )}
          </View>
        )}
        {capturing && (
          <View style={[StyleSheet.absoluteFill, styles.captureOverlay]} pointerEvents="none">
            <ActivityIndicator color={COLORS.white} size="large" />
          </View>
        )}
        {captured.length > 1 && (
          <View style={styles.multiBadge}>
            <Text style={styles.multiBadgeText}>{captured.length}</Text>
          </View>
        )}
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <TouchableOpacity onPress={captured.length > 0 ? retake : close} style={styles.iconBtn} activeOpacity={0.8}>
          <IcClose size={26} color={COLORS.white} />
        </TouchableOpacity>

        {captured.length === 0 && (
          <TouchableOpacity
            style={styles.soundPill}
            activeOpacity={0.85}
            onPress={() => setSoundPickerOpen(true)}
          >
            <IcMusic size={14} color={COLORS.white} />
            <Text style={styles.soundPillText} numberOfLines={1}>
              {selectedSound ? selectedSound.title : 'Ajouter un son'}
            </Text>
          </TouchableOpacity>
        )}

        {captured.length === 0 ? (
          <TouchableOpacity onPress={() => setUseFrontCam((v) => !v)} style={styles.iconBtn} activeOpacity={0.8}>
            <IcRefresh size={24} color={COLORS.white} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {/* Right rail — flip, flash, crop only */}
      {captured.length === 0 && (
        <View style={[styles.rightRail, { top: insets.top + 70 }]}>
          <TouchableOpacity style={styles.railBtn} onPress={() => setUseFrontCam((v) => !v)} activeOpacity={0.8}>
            <IcRefresh size={22} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.railBtn} onPress={() => setFlashOn((v) => !v)} activeOpacity={0.8}>
            <IcZap size={22} color={flashOn ? COLORS.gold : COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.railBtn} activeOpacity={0.8}>
            <IcMaximize size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom controls */}
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 18 }]}>
        {captured.length === 0 ? (
          <>
            <View style={styles.captureRow}>
              <TouchableOpacity onPress={pickFromGallery} style={styles.galleryBtn} activeOpacity={0.85}>
                <IcImage size={22} color={COLORS.white} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={takePhoto}
                onLongPress={startVideo}
                onPressOut={() => { if (isRecording) stopVideo(); }}
                delayLongPress={280}
                disabled={capturing}
                activeOpacity={0.85}
                style={[styles.captureOuter, isRecording && styles.captureOuterRecording]}
              >
                <View style={[styles.captureInner, isRecording && styles.captureInnerRecording]} />
              </TouchableOpacity>

              <View style={styles.galleryBtn} />
            </View>

            <View style={styles.modeRow}>
              <TouchableOpacity onPress={() => setMode('live')} activeOpacity={0.8}>
                <Text style={styles.modeLabel}>Live</Text>
              </TouchableOpacity>
              <Text style={[styles.modeLabel, styles.modeLabelActive]}>Caméra</Text>
            </View>
          </>
        ) : (
          <View style={styles.postCaptureRow}>
            <TouchableOpacity onPress={goToStory} disabled={capturing} style={styles.postCaptureBtn} activeOpacity={0.85}>
              {capturing ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.postCaptureBtnText}>Story</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={goToComposer} style={[styles.postCaptureBtn, styles.postCaptureBtnPrimary]} activeOpacity={0.85}>
              <Text style={[styles.postCaptureBtnText, styles.postCaptureBtnTextPrimary]}>Suivant</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <SoundPickerModal
        visible={soundPickerOpen}
        onClose={() => setSoundPickerOpen(false)}
        onSelect={(s) => { setSelectedSound(s); setSoundPickerOpen(false); api.post(`/sounds/${s.id}/use`).catch(() => {}); }}
      />
    </View>
  );
}

type SoundTab = 'recent' | 'favorites' | 'all';

function SoundPickerModal({ visible, onClose, onSelect }: {
  visible: boolean;
  onClose: () => void;
  onSelect: (s: SoundOption) => void;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<SoundTab>('all');

  const { data, isLoading } = useQuery<{ items: SoundOption[] }>({
    queryKey: ['sounds', tab],
    queryFn: () => {
      const endpoint = tab === 'recent' ? '/sounds/recent' : tab === 'favorites' ? '/sounds/favorites' : '/sounds';
      return api.get(endpoint).then((r) => r.data);
    },
    enabled: visible,
  });

  const items = data?.items ?? [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[soundStyles.container, { paddingTop: insets.top }]}>
        <View style={soundStyles.header}>
          <Text style={soundStyles.title}>Ajouter un son</Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <IcClose size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <View style={soundStyles.tabs}>
          {([['all', 'Tous les sons'], ['favorites', 'Favoris'], ['recent', 'Récents']] as [SoundTab, string][]).map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => setTab(key)} style={[soundStyles.tab, tab === key && soundStyles.tabActive]}>
              <Text style={[soundStyles.tabText, tab === key && soundStyles.tabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(s) => s.id}
            ListEmptyComponent={
              <Text style={soundStyles.empty}>
                {tab === 'favorites' ? 'Aucun son favori' : tab === 'recent' ? 'Aucun son récent' : 'Aucun son disponible'}
              </Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={soundStyles.row} onPress={() => onSelect(item)} activeOpacity={0.7}>
                <View style={soundStyles.rowIcon}><IcMusic size={16} color={COLORS.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={soundStyles.rowTitle}>{item.title}</Text>
                  {item.artist ? <Text style={soundStyles.rowArtist}>{item.artist}</Text> : null}
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  cameraPlaceholder: { backgroundColor: '#0A0A0C', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  permissionText: { color: 'rgba(255,255,255,0.85)', fontSize: FONT.size.sm, textAlign: 'center' },
  permissionBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
    paddingHorizontal: 22, paddingVertical: 12,
  },
  permissionBtnText: { color: COLORS.white, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  captureOverlay: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  multiBadge: {
    position: 'absolute', top: 60, right: 16,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  multiBadgeText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },

  topBar: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  soundPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: RADIUS.full,
    paddingHorizontal: 14, paddingVertical: 8, maxWidth: 220,
  },
  soundPillText: { color: COLORS.white, fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },

  rightRail: {
    position: 'absolute', right: SPACING.md,
    gap: 22, alignItems: 'center',
  },
  railBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  bottomArea: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 18 },
  captureRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', paddingHorizontal: 36,
  },
  galleryBtn: {
    width: 44, height: 44, borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  captureOuter: {
    width: 78, height: 78, borderRadius: 39,
    borderWidth: 4, borderColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  captureOuterRecording: { borderColor: '#FF3B5C' },
  captureInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: COLORS.white },
  captureInnerRecording: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#FF3B5C' },

  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  modeLabel: { color: 'rgba(255,255,255,0.55)', fontSize: FONT.size.sm, fontWeight: FONT.weight.semibold },
  modeLabelActive: { color: COLORS.white, fontWeight: FONT.weight.bold },

  postCaptureRow: {
    flexDirection: 'row', width: '100%', paddingHorizontal: SPACING.lg, gap: 12,
  },
  postCaptureBtn: {
    flex: 1, height: 48, borderRadius: RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  postCaptureBtnPrimary: { backgroundColor: COLORS.primary },
  postCaptureBtnText: { color: COLORS.white, fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  postCaptureBtnTextPrimary: { color: COLORS.white },
});

const soundStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  title: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold, color: COLORS.text },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: SPACING.md, paddingVertical: 10 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.inputBg },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontSize: FONT.size.sm, fontWeight: FONT.weight.medium, color: COLORS.textMuted },
  tabTextActive: { color: COLORS.white, fontWeight: FONT.weight.semibold },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.text },
  rowArtist: { fontSize: FONT.size.xs, color: COLORS.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: COLORS.textMuted, marginTop: 40, fontSize: FONT.size.sm },
});
