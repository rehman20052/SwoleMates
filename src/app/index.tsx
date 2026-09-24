import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ImageBackground,
  ScrollView,
  Modal,
  FlatList
} from 'react-native';

import { AuthForm } from '@/components/auth-form';
import { saveProfile, type UserProfile } from '@/lib/profile';
import { fullScreenRoutes, NavigationContext, Route, Tab } from '@/navigation';
import { supabase } from '@/lib/supabase';
import { ChatScreen } from '@/screens/chat';
import { DashboardScreen } from '@/screens/dashboard';
import { DiscoverScreen } from '@/screens/discover';
import { InboxScreen } from '@/screens/inbox';
import { PartnerProfileScreen } from '@/screens/partner-profile';
import { PlansScreen } from '@/screens/plans';
import { ProfileScreen } from '@/screens/profile';
import { RequestsScreen } from '@/screens/requests';
import { ScheduleWorkoutScreen } from '@/screens/schedule-workout';
import { WorkoutScheduledScreen } from '@/screens/workout-scheduled';
import { useAppData } from '@/state/app-data';

type PrField = 'bench' | 'squat' | 'deadlift';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('launch');
  const [activeTab, setActiveTab] = useState<Tab>('Discover');
  const [stack, setStack] = useState<Route[]>([]);
  const { logWorkout } = useAppData();

  const [profileData, setProfileData] = useState<UserProfile>({
    fullName: 'Alex Rivera',
    age: '26',
    gender: '',
    primaryGym: "Gold's Gym Downtown",
    hometown: '',
    zipCode: '',
    about: '',
    experienceLevel: 'Intermediate',
    selectedGoals: ['Muscle Gain', 'Strength'],
    bench: '225 lbs',
    squat: '315 lbs',
    deadlift: '405 lbs',
    customLiftName: '',
    customLift: 'N/A',
    photos: [],
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const freshProfile = (): UserProfile => ({
    fullName: 'Alex Rivera',
    age: '26',
    gender: '',
    primaryGym: "Gold's Gym Downtown",
    hometown: '',
    zipCode: '',
    about: '',
    experienceLevel: 'Intermediate',
    selectedGoals: ['Muscle Gain', 'Strength'],
    bench: '225 lbs',
    squat: '315 lbs',
    deadlift: '405 lbs',
    customLiftName: '',
    customLift: 'N/A',
    photos: [],
  });

  const continueAfterAuth = (profile: UserProfile | null) => {
    setProfileData(profile ?? freshProfile());
    setCurrentScreen(profile ? 'main-app' : 'profile-setup');
  };

  const saveAndMatch = async (requirePhoto = false) => {
    if (!profileData.fullName.trim()) {
      setProfileError('Enter your name before saving.');
      return;
    }

    if (profileData.zipCode.trim() && !/^\d{5}(-\d{4})?$/.test(profileData.zipCode.trim())) {
      setProfileError('Enter a 5-digit zip code.');
      return;
    }

    if (requirePhoto && profileData.photos.length < 1) {
      setProfileError('Add at least one profile photo.');
      return;
    }

    setSavingProfile(true);
    setProfileError(null);
    try {
      await saveProfile(profileData);
      setCurrentScreen('main-app');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Vertical Modal Picker State
  const [modalVisible, setModalVisible] = useState(false);
  const [activePrField, setActivePrField] = useState<PrField | null>(null);

  const toggleGoal = (goal: string) => {
    const goals = profileData.selectedGoals;
    if (goals.includes(goal)) {
      setProfileData({ ...profileData, selectedGoals: goals.filter(g => g !== goal) });
    } else {
      setProfileData({ ...profileData, selectedGoals: [...goals, goal] });
    }
  };

  // Generate vertical list options: N/A followed by 1 to 999 lbs
  const prOptions = ['N/A', ...Array.from({ length: 999 }, (_, i) => `${i + 1} lbs`)];

  const openPrModal = (field: PrField) => {
    setActivePrField(field);
    setModalVisible(true);
  };

  const selectPrValue = (val: string) => {
    if (activePrField) {
      setProfileData({ ...profileData, [activePrField]: val });
    }
    setModalVisible(false);
  };

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
              <View style={styles.brandContainer}>
                <View style={styles.limeSquare} />
                <Text style={styles.title}>SwoleMates</Text>
              </View>
              <Text style={styles.subtitle}>Find your perfect gym partner</Text>

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
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
          >

            <View style={styles.setupHeader}>
              <Text style={styles.setupTitle}>Set Up Profile</Text>
            </View>

            <View style={styles.avatarSection}>
              <View style={styles.avatarRing}>
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarEmoji}>💪</Text>
                </View>
                <View style={styles.cameraBadge}>
                  <Text style={styles.cameraBadgeText}>+</Text>
                </View>
              </View>
              <Text style={styles.avatarSubtext}>Tap to change workout profile photo</Text>
            </View>

            <View style={styles.profileFormCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>FULL NAME</Text>
                <TextInput
                  style={styles.input}
                  value={profileData.fullName}
                  onChangeText={(val) => setProfileData({ ...profileData, fullName: val })}
                  placeholderTextColor="#666"
                />
              </View>

              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                  <Text style={styles.inputLabel}>AGE</Text>
                  <TextInput
                    style={styles.input}
                    value={profileData.age}
                    onChangeText={(val) => setProfileData({ ...profileData, age: val })}
                    keyboardType="numeric"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 2 }]}>
                  <Text style={styles.inputLabel}>PRIMARY GYM</Text>
                  <TextInput
                    style={styles.input}
                    value={profileData.primaryGym}
                    onChangeText={(val) => setProfileData({ ...profileData, primaryGym: val })}
                    placeholderTextColor="#666"
                  />
                </View>
              </View>

              <Text style={styles.sectionSubHeader}>Experience Level</Text>
              <View style={styles.chipsRow}>
                {['Beginner', 'Intermediate', 'Advanced', 'Elite'].map((level) => {
                  const isSelected = profileData.experienceLevel === level;
                  return (
                    <TouchableOpacity
                      key={level}
                      style={[styles.chip, isSelected && styles.activeChip]}
                      onPress={() => setProfileData({ ...profileData, experienceLevel: level })}
                    >
                      <Text style={[styles.chipText, isSelected && styles.activeChipText]}>{level}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionSubHeader}>Fitness Goals (Select Multi)</Text>
              <View style={styles.chipsRow}>
                {['Muscle Gain', 'Fat Loss', 'Strength', 'Endurance', 'General Fitness'].map((goal) => {
                  const isSelected = profileData.selectedGoals.includes(goal);
                  return (
                    <TouchableOpacity
                      key={goal}
                      style={[styles.chip, isSelected && styles.activeChip]}
                      onPress={() => toggleGoal(goal)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.activeChipText]}>{goal}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Personal Records Vertical Dropdown Triggers */}
              <Text style={styles.sectionSubHeader}>Personal Records (1RM Maxes)</Text>

              <View style={styles.prRowContainer}>
                <View style={styles.prFieldWrapper}>
                  <Text style={styles.inputLabel}>BENCH</Text>
                  <TouchableOpacity style={styles.dropdownTrigger} onPress={() => openPrModal('bench')}>
                    <Text style={styles.dropdownTriggerText}>{profileData.bench}</Text>
                    <Text style={styles.dropdownArrow}>▼</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.prFieldWrapper}>
                  <Text style={styles.inputLabel}>SQUAT</Text>
                  <TouchableOpacity style={styles.dropdownTrigger} onPress={() => openPrModal('squat')}>
                    <Text style={styles.dropdownTriggerText}>{profileData.squat}</Text>
                    <Text style={styles.dropdownArrow}>▼</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.prFieldWrapper}>
                  <Text style={styles.inputLabel}>DEADLIFT</Text>
                  <TouchableOpacity style={styles.dropdownTrigger} onPress={() => openPrModal('deadlift')}>
                    <Text style={styles.dropdownTriggerText}>{profileData.deadlift}</Text>
                    <Text style={styles.dropdownArrow}>▼</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </View>

            {profileError ? (
              <Text style={styles.profileError}>{profileError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.limeButton, { marginVertical: 20, opacity: savingProfile ? 0.7 : 1 }]}
              disabled={savingProfile}
              onPress={() => saveAndMatch()}
            >
              <Text style={styles.limeButtonText}>{savingProfile ? 'Saving...' : 'Save & Match'}</Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>

        {/* Vertical Dropdown Selection Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Select {activePrField ? activePrField.toUpperCase() : 'Weight'} (lbs)
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={prOptions}
                keyExtractor={(item) => item}
                showsVerticalScrollIndicator={true}
                renderItem={({ item }) => {
                  const isSelected = activePrField !== null && profileData[activePrField] === item;
                  return (
                    <TouchableOpacity
                      style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                      onPress={() => selectPrValue(item)}
                    >
                      <Text style={[styles.modalItemText, isSelected && styles.modalItemTextSelected]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    );
  }

  // ==========================================
  // 4. MAIN APP WITH BOTTOM NAVIGATION
  // ==========================================
  const nav = {
    push: (route: Route) => setStack((current) => [...current, route]),
    // Replaces the top screen, or returns to that screen if it's already open underneath.
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
      setProfileData(freshProfile());
      setStack([]);
      setActiveTab('Discover');
      setCurrentScreen('launch');
    },
  };
  const topRoute = stack[stack.length - 1];

  const renderRoute = (route: Route) => {
    switch (route.name) {
      case 'partner':
        return <PartnerProfileScreen id={route.id} />;
      case 'invites':
        return <RequestsScreen />;
      case 'chat':
        return <ChatScreen id={route.id} />;
      case 'schedule':
        return <ScheduleWorkoutScreen partnerId={route.partnerId} />;
      case 'scheduled':
        return <WorkoutScheduledScreen workoutId={route.workoutId} />;
    }
  };

  const renderMainTabContent = () => {
    switch (activeTab) {
      case 'Discover':
        return (
          <DiscoverScreen empty={
            <View style={styles.tabContentContainer}>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyIcon}>🔍</Text>
              </View>
              <Text style={styles.emptyTitle}>No Partners Nearby Yet</Text>
              <Text style={styles.emptyDesc}>We couldn't find anyone matching your current filters within your search radius. Try expanding your search distance or style.</Text>
              <TouchableOpacity style={styles.limeButtonSmall} onPress={() => nav.setTab('Profile')}>
                <Text style={styles.limeButtonSmallText}>Edit your profile</Text>
              </TouchableOpacity>
            </View>
          } />
        );
      case 'Matches':
        return (
          <InboxScreen empty={
            <View style={styles.tabContentContainer}>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyIcon}>🤝</Text>
              </View>
              <Text style={styles.emptyTitle}>Your Inbox is Empty</Text>
              <Text style={styles.emptyDesc}>You haven't matched with any lifters yet. Swipe right on prospective SwoleMates to start a conversation!</Text>
              <TouchableOpacity style={styles.limeButtonSmall} onPress={() => nav.setTab('Discover')}>
                <Text style={styles.limeButtonSmallText}>Start Swiping Now</Text>
              </TouchableOpacity>
            </View>
          } />
        );
      case 'Dashboard':
        return (
          <DashboardScreen lifts={profileData} empty={
            <View style={styles.tabContentContainer}>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyIcon}>⚡</Text>
              </View>
              <Text style={styles.emptyTitle}>No Active Streaks</Text>
              <Text style={styles.emptyDesc}>Keep track of your consistency and PR progression alongside your partner. Complete your first logged session to start!</Text>
              <TouchableOpacity style={styles.limeButtonSmall} onPress={logWorkout}>
                <Text style={styles.limeButtonSmallText}>Log Today's Workout</Text>
              </TouchableOpacity>
            </View>
          } />
        );
      case 'Plans':
        return (
          <PlansScreen empty={
            <View style={styles.tabContentContainer}>
              <View style={styles.emptyCircle}>
                <Text style={styles.emptyIcon}>📅</Text>
              </View>
              <Text style={styles.emptyTitle}>No Scheduled Workouts</Text>
              <Text style={styles.emptyDesc}>You don't have any sessions locked in. Set up a workout plan with one of your matches to stay reliable.</Text>
              <TouchableOpacity style={styles.limeButtonSmall} onPress={() => nav.push({ name: 'schedule' })}>
                <Text style={styles.limeButtonSmallText}>Propose a New Session</Text>
              </TouchableOpacity>
            </View>
          } />
        );
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
    <SafeAreaView style={styles.container}>
      <View style={styles.mainAppContainer}>
        {topRoute ? renderRoute(topRoute) : renderMainTabContent()}

        {!(topRoute && fullScreenRoutes.includes(topRoute.name)) && (
        <View style={styles.bottomNav}>
          {([
            { name: 'Discover', icon: '✨' },
            { name: 'Matches', icon: '🤝' },
            { name: 'Dashboard', icon: '⚡' },
            { name: 'Plans', icon: '📅' },
            { name: 'Profile', icon: '👤' },
          ] as const).map((tab) => {
            const isActive = activeTab === tab.name;
            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.navItem}
                onPress={() => nav.setTab(tab.name)}
              >
                <Text style={[styles.navIcon, isActive && styles.activeNavIcon]}>{tab.icon}</Text>
                <Text style={[styles.navLabel, isActive && styles.activeNavLabel]}>{tab.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        )}
      </View>
    </SafeAreaView>
    </NavigationContext.Provider>
  );
}

const styles = StyleSheet.create({
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  overlay: { flex: 1, backgroundColor: 'rgba(5, 5, 5, 0.82)' },
  launchContainer: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingBottom: 48 },
  launchContent: { width: '100%' },
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
  navItem: { alignItems: 'center', flex: 1 },
  navIcon: { fontSize: 18, marginBottom: 2, opacity: 0.4 },
  activeNavIcon: { opacity: 1 },
  navLabel: { fontSize: 10, color: '#666666', fontWeight: '600' },
  activeNavLabel: { color: '#CCFF00' },
});