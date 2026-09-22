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
  ImageBackground
} from 'react-native';

export default function App() {
  // 'launch' or 'auth'
  const [currentScreen, setCurrentScreen] = useState('launch');
  // 'signup' or 'login' inside auth screen
  const [authMode, setAuthMode] = useState('signup');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // --- LAUNCH SCREEN VIEW ---
  if (currentScreen === 'launch') {
    return (
      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1000&auto=format&fit=crop' }}
        style={styles.backgroundImage}
      >
        <View style={styles.overlay}>
          <SafeAreaView style={styles.launchContainer}>
            <View style={styles.launchContent}>

              {/* Logo & Title */}
              <View style={styles.brandContainer}>
                <View style={styles.limeSquare} />
                <Text style={styles.title}>SwoleMates</Text>
              </View>
              <Text style={styles.subtitle}>Find your perfect gym partner</Text>

              {/* Social Proof Pill */}
              <View style={styles.socialProofCard}>
                <Text style={styles.avatarText}>👥🔥</Text>
                <Text style={styles.socialProofText}>Join 12,000+ local lifters matches today</Text>
              </View>

              {/* Get Started Button */}
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

  // --- LOGIN / SIGN UP SCREEN VIEW ---
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.authInnerContainer}
      >
        {/* Header Branding */}
        <View style={styles.authHeader}>
          <View style={styles.brandContainer}>
            <View style={styles.limeSquare} />
            <Text style={styles.title}>SwoleMates</Text>
          </View>
          <Text style={styles.subtitle}>Find your perfect gym partner.</Text>
        </View>

        {/* Auth Box Container */}
        <View style={styles.authCard}>

          {/* Toggle Tabs (Sign Up / Log In) */}
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

          {/* Form Inputs */}
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

          {/* Action Button */}
          <TouchableOpacity style={styles.limeButton}>
            <Text style={styles.limeButtonText}>
              {authMode === 'signup' ? 'Create Account' : 'Log In'}
            </Text>
          </TouchableOpacity>

        </View>

        {/* Footer Terms */}
        <Text style={styles.termsText}>
          By signing up, you agree to our <Text style={styles.termsHighlight}>Terms & Safety rules</Text>
        </Text>

        {/* Back option */}
        <TouchableOpacity onPress={() => setCurrentScreen('launch')} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Back to Welcome</Text>
        </TouchableOpacity>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 5, 0.82)',
  },
  launchContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  launchContent: {
    width: '100%',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  limeSquare: {
    width: 14,
    height: 26,
    backgroundColor: '#CCFF00',
    borderRadius: 3,
    marginRight: 10,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#999999',
    marginBottom: 24,
  },
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
  avatarText: {
    fontSize: 16,
    marginRight: 10,
  },
  socialProofText: {
    color: '#DDDDDD',
    fontSize: 13,
    fontWeight: '500',
  },
  limeButton: {
    backgroundColor: '#CCFF00',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
  },
  limeButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  authInnerContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  authHeader: {
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  authCard: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#222222',
    borderRadius: 24,
    padding: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#262626',
  },
  tabText: {
    color: '#777777',
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#CCFF00',
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
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
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginBottom: 14,
  },
  forgotPasswordText: {
    color: '#CCFF00',
    fontSize: 13,
    fontWeight: '600',
  },
  termsText: {
    color: '#777777',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
  termsHighlight: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  backLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  backLinkText: {
    color: '#666666',
    fontSize: 13,
  },
});