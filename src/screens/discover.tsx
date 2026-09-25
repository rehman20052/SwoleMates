import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { WorkoutHandshake } from "@/components/workout-handshake";
import { AppText, Card, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";
import {
  discoverSetupMessage,
  fetchDiscoverProfiles,
  formatDistance,
  matchesDiscoverFilters,
  publishDiscoverProfile,
  type DiscoverCandidate,
} from "@/lib/discover";
import { isDiscoverTester, listConnections, sendMatchRequest } from "@/lib/matches";
import type { UserProfile } from "@/lib/profile";
import { useNavigation } from "@/navigation";
import { DiscoverFiltersScreen } from "@/screens/discover-filters";
import { ProfilePreview } from "@/screens/profile";
import { useAppData } from "@/state/app-data";

export function DiscoverScreen({ profile }: { profile: UserProfile }) {
  const nav = useNavigation();
  const { discoverFilters, updateDiscoverFilters, reviewed, blocked, conversations, invites, review } = useAppData();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [candidates, setCandidates] = useState<DiscoverCandidate[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [handshake, setHandshake] = useState<{ id: string; name: string } | null>(null);
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  const [matchError, setMatchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setMessage(null);

    const load = async () => {
      if (profile.fullName.trim()) {
        try {
          await publishDiscoverProfile(profile);
        } catch {
          // The list request below reports a missing table or a network problem.
        }
      }
      const [people, connections] = await Promise.all([
        fetchDiscoverProfiles(),
        listConnections().catch(() => []),
      ]);
      if (!active) return;
      setCandidates(people);
      setRequestedIds(connections.map((person) => person.userId));
      setStatus("ready");
    };

    load().catch((error: unknown) => {
      if (!active) return;
      setCandidates([]);
      setStatus("error");
      setMessage(discoverSetupMessage(error));
    });

    return () => {
      active = false;
    };
  }, [profile]);

  const hidden = useMemo(
    () => new Set([...reviewed, ...blocked, ...conversations.map((item) => item.partnerId), ...invites.map((item) => item.partnerId)]),
    [reviewed, blocked, conversations, invites],
  );

  const queue = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          !hidden.has(candidate.id) && !requestedIds.includes(candidate.id) && matchesDiscoverFilters(candidate, discoverFilters, profile),
      ),
    [candidates, hidden, requestedIds, discoverFilters, profile],
  );

  if (filtersOpen) {
    return (
      <DiscoverFiltersScreen
        filters={discoverFilters}
        profile={profile}
        onChange={updateDiscoverFilters}
        onClose={() => setFiltersOpen(false)}
      />
    );
  }

  const current = queue[0];
  const needsZip = profile.latitude == null || profile.longitude == null;

  return (
    <Screen>
      <View style={styles.bar}>
        <AppText size={20} weight="extrabold">
          Discover
        </AppText>
        <SecondaryButton height={36} fontSize={13} onPress={() => setFiltersOpen(true)} style={styles.filters}>
          Filters
        </SecondaryButton>
      </View>

      {status === "loading" ? (
        <Card style={styles.notice}>
          <AppText muted>Looking for people near you...</AppText>
        </Card>
      ) : status === "error" ? (
        <Card style={styles.notice}>
          <AppText weight="bold">{message}</AppText>
        </Card>
      ) : needsZip ? (
        <Card style={styles.notice}>
          <AppText size={18} weight="extrabold">
            Add your zip code
          </AppText>
          <AppText muted>Discover uses your saved zip to find people within the distance you choose.</AppText>
          <PrimaryButton onPress={() => nav.setTab("Profile")}>Edit your profile</PrimaryButton>
        </Card>
      ) : current ? (
        <ProfilePreview
          key={current.id}
          profile={current.profile}
          chrome={false}
          distanceLabel={formatDistance(current.distanceMiles)}
          footer={
            <Card padding={16} radius={18} gap={14}>
              <View style={{ gap: 4 }}>
                <AppText size={18} weight="extrabold">
                  Train with {current.profile.fullName.trim().split(/\s+/)[0]}?
                </AppText>
              </View>
              {matchError ? (
                <AppText size={13} color="#FF3B30">
                  {matchError}
                </AppText>
              ) : null}
              <PrimaryButton
                onPress={() => {
                  if (handshake) return;
                  setMatchError(null);
                  setHandshake({
                    id: current.id,
                    name: current.profile.fullName.trim().split(/\s+/)[0] || "them",
                  });
                }}
              >
                Work Out Together
              </PrimaryButton>
              <SecondaryButton onPress={() => review(current.id, false)}>Skip</SecondaryButton>
            </Card>
          }
        />
      ) : (
        <Card style={styles.notice}>
          <AppText size={18} weight="extrabold">
            No one fits these filters
          </AppText>
          <AppText muted>Widen the distance, age, or other filters to see more profiles.</AppText>
          <PrimaryButton onPress={() => setFiltersOpen(true)}>Open filters</PrimaryButton>
        </Card>
      )}
      {handshake ? (
        <WorkoutHandshake
          name={handshake.name}
          onDone={() => {
            const person = handshake;
            setHandshake(null);
            if (isDiscoverTester(person.id)) {
              review(person.id, true);
              return;
            }
            void sendMatchRequest(person.id)
              .then(() => {
                review(person.id, true);
                setRequestedIds((currentIds) => [...currentIds, person.id]);
              })
              .catch((error: unknown) => {
                setMatchError(error instanceof Error ? error.message : "Could not send that request.");
              });
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  filters: {
    paddingHorizontal: 16,
  },
  notice: {
    margin: 24,
  },
});
