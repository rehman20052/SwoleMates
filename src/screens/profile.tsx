import { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";

import {
  AppText,
  Card,
  Field,
  Input,
  PrimaryButton,
  Screen,
  ScrollBody,
  SecondaryButton,
  SectionLabel,
} from "@/components/ui";
import { experienceLevels } from "@/data/partners";
import { pickProfilePhoto } from "@/lib/pick-photo";
import { type ProfileGender, type UserProfile } from "@/lib/profile";
import { useNavigation } from "@/navigation";
import { useAppTheme } from "@/theme";

const MAX_PHOTOS = 6;
const ABOUT_LIMIT = 280;
const WEIGHTS = ["N/A", ...Array.from({ length: 999 }, (_, index) => `${index + 1} lbs`)];
const GENDERS: readonly Exclude<ProfileGender, "">[] = ["Male", "Female", "Other"];

type LiftField = "bench" | "squat" | "deadlift" | "customLift";

type ProfileScreenProps = {
  profile: UserProfile;
  saving: boolean;
  error: string | null;
  title?: string;
  onChange: (profile: UserProfile) => void;
  onSave: () => void;
};

export function ProfileScreen({ profile, saving, error, title = "Edit Profile", onChange, onSave }: ProfileScreenProps) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [activeLift, setActiveLift] = useState<LiftField | null>(null);

  const update = (patch: Partial<UserProfile>) => onChange({ ...profile, ...patch });

  const addPhoto = async (index: number) => {
    setPhotoError(null);
    try {
      const photo = await pickProfilePhoto();
      if (!photo) return;
      const photos = [...profile.photos];
      if (index < photos.length) photos[index] = photo;
      else photos.push(photo);
      update({ photos: photos.slice(0, MAX_PHOTOS) });
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not add that photo.");
    }
  };

  const removePhoto = (index: number) => {
    update({ photos: profile.photos.filter((_, photoIndex) => photoIndex !== index) });
  };

  return (
    <Screen>
      <ScrollBody>
        <AppText size={20} weight="extrabold">
          {title}
        </AppText>

        <Card>
          <SectionLabel>Photos</SectionLabel>
          <AppText size={12} muted>
            Add a profile photo first, then up to {MAX_PHOTOS} photos total. At least 1 is required.
          </AppText>
          <View style={styles.photoGrid}>
            {Array.from({ length: MAX_PHOTOS }, (_, index) => {
              const photo = profile.photos[index];
              const isNextEmpty = !photo && index === profile.photos.length;
              const locked = !photo && index > profile.photos.length;
              return (
                <View
                  key={index}
                  style={[
                    styles.photoSlot,
                    {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: photo ? theme.colors.border : theme.colors.primary,
                      opacity: locked ? 0.45 : 1,
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={photo ? `Replace photo ${index + 1}` : index === 0 ? "Add profile photo" : `Add photo ${index + 1}`}
                    disabled={locked || saving}
                    onPress={() => addPhoto(index)}
                    style={styles.photoPress}
                  >
                    {photo ? (
                      <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={styles.photoEmpty}>
                        <AppText size={22} weight="bold" primary>
                          +
                        </AppText>
                        <AppText size={10} weight="bold" muted style={styles.photoLabel}>
                          {index === 0 ? "Profile photo" : isNextEmpty ? "Add" : ""}
                        </AppText>
                      </View>
                    )}
                  </Pressable>
                  {photo ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove photo ${index + 1}`}
                      hitSlop={6}
                      onPress={() => removePhoto(index)}
                      style={[styles.removePhoto, { backgroundColor: theme.colors.background }]}
                    >
                      <AppText size={12} weight="bold">
                        ✕
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
          {photoError ? (
            <AppText size={13} weight="medium" color={theme.colors.danger}>
              {photoError}
            </AppText>
          ) : null}
        </Card>

        <Card>
          <SectionLabel>Basics</SectionLabel>
          <Field label="Full name">
            <Input value={profile.fullName} onChangeText={(fullName) => update({ fullName })} autoCapitalize="words" />
          </Field>
          <Field label="Age">
            <Input value={profile.age} onChangeText={(age) => update({ age: age.replace(/[^\d]/g, "") })} keyboardType="number-pad" maxLength={3} />
          </Field>
          <Field label="Gender">
            <View style={styles.chips}>
              {GENDERS.map((gender) => {
                const selected = profile.gender === gender;
                return (
                  <Pressable
                    key={gender}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => update({ gender })}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.colors.primaryTint : theme.colors.surfaceRaised,
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <AppText size={13} weight="bold" color={selected ? theme.colors.primary : theme.colors.muted}>
                      {gender}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Field>
          <Field label="Experience">
            <View style={styles.chips}>
              {experienceLevels.map((level) => {
                const selected = profile.experienceLevel === level;
                return (
                  <Pressable
                    key={level}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => update({ experienceLevel: level })}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.colors.primaryTint : theme.colors.surfaceRaised,
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                      },
                    ]}
                  >
                    <AppText size={13} weight="bold" color={selected ? theme.colors.primary : theme.colors.muted}>
                      {level}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </Field>
        </Card>

        <Card>
          <SectionLabel>Where you train</SectionLabel>
          <AppText size={12} muted>
            Saved so you can match by distance or with people at the same gym.
          </AppText>
          <Field label="Hometown">
            <Input value={profile.hometown} onChangeText={(hometown) => update({ hometown })} autoCapitalize="words" placeholder="City" />
          </Field>
          <Field label="Zip code">
            <Input
              value={profile.zipCode}
              onChangeText={(zipCode) => update({ zipCode: zipCode.replace(/[^\d-]/g, "") })}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="12345"
            />
          </Field>
          <Field label="Home gym">
            <Input value={profile.primaryGym} onChangeText={(primaryGym) => update({ primaryGym })} placeholder="Gym name" />
          </Field>
        </Card>

        <Card>
          <SectionLabel>About me</SectionLabel>
          <Input
            multiline
            value={profile.about}
            onChangeText={(about) => update({ about: about.slice(0, ABOUT_LIMIT) })}
            placeholder="A short note about how you like to train."
            maxLength={ABOUT_LIMIT}
          />
          <AppText size={11} muted>
            {profile.about.length}/{ABOUT_LIMIT}
          </AppText>
        </Card>

        <Card>
          <SectionLabel>Lifts</SectionLabel>
          <View style={styles.liftRow}>
            <LiftField label="Bench" value={profile.bench} onPress={() => setActiveLift("bench")} />
            <LiftField label="Squat" value={profile.squat} onPress={() => setActiveLift("squat")} />
            <LiftField label="Deadlift" value={profile.deadlift} onPress={() => setActiveLift("deadlift")} />
          </View>
          <Field label="Lift of your choice">
            <Input
              value={profile.customLiftName}
              onChangeText={(customLiftName) => update({ customLiftName })}
              placeholder="Overhead press"
              autoCapitalize="words"
            />
          </Field>
          <LiftField label="Weight" value={profile.customLift} onPress={() => setActiveLift("customLift")} />
        </Card>

        {error ? (
          <AppText size={13} weight="medium" color={theme.colors.danger}>
            {error}
          </AppText>
        ) : null}

        <PrimaryButton disabled={saving} onPress={onSave}>
          {saving ? "Saving..." : "Save profile"}
        </PrimaryButton>

        <SecondaryButton height={44} fontSize={13} onPress={nav.signOut}>
          Sign Out
        </SecondaryButton>
      </ScrollBody>

      <Modal animationType="fade" transparent visible={activeLift !== null} onRequestClose={() => setActiveLift(null)}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.colors.scrim }]}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={styles.modalHeader}>
              <AppText size={15} weight="extrabold">
                Select weight
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setActiveLift(null)}>
                <AppText size={18} weight="bold" muted>
                  ✕
                </AppText>
              </Pressable>
            </View>
            <FlatList
              data={WEIGHTS}
              keyExtractor={(item) => item}
              style={styles.weightList}
              renderItem={({ item }) => {
                const selected = activeLift !== null && profile[activeLift] === item;
                return (
                  <Pressable
                    onPress={() => {
                      if (activeLift) update({ [activeLift]: item });
                      setActiveLift(null);
                    }}
                    style={[styles.weightItem, selected && { backgroundColor: theme.colors.surfaceRaised }]}
                  >
                    <AppText weight={selected ? "bold" : "medium"} primary={selected}>
                      {item}
                    </AppText>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function LiftField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <View style={styles.liftField}>
      <AppText size={12} weight="bold" muted upper>
        {label}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={[styles.liftButton, { backgroundColor: theme.colors.surfaceRaised }]}
      >
        <AppText weight="bold">{value}</AppText>
        <AppText size={10} primary>
          ▼
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoSlot: {
    aspectRatio: 1,
    borderRadius: 14,
    borderStyle: "dashed",
    borderWidth: 1,
    overflow: "hidden",
    width: "31%",
  },
  photoPress: {
    flex: 1,
  },
  photoEmpty: {
    alignItems: "center",
    flex: 1,
    gap: 2,
    justifyContent: "center",
  },
  photoLabel: {
    textAlign: "center",
  },
  removePhoto: {
    alignItems: "center",
    borderRadius: 10,
    height: 22,
    justifyContent: "center",
    position: "absolute",
    right: 6,
    top: 6,
    width: 22,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  liftRow: {
    flexDirection: "row",
    gap: 8,
  },
  liftField: {
    flex: 1,
    gap: 6,
  },
  liftButton: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    height: 44,
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  modalOverlay: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1,
    height: "60%",
    maxWidth: 340,
    padding: 16,
    width: "100%",
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  weightList: {
    flex: 1,
  },
  weightItem: {
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 12,
  },
});
