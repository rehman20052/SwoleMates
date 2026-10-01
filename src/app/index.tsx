import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  ImageBackground,
  Modal,
  AppState,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Keyframe,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Path, Rect } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { AuthForm } from '@/components/auth-form';
import { publishDiscoverProfile } from '@/lib/discover';
import { isHeicMedia } from '@/lib/heic-media';
import { chatAlertCount, notifyChatAlerts, subscribeChatAlerts, subscribeIncomingMessages } from '@/lib/matches';
import { MIN_PROFILE_PROMPTS, answeredPrompts, birthDateError, profileFromUser, profilePortrait, saveProfile, type UserProfile } from '@/lib/profile';
import { fullScreenRoutes, NavigationContext, Route, Tab } from '@/navigation';
import { supabase } from '@/lib/supabase';
import { ChatScreen } from '@/screens/chat';
import { DashboardScreen } from '@/screens/dashboard';
import { DiscoverScreen } from '@/screens/discover';
import { InboxScreen } from '@/screens/inbox';
import { NutritionTrackerScreen } from '@/screens/nutrition-tracker';
import { PartnerProfileScreen } from '@/screens/partner-profile';
import { ProfileScreen } from '@/screens/profile';
import { RequestProfileScreen } from '@/screens/request-profile';
import { ScheduleWorkoutScreen } from '@/screens/schedule-workout';
import { SocialScreen } from '@/screens/social';
import { WorkoutScheduledScreen } from '@/screens/workout-scheduled';
import { useAppData } from '@/state/app-data';
import { useAppTheme } from '@/theme';

let heicRepair: Promise<UserProfile> | null = null;
const STARTUP_MINIMUM_MS = 760;
const STARTUP_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const startupLogoEntrance = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.94 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: STARTUP_EASE_OUT },
})
  .duration(280)
  .reduceMotion(ReduceMotion.System);
const startupWordmarkEntrance = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 8 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: STARTUP_EASE_OUT },
})
  .delay(90)
  .duration(260)
  .reduceMotion(ReduceMotion.System);

function StartupSplash({ ready, onFinished }: { ready: boolean; onFinished: () => void }) {
  const opacity = useSharedValue(1);
  const [minimumReached, setMinimumReached] = useState(false);
  const exitStarted = useRef(false);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  useEffect(() => {
    const timer = setTimeout(() => setMinimumReached(true), STARTUP_MINIMUM_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready || !minimumReached || exitStarted.current) return;
    exitStarted.current = true;
    opacity.set(
      withDelay(
        80,
        withTiming(
          0,
          { duration: 220, easing: STARTUP_EASE_OUT, reduceMotion: ReduceMotion.System },
          (finished) => {
            if (finished) scheduleOnRN(onFinished);
          },
        ),
        ReduceMotion.System,
      ),
    );
  }, [minimumReached, onFinished, opacity, ready]);

  return (
    <Animated.View style={[styles.startupSplash, animatedStyle]}>
      <Animated.View entering={startupLogoEntrance} style={styles.startupLogoWrap}>
        <Image
          accessibilityLabel="SwoleMates logo"
          contentFit="cover"
          source={require('../../assets/brand/swolemates-icon-master.png')}
          style={styles.startupLogo}
        />
      </Animated.View>
      <Animated.View entering={startupWordmarkEntrance} style={styles.startupWordmark}>
        <Text style={styles.startupTitle}>SwoleMates</Text>
        <View style={styles.startupRule} />
      </Animated.View>
    </Animated.View>
  );
}

function HomeBarbellIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={22} viewBox="0 0 32 28" accessibilityLabel="Home">
      <Path
        d="M4 11.5 16 2.5l12 9M23.5 7V3.5H27V10"
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={8} y1={19} x2={24} y2={19} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <Rect x={5.5} y={14.5} width={3} height={9} rx={1.2} fill={color} />
      <Rect x={2.5} y={16.25} width={2.5} height={5.5} rx={1} fill={color} />
      <Rect x={23.5} y={14.5} width={3} height={9} rx={1.2} fill={color} />
      <Rect x={27} y={16.25} width={2.5} height={5.5} rx={1} fill={color} />
    </Svg>
  );
}

function repairHeicProfile(profile: UserProfile) {
  if (!profile.photos.some((photo) => isHeicMedia(photo))) return Promise.resolve(profile);
  heicRepair ??= saveProfile(profile).finally(() => {
    heicRepair = null;
  });
  return heicRepair;
}

const emptyProfile = (): UserProfile => ({
  fullName: '',
  birthDate: '',
  age: '',
  gender: '',
  primaryGym: '',
  gymAddress: '',
  gymLatitude: null,
  gymLongitude: null,
  gymPlaceId: '',
  hometown: '',
  zipCode: '',
  latitude: null,
  longitude: null,
  about: '',
  experienceLevel: 'Intermediate',
  selectedGoals: [],
  availabilityDays: [],
  availabilityTimes: [],
  bench: 'N/A',
  squat: 'N/A',
  deadlift: 'N/A',
  customLiftName: '',
  customLift: 'N/A',
  photos: [],
  photoMedia: [],
  photoCaptions: [],
  prompts: [],
});

export default function App() {
  const theme = useAppTheme();
  const [currentScreen, setCurrentScreen] = useState('launch');
  const [checkingSession, setCheckingSession] = useState(true);
  const [showStartup, setShowStartup] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('Discover');
  const [stack, setStack] = useState<Route[]>([]);
  const { logWorkout } = useAppData();

  const [profileData, setProfileData] = useState<UserProfile>(emptyProfile);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [chatAlerts, setChatAlerts] = useState(0);
  const finishStartup = useCallback(() => setShowStartup(false), []);

  useEffect(() => {
    if (currentScreen !== 'main-app') return;
    let active = true;
    const refresh = () => {
      void chatAlertCount().then((count) => {
        if (active) setChatAlerts(count);
      });
    };
    refresh();
    const unsubscribe = subscribeChatAlerts(refresh);
    const unsubscribeMessages = subscribeIncomingMessages();
    const timer = setInterval(() => notifyChatAlerts(), 3000);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') notifyChatAlerts();
    });
    const onFocus = () => notifyChatAlerts();
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      unsubscribe();
      unsubscribeMessages();
      clearInterval(timer);
      appState.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    };
  }, [currentScreen, activeTab, stack.length]);

  const continueAfterAuth = (profile: UserProfile | null) => {
    setProfileData(profile ?? emptyProfile());
    setCurrentScreen(profile ? 'main-app' : 'profile-setup');
  };

  useEffect(() => {
    let active = true;
    let restored = false;

    const resetToLaunch = () => {
      setProfileData(emptyProfile());
      setStack([]);
      setActiveTab('Discover');
      setCurrentScreen('launch');
    };

    // The cached session can be older than a save made on another device. Publishing that
    // copy would wipe the newer Discover card, so always read the account from the server first.
    const profileFromServer = async () => {
      const fresh = await supabase.auth.getUser();
      if (fresh.error || !fresh.data.user) return null;
      return profileFromUser(fresh.data.user);
    };

    const publishLatest = async (profile: UserProfile) => {
      let current = profile;
      if (current.photos.some((photo) => isHeicMedia(photo))) {
        try {
          current = await repairHeicProfile(current);
          if (!active) return;
          continueAfterAuth(current);
        } catch {
          // Keep showing the profile. The photo is still served as a JPEG, and the next launch tries the upload again.
        }
      }
      if (!active) return;
      publishDiscoverProfile(current).catch(() => {});
    };

    const restoreSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error || !data.session) {
        resetToLaunch();
        restored = true;
        setCheckingSession(false);
        return;
      }

      const profile = await profileFromServer();
      if (!active) return;
      if (!profile) {
        const cached = await supabase.auth.getSession();
        if (!active) return;
        continueAfterAuth(profileFromUser(cached.data.session?.user ?? null));
        restored = true;
        setCheckingSession(false);
        return;
      }
      continueAfterAuth(profile);
      restored = true;
      setCheckingSession(false);
      void publishLatest(profile);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || !restored) return;
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_OUT') {
        resetToLaunch();
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        void profileFromServer().then((profile) => {
          if (active) continueAfterAuth(profile);
        });
      }
    });

    void restoreSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const saveAndMatch = async (requirePhoto = false) => {
    if (!profileData.fullName.trim()) {
      setProfileError('Enter your name before saving.');
      return false;
    }

    const birthError = birthDateError(profileData.birthDate);
    if (birthError) {
      setProfileError(birthError);
      return false;
    }

    if (profileData.zipCode.trim() && !/^\d{5}(-\d{4})?$/.test(profileData.zipCode.trim())) {
      setProfileError('Enter a 5-digit zip code.');
      return false;
    }

    if (profileData.primaryGym.trim() && (profileData.gymLatitude == null || profileData.gymLongitude == null)) {
      setProfileError('Pick the street address from the list so we know which gym building it is.');
      return false;
    }

    if (requirePhoto && profileData.photos.length < 1) {
      setProfileError('Add at least one profile photo.');
      return false;
    }

    if (answeredPrompts(profileData.prompts).length < MIN_PROFILE_PROMPTS) {
      setProfileError(`Pick and answer at least ${MIN_PROFILE_PROMPTS} prompts.`);
      return false;
    }

    setSavingProfile(true);
    setProfileError(null);
    try {
      const saved = await saveProfile(profileData);
      try {
        await publishDiscoverProfile(saved);
      } catch {
        // Discover shows its own message if the listing table is not ready.
      }
      setProfileData(saved);
      setProfileSaved(true);
      setStack([]);
      setActiveTab('Profile');
      setCurrentScreen('main-app');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save your profile.';
      setProfileError(
        message === 'Failed to fetch'
          ? 'Could not reach Supabase to save your profile. Check your connection and try again.'
          : message === 'OVERSIZED_SESSION'
            ? 'Sign out and sign in again, then save. This login is still carrying an old photo.'
            : message,
      );
      return false;
    } finally {
      setSavingProfile(false);
    }
  };

  const nav = {
    push: (route: Route) => setStack((current) => [...current, route]),
    replace: (route: Route) =>
      setStack((current) => {
        const below = current.slice(0, -1);
        const existing = below.findIndex((r) => JSON.stringify(r) === JSON.stringify(route));
        return existing >= 0 ? below.slice(0, existing + 1) : [...below, route];
      }),
    back: () => setStack((current) => current.slice(0, -1)),
    setTab: (tab: Tab) => {
      setStack([]);
      setActiveTab(tab);
    },
    signOut: () => {
      void supabase.auth.signOut();
      setProfileData(emptyProfile());
      setStack([]);
      setActiveTab('Discover');
      setCurrentScreen('launch');
    },
  };

  if (checkingSession || showStartup) {
    return <StartupSplash ready={!checkingSession} onFinished={finishStartup} />;
  }

  // ==========================================
  // 1. LAUNCH SCREEN
  // ==========================================
  if (currentScreen === 'launch') {
    return (
      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1000&auto=format&fit=crop' }}
        style={styles.backgroundImage}
      >
        <View style={styles.overlay}>
          <SafeAreaView style={styles.launchContainer}>
            <View style={styles.launchContent}>
              <View style={[styles.brandContainer, styles.launchBrandContainer]}>
                <View style={styles.limeSquare} />
                <Text style={styles.title}>SwoleMates</Text>
              </View>
              <Text style={[styles.subtitle, styles.launchSubtitle]}>Find your perfect gym partner</Text>

              <View style={styles.socialProofCard}>
                <Text style={styles.avatarText}>👥🔥</Text>
                <Text style={styles.socialProofText}>Join local lifters and match today!</Text>
              </View>

              <TouchableOpacity
                style={styles.limeButton}
                onPress={() => setCurrentScreen('auth')}
              >
                <Text style={styles.limeButtonText}>Get Started →</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </ImageBackground>
    );
  }

  // ==========================================
  // 2. AUTH SCREEN
  // ==========================================
  if (currentScreen === 'auth') {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.authInnerContainer}
        >
          <View style={styles.authHeader}>
            <View style={styles.brandContainer}>
              <View style={styles.limeSquare} />
              <Text style={styles.title}>SwoleMates</Text>
            </View>
            <Text style={styles.subtitle}>Find your perfect gym partner.</Text>
          </View>

          <View style={styles.authCard}>
            <AuthForm onSuccess={continueAfterAuth} />
          </View>

          <Text style={styles.termsText}>
            By signing up, you agree to our <Text style={styles.termsHighlight}>Terms & Safety rules</Text>
          </Text>

          <TouchableOpacity onPress={() => setCurrentScreen('launch')} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Back to Welcome</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ==========================================
  // 3. PROFILE SETUP SCREEN
  // ==========================================
  if (currentScreen === 'profile-setup') {
    return (
      <NavigationContext.Provider value={nav}>
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
          <ProfileScreen
            profile={profileData}
            saving={savingProfile}
            error={profileError}
            title="Create your profile"
            initialMode="edit"
            onChange={setProfileData}
            onSave={() => saveAndMatch(true)}
          />
        </SafeAreaView>
      </NavigationContext.Provider>
    );
  }

  // ==========================================
  // 4. MAIN APP WITH BOTTOM NAVIGATION
  // ==========================================

  const topRoute = stack[stack.length - 1];

  const renderRoute = (route: Route) => {
    switch (route.name) {
      case 'partner':
        return <PartnerProfileScreen id={route.id} />;
      case 'chat':
        return <ChatScreen id={route.id} />;
      case 'request-profile':
        return <RequestProfileScreen userId={route.userId} />;
      case 'schedule':
        return <ScheduleWorkoutScreen partnerId={route.partnerId} />;
      case 'scheduled':
        return <WorkoutScheduledScreen workoutId={route.workoutId} />;
      case 'nutrition':
        return <NutritionTrackerScreen />;
    }
  };

  const renderMainTabContent = () => {
    switch (activeTab) {
      case 'Discover':
        return <DiscoverScreen profile={profileData} />;
      case 'Chat':
        return (
          <InboxScreen empty={
            <View style={styles.tabContentContainer}>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyIcon}>🤝</Text>
              </View>
              <Text style={styles.emptyTitle}>Your Inbox is Empty</Text>
              <Text style={styles.emptyDesc}>Send a request from Discover. When they accept, the chat shows up here.</Text>
              <TouchableOpacity style={styles.limeButtonSmall} onPress={() => nav.setTab('Discover')}>
                <Text style={styles.limeButtonSmallText}>Browse Profiles</Text>
              </TouchableOpacity>
            </View>
          } />
        );
      case 'Home':
        return (
          <DashboardScreen lifts={profileData} empty={
            <View style={styles.tabContentContainer}>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyIcon}>⚡</Text>
              </View>
              <Text style={styles.emptyTitle}>No Active Streaks</Text>
              <Text style={styles.emptyDesc}>Keep track of your consistency and PR progression alongside your partner. Complete your first logged session to start!</Text>
              <TouchableOpacity style={styles.limeButtonSmall} onPress={() => logWorkout()}>
                <Text style={styles.limeButtonSmallText}>Log Today's Workout</Text>
              </TouchableOpacity>
            </View>
          } />
        );
      case 'Social':
        return <SocialScreen me={{ name: profileData.fullName, photo: profilePortrait(profileData) ?? undefined }} />;
      case 'Profile':
        return (
          <ProfileScreen
            profile={profileData}
            saving={savingProfile}
            error={profileError}
            onChange={setProfileData}
            onSave={() => saveAndMatch(true)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <NavigationContext.Provider value={nav}>
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.mainAppContainer}>
        {topRoute ? renderRoute(topRoute) : renderMainTabContent()}

        {!(topRoute && fullScreenRoutes.includes(topRoute.name)) && (
        <View style={[styles.bottomNav, { backgroundColor: theme.colors.background, borderTopColor: theme.colors.border }]}>
          {([
            { name: 'Discover', icon: '✨' },
            { name: 'Chat', icon: '💬' },
            { name: 'Home', icon: '⌂' },
            { name: 'Social', icon: '👥' },
            { name: 'Profile', icon: '👤' },
          ] as const).map((tab) => {
            const isActive = activeTab === tab.name;
            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.navItem}
                accessibilityLabel={tab.name === 'Chat' && chatAlerts > 0 ? `Chat, ${chatAlerts} new` : tab.name}
                onPress={() => nav.setTab(tab.name)}
              >
                <View style={styles.navIconWrap}>
                  {tab.name === 'Home' ? (
                    <View style={styles.homeNavIcon}>
                      <HomeBarbellIcon color={isActive ? theme.colors.accent : theme.colors.muted} />
                    </View>
                  ) : (
                    <Text style={[styles.navIcon, isActive && styles.activeNavIcon]}>{tab.icon}</Text>
                  )}
                  {tab.name === 'Chat' && chatAlerts > 0 ? (
                    <View style={styles.chatBadge}>
                      <Text style={styles.chatBadgeText}>{chatAlerts > 9 ? '9+' : chatAlerts}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.navLabel, { color: theme.colors.muted }, isActive && { color: theme.colors.accent }]}>{tab.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        )}
      </View>
      <Modal animationType="fade" transparent visible={profileSaved} onRequestClose={() => setProfileSaved(false)}>
        <View style={styles.savedOverlay}>
          <View style={styles.savedCard}>
            <Text style={styles.savedTitle}>Profile saved</Text>
            <Text style={styles.savedBody}>Your profile was saved successfully.</Text>
            <TouchableOpacity style={styles.limeButton} onPress={() => setProfileSaved(false)}>
              <Text style={styles.limeButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </NavigationContext.Provider>
  );
}

const styles = StyleSheet.create({
  startupSplash: {
    alignItems: 'center',
    backgroundColor: '#0A0A0C',
    flex: 1,
    justifyContent: 'center',
  },
  startupLogoWrap: {
    borderRadius: 36,
    height: 144,
    overflow: 'hidden',
    width: 144,
  },
  startupLogo: { height: '100%', width: '100%' },
  startupWordmark: { alignItems: 'center', gap: 10, paddingTop: 16 },
  startupTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  startupRule: { backgroundColor: '#CCFF00', borderRadius: 2, height: 3, width: 38 },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  overlay: { flex: 1, backgroundColor: 'rgba(5, 5, 5, 0.82)' },
  launchContainer: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },
  launchContent: { maxWidth: 360, transform: [{ translateX: 8 }], width: '100%' },
  launchBrandContainer: { justifyContent: 'center' },
  launchSubtitle: { textAlign: 'center' },
  brandContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  limeSquare: { width: 14, height: 26, backgroundColor: '#CCFF00', borderRadius: 3, marginRight: 10 },
  title: { fontSize: 34, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#999999', marginBottom: 24 },
  socialProofCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#262626',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 16,
    marginBottom: 20,
  },
  avatarText: { fontSize: 16, marginRight: 10 },
  socialProofText: { color: '#DDDDDD', fontSize: 13, fontWeight: '500' },
  limeButton: { backgroundColor: '#CCFF00', paddingVertical: 18, borderRadius: 16, alignItems: 'center', width: '100%' },
  limeButtonText: { color: '#000000', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  savedOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.72)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  savedCard: { width: '100%', maxWidth: 320, backgroundColor: '#151518', borderRadius: 20, borderWidth: 1, borderColor: '#28282D', padding: 22, gap: 12 },
  savedTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  savedBody: { color: '#8E8E93', fontSize: 15, lineHeight: 22 },
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  authInnerContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  authHeader: { marginBottom: 24, paddingHorizontal: 4 },
  authCard: { backgroundColor: '#121212', borderWidth: 1, borderColor: '#222222', borderRadius: 24, padding: 20 },
  inputGroup: { marginBottom: 14 },
  inputLabel: { color: '#888888', fontSize: 11, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 },
  input: {
    backgroundColor: '#1A1A1A',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#262626',
  },
  profileError: { color: '#FF3B30', fontSize: 13, textAlign: 'center', marginTop: 16 },
  termsText: { color: '#777777', fontSize: 12, textAlign: 'center', marginTop: 20 },
  termsHighlight: { color: '#FFFFFF', fontWeight: '600' },
  backLink: { alignItems: 'center', marginTop: 16 },
  backLinkText: { color: '#666666', fontSize: 13 },
  scrollContainer: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 },
  setupHeader: { marginBottom: 20 },
  setupTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: '#CCFF00',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  avatarPlaceholder: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#1E1E1E', justifyContent: 'center', alignItems: 'center' },
  avatarEmoji: { fontSize: 32 },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#CCFF00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadgeText: { color: '#000000', fontWeight: 'bold', fontSize: 16 },
  avatarSubtext: { color: '#888888', fontSize: 12 },
  profileFormCard: { backgroundColor: '#121212', borderWidth: 1, borderColor: '#222222', borderRadius: 24, padding: 16 },
  rowInputs: { flexDirection: 'row' },
  sectionSubHeader: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 10 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#262626', marginBottom: 6 },
  activeChip: { backgroundColor: '#1A1A1A', borderColor: '#CCFF00' },
  chipText: { color: '#777777', fontSize: 13, fontWeight: '600' },
  activeChipText: { color: '#CCFF00' },
  prRowContainer: { flexDirection: 'row', gap: 8 },
  prFieldWrapper: { flex: 1 },
  dropdownTrigger: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownTriggerText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  dropdownArrow: { color: '#CCFF00', fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#121212', borderRadius: 20, width: '100%', maxWidth: 340, height: '60%', padding: 20, borderWidth: 1, borderColor: '#222222' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#222222', paddingBottom: 10 },
  modalTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  modalCloseText: { color: '#888888', fontSize: 18, fontWeight: 'bold' },
  modalItem: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1A1A1A', alignItems: 'center' },
  modalItemSelected: { backgroundColor: '#1A1A1A', borderRadius: 8 },
  modalItemText: { color: '#999999', fontSize: 15, fontWeight: '600' },
  modalItemTextSelected: { color: '#CCFF00', fontWeight: 'bold' },
  mainAppContainer: { flex: 1, justifyContent: 'space-between' },
  tabContentContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyIcon: { fontSize: 32 },
  emptyTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  emptyDesc: { color: '#888888', fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 24 },
  savedPrsText: { color: '#CCFF00', fontSize: 13, fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  limeButtonSmall: { backgroundColor: '#CCFF00', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center' },
  limeButtonSmallText: { color: '#000000', fontSize: 14, fontWeight: '700' },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#0F0F0F',
    borderTopWidth: 1,
    borderTopColor: '#222222',
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'space-around',
  },
  navItem: { alignItems: 'center', flex: 1, overflow: 'visible' },
  navIconWrap: { position: 'relative', overflow: 'visible' },
  chatBadge: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#CCFF00',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    zIndex: 2,
  },
  chatBadgeText: { color: '#000000', fontSize: 10, fontWeight: '800' },
  navIcon: { fontSize: 18, marginBottom: 2, opacity: 0.4 },
  homeNavIcon: { height: 22, justifyContent: 'center', marginBottom: 2 },
  activeNavIcon: { opacity: 1 },
  navLabel: { fontSize: 10, color: '#666666', fontWeight: '600' },
  activeNavLabel: { color: '#CCFF00' },
});
