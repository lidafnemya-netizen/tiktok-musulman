import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  Switch, Alert, Linking, StyleSheet, TextInput,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { CHANGELOG } from '../../constants/changelog';
import { useTheme } from '../../hooks/useTheme';
import { api } from '../../api/client';
import { RootStackParamList } from '../../navigation';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../../constants/theme';
import {
  IcEdit, IcMail, IcShield, IcLock, IcBell, IcUsers, IcGlobe,
  IcMoon, IcSun, IcSettings, IcHelp, IcLogOut, IcVideo, IcStar, IcFlag, IcInfo,
  IcCheck, IcProfile, IcBack, IcClose,
} from '../../components/ui/Icons';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type IconComp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const SETTINGS_KEY = 'nour_user_settings';

interface UserSettings {
  notifPosts: boolean;
  notifMessages: boolean;
  notifFollowers: boolean;
  notifLikes: boolean;
  notifComments: boolean;
  privateAccount: boolean;
  showActivity: boolean;
  allowDMRequests: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  notifPosts: true, notifMessages: true, notifFollowers: true,
  notifLikes: true, notifComments: true,
  privateAccount: false, showActivity: true, allowDMRequests: true,
};

function Row({
  Icon, label, value, onPress, right, destructive, last, theme,
}: {
  Icon: IconComp; label: string; value?: string; onPress?: () => void;
  right?: React.ReactNode; destructive?: boolean; last?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <TouchableOpacity
      style={[rStyles.row, { borderBottomColor: theme.borderLight }, last && rStyles.rowLast]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress && right === undefined}
    >
      <View style={rStyles.rowLeft}>
        <View style={[rStyles.rowIcon, { backgroundColor: destructive ? COLORS.likeBg : theme.primaryBg }]}>
          <Icon size={17} color={destructive ? COLORS.error : theme.tabActive} strokeWidth={1.8} />
        </View>
        <Text style={[rStyles.rowLabel, { color: destructive ? COLORS.error : theme.text }]}>{label}</Text>
      </View>
      <View style={rStyles.rowRight}>
        {value ? <Text style={[rStyles.rowValue, { color: theme.textMuted }]}>{value}</Text> : null}
        {right !== undefined ? right : onPress ? <ChevronRight size={16} color={theme.textSubtle} strokeWidth={1.6} /> : null}
      </View>
    </TouchableOpacity>
  );
}

function Section({ title, children, theme }: { title: string; children: React.ReactNode; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={rStyles.section}>
      <Text style={[rStyles.sectionTitle, { color: theme.textSubtle }]}>{title}</Text>
      <View style={[rStyles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
        {children}
      </View>
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <Switch value={value} onValueChange={onChange} trackColor={{ false: COLORS.border, true: COLORS.primary }} thumbColor={COLORS.white} ios_backgroundColor={COLORS.border} />;
}

export default function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser } = useAuthStore();
  const { isDark, mode, setMode } = useThemeStore() as any;
  const theme = useTheme();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Password modal
  const [pwModal, setPwModal] = useState(false);
  const [changelogModal, setChangelogModal] = useState(false);
  const currentVersion = CHANGELOG[0]?.version ?? '1.0.0';
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Load saved settings
  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(raw => {
      if (raw) {
        try { setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) }); } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const updateSetting = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    // Persist to server (best effort)
    api.patch('/users/me', { [key]: value }).catch(() => {});
  };

  const handleChangePassword = async () => {
    if (!oldPw || !newPw || !confirmPw) { Alert.alert('Erreur', 'Remplis tous les champs.'); return; }
    if (newPw !== confirmPw) { Alert.alert('Erreur', 'Les mots de passe ne correspondent pas.'); return; }
    if (newPw.length < 8) { Alert.alert('Erreur', 'Mot de passe trop court (8 caractères min).'); return; }
    setPwLoading(true);
    try {
      await api.post('/auth/change-password', { current_password: oldPw, new_password: newPw });
      setPwModal(false); setOldPw(''); setNewPw(''); setConfirmPw('');
      Alert.alert('✓', 'Mot de passe modifié avec succès.');
    } catch (err: any) {
      Alert.alert('Erreur', err?.response?.data?.error ?? 'Mot de passe actuel incorrect.');
    } finally { setPwLoading(false); }
  };

  const confirmLogout = () =>
    Alert.alert('Se déconnecter', 'Confirmer ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnecter', style: 'destructive', onPress: logout },
    ]);

  const confirmDeleteAccount = () =>
    Alert.alert('Supprimer le compte', 'Action irréversible. Toutes tes données seront supprimées.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer définitivement', style: 'destructive',
        onPress: async () => {
          try { await api.delete('/users/me/account'); await logout(); }
          catch { Alert.alert('Erreur', 'Impossible de supprimer le compte.'); }
        },
      },
    ]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ height: insets.top, backgroundColor: theme.surface }} />
      {/* Changelog modal */}
      <Modal visible={changelogModal} transparent animationType="slide" onRequestClose={() => setChangelogModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.changelogBox, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Nouveautés</Text>
              <TouchableOpacity onPress={() => setChangelogModal(false)}><IcClose size={20} color={theme.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              {CHANGELOG.map(entry => (
                <View key={entry.version} style={styles.clEntry}>
                  <View style={styles.clHeader}>
                    <View style={styles.clBadge}><Text style={styles.clVersion}>v{entry.version}</Text></View>
                    <Text style={[styles.clDate, { color: theme.textMuted }]}>{entry.date}</Text>
                  </View>
                  {entry.changes.map((c, i) => (
                    <View key={i} style={styles.clRow}>
                      <View style={styles.clDot} />
                      <Text style={[styles.clText, { color: theme.text }]}>{c}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Change password modal */}
      <Modal visible={pwModal} transparent animationType="slide" onRequestClose={() => setPwModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Changer le mot de passe</Text>
              <TouchableOpacity onPress={() => setPwModal(false)}><IcClose size={20} color={theme.textMuted} /></TouchableOpacity>
            </View>
            <TextInput style={[styles.pwInput, { borderColor: theme.borderLight, color: theme.text, backgroundColor: theme.inputBg }]} value={oldPw} onChangeText={setOldPw} placeholder="Mot de passe actuel" placeholderTextColor={COLORS.textPlaceholder} secureTextEntry />
            <TextInput style={[styles.pwInput, { borderColor: theme.borderLight, color: theme.text, backgroundColor: theme.inputBg }]} value={newPw} onChangeText={setNewPw} placeholder="Nouveau mot de passe (8+ caractères)" placeholderTextColor={COLORS.textPlaceholder} secureTextEntry />
            <TextInput style={[styles.pwInput, { borderColor: theme.borderLight, color: theme.text, backgroundColor: theme.inputBg }]} value={confirmPw} onChangeText={setConfirmPw} placeholder="Confirmer le nouveau mot de passe" placeholderTextColor={COLORS.textPlaceholder} secureTextEntry />
            <TouchableOpacity
              style={[styles.pwSubmit, (!oldPw || !newPw || !confirmPw || pwLoading) && styles.pwSubmitDisabled]}
              onPress={handleChangePassword}
              disabled={!oldPw || !newPw || !confirmPw || pwLoading}
              activeOpacity={0.85}
            >
              {pwLoading ? <ActivityIndicator color={COLORS.white} size="small" /> : <Text style={styles.pwSubmitText}>Modifier</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.borderLight }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <IcBack size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Paramètres</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>

        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.borderLight }]}>
          <View style={[styles.profileAvatar, { backgroundColor: theme.primaryBg }]}>
            <Text style={styles.profileInitial}>{user?.display_name?.[0]?.toUpperCase() ?? 'U'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: theme.text }]}>{user?.display_name}</Text>
            <Text style={[styles.profileUser, { color: theme.textMuted }]}>@{user?.username}</Text>
          </View>
          {user?.is_verified && <View style={styles.verifiedBadge}><IcCheck size={10} color={COLORS.white} strokeWidth={3} /></View>}
        </View>

        <Section title="COMPTE" theme={theme}>
          <Row theme={theme} Icon={IcEdit}    label="Modifier le profil" onPress={() => navigation.goBack()} />
          <Row theme={theme} Icon={IcMail}    label="Email" value={user?.email} />
          <Row theme={theme} Icon={IcProfile} label="Genre" value={user?.gender === 'MALE' ? 'Homme' : 'Femme'} />
          <Row theme={theme} Icon={IcStar}    label="Statut" value={user?.is_verified ? 'Vérifié ✓' : 'Standard'} last />
        </Section>

        <Section title="SÉCURITÉ" theme={theme}>
          <Row theme={theme} Icon={IcLock}   label="Changer le mot de passe" onPress={() => setPwModal(true)} />
          <Row theme={theme} Icon={IcShield} label="Double authentification" value="Bientôt" last />
        </Section>

        <Section title="NOTIFICATIONS" theme={theme}>
          <Row theme={theme} Icon={IcVideo}   label="Nouvelles publications"  right={<Toggle value={settings.notifPosts}      onChange={v => updateSetting('notifPosts', v)} />} />
          <Row theme={theme} Icon={IcBell}    label="Likes"                   right={<Toggle value={settings.notifLikes}     onChange={v => updateSetting('notifLikes', v)} />} />
          <Row theme={theme} Icon={IcBell}    label="Commentaires"            right={<Toggle value={settings.notifComments}  onChange={v => updateSetting('notifComments', v)} />} />
          <Row theme={theme} Icon={IcMail}    label="Nouveaux messages"       right={<Toggle value={settings.notifMessages}  onChange={v => updateSetting('notifMessages', v)} />} />
          <Row theme={theme} Icon={IcUsers}   label="Nouveaux abonnés"        right={<Toggle value={settings.notifFollowers} onChange={v => updateSetting('notifFollowers', v)} />} last />
        </Section>

        <Section title="CONFIDENTIALITÉ" theme={theme}>
          <Row theme={theme} Icon={IcLock}    label="Compte privé"            right={<Toggle value={settings.privateAccount} onChange={v => updateSetting('privateAccount', v)} />} />
          <Row theme={theme} Icon={IcBell}    label="Afficher l'activité"     right={<Toggle value={settings.showActivity}    onChange={v => updateSetting('showActivity', v)} />} />
          <Row theme={theme} Icon={IcMail}    label="Autoriser les demandes de contact" right={<Toggle value={settings.allowDMRequests} onChange={v => updateSetting('allowDMRequests', v)} />} />
          <Row theme={theme} Icon={IcUsers}   label="Blocages"  value="Gérer" onPress={() => Alert.alert('Bientôt', 'Gestion des blocages dans la prochaine version.')} last />
        </Section>

        <Section title="APPARENCE" theme={theme}>
          <View style={[rStyles.row, { borderBottomColor: theme.borderLight }]}>
            <View style={rStyles.rowLeft}>
              <View style={[rStyles.rowIcon, { backgroundColor: theme.primaryBg }]}>
                <IcMoon size={17} color={COLORS.primary} strokeWidth={1.8} />
              </View>
              <Text style={[rStyles.rowLabel, { color: theme.text }]}>Thème</Text>
            </View>
            <View style={styles.themeButtons}>
              {([
                ['light', 'Clair', IcSun],
                ['dark', 'Sombre', IcMoon],
                ['system', 'Auto', IcSettings],
              ] as const).map(([m, label, ModeIcon]) => (
                <TouchableOpacity key={m} style={[styles.themeBtn, mode === m && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]}
                  onPress={() => setMode(m)} activeOpacity={0.8}>
                  <ModeIcon size={13} color={mode === m ? COLORS.white : theme.textMuted} strokeWidth={1.8} />
                  <Text style={[styles.themeBtnText, mode === m && { color: COLORS.white }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Row theme={theme} Icon={IcGlobe} label="Langue" value="Français" last />
        </Section>

        <Section title="AIDE & INFOS" theme={theme}>
          <Row theme={theme} Icon={IcHelp} label="Aide & Support"         onPress={() => Linking.openURL('mailto:support@nour.app')} />
          <Row theme={theme} Icon={IcFlag} label="Signaler un problème"   onPress={() => Linking.openURL('mailto:support@nour.app?subject=Bug')} />
          <Row theme={theme} Icon={IcInfo} label={`Version ${currentVersion}`} value="Voir les nouveautés" onPress={() => setChangelogModal(true)} last />
        </Section>

        <TouchableOpacity style={[styles.logoutBtn, { borderColor: COLORS.error, backgroundColor: theme.surface }]} onPress={confirmLogout} activeOpacity={0.8}>
          <IcLogOut size={18} color={COLORS.error} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteBtn} onPress={confirmDeleteAccount} activeOpacity={0.8}>
          <Text style={styles.deleteBtnText}>Supprimer le compte</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const rStyles = StyleSheet.create({
  section: { gap: 6 },
  sectionTitle: { fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold, letterSpacing: 1, paddingHorizontal: 4 },
  sectionCard: { borderRadius: RADIUS.lg, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 13, borderBottomWidth: 1,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: { width: 38, height: 38, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: FONT.size.base },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue: { fontSize: FONT.size.sm },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: 10, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.semibold },
  content: { padding: SPACING.md, gap: SPACING.md },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, ...SHADOW.sm,
  },
  profileAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { fontSize: 20, fontWeight: FONT.weight.bold, color: COLORS.primary },
  profileName: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold },
  profileUser: { fontSize: FONT.size.sm },
  verifiedBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: RADIUS.lg, paddingVertical: 14, borderWidth: 1.5,
  },
  logoutText: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.error },
  deleteBtn: { alignItems: 'center', paddingVertical: 10 },
  deleteBtnText: { fontSize: FONT.size.sm, color: COLORS.textSubtle, textDecorationLine: 'underline' },
  themeButtons: { flexDirection: 'row', gap: 6 },
  themeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  themeBtnText: { fontSize: 11, fontWeight: FONT.weight.medium, color: COLORS.textMuted },

  changelogBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, gap: 14, marginTop: 'auto' },
  clEntry: { marginBottom: SPACING.md },
  clHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  clBadge: { backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  clVersion: { fontSize: FONT.size.sm, fontWeight: FONT.weight.bold, color: COLORS.primary },
  clDate: { fontSize: FONT.size.xs },
  clRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginBottom: 4 },
  clDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary, marginTop: 6 },
  clText: { flex: 1, fontSize: FONT.size.sm, lineHeight: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SPACING.lg, gap: 14 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold },
  pwInput: {
    borderWidth: 1, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 12,
    fontSize: FONT.size.base,
  },
  pwSubmit: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingVertical: 14, alignItems: 'center',
  },
  pwSubmitDisabled: { opacity: 0.4 },
  pwSubmitText: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.white },
});
