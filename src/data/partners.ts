import { ImageSource } from "expo-image";

import { images } from "@/assets";

export type Lifts = {
  bench: number;
  squat: number;
  deadlift: number;
};

export type Partner = {
  id: string;
  name: string;
  age: number;
  gym: string;
  style: string;
  tags: string;
  distance: number;
  frequency: string;
  match: number;
  safety: number;
  reliability: number;
  lifts: Lifts;
  avatar: ImageSource;
  photos: ImageSource[];
  goals: { primary: string; focus: string; summary: string };
  experience: { years: string; style: string; summary: string };
  gymNote: string;
  availability: { days: string; bestTime: string; summary: string };
};

export const gyms = [
  "Gold's Gym Downtown",
  "LA Fitness Central",
  "Equinox West",
  "Crunch Midtown",
] as const;

export const workoutFocuses = ["Push", "Pull", "Legs", "Upper", "Full Body", "Cardio"] as const;
export type WorkoutFocus = (typeof workoutFocuses)[number];

export const experienceLevels = ["Beginner", "Intermediate", "Advanced", "Elite"] as const;

export const partners: Partner[] = [
  {
    id: "marcus",
    name: "Marcus Thorne",
    age: 27,
    gym: "Gold's Gym Downtown",
    style: "Powerlifting",
    tags: "Powerlifting • Strength",
    distance: 1.2,
    frequency: "4x / Week",
    match: 94,
    safety: 4.9,
    reliability: 98,
    lifts: { bench: 245, squat: 385, deadlift: 455 },
    avatar: images.marcusAvatar,
    photos: [images.marcusCard, images.marcusPhoto2, images.marcusPhoto3],
    goals: {
      primary: "Powerlifting",
      focus: "Strength",
      summary:
        "Building a consistent powerlifting routine and finding a reliable training partner for downtown sessions.",
    },
    experience: {
      years: "6 Years",
      style: "Powerlifting",
      summary:
        "Marcus has been lifting consistently since college and prefers structured powerlifting sessions with a focus on safety, form, and progressive overload.",
    },
    gymNote: "Preferred training spot for heavy sessions and meet prep.",
    availability: {
      days: "4x / Week",
      bestTime: "6:00 PM",
      summary: "Usually trains after work and prefers partners who can commit to a consistent weekly schedule.",
    },
  },
  {
    id: "serena",
    name: "Serena Wu",
    age: 24,
    gym: "LA Fitness Central",
    style: "Hypertrophy",
    tags: "Hypertrophy • HIIT",
    distance: 2.4,
    frequency: "5x / Week",
    match: 89,
    safety: 4.8,
    reliability: 95,
    lifts: { bench: 115, squat: 205, deadlift: 245 },
    avatar: images.serena,
    photos: [images.serena],
    goals: {
      primary: "Hypertrophy",
      focus: "Conditioning",
      summary: "Looking for a partner to push through high-volume hypertrophy blocks and weekly HIIT finishers.",
    },
    experience: {
      years: "3 Years",
      style: "Bodybuilding",
      summary: "Serena runs a 5-day hypertrophy split and likes partners who keep rest times honest.",
    },
    gymNote: "Trains here most mornings before class.",
    availability: {
      days: "5x / Week",
      bestTime: "7:00 AM",
      summary: "Early riser. Prefers morning sessions on weekdays.",
    },
  },
  {
    id: "devon",
    name: "Devon Carter",
    age: 29,
    gym: "Equinox West",
    style: "Olympic Lifting",
    tags: "Olympic Lifting • Strength",
    distance: 3.1,
    frequency: "3x / Week",
    match: 91,
    safety: 4.9,
    reliability: 93,
    lifts: { bench: 225, squat: 365, deadlift: 425 },
    avatar: images.devon,
    photos: [images.devon],
    goals: {
      primary: "Olympic Lifting",
      focus: "Power",
      summary: "Working on clean & jerk technique and looking for someone to film and spot heavy singles.",
    },
    experience: {
      years: "8 Years",
      style: "Weightlifting",
      summary: "Former collegiate athlete who now competes in local weightlifting meets.",
    },
    gymNote: "Has platform access and bumper plates.",
    availability: {
      days: "3x / Week",
      bestTime: "5:30 PM",
      summary: "Trains Monday, Wednesday, and Friday evenings.",
    },
  },
  {
    id: "jessica",
    name: "Jessica Alvarez",
    age: 26,
    gym: "Crunch Midtown",
    style: "HIIT",
    tags: "HIIT • Endurance",
    distance: 1.9,
    frequency: "4x / Week",
    match: 87,
    safety: 4.7,
    reliability: 92,
    lifts: { bench: 95, squat: 155, deadlift: 205 },
    avatar: images.jessica,
    photos: [images.jessica],
    goals: {
      primary: "Endurance",
      focus: "Fat Loss",
      summary: "Training for a spring half marathon while keeping two strength days a week.",
    },
    experience: {
      years: "4 Years",
      style: "Hybrid",
      summary: "Mixes running, circuits, and full-body lifting.",
    },
    gymNote: "Usually in the turf area for circuits.",
    availability: {
      days: "4x / Week",
      bestTime: "6:30 AM",
      summary: "Mornings before work, flexible on weekends.",
    },
  },
  {
    id: "brandon",
    name: "Brandon Vance",
    age: 31,
    gym: "Gold's Gym Downtown",
    style: "Bodybuilding",
    tags: "Bodybuilding • Strength",
    distance: 1.4,
    frequency: "6x / Week",
    match: 85,
    safety: 4.8,
    reliability: 90,
    lifts: { bench: 275, squat: 405, deadlift: 495 },
    avatar: images.brandon,
    photos: [images.brandon],
    goals: {
      primary: "Bodybuilding",
      focus: "Muscle Gain",
      summary: "Off-season bulk. Wants a spotter for heavy pressing days.",
    },
    experience: {
      years: "10 Years",
      style: "Bodybuilding",
      summary: "Competed twice in regional physique shows.",
    },
    gymNote: "Same gym as you. Usually by the dumbbell racks.",
    availability: {
      days: "6x / Week",
      bestTime: "8:00 PM",
      summary: "Late evenings, six days a week.",
    },
  },
  // Placeholder portraits until real profile photos come from the backend.
  mockPartner({
    id: "priya",
    name: "Priya Nair",
    age: 25,
    gym: "Equinox West",
    style: "CrossFit",
    tags: "CrossFit • Conditioning",
    distance: 2.8,
    frequency: "5x / Week",
    match: 88,
    photo: "https://randomuser.me/api/portraits/women/44.jpg",
    lifts: { bench: 115, squat: 205, deadlift: 255 },
    goal: "Wants a partner for early WODs and Olympic lift practice.",
  }),
  mockPartner({
    id: "tyler",
    name: "Tyler Brooks",
    age: 28,
    gym: "Gold's Gym Downtown",
    style: "Powerlifting",
    tags: "Powerlifting • Strength",
    distance: 1.6,
    frequency: "4x / Week",
    match: 86,
    photo: "https://randomuser.me/api/portraits/men/32.jpg",
    lifts: { bench: 265, squat: 405, deadlift: 485 },
    goal: "Peaking for a local meet and needs a reliable spotter.",
  }),
  mockPartner({
    id: "kenji",
    name: "Kenji Sato",
    age: 30,
    gym: "Crunch Midtown",
    style: "Calisthenics",
    tags: "Calisthenics • Mobility",
    distance: 3.4,
    frequency: "3x / Week",
    match: 84,
    photo: "https://randomuser.me/api/portraits/men/75.jpg",
    lifts: { bench: 185, squat: 225, deadlift: 315 },
    goal: "Working toward a muscle-up and front lever.",
  }),
  mockPartner({
    id: "aaliyah",
    name: "Aaliyah Grant",
    age: 27,
    gym: "LA Fitness Central",
    style: "Bodybuilding",
    tags: "Bodybuilding • Glute Focus",
    distance: 2.1,
    frequency: "5x / Week",
    match: 90,
    photo: "https://randomuser.me/api/portraits/women/68.jpg",
    lifts: { bench: 125, squat: 245, deadlift: 275 },
    goal: "Prepping for a first bikini show next spring.",
  }),
];

// Builds a full profile from a few fields, for mock partners without hand-written details.
function mockPartner(input: {
  id: string;
  name: string;
  age: number;
  gym: string;
  style: string;
  tags: string;
  distance: number;
  frequency: string;
  match: number;
  photo: string;
  lifts: Lifts;
  goal: string;
}): Partner {
  const { photo, goal, ...rest } = input;
  return {
    ...rest,
    safety: 4.8,
    reliability: 92,
    avatar: { uri: photo },
    photos: [{ uri: photo }],
    goals: { primary: input.style, focus: "Consistency", summary: goal },
    experience: { years: "4 Years", style: input.style, summary: `Trains ${input.frequency.toLowerCase()} at ${input.gym}.` },
    gymNote: "Usually trains here after work.",
    availability: { days: input.frequency, bestTime: "6:00 PM", summary: "Evenings on weekdays, flexible on weekends." },
  };
}

export function getPartner(id: string) {
  return partners.find((partner) => partner.id === id);
}

export function firstName(partner: Partner) {
  return partner.name.split(" ")[0];
}
