export type GymPlace = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

function roundCoordinate(value: number) {
  return Math.round(value * 10000) / 10000;
}

function milesBetween(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(fromLatitude)) * Math.cos(toRadians(toLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function compactName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function namesMatch(typed: string, found: string) {
  const query = compactName(typed);
  const place = compactName(found);
  if (query.length < 3 || place.length < 3) return false;
  if (query === place) return true;
  return query.length >= 5 && (place.startsWith(query) || query.startsWith(place));
}

function addressFor(place: {
  housenumber?: string;
  street?: string;
  city?: string;
  town?: string;
  district?: string;
  state?: string;
}) {
  const street = [place.housenumber, place.street].filter(Boolean).join(" ");
  const city = place.city || place.town || place.district || "";
  return [street, city, place.state].filter(Boolean).join(", ");
}

type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    district?: string;
    locality?: string;
    state?: string;
    countrycode?: string;
  };
};

async function photonSearch(
  query: string,
  near: { latitude: number; longitude: number },
  limit: number,
  span = { longitude: 0.45, latitude: 0.35 },
) {
  const bbox = [
    near.longitude - span.longitude,
    near.latitude - span.latitude,
    near.longitude + span.longitude,
    near.latitude + span.latitude,
  ].join(",");
  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}` +
    `&lat=${near.latitude}&lon=${near.longitude}&bbox=${bbox}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not search that place. Check your connection and try again.");
  const body = (await response.json()) as { features?: PhotonFeature[] };
  return body.features ?? [];
}

function placeFromFeature(feature: PhotonFeature, near: { latitude: number; longitude: number }, maxMiles: number): GymPlace | null {
  const properties = feature.properties;
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  if (!properties || properties.countrycode !== "US") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (milesBetween(near.latitude, near.longitude, latitude, longitude) > maxMiles) return null;
  const address = addressFor(properties);
  if (!address) return null;
  return {
    id: `${properties.osm_type ?? "place"}:${properties.osm_id ?? address}`,
    name: properties.name?.trim() || address,
    address,
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
  };
}

function uniquePlaces(places: GymPlace[]) {
  const seen = new Set<string>();
  return places.filter((place) => {
    const key = `${place.name}|${place.address}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchGymsByName(name: string, near: { latitude: number; longitude: number }): Promise<GymPlace[]> {
  const gymName = name.trim();
  if (gymName.length < 2) return [];

  const features = await photonSearch(gymName, near, 12);
  const gyms = features.flatMap((feature) => {
    const place = placeFromFeature(feature, near, 25);
    if (!place || !namesMatch(gymName, place.name)) return [];
    return [place];
  });
  return uniquePlaces(gyms).sort((left, right) => {
    const leftNumber = /\d/.test(left.address) ? 0 : 1;
    const rightNumber = /\d/.test(right.address) ? 0 : 1;
    return leftNumber - rightNumber;
  });
}

const townKinds = new Set(["city", "town", "village", "hamlet", "suburb", "locality", "municipality", "administrative"]);

async function lookupTown(town: string, near: { latitude: number; longitude: number } | null) {
  const bias = near
    ? `&lat=${near.latitude}&lon=${near.longitude}&bbox=${[near.longitude - 1, near.latitude - 0.8, near.longitude + 1, near.latitude + 0.8].join(",")}`
    : "";
  const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(town)}${bias}&limit=8`);
  if (!response.ok) throw new Error("Could not look up that town. Check your connection and try again.");
  const body = (await response.json()) as { features?: PhotonFeature[] };
  const matches = (body.features ?? []).flatMap((feature) => {
    const properties = feature.properties;
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    if (!properties?.name || properties.countrycode !== "US") return [];
    if (!namesMatch(town, properties.name)) return [];
    const isTown = properties.osm_key === "place" || properties.osm_key === "boundary" || townKinds.has(properties.osm_value ?? "");
    if (!isTown || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const distance = near ? milesBetween(near.latitude, near.longitude, latitude, longitude) : 0;
    const rank = properties.osm_key === "place" ? 0 : 1;
    return [{ name: properties.name, latitude, longitude, distance, rank }];
  });
  matches.sort((left, right) => left.rank - right.rank || left.distance - right.distance);
  return matches[0] ?? null;
}

export async function searchStreetAddresses(
  query: string,
  town: string,
  near: { latitude: number; longitude: number } | null,
): Promise<GymPlace[]> {
  const street = query.trim();
  const townName = town.trim();
  if (street.length < 3 || townName.length < 2) return [];

  const center = await lookupTown(townName, near);
  if (!center) throw new Error("That town was not found.");

  const features = await photonSearch(`${street}, ${center.name}`, center, 8, { longitude: 0.2, latitude: 0.16 });
  const seen = new Set<string>();
  const places: GymPlace[] = [];
  for (const feature of features) {
    const house = feature.properties?.housenumber;
    const road = feature.properties?.street;
    const state = feature.properties?.state;
    const place = placeFromFeature(feature, center, 12);
    if (!house || !road || !place) continue;
    const key = `${house}|${road}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const streetLine = `${house} ${road}`;
    places.push({
      ...place,
      name: streetLine,
      address: [streetLine, center.name, state].filter(Boolean).join(", "),
    });
  }
  return places;
}
