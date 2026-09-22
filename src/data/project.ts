export const teamMembers = [
  { name: "Abdur", branch: "member/abdur", focus: "Project coordination and matching flow" },
  { name: "Gio", branch: "member/gio", focus: "Discovery UI and profile cards" },
  { name: "Habib", branch: "member/habib", focus: "Workout plans and scheduling" },
  { name: "Noor", branch: "member/noor", focus: "Profile setup and preferences" },
  { name: "Zub", branch: "member/zub", focus: "Reliability score and check-ins" },
  { name: "Yunus", branch: "member/yunus", focus: "Matches list and messaging starter" },
];

export const weeklyMeetings = [
  "Tuesdays before 12:15 p.m. Senior Project class",
  "Thursdays from 10:00 a.m. to 12:00 p.m.",
];

export const matchingFactors = [
  "Location",
  "Fitness goals",
  "Experience level",
  "Availability",
  "Preferred workouts",
  "Gym preferences",
  "Similar interests",
];

export const featureDirection = {
  mainFocus: "Gym-partner matchmaking",
  problem:
    "People often lose motivation or struggle to find someone with similar fitness goals, schedules, and experience levels.",
  supporting:
    "Nutrition, goals, competitions, and calorie tracking can be added later as supporting features after matching works well.",
};

export type Partner = {
  id: string;
  name: string;
  age: number;
  gym: string;
  distance: string;
  match: number;
  reliability: number;
  experience: string;
  split: string;
  availability: string;
  goal: string;
  lifts: {
    bench: string;
    squat: string;
    deadlift: string;
  };
  interests: string[];
};

export const partners: Partner[] = [
  {
    id: "maya",
    name: "Maya",
    age: 22,
    gym: "LA Fitness",
    distance: "1.8 mi",
    match: 92,
    reliability: 94,
    experience: "Intermediate",
    split: "Push/Pull/Legs",
    availability: "Mornings",
    goal: "Build strength with a consistent partner",
    lifts: {
      bench: "135",
      squat: "205",
      deadlift: "245",
    },
    interests: ["Upper body days", "Form checks", "Consistent schedule"],
  },
  {
    id: "andre",
    name: "Andre",
    age: 23,
    gym: "Gold's Gym",
    distance: "2.1 mi",
    match: 89,
    reliability: 91,
    experience: "Advanced",
    split: "Powerbuilding",
    availability: "Evenings",
    goal: "Train heavy while keeping workouts organized",
    lifts: {
      bench: "225",
      squat: "315",
      deadlift: "385",
    },
    interests: ["Spotter needed", "Strength blocks", "Gym events"],
  },
  {
    id: "leah",
    name: "Leah",
    age: 21,
    gym: "Crunch",
    distance: "3.4 mi",
    match: 86,
    reliability: 88,
    experience: "Beginner+",
    split: "Full body",
    availability: "Afternoons",
    goal: "Stay motivated and learn better programming",
    lifts: {
      bench: "95",
      squat: "155",
      deadlift: "185",
    },
    interests: ["Beginner friendly", "Accountability", "Machine work"],
  },
];

export const prototypeDirection = [
  "Use the workout-session concept as the main flow because it pushes users toward actually meeting for a lift.",
  "Borrow the comparison filters from the criteria-first prototype.",
  "Keep the swipe-card profile feeling for quick discovery.",
];
