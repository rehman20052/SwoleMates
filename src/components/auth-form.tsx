import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AppText, Field, Input, PrimaryButton, Segmented } from "@/components/ui";
import { profileFromUser, type UserProfile } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import { useAppTheme } from "@/theme";

type AuthMode = "signup" | "login";

type AuthFormProps = {
  onSuccess?: (profile: UserProfile | null) => void;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthForm({ onSuccess }: AuthFormProps) {
  const theme = useAppTheme();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const submit = async () => {
    const trimmedEmail = email.trim();
    setError(null);
    setNotice(null);

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const result =
        mode === "signup"
          ? await supabase.auth.signUp({ email: trimmedEmail, password })
          : await supabase.auth.signInWithPassword({ email: trimmedEmail, password });

      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (mode === "signup" && result.data.user && result.data.user.identities?.length === 0) {
        setError("An account with this email already exists. Try logging in.");
        return;
      }

      if (!result.data.session) {
        setNotice("Check your email to confirm your account, then log in.");
        setMode("login");
        return;
      }

      onSuccess?.(profileFromUser(result.data.user));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
      setError(
        message === "Failed to fetch"
          ? "Could not reach Supabase. Check your connection or antivirus, then try again."
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.form}>
      <Segmented
        value={mode}
        onChange={switchMode}
        options={[
          { value: "signup", label: "Sign Up" },
          { value: "login", label: "Log In" },
        ]}
      />

      <Field label="Email address">
        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="e.g. gym@swolemates.com"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!submitting}
        />
      </Field>

      <Field label="Password">
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === "signup" ? "new-password" : "password"}
          textContentType={mode === "signup" ? "newPassword" : "password"}
          editable={!submitting}
        />
      </Field>

      {mode === "signup" ? (
        <Field label="Confirm password">
          <Input
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!submitting}
          />
        </Field>
      ) : null}

      {error ? (
        <AppText size={13} weight="medium" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}

      {notice ? (
        <AppText size={13} weight="medium" color={theme.colors.primary}>
          {notice}
        </AppText>
      ) : null}

      <PrimaryButton disabled={submitting} onPress={submit}>
        {submitting ? (
          <ActivityIndicator color={theme.colors.primaryText} />
        ) : mode === "signup" ? (
          "Create Account"
        ) : (
          "Log In"
        )}
      </PrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
});
