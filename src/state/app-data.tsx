import { createContext, PropsWithChildren, useContext, useMemo, useState } from "react";

import { getPartner, WorkoutFocus } from "@/data/partners";

export type Gender = "Male" | "Female" | "Any";

export type Preferences = {
  distance: number;
  gender: Gender;
  experienceRange: [number, number];
  strengthRange: number;
  expandScope: boolean;
};

export type Message = {
  id: string;
  from: "me" | "them";
  text: string;
  day: string;
  time: string;
};

export type Conversation = {
  partnerId: string;
  messages: Message[];
  unread: boolean;
};

export type Invite = {
  partnerId: string;
  direction: "incoming" | "outgoing";
};

export type Workout = {
  id: string;
  partnerId: string;
  title: string;
  gym: string;
  date: string;
  time: string;
  focus: WorkoutFocus;
  notes: string;
};

type SessionLog = {
  id: string;
  date: string;
  title: string;
  verified: boolean;
};

type AppData = {
  preferences: Preferences;
  swiped: string[];
  blocked: string[];
  invites: Invite[];
  conversations: Conversation[];
  workouts: Workout[];
  logs: SessionLog[];
  streak: number;
  nutrition: { calories: string; protein: string; carbs: string; fats: string } | null;
};

type AppDataContextValue = AppData & {
  swipe: (partnerId: string, liked: boolean) => void;
  respondToInvite: (partnerId: string, accept: boolean) => void;
  cancelInvite: (partnerId: string) => void;
  sendMessage: (partnerId: string, text: string) => void;
  markRead: (partnerId: string) => void;
  scheduleWorkout: (workout: Omit<Workout, "id" | "title">) => Workout;
  block: (partnerId: string) => void;
  updatePreferences: (preferences: Partial<Preferences>) => void;
  logWorkout: () => void;
  resetDeck: () => void;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

function toIsoDate(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseIsoDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function daysFromToday(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return toIsoDate(date);
}

export function formatDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatShortDate(iso: string) {
  return parseIsoDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function relativeDay(iso: string) {
  if (iso === daysFromToday(0)) return "Today";
  if (iso === daysFromToday(1)) return "Tomorrow";
  return parseIsoDate(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function currentTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const defaultPreferences: Preferences = {
  distance: 15,
  gender: "Any",
  experienceRange: [1, 2],
  strengthRange: 20,
  expandScope: true,
};

// Mock data until the Supabase backend is ready.
function seedData(): AppData {
  return {
    preferences: defaultPreferences,
    swiped: [],
    blocked: [],
    invites: [
      { partnerId: "serena", direction: "incoming" },
      { partnerId: "devon", direction: "incoming" },
    ],
    conversations: [
      {
        partnerId: "marcus",
        unread: true,
        messages: [
          {
            id: "m1",
            from: "them",
            day: "Yesterday",
            time: "4:12 PM",
            text: "Hey! Saw we both train Downtown Gold's. You planning on hitting Legs this week?",
          },
          {
            id: "m2",
            from: "me",
            day: "Yesterday",
            time: "4:15 PM",
            text: "Yeah for sure! Hoping to squat on Tuesday. I usually hit a 315lb working set. What about you?",
          },
          {
            id: "m3",
            from: "them",
            day: "Today",
            time: "9:15 PM",
            text: "Perfect, I'm aiming for a new squat 1RM of 385lb. Be ready to spot me!",
          },
        ],
      },
      {
        partnerId: "jessica",
        unread: false,
        messages: [
          {
            id: "j1",
            from: "them",
            day: "Yesterday",
            time: "6:02 PM",
            text: "Let's plan for that HIIT session on Friday morning.",
          },
        ],
      },
      {
        partnerId: "brandon",
        unread: false,
        messages: [
          {
            id: "b1",
            from: "them",
            day: "2 days ago",
            time: "7:40 PM",
            text: "Hey man, do you use lifting straps for deadlifts?",
          },
        ],
      },
    ],
    workouts: [
      {
        id: "w1",
        partnerId: "marcus",
        title: "Heavy Squat Day with Marcus",
        gym: "Gold's Gym Downtown",
        date: daysFromToday(1),
        time: "6:30 PM",
        focus: "Legs",
        notes: "Let's try to hit a new squat 1RM together! Bring your knee sleeves.",
      },
    ],
    logs: [
      { id: "l1", date: daysFromToday(-1), title: "Chest & Triceps with Marcus", verified: true },
      { id: "l2", date: daysFromToday(-4), title: "Active Recovery Yoga with Serena", verified: true },
      { id: "l3", date: daysFromToday(-6), title: "Back & Biceps with Brandon", verified: true },
    ],
    streak: 14,
    nutrition: { calories: "2,450", protein: "185g", carbs: "220g", fats: "65g" },
  };
}

const focusTitles: Record<WorkoutFocus, string> = {
  Push: "Push Day",
  Pull: "Pull Day",
  Legs: "Leg Day",
  Upper: "Upper Body",
  "Full Body": "Full Body",
  Cardio: "Cardio",
};

export function AppDataProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<AppData>(seedData);

  const value = useMemo<AppDataContextValue>(() => {
    const update = (fn: (current: AppData) => AppData) => setData(fn);

    return {
      ...data,
      swipe(partnerId, liked) {
        update((current) => {
          const connected =
            current.conversations.some((c) => c.partnerId === partnerId) ||
            current.invites.some((i) => i.partnerId === partnerId);
          return {
            ...current,
            swiped: [...current.swiped, partnerId],
            invites:
              liked && !connected
                ? [...current.invites, { partnerId, direction: "outgoing" }]
                : current.invites,
          };
        });
      },
      respondToInvite(partnerId, accept) {
        update((current) => {
          const partner = getPartner(partnerId);
          const invites = current.invites.filter((invite) => invite.partnerId !== partnerId);
          if (!accept || !partner || current.conversations.some((c) => c.partnerId === partnerId)) {
            return { ...current, invites };
          }
          const greeting: Message = {
            id: `${partnerId}-${Date.now()}`,
            from: "them",
            day: "Today",
            time: currentTime(),
            text: `Thanks for accepting! When do you usually train at ${partner.gym}?`,
          };
          return {
            ...current,
            invites,
            conversations: [{ partnerId, unread: true, messages: [greeting] }, ...current.conversations],
          };
        });
      },
      cancelInvite(partnerId) {
        update((current) => ({
          ...current,
          invites: current.invites.filter((invite) => invite.partnerId !== partnerId),
        }));
      },
      sendMessage(partnerId, text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        update((current) => {
          const message: Message = {
            id: `${partnerId}-${Date.now()}`,
            from: "me",
            day: "Today",
            time: currentTime(),
            text: trimmed,
          };
          const existing = current.conversations.find((c) => c.partnerId === partnerId);
          const updated: Conversation = existing
            ? { ...existing, messages: [...existing.messages, message] }
            : { partnerId, unread: false, messages: [message] };
          return {
            ...current,
            conversations: [updated, ...current.conversations.filter((c) => c.partnerId !== partnerId)],
          };
        });
      },
      markRead(partnerId) {
        update((current) => ({
          ...current,
          conversations: current.conversations.map((c) => (c.partnerId === partnerId ? { ...c, unread: false } : c)),
        }));
      },
      scheduleWorkout(input) {
        const partner = getPartner(input.partnerId);
        const workout: Workout = {
          ...input,
          id: `workout-${Date.now()}`,
          title: `${focusTitles[input.focus]} with ${partner?.name.split(" ")[0] ?? "Partner"}`,
        };
        update((current) => ({
          ...current,
          workouts: [...current.workouts, workout].sort((a, b) =>
            a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
          ),
        }));
        return workout;
      },
      block(partnerId) {
        update((current) => ({
          ...current,
          blocked: [...current.blocked, partnerId],
          invites: current.invites.filter((invite) => invite.partnerId !== partnerId),
          conversations: current.conversations.filter((c) => c.partnerId !== partnerId),
          workouts: current.workouts.filter((w) => w.partnerId !== partnerId),
        }));
      },
      updatePreferences(preferences) {
        update((current) => ({ ...current, preferences: { ...current.preferences, ...preferences } }));
      },
      logWorkout() {
        update((current) => ({
          ...current,
          logs: [
            { id: `log-${Date.now()}`, date: daysFromToday(0), title: "Solo session", verified: false },
            ...current.logs,
          ],
          streak: current.streak + 1,
        }));
      },
      resetDeck() {
        update((current) => ({ ...current, swiped: [] }));
      },
    };
  }, [data]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error("useAppData must be used within an AppDataProvider");
  }

  return context;
}
