import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { WorkoutHandshake } from "@/components/workout-handshake";
import { AppText, Card, PrimaryButton, Screen, SecondaryButton, TitleBar } from "@/components/ui";
import {
  discoverSetupMessage,
  fetchDiscoverProfiles,
  formatDistance,
  matchesDiscoverFilters,
  publishDiscoverProfile,
  type DiscoverCandidate,
} from "@/lib/discover";
import { isDiscoverTester, listConnections, sendMatchRequest } from "@/lib/matches";
import { blockedUserIds } from "@/lib/safety";
import type { UserProfile } from "@/lib/profile";
import { useNavigation } from "@/navigation";
import { DiscoverFiltersScreen } from "@/screens/discover-filters";
import { ProfilePreview } from "@/screens/profile";
import { useAppData } from "@/state/app-data";

export function DiscoverScreen({ profile }: { profile: UserProfile }) {
  const nav = useNavigation();
  const { discoverFilters, updateDiscoverFilters, reviewed, blocked, conversations, invites, review } = useAppData();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reviewingSkipped, setReviewingSkipped] = useState(false);
  const [skippedIndex, setSkippedIndex] = useState(0);
  const [candidates, setCandidates] = useState<DiscoverCandidate[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [handshake, setHandshake] = useState<{ id: string; name: string } | null>(null);
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
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
      const [people, connections, blocked] = await Promise.all([
        fetchDiscoverProfiles(),
        listConnections().catch(() => []),
        blockedUserIds(),
      ]);
      if (!active) return;
      setCandidates(people);
      setRequestedIds(connections.map((person) => person.userId));
      setBlockedIds([...blocked]);
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
    () => new Set([...reviewed, ...blocked, ...blockedIds, ...conversations.map((item) => item.partnerId), ...invites.map((item) => item.partnerId)]),
    [reviewed, blocked, blockedIds, conversations, invites],
  );

  const queue = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          !hidden.has(candidate.id) && !requestedIds.includes(candidate.id) && matchesDiscoverFilters(candidate, discoverFilters, profile),
      ),
    [candidates, hidden, requestedIds, discoverFilters, profile],
  );

  const skipped = useMemo(
    () =>
      candidates.filter((candidate) => {
        if (!reviewed.includes(candidate.id) || requestedIds.includes(candidate.id)) return false;
        if (blocked.includes(candidate.id) || blockedIds.includes(candidate.id)) return false;
        if (conversations.some((item) => item.partnerId === candidate.id)) return false;
        if (invites.some((item) => item.partnerId === candidate.id)) return false;
        return matchesDiscoverFilters(candidate, discoverFilters, profile);
      }),
    [candidates, reviewed, requestedIds, blocked, blockedIds, conversations, invites, discoverFilters, profile],
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

  const current = reviewingSkipped ? skipped[skippedIndex] : queue[0];
  const needsZip = profile.latitude == null || profile.longitude == null;
  const filtersButton = (
    <SecondaryButton height={36} fontSize={13} onPress={() => setFiltersOpen(true)} style={styles.filters}>
      Filters
    </SecondaryButton>
  );

  return (
    <Screen>
      {reviewingSkipped ? (
        <TitleBar title="Skipped" onBack={() => setReviewingSkipped(false)} right={filtersButton} />
      ) : (
        <View style={styles.bar}>
          <AppText size={20} weight="extrabold">
            Discover
          </AppText>
          {filtersButton}
        </View>
      )}

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
              <SecondaryButton
                onPress={() => {
                  if (reviewingSkipped) {
                    setSkippedIndex((index) => index + 1);
                    return;
                  }
                  review(current.id, false);
                }}
              >
                {reviewingSkipped ? "Next" : "Skip"}
              </SecondaryButton>
            </Card>
          }
        />
      ) : (
        <Card style={styles.notice}>
          {reviewingSkipped ? (
            <>
              <AppText size={18} weight="extrabold">
                That's everyone you skipped
              </AppText>
              <AppText muted>They stay out of Discover. You can look through them again anytime.</AppText>
              <PrimaryButton onPress={() => setReviewingSkipped(false)}>Back to Discover</PrimaryButton>
            </>
          ) : skipped.length > 0 ? (
            <>
              <AppText size={18} weight="extrabold">
                You've seen everyone nearby
              </AppText>
              <AppText muted>Look through people you skipped. They will not show up in Discover again.</AppText>
              <PrimaryButton
                onPress={() => {
                  setSkippedIndex(0);
                  setReviewingSkipped(true);
                }}
              >
                {`Look at skipped (${skipped.length})`}
              </PrimaryButton>
              <SecondaryButton onPress={() => setFiltersOpen(true)}>Open filters</SecondaryButton>
            </>
          ) : (
            <>
              <AppText size={18} weight="extrabold">
                No one fits these filters
              </AppText>
              <AppText muted>Widen the distance, age, or other filters to see more profiles.</AppText>
              <PrimaryButton onPress={() => setFiltersOpen(true)}>Open filters</PrimaryButton>
            </>
          )}
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
