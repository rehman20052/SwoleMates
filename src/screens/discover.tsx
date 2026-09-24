import { ReactNode, useMemo } from "react";
import { View } from "react-native";

import { AppText, Card, PrimaryButton, Screen, SecondaryButton } from "@/components/ui";
import { firstName, partners } from "@/data/partners";
import { PartnerDetails } from "@/screens/partner-profile";
import { useAppData } from "@/state/app-data";

// One full profile at a time. The decision sits at the bottom, so people read
// the whole profile before choosing instead of swiping on a photo.
export function DiscoverScreen({ empty }: { empty: ReactNode }) {
  const { reviewed, blocked, preferences, review, conversations, invites } = useAppData();

  // New people only: skip anyone already reviewed, blocked, chatting, or invited.
  const queue = useMemo(() => {
    const maxDistance = preferences.distance * (preferences.expandScope ? 1.2 : 1);
    const known = new Set([
      ...reviewed,
      ...blocked,
      ...conversations.map((c) => c.partnerId),
      ...invites.map((i) => i.partnerId),
    ]);
    return partners.filter((partner) => !known.has(partner.id) && partner.distance <= maxDistance);
  }, [reviewed, blocked, conversations, invites, preferences.distance, preferences.expandScope]);

  const current = queue[0];

  if (!current) {
    return empty;
  }

  const name = firstName(current);

  return (
    <Screen>
      {/* Keyed by partner so each new profile starts scrolled to the top. */}
      <PartnerDetails
        key={current.id}
        partner={current}
        footer={
          <Card padding={16} radius={18} gap={14}>
            <View style={{ gap: 4 }}>
              <AppText size={18} weight="extrabold">
                Train with {name}?
              </AppText>
              <AppText size={13} muted>
                {name} gets a partner invite. You can chat once they accept.
              </AppText>
            </View>
            <PrimaryButton onPress={() => review(current.id, true)}>Work Out Together</PrimaryButton>
            <SecondaryButton onPress={() => review(current.id, false)}>Skip</SecondaryButton>
          </Card>
        }
      />
    </Screen>
  );
}
