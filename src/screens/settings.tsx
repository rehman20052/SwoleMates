import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, Avatar, Field, Input, PrimaryButton, Screen, ScrollBody, SecondaryButton, TitleBar, Toggle } from "@/components/ui";
import { changeEmail, changePassword, currentEmail, discoverPaused, setDiscoverPaused } from "@/lib/account";
import { notifyChatAlerts } from "@/lib/matches";
import { listBlockedPeople, unblockPerson, type BlockedPerson } from "@/lib/safety";
import { useNavigation } from "@/navigation";
import { useAppTheme, useColorScheme } from "@/theme";

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const { scheme, setScheme, schemeError, savingScheme } = useColorScheme();
  const [email, setEmail] = useState("");
  const [people, setPeople] = useState<BlockedPerson[]>([]);
  const [blockedStatus, setBlockedStatus] = useState<"loading" | "ready" | "error">("loading");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [pauseMessage, setPauseMessage] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  useEffect(() => {
    let active = true;
    currentEmail()
      .then((value) => {
        if (active) setEmail(value);
      })
      .catch(() => {
        if (active) setEmail("");
      });
    discoverPaused()
      .then((value) => {
        if (!active) return;
        setPaused(value);
        setPauseMessage(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPauseMessage(error instanceof Error ? error.message : "Could not load Discover visibility.");
      });
    listBlockedPeople()
      .then((blocked) => {
        if (!active) return;
        setPeople(blocked);
        setBlockedStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setBlockedStatus("error");
        setBlockedMessage(error instanceof Error ? error.message : "Could not load blocked people.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function togglePause(next: boolean) {
    setPauseMessage(null);
    setPaused(next);
    try {
      await setDiscoverPaused(next);
    } catch (error) {
      setPaused(!next);
      setPauseMessage(error instanceof Error ? error.message : "Could not update Discover.");
    }
  }

  async function unblock(userId: string) {
    setBusyId(userId);
    setBlockedMessage(null);
    try {
      await unblockPerson(userId);
      setPeople((current) => current.filter((person) => person.userId !== userId));
      notifyChatAlerts();
      setBlockedStatus("ready");
    } catch (error) {
      setBlockedMessage(error instanceof Error ? error.message : "Could not unblock that person.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <TitleBar title="Settings" onBack={onClose} />
      <ScrollBody contentContainerStyle={styles.list}>
        <AppText size={13} weight="bold" primary upper>
          Account
        </AppText>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText size={12} weight="bold" muted upper>
            Email
          </AppText>
          <AppText weight="semibold">{email || "Loading email..."}</AppText>
          <EmailForm onChanged={setEmail} />
        </View>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <AppText size={12} weight="bold" muted upper>
            Password
          </AppText>
          <PasswordForm />
        </View>
        {confirmLogout ? (
          <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <AppText weight="semibold">Log out of SwoleMates?</AppText>
            <View style={styles.actions}>
              <SecondaryButton height={44} fontSize={14} style={styles.actionButton} onPress={() => setConfirmLogout(false)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton height={44} fontSize={14} style={styles.actionButton} onPress={() => nav.signOut()}>
                Log out
              </PrimaryButton>
            </View>
          </View>
        ) : (
          <SecondaryButton height={48} fontSize={15} onPress={() => setConfirmLogout(true)}>
            Log out
          </SecondaryButton>
        )}

        <AppText size={13} weight="bold" primary upper style={styles.section}>
          Appearance
        </AppText>
        <View style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText weight="semibold">Dark mode</AppText>
            <AppText size={13} muted>
              {scheme === "dark" ? "The app is using the dark theme." : "The app is using the light theme."}
            </AppText>
          </View>
          <Toggle accessibilityLabel="Dark mode" value={scheme === "dark"} onChange={(on) => { if (!savingScheme) void setScheme(on ? "dark" : "light"); }} />
        </View>

        {savingScheme ? <AppText size={12} muted>Saving appearance…</AppText> : null}
        {schemeError ? <AppText size={13} color={theme.colors.danger}>{schemeError}</AppText> : null}

        <AppText size={13} weight="bold" primary upper style={styles.section}>
          Safety
        </AppText>
        <View style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText weight="semibold">Hide me from Discover</AppText>
            <AppText size={13} muted style={{ lineHeight: 18 }}>
              Your account stays. Other people stop seeing you in Discover until you turn this off. Chats you already have stay open.
            </AppText>
            {pauseMessage ? <AppText size={13} color={theme.colors.danger}>{pauseMessage}</AppText> : null}
          </View>
          <Toggle accessibilityLabel="Hide me from Discover" value={paused} onChange={(next) => void togglePause(next)} />
        </View>

        <AppText size={12} weight="bold" muted upper>
          Blocked users
        </AppText>
        {blockedStatus === "loading" ? <AppText muted>Loading blocked people...</AppText> : null}
        {blockedStatus === "error" ? <AppText color={theme.colors.danger}>{blockedMessage}</AppText> : null}
        {blockedStatus === "ready" && people.length === 0 ? (
          <AppText muted style={{ lineHeight: 20 }}>
            You haven't blocked anyone. People you block disappear from Discover, chat, and matching until you unblock them here.
          </AppText>
        ) : null}
        {people.map((person) => (
          <View key={person.userId} style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            {person.photo ? <Avatar source={{ uri: person.photo }} size={44} /> : <View style={[styles.face, { backgroundColor: theme.colors.surfaceRaised }]} />}
            <AppText weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
              {person.name}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Unblock ${person.name}`}
              disabled={busyId === person.userId}
              onPress={() => void unblock(person.userId)}
              style={[styles.unblock, { borderColor: theme.colors.border, opacity: busyId === person.userId ? 0.6 : 1 }]}
            >
              <AppText size={13} weight="semibold">
                {busyId === person.userId ? "Unblocking…" : "Unblock"}
              </AppText>
            </Pressable>
          </View>
        ))}
        {blockedMessage && blockedStatus === "ready" ? <AppText color={theme.colors.danger}>{blockedMessage}</AppText> : null}
        {Platform.OS === "web" ? <ScreenLayoutDetails /> : null}
        <SecondaryButton height={44} fontSize={14} textColor={theme.colors.danger} onPress={() => nav.push({ name: "delete-account" })}>Delete account</SecondaryButton>
      </ScrollBody>
    </Screen>
  );
}

function ScreenLayoutDetails() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<string | null>(null);
  function measure() {
    const root = document.getElementById("root")?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const home = document.querySelector('[aria-label="Home"]');
    const nav = home?.parentElement;
    const bounds = nav?.getBoundingClientRect();
    const round = (value: number | undefined) => value === undefined ? "unknown" : String(Math.round(value * 10) / 10);
    const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    setReport([
      "Screen layout: iphone-layout-2",
      `Mode: ${standalone ? "Home Screen" : "Browser"}`,
      `Screen: ${screen.width} × ${screen.height}`,
      `Window: ${window.innerWidth} × ${window.innerHeight}`,
      `Document: ${document.documentElement.clientWidth} × ${document.documentElement.clientHeight}`,
      `Visible height / top: ${round(viewport?.height)} / ${round(viewport?.offsetTop)}`,
      `Root top / bottom: ${round(root?.top)} / ${round(root?.bottom)}`,
      `Safe area top / bottom: ${round(insets.top)} / ${round(insets.bottom)}`,
      `Tabs bottom / padding: ${round(bounds?.bottom)} / ${nav ? getComputedStyle(nav).paddingBottom : "unknown"}`,
      `Status bar: ${document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute("content")}`,
      `Browser: ${navigator.userAgent}`,
    ].join("\n"));
  }
  return <View style={[styles.card, styles.section, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <AppText weight="semibold">Screen layout help</AppText>
    <AppText size={13} muted>Show screen measurements to help investigate extra space below the tabs.</AppText>
    <SecondaryButton height={44} fontSize={14} onPress={measure}>{report ? "Refresh screen details" : "Show screen details"}</SecondaryButton>
    {report ? <>
      <AppText selectable size={12}>{report}</AppText>
      <SecondaryButton height={40} fontSize={14} onPress={() => setReport(null)}>Hide details</SecondaryButton>
    </> : null}
  </View>;
}

function EmailForm({ onChanged }: { onChanged: (email: string) => void }) {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const [nextEmail, setNextEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await changeEmail(nextEmail, password);
      onChanged(nextEmail.trim());
      setMessage("Check that inbox to confirm the new email.");
      setNextEmail("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your email.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <SecondaryButton height={40} fontSize={14} onPress={() => setOpen(true)}>
        Change email
      </SecondaryButton>
    );
  }

  return (
    <View style={styles.form}>
      <Field label="New email">
        <Input value={nextEmail} onChangeText={setNextEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="name@email.com" />
      </Field>
      <Field label="Current password">
        <Input value={password} onChangeText={setPassword} secureTextEntry placeholder="Current password" />
      </Field>
      {error ? <AppText size={13} color={theme.colors.danger}>{error}</AppText> : null}
      {message ? <AppText size={13} primary>{message}</AppText> : null}
      <View style={styles.actions}>
        <SecondaryButton height={44} fontSize={14} style={styles.actionButton} disabled={busy} onPress={() => setOpen(false)}>
          Cancel
        </SecondaryButton>
        <PrimaryButton height={44} fontSize={14} style={styles.actionButton} disabled={busy} onPress={() => void save()}>
          {busy ? "Saving…" : "Save email"}
        </PrimaryButton>
      </View>
    </View>
  );
}

function PasswordForm() {
  const theme = useAppTheme();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setMessage(null);
    if (next !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setMessage("Password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your password.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <SecondaryButton height={40} fontSize={14} onPress={() => setOpen(true)}>
        Change password
      </SecondaryButton>
    );
  }

  return (
    <View style={styles.form}>
      <Field label="Current password">
        <Input value={current} onChangeText={setCurrent} secureTextEntry placeholder="Current password" />
      </Field>
      <Field label="New password">
        <Input value={next} onChangeText={setNext} secureTextEntry placeholder="At least 6 characters" />
      </Field>
      <Field label="Confirm new password">
        <Input value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Repeat the new password" />
      </Field>
      {error ? <AppText size={13} color={theme.colors.danger}>{error}</AppText> : null}
      {message ? <AppText size={13} primary>{message}</AppText> : null}
      <View style={styles.actions}>
        <SecondaryButton height={44} fontSize={14} style={styles.actionButton} disabled={busy} onPress={() => setOpen(false)}>
          Cancel
        </SecondaryButton>
        <PrimaryButton height={44} fontSize={14} style={styles.actionButton} disabled={busy} onPress={() => void save()}>
          {busy ? "Saving…" : "Save password"}
        </PrimaryButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
    padding: 20,
    paddingBottom: 32,
  },
  section: {
    marginTop: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  form: {
    gap: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
  },
  row: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  face: {
    borderRadius: 22,
    height: 44,
    width: 44,
  },
  unblock: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
