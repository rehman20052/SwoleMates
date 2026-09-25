import { useEffect, useState, type ReactNode } from "react";
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
import { dayTimes, MIN_PROFILE_PROMPTS, photoCaptionGroups, PROMPT_ANSWER_LIMIT, profileGoals, profilePromptGroups, profilePromptOptions, weekDays, type ProfileGender, type ProfilePromptAnswer, type UserProfile } from "@/lib/profile";
import { useNavigation } from "@/navigation";
import { useAppTheme } from "@/theme";
import { lookupUsZip } from "@/lib/zip-location";
import { searchGymsByName, searchStreetAddresses, type GymPlace } from "@/lib/gym-location";

const MAX_PHOTOS = 6;
const ABOUT_LIMIT = 280;
const WEIGHTS = ["N/A", ...Array.from({ length: 200 }, (_, index) => `${(index + 1) * 5} lbs`)];
const GENDERS: readonly Exclude<ProfileGender, "">[] = ["Male", "Female", "Other"];

type LiftField = "bench" | "squat" | "deadlift" | "customLift";

type PickerChoice =
  | { id: string; kind: "label"; text: string }
  | { id: string; kind: "choice"; text: string; value: string };

function pickerChoices(picker: { kind: "caption" | "prompt"; index: number } | null, prompts: ProfilePromptAnswer[]): PickerChoice[] {
  if (!picker) return [];
  const groups = picker.kind === "caption" ? photoCaptionGroups : profilePromptGroups;
  const used = new Set(
    picker.kind === "prompt" ? prompts.flatMap((row, index) => (index === picker.index || !row.prompt ? [] : [row.prompt])) : [],
  );
  const rows: PickerChoice[] = [];
  if (picker.kind === "caption") rows.push({ id: "none", kind: "choice", text: "No caption", value: "" });
  for (const group of groups) {
    const options = group.options.filter((option) => !used.has(option));
    if (options.length === 0) continue;
    rows.push({ id: `label-${group.title}`, kind: "label", text: group.title });
    for (const option of options) rows.push({ id: option, kind: "choice", text: option, value: option });
  }
  return rows;
}

type ProfileScreenProps = {
  profile: UserProfile;
  saving: boolean;
  error: string | null;
  title?: string;
  initialMode?: "edit" | "view";
  onChange: (profile: UserProfile) => void;
  onSave: () => Promise<boolean>;
};

export function ProfileScreen({ profile, saving, error, title = "Edit Profile", initialMode = "view", onChange, onSave }: ProfileScreenProps) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [activeLift, setActiveLift] = useState<LiftField | null>(null);
  const [picker, setPicker] = useState<{ kind: "caption" | "prompt"; index: number } | null>(null);
  const [mode, setMode] = useState<"edit" | "view">(initialMode);
  const [zipPlace, setZipPlace] = useState<string | null>(null);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [zipPoint, setZipPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [streetQuery, setStreetQuery] = useState(profile.gymAddress);
  const [gymTown, setGymTown] = useState("");
  const [gymResults, setGymResults] = useState<GymPlace[]>([]);
  const [addressResults, setAddressResults] = useState<GymPlace[]>([]);
  const [gymStatus, setGymStatus] = useState<string | null>(null);
  const [addressStatus, setAddressStatus] = useState<string | null>(null);

  useEffect(() => {
    const zip = profile.zipCode.trim();
    if (!/^\d{5}(-\d{4})?$/.test(zip)) {
      setZipPlace(null);
      setZipPoint(null);
      setZipStatus(null);
      return;
    }

    let active = true;
    setZipStatus("Checking that zip code...");
    lookupUsZip(zip)
      .then((place) => {
        if (!active) return;
        if (!place) {
          setZipPlace(null);
          setZipPoint(null);
          setZipStatus("That zip code was not found.");
          return;
        }
        setZipPlace([place.placeName, place.state].filter(Boolean).join(", "));
        setZipPoint({ latitude: place.latitude, longitude: place.longitude });
        setZipStatus(null);
      })
      .catch(() => {
        if (!active) return;
        setZipPlace(null);
        setZipPoint(null);
        setZipStatus("Could not look up that zip code.");
      });

    return () => {
      active = false;
    };
  }, [profile.zipCode]);

  useEffect(() => {
    const gymName = profile.primaryGym.trim();
    const pinned = profile.gymLatitude != null && profile.gymLongitude != null;
    if (pinned || streetQuery.trim() || gymName.length < 2) {
      setGymResults([]);
      setGymStatus(null);
      return;
    }
    if (!zipPoint) {
      setGymResults([]);
      setGymStatus("Add your zip code first so we can look near you.");
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setGymStatus("Searching gyms...");
      searchGymsByName(gymName, zipPoint)
        .then((gyms) => {
          if (!active) return;
          setGymResults(gyms);
          setGymStatus(gyms.length > 0 ? null : "That gym is not listed yet. Enter the street address and town below.");
        })
        .catch((error: unknown) => {
          if (!active) return;
          setGymResults([]);
          setGymStatus(error instanceof Error ? error.message : "Could not search gyms.");
        });
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [profile.primaryGym, profile.gymLatitude, profile.gymLongitude, streetQuery, zipPoint]);

  useEffect(() => {
    const street = streetQuery.trim();
    const town = gymTown.trim();
    const pinned = profile.gymLatitude != null && profile.gymLongitude != null;
    if (pinned || street.length < 3 || town.length < 2) {
      setAddressResults([]);
      setAddressStatus(null);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setAddressStatus("Searching addresses...");
      searchStreetAddresses(street, town, zipPoint)
        .then((places) => {
          if (!active) return;
          setAddressResults(places);
          setAddressStatus(places.length > 0 ? null : `No matching address in ${town}.`);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setAddressResults([]);
          setAddressStatus(error instanceof Error ? error.message : "Could not search that address.");
        });
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [streetQuery, gymTown, profile.gymLatitude, profile.gymLongitude, zipPoint]);

  const update = (patch: Partial<UserProfile>) => onChange({ ...profile, ...patch });

  const addPhoto = async (index: number) => {
    setPhotoError(null);
    try {
      const photo = await pickProfilePhoto();
      if (!photo) return;
      const photos = [...profile.photos];
      const photoCaptions = [...(profile.photoCaptions ?? [])];
      if (index < photos.length) {
        photos[index] = photo;
      } else {
        photos.push(photo);
        photoCaptions.push("");
      }
      update({ photos: photos.slice(0, MAX_PHOTOS), photoCaptions: photoCaptions.slice(0, photos.length) });
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Could not add that photo.");
    }
  };

  const removePhoto = (index: number) => {
    update({
      photos: profile.photos.filter((_, photoIndex) => photoIndex !== index),
      photoCaptions: (profile.photoCaptions ?? []).filter((_, photoIndex) => photoIndex !== index),
    });
  };

  const promptRows = () => {
    const rows = (profile.prompts ?? []).map((row) => ({ ...row }));
    while (rows.length < MIN_PROFILE_PROMPTS) rows.push({ prompt: "", answer: "" });
    return rows;
  };

  const updatePrompt = (index: number, patch: Partial<ProfilePromptAnswer>) => {
    const rows = promptRows();
    rows[index] = { ...rows[index], ...patch };
    update({ prompts: rows });
  };

  return (
    <Screen>
      {mode === "view" ? (
        <ProfilePreview profile={profile} mode={mode} onChangeMode={setMode} />
      ) : (
      <>
      <View style={styles.modeBar}>
        {(
          [
            ["edit", "Edit"],
            ["view", "View profile"],
          ] as const
        ).map(([value, label]) => {
          const selected = mode === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setMode(value)}
              style={[
                styles.modeTab,
                {
                  backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceRaised,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                },
              ]}
            >
              <AppText size={13} weight="extrabold" color={selected ? theme.colors.primaryText : theme.colors.muted}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

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
          {profile.photos.length > 0 ? (
            <View style={styles.promptList}>
              <AppText size={12} muted>
                Add a caption to a photo if you want. It shows at the top of that photo.
              </AppText>
              {profile.photos.map((_, index) => (
                <Field key={index} label={index === 0 ? "Profile photo caption" : `Photo ${index + 1} caption`}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPicker({ kind: "caption", index })}
                    style={[styles.selector, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}
                  >
                    <AppText size={13} weight="semibold" muted={!profile.photoCaptions?.[index]} style={styles.selectorText}>
                      {profile.photoCaptions?.[index] || "No caption"}
                    </AppText>
                    <AppText size={12} weight="bold" muted>
                      ▾
                    </AppText>
                  </Pressable>
                </Field>
              ))}
            </View>
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
          <Field label="Goals">
            <AppText size={12} muted>
              Pick any that fit. You can choose more than one.
            </AppText>
            <ChoiceChips
              options={profileGoals}
              selected={profile.selectedGoals}
              onToggle={(goal) => update({ selectedGoals: toggleChoice(profile.selectedGoals, goal, profileGoals) })}
            />
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
            <AppText size={12} muted>
              Used to match people near you. It is saved as a location and is not shown on your profile.
            </AppText>
            {zipPlace ? (
              <AppText size={13} weight="semibold" primary>
                {zipPlace}
              </AppText>
            ) : zipStatus ? (
              <AppText size={13} weight="medium" color={zipStatus.startsWith("Checking") ? theme.colors.muted : theme.colors.danger}>
                {zipStatus}
              </AppText>
            ) : null}
          </Field>
          <Field label="Gym name">
            <Input
              value={profile.primaryGym}
              onChangeText={(primaryGym) => {
                setStreetQuery("");
                setGymTown("");
                setAddressResults([]);
                setAddressStatus(null);
                update({ primaryGym, gymAddress: "", gymLatitude: null, gymLongitude: null });
              }}
              placeholder="Enter gym name"
              autoCapitalize="words"
            />
            <AppText size={12} muted>
              Select your gym from the results to save its location.
            </AppText>
            {gymResults.length > 0 ? (
              <View style={styles.gymResults}>
                {gymResults.map((gym) => (
                  <Pressable
                    key={gym.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${gym.name}, ${gym.address}`}
                    onPress={() => {
                      setStreetQuery(gym.address);
                      update({
                        primaryGym: profile.primaryGym.trim() || gym.name,
                        gymAddress: gym.address,
                        gymLatitude: gym.latitude,
                        gymLongitude: gym.longitude,
                      });
                      setGymResults([]);
                      setGymStatus(null);
                      setAddressResults([]);
                      setAddressStatus(null);
                    }}
                    style={[styles.gymResult, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}
                  >
                    <AppText size={14} weight="bold">
                      {gym.name}
                    </AppText>
                    {gym.address ? (
                      <AppText size={12} muted>
                        {gym.address}
                      </AppText>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : gymStatus ? (
              <AppText size={13} weight="medium" color={gymStatus.startsWith("Searching") || gymStatus.startsWith("That gym") || gymStatus.startsWith("Add your") ? theme.colors.muted : theme.colors.danger}>
                {gymStatus}
              </AppText>
            ) : null}
          </Field>
          <Field label="Street address">
            <Input
              value={streetQuery}
              onChangeText={(street) => {
                setStreetQuery(street);
                setGymResults([]);
                setGymStatus(null);
                update({ gymAddress: "", gymLatitude: null, gymLongitude: null });
              }}
              placeholder="Enter street address"
              autoCapitalize="words"
            />
          </Field>
          <Field label="Town">
            <Input
              value={gymTown}
              onChangeText={(town) => {
                setGymTown(town);
                setGymResults([]);
                setGymStatus(null);
                update({ gymAddress: "", gymLatitude: null, gymLongitude: null });
              }}
              placeholder="Enter town"
              autoCapitalize="words"
            />
            {profile.gymAddress.trim() && profile.gymLatitude != null ? (
              <AppText size={13} weight="semibold" primary>
                Saved location: {profile.gymAddress}
              </AppText>
            ) : (
              <AppText size={12} muted>
                If your gym is not listed, enter the street address and town, then select the location.
              </AppText>
            )}
            {addressResults.length > 0 ? (
              <View style={styles.gymResults}>
                {addressResults.map((place) => (
                  <Pressable
                    key={place.id}
                    accessibilityRole="button"
                    accessibilityLabel={place.address}
                    onPress={() => {
                      setStreetQuery(place.name);
                      setGymTown(gymTown.trim());
                      update({
                        gymAddress: place.address,
                        gymLatitude: place.latitude,
                        gymLongitude: place.longitude,
                      });
                      setAddressResults([]);
                      setAddressStatus(null);
                    }}
                    style={[styles.gymResult, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}
                  >
                    <AppText size={14} weight="bold">
                      {place.address}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            ) : addressStatus ? (
              <AppText size={13} weight="medium" color={addressStatus.startsWith("Searching") || addressStatus.startsWith("No matching") || addressStatus.startsWith("That town") ? theme.colors.muted : theme.colors.danger}>
                {addressStatus}
              </AppText>
            ) : null}
          </Field>
        </Card>

        <Card>
          <SectionLabel>Availability</SectionLabel>
          <AppText size={12} muted>
            Choose the days and times you usually train.
          </AppText>
          <Field label="Days">
            <ChoiceChips
              options={weekDays}
              selected={profile.availabilityDays}
              onToggle={(day) => update({ availabilityDays: toggleChoice(profile.availabilityDays, day, weekDays) })}
            />
          </Field>
          <Field label="Time">
            <ChoiceChips
              options={dayTimes}
              selected={profile.availabilityTimes}
              onToggle={(time) => update({ availabilityTimes: toggleChoice(profile.availabilityTimes, time, dayTimes) })}
            />
          </Field>
        </Card>

        <Card>
          <SectionLabel>About me</SectionLabel>
          <AppText size={12} muted>
            Write about yourself and who you are. It does not have to be about the gym.
          </AppText>
          <Input
            multiline
            value={profile.about}
            onChangeText={(about) => update({ about: about.slice(0, ABOUT_LIMIT) })}
            placeholder="Who you are, in your own words."
            maxLength={ABOUT_LIMIT}
          />
          <AppText size={11} muted>
            {profile.about.length}/{ABOUT_LIMIT}
          </AppText>
        </Card>

        <Card>
          <SectionLabel>Prompts</SectionLabel>
          <AppText size={12} muted>
            Pick a prompt and answer it. At least {MIN_PROFILE_PROMPTS} are required.
          </AppText>
          <View style={styles.promptList}>
            {promptRows().map((row, index) => (
              <View key={index} style={styles.promptRow}>
                <View style={styles.promptHeader}>
                  <AppText size={12} weight="bold" muted upper>
                    Prompt {index + 1}
                  </AppText>
                  {promptRows().length > MIN_PROFILE_PROMPTS ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove prompt ${index + 1}`} onPress={() => update({ prompts: promptRows().filter((_, rowIndex) => rowIndex !== index) })}>
                      <AppText size={12} weight="bold" color={theme.colors.danger}>
                        Remove
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPicker({ kind: "prompt", index })}
                  style={[styles.selector, { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border }]}
                >
                  <AppText size={13} weight="semibold" muted={!row.prompt} style={styles.selectorText}>
                    {row.prompt || "Choose a prompt"}
                  </AppText>
                  <AppText size={12} weight="bold" muted>
                    ▾
                  </AppText>
                </Pressable>
                <Input
                  multiline
                  value={row.answer}
                  onChangeText={(answer) => updatePrompt(index, { answer: answer.slice(0, PROMPT_ANSWER_LIMIT) })}
                  placeholder="Your answer"
                  maxLength={PROMPT_ANSWER_LIMIT}
                />
                <AppText size={11} muted>
                  {row.answer.length}/{PROMPT_ANSWER_LIMIT}
                </AppText>
              </View>
            ))}
            {promptRows().length < profilePromptOptions.length ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => update({ prompts: [...promptRows(), { prompt: "", answer: "" }] })}
                style={[styles.addPrompt, { borderColor: theme.colors.border }]}
              >
                <AppText size={13} weight="bold" primary>
                  Add another prompt
                </AppText>
              </Pressable>
            ) : null}
          </View>
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

        <PrimaryButton
          disabled={saving}
          onPress={() => {
            void onSave().then((saved) => {
              if (saved) setMode("view");
            });
          }}
        >
          {saving ? "Saving..." : "Save profile"}
        </PrimaryButton>

        <SecondaryButton height={44} fontSize={13} onPress={nav.signOut}>
          Sign Out
        </SecondaryButton>
      </ScrollBody>
      </>
      )}

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

      <Modal animationType="fade" transparent visible={picker !== null} onRequestClose={() => setPicker(null)}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.colors.scrim }]}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={styles.modalHeader}>
              <AppText size={15} weight="extrabold">
                {picker?.kind === "caption" ? "Photo caption" : "Choose a prompt"}
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setPicker(null)}>
                <AppText size={18} weight="bold" muted>
                  ✕
                </AppText>
              </Pressable>
            </View>
            <FlatList
              data={pickerChoices(picker, promptRows())}
              keyExtractor={(item) => item.id}
              style={styles.weightList}
              renderItem={({ item }) => {
                if (item.kind === "label") {
                  return (
                    <AppText size={11} weight="bold" muted upper style={styles.optionLabel}>
                      {item.text}
                    </AppText>
                  );
                }
                const selected =
                  picker?.kind === "caption"
                    ? (profile.photoCaptions?.[picker.index] ?? "") === item.value
                    : picker?.kind === "prompt" && promptRows()[picker.index]?.prompt === item.value;
                return (
                  <Pressable
                    onPress={() => {
                      if (!picker) return;
                      if (picker.kind === "caption") {
                        const photoCaptions = profile.photos.map((_, index) => profile.photoCaptions?.[index] ?? "");
                        photoCaptions[picker.index] = item.value;
                        update({ photoCaptions });
                      } else {
                        updatePrompt(picker.index, { prompt: item.value });
                      }
                      setPicker(null);
                    }}
                    style={[styles.optionItem, selected && { backgroundColor: theme.colors.surfaceRaised }]}
                  >
                    <AppText size={14} weight={selected ? "bold" : "medium"} primary={selected}>
                      {item.value ? item.text : "No caption"}
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

function ModeTabs({
  mode,
  onChange,
  inset = true,
}: {
  mode: "edit" | "view";
  onChange: (mode: "edit" | "view") => void;
  inset?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <View style={[styles.modeBar, inset ? null : styles.previewTabs]}>
      {(
        [
          ["edit", "Edit"],
          ["view", "View profile"],
        ] as const
      ).map(([value, label]) => {
        const selected = mode === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(value)}
            style={[
              styles.modeTab,
              {
                backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceRaised,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
              },
            ]}
          >
            <AppText size={13} weight="extrabold" color={selected ? theme.colors.primaryText : theme.colors.muted}>
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProfilePreview({
  profile,
  mode = "view",
  onChangeMode,
  chrome = true,
  distanceLabel,
  footer,
}: {
  profile: UserProfile;
  mode?: "edit" | "view";
  onChangeMode?: (mode: "edit" | "view") => void;
  chrome?: boolean;
  distanceLabel?: string;
  footer?: ReactNode;
}) {
  const theme = useAppTheme();
  const nav = useNavigation();
  const [hero, ...morePhotos] = profile.photos;
  const headline = [profile.fullName.trim() || "Your name", profile.age.trim()].filter(Boolean).join(", ");
  const subtitle = [profile.experienceLevel, profile.gender].filter(Boolean).join(" • ");
  const facts = [distanceLabel, profile.hometown.trim(), profile.primaryGym.trim()].filter(Boolean);
  const days = profile.availabilityDays.join(", ");
  const times = profile.availabilityTimes.join(", ");
  const answered = (profile.prompts ?? []).filter((row) => row.prompt.trim() && row.answer.trim());
  const betweenPrompts = [
    <Card key="about">
      <SectionLabel>About</SectionLabel>
      <AppText weight="semibold" style={{ lineHeight: 22 }}>
        {profile.about.trim() || "No bio yet."}
      </AppText>
    </Card>,
    ...morePhotos.map((photo, index) => (
      <View key={`photo-${index}-${photo.slice(0, 24)}`} style={styles.hero}>
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
        {profile.photoCaptions?.[index + 1] ? <PhotoCaption text={profile.photoCaptions[index + 1]} /> : null}
      </View>
    )),
    <Card key="goals">
      <SectionLabel>Goals</SectionLabel>
      {profile.selectedGoals.length > 0 ? (
        <ReadOnlyChips values={profile.selectedGoals} />
      ) : (
        <AppText size={13} muted>
          No goals selected yet.
        </AppText>
      )}
    </Card>,
    <Card key="availability">
      <SectionLabel>Availability</SectionLabel>
      <View style={styles.liftRow}>
        <View style={styles.liftField}>
          <AppText size={12} weight="bold" muted upper>
            Days
          </AppText>
          <AppText weight="bold">{days || "Not set"}</AppText>
        </View>
        <View style={styles.liftField}>
          <AppText size={12} weight="bold" muted upper>
            Time
          </AppText>
          <AppText weight="bold">{times || "Not set"}</AppText>
        </View>
      </View>
    </Card>,
    <Card key="lifts">
      <SectionLabel>Lifts</SectionLabel>
      <View style={styles.liftRow}>
        <PreviewStat label="Bench" value={profile.bench} />
        <PreviewStat label="Squat" value={profile.squat} />
        <PreviewStat label="Deadlift" value={profile.deadlift} />
      </View>
      {profile.customLiftName.trim() ? (
        <PreviewStat label={profile.customLiftName.trim()} value={profile.customLift} />
      ) : null}
    </Card>,
    <Card key="gym">
      <SectionLabel>Gym</SectionLabel>
      <AppText size={16} weight="extrabold">
        {profile.primaryGym.trim() || "Home gym not set"}
      </AppText>
      <AppText size={13} muted>
        {profile.gymAddress.trim() || profile.hometown.trim() || "Add a hometown so people nearby can find you."}
      </AppText>
    </Card>,
  ];
  const previewBlocks = [];
  let promptIndex = 0;
  let blockIndex = 0;
  if (betweenPrompts[0]) previewBlocks.push(betweenPrompts[blockIndex++]);
  while (promptIndex < answered.length || blockIndex < betweenPrompts.length) {
    if (promptIndex < answered.length) {
      const row = answered[promptIndex];
      previewBlocks.push(<PromptAnswer key={row.prompt} prompt={row.prompt} answer={row.answer} />);
      promptIndex += 1;
    }
    if (blockIndex < betweenPrompts.length) previewBlocks.push(betweenPrompts[blockIndex++]);
  }

  return (
    <ScrollBody style={{ flex: 1 }} contentContainerStyle={styles.previewScroll}>
      {chrome && onChangeMode ? <ModeTabs mode={mode} onChange={onChangeMode} inset={false} /> : null}
      <View style={styles.hero}>
        {hero ? (
          <Image source={{ uri: hero }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.heroEmpty, { backgroundColor: theme.colors.surfaceRaised }]}>
            <AppText size={48} weight="black" primary>
              {(profile.fullName.trim() || "?").slice(0, 1).toUpperCase()}
            </AppText>
          </View>
        )}
        <View style={[StyleSheet.absoluteFill, styles.heroShade]} />
        <View style={styles.heroDetails}>
          <AppText size={28} weight="black">
            {headline}
          </AppText>
          {subtitle ? (
            <AppText weight="semibold" primary>
              {subtitle}
            </AppText>
          ) : null}
          {facts.length > 0 ? (
            <View style={styles.factRow}>
              {facts.map((fact) => (
                <View key={fact} style={[styles.fact, { backgroundColor: theme.colors.glass }]}>
                  <AppText size={12} weight="medium">
                    {fact}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        {profile.photoCaptions?.[0] ? <PhotoCaption text={profile.photoCaptions[0]} /> : null}
      </View>

      {previewBlocks}

      {footer}

      {chrome ? (
        <SecondaryButton height={44} fontSize={13} onPress={nav.signOut}>
          Sign Out
        </SecondaryButton>
      ) : null}
    </ScrollBody>
  );
}

function PromptAnswer({ prompt, answer }: { prompt: string; answer: string }) {
  return (
    <Card>
      <AppText size={13} weight="bold" primary>
        {prompt}
      </AppText>
      <AppText weight="semibold" style={{ lineHeight: 22 }}>
        {answer}
      </AppText>
    </Card>
  );
}

function PhotoCaption({ text }: { text: string }) {
  return (
    <View pointerEvents="none" style={styles.captionWrap}>
      <View style={styles.captionBadge}>
        <AppText size={13} weight="bold">
          {text}
        </AppText>
      </View>
    </View>
  );
}

function ReadOnlyChips({ values }: { values: string[] }) {
  const theme = useAppTheme();
  return (
    <View style={styles.chips}>
      {values.map((value) => (
        <View
          key={value}
          style={[styles.chip, { backgroundColor: theme.colors.primaryTint, borderColor: theme.colors.primary }]}
        >
          <AppText size={13} weight="bold" color={theme.colors.primary}>
            {value}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.liftField}>
      <AppText size={12} weight="bold" muted upper>
        {label}
      </AppText>
      <AppText weight="extrabold">{value}</AppText>
    </View>
  );
}

function toggleChoice(selected: string[], value: string, order: readonly string[]) {
  const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
  return order.filter((item) => next.includes(item));
}

function ChoiceChips({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onToggle(option)}
            style={[
              styles.chip,
              {
                backgroundColor: isSelected ? theme.colors.primaryTint : theme.colors.surfaceRaised,
                borderColor: isSelected ? theme.colors.primary : theme.colors.border,
              },
            ]}
          >
            <AppText size={13} weight="bold" color={isSelected ? theme.colors.primary : theme.colors.muted}>
              {option}
            </AppText>
          </Pressable>
        );
      })}
    </View>
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
  modeBar: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 4,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  previewTabs: {
    marginBottom: 10,
    paddingHorizontal: 0,
    paddingTop: 4,
  },
  previewScroll: {
    gap: 24,
    paddingBottom: 40,
    paddingTop: 8,
  },
  modeTab: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  hero: {
    borderRadius: 24,
    height: 420,
    overflow: "hidden",
  },
  captionWrap: {
    left: 14,
    position: "absolute",
    right: 14,
    top: 14,
  },
  captionBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(10, 10, 12, 0.72)",
    borderRadius: 12,
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  heroShade: {
    backgroundColor: "rgba(0, 0, 0, 0.28)",
  },
  heroDetails: {
    bottom: 0,
    gap: 4,
    left: 0,
    padding: 20,
    position: "absolute",
    right: 0,
  },
  factRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  fact: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
  optionItem: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  optionLabel: {
    paddingBottom: 4,
    paddingHorizontal: 8,
    paddingTop: 14,
  },
  selector: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectorText: {
    flex: 1,
  },
  promptList: {
    gap: 16,
  },
  promptRow: {
    gap: 8,
  },
  promptHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  gymResults: {
    gap: 8,
  },
  gymResult: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  addPrompt: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
  },
});
