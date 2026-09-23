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
  ScrollView
} from 'react-native';

export default function App() {
  // Navigation Flow States: 'launch' | 'auth' | 'profile-setup' | 'main-app'
  const [currentScreen, setCurrentScreen] = useState('launch');
  const [authMode, setAuthMode] = useState('signup'); // 'signup' | 'login'
  const [activeTab, setActiveTab] = useState('Discover'); // 'Discover' | 'Matches' | 'Dashboard' | 'Plans' | 'Profile'

  // Form Inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Profile Setup Form States
  const [fullName, setFullName] = useState('Alex Rivera');
  const [age, setAge] = useState('26');
  const [primaryGym, setPrimaryGym] = useState("Gold's Gym Downtown");
  const [experienceLevel, setExperienceLevel] = useState('Intermediate');
  const [selectedGoals, setSelectedGoals] = useState(['Muscle Gain', 'Strength']);
  const [bench, setBench] = useState('225 lbs');
  const [squat, setSquat] = useState('315 lbs');
  const [deadlift, setDeadlift] = useState('405 lbs');

  const toggleGoal = (goal) => {
    if (selectedGoals.includes(goal)) {
      setSelectedGoals(selectedGoals.filter(g => g !== goal));
    } else {
      setSelectedGoals([...selectedGoals, goal]);
    }
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
  // 2. AUTH SCREEN (Sign Up / Log In)
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
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, authMode === 'signup' && styles.activeTab]}
                onPress={() => setAuthMode('signup')}
              >
                <Text style={[styles.tabText, authMode === 'signup' && styles.activeTabText]}>Sign Up</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tab, authMode === 'login' && styles.activeTab]}
                onPress={() => setAuthMode('login')}
              >
                <Text style={[styles.tabText, authMode === 'login' && styles.activeTabText]}>Log In</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. gym@swolemates.com"
                placeholderTextColor="#666"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#666"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            {authMode === 'signup' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#666"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
            )}

            {authMode === 'login' && (
              <TouchableOpacity style={styles.forgotPasswordContainer}>
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>
            )}

            {/* Triggers Profile Setup on Auth Success */}
            <TouchableOpacity
              style={styles.limeButton}
              onPress={() => setCurrentScreen('profile-setup')}
            >
              <Text style={styles.limeButtonText}>
                {authMode === 'signup' ? 'Create Account' : 'Log In'}
              </Text>
            </TouchableOpacity>
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
  // 3. PROFILE SETUP SCREEN (Step 1 of 2)
  // ==========================================
  if (currentScreen === 'profile-setup') {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>

          <View style={styles.setupHeader}>
            <Text style={styles.setupTitle}>Set Up Profile</Text>
            <Text style={styles.stepIndicator}>Step 1 of 2</Text>
          </View>

          {/* Avatar Picker Mock */}
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

          {/* Form Card */}
          <View style={styles.profileFormCard}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>FULL NAME</Text>
              <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholderTextColor="#666" />
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.inputLabel}>AGE</Text>
                <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" placeholderTextColor="#666" />
              </View>
              <View style={[styles.inputGroup, { flex: 2 }]}>
                <Text style={styles.inputLabel}>PRIMARY GYM</Text>
                <TextInput style={styles.input} value={primaryGym} onChangeText={setPrimaryGym} placeholderTextColor="#666" />
              </View>
            </View>

            {/* Experience Level Selection */}
            <Text style={styles.sectionSubHeader}>Experience Level</Text>
            <View style={styles.chipsRow}>
              {['Beginner', 'Intermediate', 'Advanced', 'Elite'].map((level) => {
                const isSelected = experienceLevel === level;
                return (
                  <TouchableOpacity
                    key={level}
                    style={[styles.chip, isSelected && styles.activeChip]}
                    onPress={() => setExperienceLevel(level)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.activeChipText]}>{level}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Fitness Goals Selection */}
            <Text style={styles.sectionSubHeader}>Fitness Goals (Select Multi)</Text>
            <View style={styles.chipsRow}>
              {['Muscle Gain', 'Fat Loss', 'Strength', 'Endurance', 'General Fitness'].map((goal) => {
                const isSelected = selectedGoals.includes(goal);
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

            {/* PRs */}
            <Text style={styles.sectionSubHeader}>Personal Records (1RM Maxes)</Text>
            <View style={styles.prRow}>
              <View style={styles.prBox}>
                <Text style={styles.prLabel}>BENCH</Text>
                <TextInput style={styles.prInput} value={bench} onChangeText={setBench} />
              </View>
              <View style={styles.prBox}>
                <Text style={styles.prLabel}>SQUAT</Text>
                <TextInput style={styles.prInput} value={squat} onChangeText={setSquat} />
              </View>
              <View style={styles.prBox}>
                <Text style={styles.prLabel}>DEADLIFT</Text>
                <TextInput style={styles.prInput} value={deadlift} onChangeText={setDeadlift} />
              </View>
            </View>
          </View>

          {/* Submit Profile & Enter Main App */}
          <TouchableOpacity
            style={[styles.limeButton, { marginVertical: 20 }]}
            onPress={() => setCurrentScreen('main-app')}
          >
            <Text style={styles.limeButtonText}>Save & Match</Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>
    );
  }

  // ==========================================
  // 4. MAIN APP WITH BOTTOM NAVIGATION
  // ==========================================
  const renderMainTabContent = () => {
    switch (activeTab) {
      case 'Discover':
        return (
          <View style={styles.tabContentContainer}>
            <View style={styles.emptyCircle}>
              <Text style={styles.emptyIcon}>🔍</Text>
            </View>
            <Text style={styles.emptyTitle}>No Partners Nearby Yet</Text>
            <Text style={styles.emptyDesc}>We couldn't find anyone matching your current filters within your search radius. Try expanding your search distance or style.</Text>
            <TouchableOpacity style={styles.limeButtonSmall}>
              <Text style={styles.limeButtonSmallText}>Expand Match Preferences</Text>
            </TouchableOpacity>
          </View>
        );
      case 'Matches':
        return (
          <View style={styles.tabContentContainer}>
            <View style={styles.emptyCircle}>
              <Text style={styles.emptyIcon}>💬</Text>
            </View>
            <Text style={styles.emptyTitle}>Your Inbox is Empty</Text>
            <Text style={styles.emptyDesc}>You haven't matched with any lifters yet. Swipe right on prospective SwoleMates to start a conversation!</Text>
            <TouchableOpacity style={styles.limeButtonSmall}>
              <Text style={styles.limeButtonSmallText}>Start Swiping Now</Text>
            </TouchableOpacity>
          </View>
        );
      case 'Dashboard':
        return (
          <View style={styles.tabContentContainer}>
            <View style={styles.emptyCircle}>
              <Text style={styles.emptyIcon}>⚡</Text>
            </View>
            <Text style={styles.emptyTitle}>No Active Streaks</Text>
            <Text style={styles.emptyDesc}>Keep track of your consistency and PR progression alongside your partner. Complete your first logged session to start!</Text>
            <TouchableOpacity style={styles.limeButtonSmall}>
              <Text style={styles.limeButtonSmallText}>Log Today's Workout</Text>
            </TouchableOpacity>
          </View>
        );
      case 'Plans':
        return (
          <View style={styles.tabContentContainer}>
            <View style={styles.emptyCircle}>
              <Text style={styles.emptyIcon}>📅</Text>
            </View>
            <Text style={styles.emptyTitle}>No Scheduled Workouts</Text>
            <Text style={styles.emptyDesc}>You don't have any sessions locked in. Set up a workout plan with one of your matches to stay reliable.</Text>
            <TouchableOpacity style={styles.limeButtonSmall}>
              <Text style={styles.limeButtonSmallText}>Propose a New Session</Text>
            </TouchableOpacity>
          </View>
        );
      case 'Profile':
        return (
          <View style={styles.tabContentContainer}>
            <View style={styles.emptyCircle}>
              <Text style={styles.emptyIcon}>👤</Text>
            </View>
            <Text style={styles.emptyTitle}>{fullName}</Text>
            <Text style={styles.emptyDesc}>{primaryGym} • Age {age} • {experienceLevel}</Text>
            <TouchableOpacity style={styles.limeButtonSmall} onPress={() => setCurrentScreen('profile-setup')}>
              <Text style={styles.limeButtonSmallText}>Edit Profile Info</Text>
            </TouchableOpacity>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainAppContainer}>
        {/* Dynamic Tab Body */}
        {renderMainTabContent()}

        {/* Bottom Navigation Bar */}
        <View style={styles.bottomNav}>
          {[
            { name: 'Discover', icon: '✨' },
            { name: 'Matches', icon: '❤️' },
            { name: 'Dashboard', icon: '⚡' },
            { name: 'Plans', icon: '📅' },
            { name: 'Profile', icon: '👤' },
          ].map((tab) => {
            const isActive = activeTab === tab.name;
            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.navItem}
                onPress={() => setActiveTab(tab.name)}
              >
                <Text style={[styles.navIcon, isActive && styles.activeNavIcon]}>{tab.icon}</Text>
                <Text style={[styles.navLabel, isActive && styles.activeNavLabel]}>{tab.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
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
  tabContainer: { flexDirection: 'row', backgroundColor: '#1A1A1A', borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  activeTab: { backgroundColor: '#262626' },
  tabText: { color: '#777777', fontSize: 14, fontWeight: '600' },
  activeTabText: { color: '#CCFF00' },
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
  forgotPasswordContainer: { alignItems: 'flex-end', marginBottom: 14 },
  forgotPasswordText: { color: '#CCFF00', fontSize: 13, fontWeight: '600' },
  termsText: { color: '#777777', fontSize: 12, textAlign: 'center', marginTop: 20 },
  termsHighlight: { color: '#FFFFFF', fontWeight: '600' },
  backLink: { alignItems: 'center', marginTop: 16 },
  backLinkText: { color: '#666666', fontSize: 13 },
  scrollContainer: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  setupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  setupTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
  stepIndicator: { color: '#CCFF00', fontSize: 14, fontWeight: '700' },
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
  prRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  prBox: { flex: 1, backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#262626', borderRadius: 12, padding: 10 },
  prLabel: { color: '#777777', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  prInput: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
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