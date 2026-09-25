export type ZipLocation = {
  zipCode: string;
  placeName: string;
  state: string;
  latitude: number;
  longitude: number;
};

function zipPrefix(zip: string) {
  return zip.trim().match(/^(\d{5})(?:-\d{4})?$/)?.[1] ?? null;
}

function roundCoordinate(value: number) {
  return Math.round(value * 10000) / 10000;
}

export async function lookupUsZip(zip: string): Promise<ZipLocation | null> {
  const prefix = zipPrefix(zip);
  if (!prefix) return null;

  const response = await fetch(`https://api.zippopotam.us/us/${prefix}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not look up that zip code. Check your connection and try again.");

  const body = (await response.json()) as {
    places?: { "place name"?: string; state?: string; latitude?: string; longitude?: string }[];
  };
  const place = body.places?.[0];
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  if (!place || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    zipCode: prefix,
    placeName: place["place name"]?.trim() || "Unknown place",
    state: place.state?.trim() || "",
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
}
