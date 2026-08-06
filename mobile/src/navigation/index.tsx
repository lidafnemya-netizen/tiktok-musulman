import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/authStore';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../constants/theme';
import {
  IcHome, IcExplore, IcCreate, IcMail,
  IcProfile, IcBrand,
} from '../components/ui/Icons';

// Auth
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

// Main tabs
import FeedScreen from '../screens/feed/FeedScreen';
import ExploreScreen from '../screens/explore/ExploreScreen';
import CreateScreen from '../screens/upload/UploadScreen';
import MessagesScreen from '../screens/messages/MessagesScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

// Stack screens
import PostDetailScreen from '../screens/feed/PostDetailScreen';
import UserProfileScreen from '../screens/profile/UserProfileScreen';
import ConversationScreen from '../screens/messages/ConversationScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ProfileViewsScreen from '../screens/profile/ProfileViewsScreen';
import ThreadComposerScreen from '../screens/threads/ThreadComposerScreen';
import CreateCameraScreen from '../screens/upload/CreateCameraScreen';
import PostComposerScreen from '../screens/upload/PostComposerScreen';
import SoundScreen from '../screens/sound/SoundScreen';
import VideoPlayerScreen from '../screens/feed/VideoPlayerScreen';
import ThreadDetailScreen from '../screens/threads/ThreadDetailScreen';
import GoLiveScreen from '../screens/live/GoLiveScreen';
import LiveViewerScreen from '../screens/live/LiveViewerScreen';
import LiveListScreen from '../screens/live/LiveListScreen';
import FollowersScreen from '../screens/profile/FollowersScreen';
import HashtagScreen from '../screens/explore/HashtagScreen';
import CreatorStatsScreen from '../screens/profile/CreatorStatsScreen';
import StoriesScreen from '../screens/feed/StoriesScreen';
import SearchScreen from '../screens/search/SearchScreen';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  PostDetail: { postId: string };
  UserProfile: { userId: string; username: string };
  Conversation: { conversationId: string; otherUser: { id: string; display_name: string } };
  Messages: undefined;
  Notifications: undefined;
  Settings: undefined;
  ProfileViews: undefined;
  ThreadComposer: undefined;
  Sound: { soundId: string; title: string; artist?: string | null };
  VideoPlayer: { postId: string; userId?: string; draftsOnly?: boolean };
  ThreadDetail: { threadId: string };
  GoLive: undefined;
  LiveViewer: { sessionId: string; broadcasterId: string };
  LiveList: undefined;
  Followers: { userId: string; username: string; type: 'followers' | 'following' };
  Hashtag: { tag: string };
  CreatorStats: undefined;
  Stories: { userId: string; queueUserIds?: string[] };
  Search: undefined;
  CreateCamera: undefined;
  PostComposer: { media: { uri: string; type: 'photo' | 'video' }[]; soundId?: string };
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type TabParamList = {
  Home: undefined;
  Explore: undefined;
  Create: undefined;
  Messages: undefined;
  Profile: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_LABELS: Record<string, string> = {
  Home: 'Accueil', Explore: 'Explorer', Create: '', Messages: 'Messages', Profile: 'Profil',
};

function TabIcon({ name, focused, theme }: { name: string; focused: boolean; theme: any }) {
  const color = focused ? theme.tabActive : theme.tabInactive;
  const size = 24;
  switch (name) {
    case 'Home':     return <IcHome    size={size} color={color} strokeWidth={focused ? 2.2 : 1.8} />;
    case 'Explore':  return <IcExplore size={size} color={color} strokeWidth={focused ? 2.2 : 1.8} />;
    case 'Messages': return <IcMail    size={size} color={color} strokeWidth={focused ? 2.2 : 1.8} />;
    case 'Profile':  return <IcProfile size={size} color={color} strokeWidth={focused ? 2.2 : 1.8} />;
    default:         return null;
  }
}

function useUnreadCount() {
  const { data } = useQuery<{ count: number }>({
    queryKey: ['notif-unread'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data).catch(() => ({ count: 0 })),
    refetchInterval: 30_000,
  });
  return data?.count ?? 0;
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const unread = useUnreadCount();

  return (
    <>

      <View style={[
        styles.tabBar,
        { paddingBottom: insets.bottom > 0 ? Math.max(insets.bottom - 14, 4) : 4, backgroundColor: theme.tabBg, borderTopColor: theme.navBorder },
      ]}>
        {state.routes.map((route: any, index: number) => {
          const isFocused = state.index === index;
          const isCreate = route.name === 'Create';

          const onPress = () => {
            if (isCreate) { navigation.navigate('CreateCamera'); return; }
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          if (isCreate) {
            return (
              <TouchableOpacity key={route.key} style={styles.createBtn} onPress={onPress} activeOpacity={0.85}>
                <View style={styles.createInner}>
                  <IcCreate size={22} color={COLORS.white} strokeWidth={2.5} />
                </View>
              </TouchableOpacity>
            );
          }

          const showBadge = route.name === 'Messages' && unread > 0;

          return (
            <TouchableOpacity key={route.key} style={styles.tabItem} onPress={onPress} activeOpacity={0.7}>
              <View style={{ position: 'relative' }}>
                <TabIcon name={route.name} focused={isFocused} theme={theme} />
                {showBadge && (
                  <View style={[styles.notifBadge, { borderColor: theme.tabBg }]}>
                    <Text style={styles.notifBadgeText}>{unread > 99 ? '99+' : String(unread)}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.tabLabel, { color: isFocused ? theme.tabActive : theme.tabInactive }, isFocused && styles.tabLabelActive]}>
                {TAB_LABELS[route.name]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home"     component={FeedScreen} />
      <Tab.Screen name="Explore"  component={ExploreScreen} />
      <Tab.Screen name="Create"   component={CreateScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="Profile"  component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <AuthStack.Screen name="Login"    component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

export function AppNavigator() {
  const { user, loading } = useAuthStore();
  const theme = useTheme();

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <View style={[styles.loadingLogo, { backgroundColor: theme.primaryBg, borderColor: theme.primaryLight }]}>
          <IcBrand size={32} color={theme.primary} />
        </View>
        <ActivityIndicator color={theme.primary} size="large" style={{ marginTop: 32 }} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false, gestureEnabled: true, gestureDirection: 'horizontal' }}>
        {user ? (
          <>
            <RootStack.Screen name="Main" component={MainTabs} />
            <RootStack.Screen name="PostDetail" component={PostDetailScreen}
              options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical' }} />
            <RootStack.Screen name="UserProfile" component={UserProfileScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }} />
            <RootStack.Screen name="Conversation" component={ConversationScreen}
              options={{
                headerShown: true,
                headerStyle: { backgroundColor: theme.surface },
                headerTintColor: theme.primary,
                headerTitle: '',
                headerShadowVisible: false,
                gestureEnabled: true,
              }} />
            <RootStack.Screen name="Messages" component={MessagesScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }} />
            <RootStack.Screen name="Notifications" component={NotificationsScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }} />
            <RootStack.Screen name="Settings" component={SettingsScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }} />
            <RootStack.Screen name="ProfileViews" component={ProfileViewsScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }} />
            <RootStack.Screen name="ThreadComposer" component={ThreadComposerScreen}
              options={{ animation: 'slide_from_bottom', presentation: 'modal', gestureEnabled: true }} />
            <RootStack.Screen name="Sound" component={SoundScreen}
              options={{ animation: 'slide_from_bottom', presentation: 'modal', gestureEnabled: true }} />
            <RootStack.Screen name="VideoPlayer" component={VideoPlayerScreen}
              options={{ animation: 'slide_from_bottom', gestureDirection: 'vertical', gestureEnabled: true }} />
            <RootStack.Screen name="ThreadDetail" component={ThreadDetailScreen}
              options={{ animation: 'slide_from_right' }} />
            <RootStack.Screen name="GoLive" component={GoLiveScreen}
              options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }} />
            <RootStack.Screen name="LiveViewer" component={LiveViewerScreen}
              options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }} />
            <RootStack.Screen name="LiveList" component={LiveListScreen}
              options={{ animation: 'slide_from_right' }} />
            <RootStack.Screen name="Followers" component={FollowersScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }} />
            <RootStack.Screen name="Hashtag" component={HashtagScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }} />
            <RootStack.Screen name="CreatorStats" component={CreatorStatsScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }} />
            <RootStack.Screen name="Stories" component={StoriesScreen}
              options={{ animation: 'fade', presentation: 'fullScreenModal', gestureEnabled: false }} />
            <RootStack.Screen name="Search" component={SearchScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }} />
            <RootStack.Screen name="CreateCamera" component={CreateCameraScreen}
              options={{ animation: 'fade', presentation: 'fullScreenModal', gestureEnabled: false }} />
            <RootStack.Screen name="PostComposer" component={PostComposerScreen}
              options={{ animation: 'slide_from_right', gestureEnabled: true }} />
          </>
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  loadingLogo: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    paddingTop: 10, paddingHorizontal: SPACING.sm,
  },
  notifBadge: {
    position: 'absolute', top: -4, right: -6,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3, borderWidth: 1.5,
  },
  notifBadgeText: { fontSize: 9, fontWeight: FONT.weight.bold, color: COLORS.white },
  tabItem: { flex: 1, alignItems: 'center', gap: 2, position: 'relative', paddingVertical: 4 },
  tabLabel: { fontSize: 10, fontWeight: FONT.weight.medium },
  tabLabelActive: { fontWeight: FONT.weight.semibold },
  createBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  createInner: {
    width: 44, height: 44, borderRadius: 22, // circle like the design — contained within bar bounds
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOW.green,
  },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetContainer: {
    backgroundColor: COLORS.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.md, gap: 4,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border,
    alignSelf: 'center', marginBottom: 12,
  },
  sheetTitle: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold, color: COLORS.text, marginBottom: 8, paddingHorizontal: 4 },
  sheetOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: SPACING.md, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.bg, marginBottom: 6,
  },
  sheetOptionIcon: { width: 48, height: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  sheetOptionText: { flex: 1, gap: 2 },
  sheetOptionTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.text },
  sheetOptionSub: { fontSize: FONT.size.xs, color: COLORS.textMuted },
});
