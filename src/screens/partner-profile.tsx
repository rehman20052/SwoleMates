import { Image } from "expo-image";
import { PropsWithChildren, ReactNode } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { icons } from "@/assets";
import { AppText, Card, Icon, IconButton, Screen, ScrollBody, SectionLabel, StatBox } from "@/components/ui";
import { firstName, getPartner, Partner } from "@/data/partners";
import { useNavigation } from "@/navigation";
import { useAppData } from "@/state/app-data";
import { useAppTheme } from "@/theme";

export function PartnerProfileScreen({ id }: { id: string }) {
  const partner = getPartner(id);
  return partner ? <PartnerProfile partner={partner} /> : null;
}

export function confirmSafetyAction(
  partner: Partner,
  action: "block" | "report",
  onConfirm: () => void,
) {
  const name = firstName(partner);
  const copy =
    action === "block"
      ? {
          title: `Block ${name}?`,
          body: `${name} won't be able to see your profile or message you, and any plans with them are cancelled.`,
          button: "Block",
        }
      : {
          title: `Report ${name}?`,
          body: "Our safety team reviews every report within 24 hours. They won't know you reported them.",
          button: "Report",
        };

  Alert.alert(copy.title, copy.body, [
    { text: "Cancel", style: "cancel" },
    { text: copy.button, style: "destructive", onPress: onConfirm },
  ]);
}

function PartnerProfile({ partner }: { partner: Partner }) {
  const nav = useNavigation();
  const { block } = useAppData();

  function openMore() {
    Alert.alert(partner.name, undefined, [
      { text: `Message ${firstName(partner)}`, onPress: () => nav.push({ name: "chat", id: partner.id }) },
      {
        text: "Report",
        onPress: () => confirmSafetyAction(partner, "report", () => Alert.alert("Report submitted", "Thanks for helping keep SwoleMates safe.")),
      },
      {
        text: "Block",
        style: "destructive",
        onPress: () =>
          confirmSafetyAction(partner, "block", () => {
            block(partner.id);
            nav.back();
          }),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton source={icons.arrowLeft} label="Back" onPress={nav.back} />
        <AppText size={18} weight="extrabold">
          {partner.name}
        </AppText>
        <IconButton source={icons.moreHorizontal} label="More options" onPress={openMore} />
      </View>
      <PartnerDetails partner={partner} onRemoved={nav.back} />
    </Screen>
  );
}

// The full, scrollable profile. Discover shows it with a decision footer so people
// read the whole profile before choosing, instead of swiping on a photo.
export function PartnerDetails({
  partner,
  footer,
  onRemoved,
}: {
  partner: Partner;
  footer?: ReactNode;
  onRemoved?: () => void;
}) {
  const theme = useAppTheme();
  const { block, review } = useAppData();

  function handleBlock() {
    confirmSafetyAction(partner, "block", () => {
      block(partner.id);
      onRemoved?.();
    });
  }

  function handleReport() {
    confirmSafetyAction(partner, "report", () =>
      Alert.alert("Report submitted", "Thanks for helping keep SwoleMates safe."),
    );
  }

  function handleHide() {
    review(partner.id, false);
    onRemoved?.();
  }

  return (
      <ScrollBody contentContainerStyle={{ paddingHorizontal: 20 }}>
        <View style={styles.hero}>
          <Image source={partner.photos[0]} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.3)" }]} />
          <View style={styles.heroBadges}>
            <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
              <AppText size={13} weight="extrabold" color={theme.colors.primaryText}>
                {partner.match}% Match
              </AppText>
            </View>
            <View style={[styles.badge, styles.row, { backgroundColor: theme.colors.scrim, gap: 4 }]}>
              <Icon source={icons.shieldAlt} size={14} />
              <AppText size={12} weight="bold">
                {partner.safety} Safety Rating
              </AppText>
            </View>
          </View>
          <View style={styles.heroDetails}>
            <AppText size={26} weight="black">
              {partner.name}, {partner.age}
            </AppText>
            <AppText weight="semibold" primary>
              {partner.style} • {partner.gym}
            </AppText>
            <View style={[styles.row, { flexWrap: "wrap", gap: 8, marginTop: 8 }]}>
              {[`${partner.distance} miles away`, `${partner.frequency} Availability`].map((fact) => (
                <View key={fact} style={[styles.fact, { backgroundColor: theme.colors.glass }]}>
                  <AppText size={12} weight="medium">
                    {fact}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <SectionLabel>Photos</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
            {partner.photos.map((photo, index) => (
              <Image
                key={index}
                source={photo}
                style={[styles.photo, { width: index === 0 ? 220 : 110 }]}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        </View>

        <Section title="Goals" summary={partner.goals.summary}>
          <StatBox label="Primary" value={partner.goals.primary} />
          <StatBox label="Focus" value={partner.goals.focus} />
        </Section>

        <Section title="Training Experience" summary={partner.experience.summary}>
          <StatBox label="Years" value={partner.experience.years} />
          <StatBox label="Style" value={partner.experience.style} />
        </Section>

        <Card padding={16} radius={18} gap={12}>
          <SectionLabel>Gym</SectionLabel>
          <View style={[styles.row, { gap: 10 }]}>
            <View style={[styles.gymMark, { backgroundColor: theme.colors.primary }]}>
              <AppText size={12} weight="black" color={theme.colors.primaryText}>
                {partner.gym[0]}
              </AppText>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size={16} weight="extrabold">
                {partner.gym}
              </AppText>
              <AppText size={13} weight="semibold" muted>
                {partner.gymNote}
              </AppText>
            </View>
          </View>
        </Card>

        <Section title="Availability" summary={partner.availability.summary}>
          <StatBox label="Days" value={partner.availability.days} />
          <StatBox label="Best Time" value={partner.availability.bestTime} />
        </Section>

        <Section title="Key Lifts">
          <StatBox label="Bench Press" value={`${partner.lifts.bench} lb`} />
          <StatBox label="Squat" value={`${partner.lifts.squat} lb`} />
          <StatBox label="Deadlift" value={`${partner.lifts.deadlift} lb`} />
        </Section>

        <Section title="Scores">
          <StatBox label="Reliability" value={`${partner.reliability}%`} {...scoreStyle} valueColor={theme.colors.primary} />
          <StatBox label="Safety" value={`${partner.safety}`} {...scoreStyle} valueColor={theme.colors.primary} />
        </Section>

        <Card padding={16} radius={18} gap={12}>
          <SectionLabel>Actions</SectionLabel>
          <View style={[styles.row, { gap: 8 }]}>
            <ActionButton label="Block" onPress={handleBlock} background={theme.colors.danger} />
            <ActionButton label="Report" onPress={handleReport} />
            <ActionButton label="Hide Profile" onPress={handleHide} />
          </View>
        </Card>
        {footer}
      </ScrollBody>
  );
}

const scoreStyle = { labelSize: 11, valueSize: 18, valueWeight: "black", padding: 12, radius: 14 } as const;

function Section({ title, summary, children }: PropsWithChildren<{ title: string; summary?: string }>) {
  return (
    <Card padding={16} radius={18} gap={12}>
      <SectionLabel>{title}</SectionLabel>
      <View style={[styles.row, { alignItems: "flex-start", gap: 8 }]}>{children}</View>
      {summary ? (
        <AppText weight="semibold" style={{ lineHeight: 20 }}>
          {summary}
        </AppText>
      ) : null}
    </Card>
  );
}

function ActionButton({ label, onPress, background }: { label: string; onPress: () => void; background?: string }) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: background ?? theme.colors.surface,
          borderColor: background ?? theme.colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <AppText size={13} weight="extrabold" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
  },
  hero: {
    borderRadius: 24,
    height: 420,
    overflow: "hidden",
  },
  heroDetails: {
    bottom: 0,
    gap: 4,
    left: 0,
    padding: 20,
    position: "absolute",
    right: 0,
  },
  fact: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadges: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 12,
  },
  badge: {
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  photoStrip: {
    gap: 12,
  },
  photo: {
    borderRadius: 18,
    height: 140,
  },
  gymMark: {
    alignItems: "center",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  action: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
});
