import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getPartner, WorkoutFocus } from "@/data/partners";
import {
  defaultDiscoverFilters,
  forgetSkip,
  isAccountId,
  loadDiscoverFilters,
  loadSkippedIds,
  rememberSkip,
  saveDiscoverFilters,
  type DiscoverFilters,
} from "@/lib/discover";
import { supabase } from "@/lib/supabase";

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

export type SessionLog = {
  id: string;
  date: string;
  title: string;
  notes?: string;
  verified: boolean;
  checkedIn?: boolean;
  plannedWorkoutId?: string;
  partnerName?: string;
  partnerPhoto?: string | null;
};

export type WorkoutLogDetails = Pick<
  SessionLog,
  "verified" | "checkedIn" | "plannedWorkoutId" | "partnerName" | "partnerPhoto"
>;

export type NutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  calorieGoal: number;
  proteinGoal: number;
  carbGoal: number;
  fatGoal: number;
};

export type FoodLogEntry = {
  id: string;
  date: string;
  meal: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
};

export type SavedMeal = Omit<FoodLogEntry, "id" | "date"> & {
  id: string;
};

export type NutritionProfile = {
  sex: "Male" | "Female";
  age: number;
  weightLb: number;
  heightIn: number;
  activityLevel: "1–2 workouts/week" | "3–4 workouts/week" | "5–6 workouts/week" | "Daily intense training";
  goal: "Lose 0.5 lb/week" | "Lose 1 lb/week" | "Maintain weight" | "Gain 0.5 lb/week" | "Gain 1 lb/week";
};

type AppData = {
  preferences: Preferences;
  discoverFilters: DiscoverFilters;
  // Partners already shown in Discover (skipped or invited).
  reviewed: string[];
  blocked: string[];
  invites: Invite[];
  conversations: Conversation[];
  workouts: Workout[];
  completedWorkoutIds: string[];
  logs: SessionLog[];
  streak: number;
  weeklyWorkoutGoal: number;
  nutrition: NutritionTotals | null;
  foodEntries: FoodLogEntry[];
  savedMeals: SavedMeal[];
  nutritionProfile: NutritionProfile | null;
};

type AppDataContextValue = AppData & {
  review: (partnerId: string, interested: boolean) => void;
  clearReview: (partnerId: string) => void;
  respondToInvite: (partnerId: string, accept: boolean) => void;
  cancelInvite: (partnerId: string) => void;
  sendMessage: (partnerId: string, text: string) => void;
  markRead: (partnerId: string) => void;
  scheduleWorkout: (workout: Omit<Workout, "id" | "title">) => Workout;
  block: (partnerId: string) => void;
  updatePreferences: (preferences: Partial<Preferences>) => void;
  updateDiscoverFilters: (filters: DiscoverFilters) => void;
  discoverPrefsLoaded: boolean;
  completeWorkout: (workoutId: string) => void;
  updateNutrition: (nutrition: Partial<NutritionTotals>) => void;
  addFoodEntry: (entry: Omit<FoodLogEntry, "id" | "date">) => void;
  deleteFoodEntry: (entryId: string) => void;
  saveMeal: (meal: Omit<SavedMeal, "id">) => void;
  updateNutritionProfile: (profile: NutritionProfile) => void;
  updateWeeklyWorkoutGoal: (goal: number) => void;
  logWorkout: (title?: string, notes?: string, date?: string, details?: Partial<WorkoutLogDetails>) => void;
  syncVerifiedWorkoutLogs: (logs: SessionLog[]) => void;
  updateWorkoutLog: (logId: string, updates: Partial<Pick<SessionLog, "title" | "notes">>) => void;
  deleteWorkoutLog: (logId: string) => void;
  resetDeck: () => void;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);
const weeklyWorkoutGoalKey = "swolemates.weekly-workout-goal";
const dashboardStateKey = "swolemates.dashboard-state";

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

const defaultNutrition: NutritionTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fats: 0,
  calorieGoal: 2500,
  proteinGoal: 190,
  carbGoal: 260,
  fatGoal: 75,
};

const seedSavedMeals: SavedMeal[] = [
  { id: "saved-1", meal: "Breakfast", name: "Protein shake", calories: 210, protein: 32, carbs: 12, fats: 4 },
  { id: "saved-2", meal: "Lunch", name: "Chicken burrito bowl", calories: 650, protein: 45, carbs: 75, fats: 18 },
  { id: "saved-3", meal: "Dinner", name: "Turkey pasta", calories: 590, protein: 46, carbs: 62, fats: 16 },
];

// Mock data until the Supabase backend is ready.
function seedData(): AppData {
  return {
    preferences: defaultPreferences,
    discoverFilters: defaultDiscoverFilters,
    reviewed: [],
    blocked: [],
    invites: [
      { partnerId: "serena", direction: "incoming" },
      { partnerId: "devon", direction: "incoming" },
      { partnerId: "aaliyah", direction: "incoming" },
      { partnerId: "tyler", direction: "incoming" },
      { partnerId: "priya", direction: "incoming" },
      { partnerId: "kenji", direction: "incoming" },
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
    completedWorkoutIds: [],
    logs: [],
    streak: 0,
    weeklyWorkoutGoal: 3,
    nutrition: defaultNutrition,
    foodEntries: [],
    savedMeals: seedSavedMeals,
    nutritionProfile: null,
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
  const [discoverPrefsLoaded, setDiscoverPrefsLoaded] = useState(false);
  const [dashboardHydrated, setDashboardHydrated] = useState(false);
  const filtersTouched = useRef(false);
  const filterSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFilters = useRef<DiscoverFilters | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem(weeklyWorkoutGoalKey), AsyncStorage.getItem(dashboardStateKey)])
      .then(([savedGoal, savedDashboard]) => {
        if (!active) return;
        const parsedGoal = Number(savedGoal);
        let saved: Partial<Pick<AppData, "logs" | "foodEntries" | "nutrition">> = {};
        try {
          saved = savedDashboard ? JSON.parse(savedDashboard) : {};
        } catch {
          saved = {};
        }
        setData((current) => ({
          ...current,
          logs: Array.isArray(saved.logs) ? saved.logs : current.logs,
          foodEntries: Array.isArray(saved.foodEntries) ? saved.foodEntries : current.foodEntries,
          nutrition: saved.nutrition && typeof saved.nutrition === "object" ? saved.nutrition : current.nutrition,
          weeklyWorkoutGoal:
            Number.isInteger(parsedGoal) && parsedGoal >= 1 && parsedGoal <= 7
              ? parsedGoal
              : current.weeklyWorkoutGoal,
        }));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setDashboardHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!dashboardHydrated) return;
    void AsyncStorage.setItem(
      dashboardStateKey,
      JSON.stringify({ logs: data.logs, foodEntries: data.foodEntries, nutrition: data.nutrition }),
    );
  }, [dashboardHydrated, data.foodEntries, data.logs, data.nutrition]);

  useEffect(() => {
    let active = true;

    const applySaved = async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!active) return;
      if (!session.session?.user.id) {
        setDiscoverPrefsLoaded(true);
        return;
      }
      const [filters, skipped] = await Promise.all([loadDiscoverFilters(), loadSkippedIds()]);
      if (!active) return;
      setData((current) => ({
        ...current,
        discoverFilters: filtersTouched.current ? current.discoverFilters : (filters ?? current.discoverFilters),
        reviewed: [...new Set([...current.reviewed, ...skipped])],
      }));
      setDiscoverPrefsLoaded(true);
    };

    void applySaved();
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        filtersTouched.current = false;
        setDiscoverPrefsLoaded(false);
        setTimeout(() => {
          void applySaved();
        }, 0);
      }
      if (event === "SIGNED_OUT") {
        filtersTouched.current = false;
        if (filterSave.current) clearTimeout(filterSave.current);
        setData((current) => ({
          ...current,
          discoverFilters: defaultDiscoverFilters,
          reviewed: current.reviewed.filter((id) => !isAccountId(id)),
        }));
        setDiscoverPrefsLoaded(true);
      }
    });

    return () => {
      active = false;
      auth.subscription.unsubscribe();
      if (filterSave.current) {
        clearTimeout(filterSave.current);
        filterSave.current = null;
        if (pendingFilters.current) void saveDiscoverFilters(pendingFilters.current);
      }
    };
  }, []);

  const value = useMemo<AppDataContextValue>(() => {
    const update = (fn: (current: AppData) => AppData) => setData(fn);

    return {
      ...data,
      review(partnerId, interested) {
        update((current) => {
          const connected =
            current.conversations.some((c) => c.partnerId === partnerId) ||
            current.invites.some((i) => i.partnerId === partnerId);
          return {
            ...current,
            reviewed: current.reviewed.includes(partnerId) ? current.reviewed : [...current.reviewed, partnerId],
            invites:
              interested && !connected && getPartner(partnerId)
                ? [...current.invites, { partnerId, direction: "outgoing" }]
                : current.invites,
          };
        });
        if (!interested) void rememberSkip(partnerId);
      },
      clearReview(partnerId) {
        update((current) => ({
          ...current,
          reviewed: current.reviewed.filter((id) => id !== partnerId),
        }));
        void forgetSkip(partnerId);
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
          completedWorkoutIds: current.completedWorkoutIds.filter(
            (id) => current.workouts.find((workout) => workout.id === id)?.partnerId !== partnerId,
          ),
        }));
      },
      updatePreferences(preferences) {
        update((current) => ({ ...current, preferences: { ...current.preferences, ...preferences } }));
      },
      discoverPrefsLoaded,
      updateDiscoverFilters(filters) {
        filtersTouched.current = true;
        pendingFilters.current = filters;
        update((current) => ({ ...current, discoverFilters: filters }));
        if (filterSave.current) clearTimeout(filterSave.current);
        filterSave.current = setTimeout(() => {
          pendingFilters.current = null;
          void saveDiscoverFilters(filters);
        }, 250);
      },
      completeWorkout(workoutId) {
        update((current) => {
          if (current.completedWorkoutIds.includes(workoutId)) {
            return current;
          }

          const workout = current.workouts.find((item) => item.id === workoutId);
          if (!workout) {
            return current;
          }

          const alreadyLogged = current.logs.some((log) => log.title === workout.title && log.date === workout.date);

          return {
            ...current,
            completedWorkoutIds: [...current.completedWorkoutIds, workoutId],
            logs: alreadyLogged
              ? current.logs
              : [
                  {
                    id: `log-${workoutId}-${Date.now()}`,
                    date: workout.date,
                    title: workout.title,
                    notes: workout.notes,
                    verified: true,
                  },
                  ...current.logs,
                ],
            streak: workout.date === daysFromToday(0) ? current.streak + 1 : current.streak,
          };
        });
      },
      updateNutrition(nutrition) {
        update((current) => ({
          ...current,
          nutrition: {
            ...defaultNutrition,
            ...(current.nutrition ?? {}),
            ...nutrition,
          },
        }));
      },
      addFoodEntry(entry) {
        update((current) => {
          const nextEntry: FoodLogEntry = { ...entry, id: `food-${Date.now()}`, date: daysFromToday(0) };
          const nutrition = current.nutrition ?? defaultNutrition;
          return {
            ...current,
            foodEntries: [nextEntry, ...current.foodEntries],
            nutrition: {
              ...nutrition,
              calories: nutrition.calories + entry.calories,
              protein: nutrition.protein + entry.protein,
              carbs: nutrition.carbs + entry.carbs,
              fats: nutrition.fats + entry.fats,
            },
          };
        });
      },
      deleteFoodEntry(entryId) {
        update((current) => {
          const entry = current.foodEntries.find((item) => item.id === entryId);
          if (!entry || entry.date !== daysFromToday(0)) return current;
          const nutrition = current.nutrition ?? defaultNutrition;
          return {
            ...current,
            foodEntries: current.foodEntries.filter((item) => item.id !== entryId),
            nutrition: {
              ...nutrition,
              calories: Math.max(0, nutrition.calories - entry.calories),
              protein: Math.max(0, nutrition.protein - entry.protein),
              carbs: Math.max(0, nutrition.carbs - entry.carbs),
              fats: Math.max(0, nutrition.fats - entry.fats),
            },
          };
        });
      },
      saveMeal(meal) {
        update((current) => ({
          ...current,
          savedMeals: [{ ...meal, id: `saved-${Date.now()}` }, ...current.savedMeals],
        }));
      },
      updateNutritionProfile(profile) {
        update((current) => ({ ...current, nutritionProfile: profile }));
      },
      updateWeeklyWorkoutGoal(goal) {
        const normalized = Math.max(1, Math.min(7, Math.round(goal)));
        update((current) => ({ ...current, weeklyWorkoutGoal: normalized }));
        void AsyncStorage.setItem(weeklyWorkoutGoalKey, `${normalized}`);
      },
      logWorkout(title = "Solo workout", notes, date = daysFromToday(0), details = {}) {
        update((current) => ({
          ...current,
          logs: current.logs.some(
            (log) => details.plannedWorkoutId && log.plannedWorkoutId === details.plannedWorkoutId && log.date === date,
          )
            ? current.logs
            : [
                {
                  id: `log-${Date.now()}`,
                  date,
                  title,
                  notes,
                  verified: details.verified ?? false,
                  ...details,
                },
                ...current.logs,
              ],
        }));
      },
      syncVerifiedWorkoutLogs(logs) {
        update((current) => {
          const nonCheckInLogs = current.logs.filter((log) => !log.checkedIn || !log.plannedWorkoutId);
          return { ...current, logs: [...logs, ...nonCheckInLogs] };
        });
      },
      updateWorkoutLog(logId, updates) {
        update((current) => ({
          ...current,
          logs: current.logs.map((log) => (log.id === logId ? { ...log, ...updates } : log)),
        }));
      },
      deleteWorkoutLog(logId) {
        update((current) => ({
          ...current,
          logs: current.logs.filter((log) => log.id !== logId),
        }));
      },
      resetDeck() {
        update((current) => ({ ...current, reviewed: [] }));
      },
    };
  }, [data, discoverPrefsLoaded]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error("useAppData must be used within an AppDataProvider");
  }

  return context;
}
