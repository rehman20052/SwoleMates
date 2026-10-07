import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";

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
import { withCurrentWeight, type NutritionProfile } from "@/lib/macro-calculator";
import { supabase } from "@/lib/supabase";
import { isFoodEntry, sumFoodEntries } from "@/lib/food-journal";
import { mergeVerifiedLogs, workoutLogKey } from "@/lib/workout-log-sync";
import { nutritionGoalSource, planWithUpdatedWeight, goalsFromProfile, type NutritionGoals, type SavedNutritionPlan } from "@/lib/nutrition-plan-storage";
import { type AccountSetting, createAccountStores, loadAccountStores, refreshAccountStores } from "@/lib/account-app-data";
import { accountSyncError } from "@/lib/account-sync";
import { saveLiftDetails, type LiftDetails, type TrackedLift } from "@/lib/lift-progression";
import { type WorkoutExercise } from "@/lib/workout-session";
import { validItemArtwork } from "@/lib/item-artwork";

export type { NutritionProfile };

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
  exercises?: WorkoutExercise[];
  loggedAt?: string;
};

export type WorkoutLogDetails = Pick<
  SessionLog,
  "verified" | "checkedIn" | "plannedWorkoutId" | "partnerName" | "partnerPhoto" | "exercises"
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
  artwork?: import("@/lib/item-artwork").ItemArtwork;
  scannedIngredients?: import("@/lib/food-scanner").ScanIngredient[];
};

export type SavedMeal = Omit<FoodLogEntry, "id" | "date"> & {
  id: string;
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
  deletedWorkoutIds: string[];
  streak: number;
  weeklyWorkoutGoal: number;
  workspaceSettings: AccountSetting[];
  nutrition: NutritionTotals | null;
  foodEntries: FoodLogEntry[];
  savedMeals: SavedMeal[];
  nutritionProfile: NutritionProfile | null;
  nutritionGoalSource: "manual" | "estimated";
  trackedLifts: TrackedLift[];
};

type AppDataContextValue = AppData & {
  saveFeedback: Partial<Record<SaveArea, SaveFeedback>>;
  retrySave: (area: SaveArea) => Promise<boolean>;
  resolveSave: (area: SaveArea, choice: "server" | "reapply") => Promise<void>;
  accountUserId: string | null;
  saveWorkspaceSetting: (id: string, content: string, owner: string, updatedAt: number) => Promise<boolean>;
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
  updateNutrition: (nutrition: NutritionGoals) => Promise<boolean>;
  nutritionPlanReady: boolean;
  nutritionPlanError: string | null;
  addFoodEntry: (entry: Omit<FoodLogEntry, "id" | "date">, date?: string) => Promise<boolean>;
  updateFoodEntry: (entryId: string, entry: Omit<FoodLogEntry, "id" | "date">) => Promise<boolean>;
  deleteFoodEntry: (entryId: string) => Promise<boolean>;
  restoreFoodEntry: (entry: FoodLogEntry) => Promise<boolean>;
  copyFoodMeal: (sourceDate: string, sourceMeal: FoodLogEntry["meal"], destinationDate: string, destinationMeal: FoodLogEntry["meal"]) => Promise<boolean>;
  foodJournalReady: boolean;
  foodJournalError: string | null;
  recipesReady: boolean;
  recipeStorageError: string | null;
  saveMeal: (meal: Omit<SavedMeal, "id">) => Promise<boolean>;
  updateSavedMeal: (mealId: string, meal: Omit<SavedMeal, "id">) => Promise<boolean>;
  deleteSavedMeal: (mealId: string) => Promise<boolean>;
  updateNutritionProfile: (profile: NutritionProfile) => Promise<boolean>;
  logWeighIn: (weightLb: number) => Promise<boolean>;
  saveTrackedLift: (id: string, details: LiftDetails) => Promise<boolean>;
  deleteTrackedLift: (id: string) => Promise<boolean>;
  liftStorageError: string | null;
  accountSyncError: string | null;
  retryAccountSync: () => void;
  updateWeeklyWorkoutGoal: (goal: number) => Promise<boolean>;
  logWorkout: (title?: string, notes?: string, date?: string, details?: Partial<WorkoutLogDetails>, recordId?: string) => Promise<boolean>;
  syncVerifiedWorkoutLogs: (logs: SessionLog[]) => void;
  updateWorkoutLog: (logId: string, updates: Partial<Pick<SessionLog, "title" | "notes" | "exercises">>) => Promise<boolean>;
  deleteWorkoutLog: (logId: string) => Promise<boolean>;
  workoutStorageError: string | null;
  resetDeck: () => void;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);
export type SaveArea = "food" | "recipes" | "plan" | "lifts" | "workouts" | "drafts";
export type SaveFeedback = { phase: "saving" | "saved" | "pending" | "conflict" | "error"; message?: string };
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

function isSavedMeal(value: unknown): value is SavedMeal {
  if (!value || typeof value !== "object") return false;
  const meal = value as Partial<SavedMeal>;
  return (
    typeof meal.id === "string" &&
    (meal.meal === "Breakfast" || meal.meal === "Lunch" || meal.meal === "Dinner" || meal.meal === "Snack") &&
    typeof meal.name === "string" &&
    validItemArtwork(meal.artwork) &&
    typeof meal.calories === "number" &&
    typeof meal.protein === "number" &&
    typeof meal.carbs === "number" &&
    typeof meal.fats === "number"
  );
}

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
    deletedWorkoutIds: [],
    streak: 0,
    weeklyWorkoutGoal: 3, workspaceSettings: [],
    nutrition: defaultNutrition,
    foodEntries: [],
    savedMeals: [],
    nutritionProfile: null, nutritionGoalSource: "manual",
    trackedLifts: [],
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
  const [recipeStorageError, setRecipeStorageError] = useState<string | null>(null);
  const accountStores = useRef<ReturnType<typeof createAccountStores> | null>(null);
  const accountQueue = useRef<Promise<unknown>>(Promise.resolve());
  const accountGeneration = useRef(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [draftStorageError, setDraftStorageError] = useState<string | null>(null);
  const [liftStorageError, setLiftStorageError] = useState<string | null>(null);
  const [retrySync, setRetrySync] = useState(0);
  const [nutritionPlanError, setNutritionPlanError] = useState<string | null>(null);
  const [workoutStorageError, setWorkoutStorageError] = useState<string | null>(null);
  const [foodJournalError, setFoodJournalError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<Partial<Record<SaveArea, SaveFeedback>>>({});
  const saveRetries = useRef<Partial<Record<SaveArea, () => Promise<boolean>>>>({});
  const [today, setToday] = useState(() => daysFromToday(0));
  useEffect(() => {
    const refreshDate = () => setToday(daysFromToday(0));
    const timer = setInterval(refreshDate, 60000);
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") refreshDate(); });
    if (Platform.OS === "web" && typeof window !== "undefined") window.addEventListener("focus", refreshDate);
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", refreshDate);
    return () => {
      clearInterval(timer);
      subscription.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") window.removeEventListener("focus", refreshDate);
      if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", refreshDate);
    };
  }, []);
  const filtersTouched = useRef(false);
  const filterSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFilters = useRef<DiscoverFilters | null>(null);

  useEffect(() => {
    let active = true;
    let loaded = false;
    let refreshing = false;
    let currentOwner: string | null = null;
    function applySnapshot(snapshot: Awaited<ReturnType<typeof loadAccountStores>>) {
      const stores = accountStores.current;
      if (stores) setSaveFeedback({ food: stores.food.status(), recipes: stores.recipes.status(), plan: stores.plan.status(), lifts: stores.lifts.status(), workouts: stores.logs.status(), drafts: stores.settings.status() });
      setData((current) => ({ ...current,
        savedMeals: snapshot.recipes, foodEntries: snapshot.foodEntries,
        nutrition: { ...defaultNutrition, ...snapshot.plan.goals }, nutritionProfile: snapshot.plan.profile, nutritionGoalSource: nutritionGoalSource(snapshot.plan),
        logs: mergeVerifiedLogs(snapshot.logs, current.logs.filter((log) => log.checkedIn && log.plannedWorkoutId), snapshot.deletedWorkoutIds),
        deletedWorkoutIds: snapshot.deletedWorkoutIds, weeklyWorkoutGoal: snapshot.weeklyWorkoutGoal,
        trackedLifts: snapshot.lifts, workspaceSettings: snapshot.workspaceSettings,
      }));
    }
    const refresh = async (owner: string | null, force = false) => {
      if (!active || refreshing) return;
      if (owner !== currentOwner || force) {
        currentOwner = owner; loaded = false; accountGeneration.current++;
        accountStores.current = owner ? createAccountStores(owner) : null;
        setDashboardHydrated(false); setData(seedData());
        setRecipeStorageError(null); setFoodJournalError(null); setWorkoutStorageError(null);
        setNutritionPlanError(null); setLiftStorageError(null); setSyncError(null);
        setSaveFeedback({}); saveRetries.current = {};
      }
      const stores = accountStores.current;
      if (!owner || !stores) return;
      const generation = accountGeneration.current;
      refreshing = true;
      const operation = accountQueue.current.then(async () => {
        if (!active || generation !== accountGeneration.current) return;
        try {
          const snapshot = loaded ? await refreshAccountStores(stores, defaultNutrition) : await loadAccountStores(stores, defaultNutrition);
          if (!active || generation !== accountGeneration.current) return;
          applySnapshot(snapshot);
          if (!loaded) {
            setRecipeStorageError(null); setFoodJournalError(null); setWorkoutStorageError(null);
            setNutritionPlanError(null); setLiftStorageError(null);
          }
          loaded = true; setDashboardHydrated(true); setSyncError(null);
        } catch (error) {
          if (!active || generation !== accountGeneration.current) return;
          const message = accountSyncError(error);
          setSyncError(message);
          if (!loaded) {
            setRecipeStorageError(message); setFoodJournalError(message); setWorkoutStorageError(message);
            setNutritionPlanError(message); setLiftStorageError(message);
          }
        }
      });
      accountQueue.current = operation.catch(() => undefined);
      await operation; refreshing = false;
    };
    void supabase.auth.getSession().then(({ data }) => refresh(data.session?.user.id ?? null, true));
    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      const owner = session?.user.id ?? null;
      if (event === "SIGNED_OUT" || owner !== currentOwner) {
        // Clear the old account synchronously, even while a server call is pending.
        accountGeneration.current++; accountStores.current = null;
        currentOwner = owner; loaded = false; setDashboardHydrated(false); setData(seedData());
        setTimeout(() => { refreshing = false; void refresh(owner, true); }, 0);
      }
    });
    const foreground = () => {
      if (Platform.OS === "web" && typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh(currentOwner);
    };
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") foreground(); });
    let realtime = false;
    const channel = supabase.channel("account-record-deltas")
      .on("postgres_changes", { event: "*", schema: "public", table: "account_records" }, foreground)
      .subscribe(status => { realtime = status === "SUBSCRIBED"; if (realtime) foreground(); });
    const timer = setInterval(() => { if (!realtime) foreground(); }, 60000);
    const retryTimer = setInterval(() => {
      const stores = accountStores.current;
      if (stores && Object.values(stores).some(store => typeof store === "object" && "status" in store && store.status().phase === "pending")) foreground();
    }, 5000);
    if (Platform.OS === "web" && typeof window !== "undefined") window.addEventListener("online", foreground);
    if (Platform.OS === "web" && typeof window !== "undefined") window.addEventListener("focus", foreground);
    if (Platform.OS === "web" && typeof document !== "undefined") document.addEventListener("visibilitychange", foreground);
    return () => {
      active = false; accountGeneration.current++; clearInterval(timer); clearInterval(retryTimer); void supabase.removeChannel(channel); auth.subscription.unsubscribe(); subscription.remove();
      if (Platform.OS === "web" && typeof window !== "undefined") window.removeEventListener("online", foreground);
      if (Platform.OS === "web" && typeof window !== "undefined") window.removeEventListener("focus", foreground);
      if (Platform.OS === "web" && typeof document !== "undefined") document.removeEventListener("visibilitychange", foreground);
    };
  }, [retrySync]);

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
    const persistAccount = (operation: (stores: ReturnType<typeof createAccountStores>) => Promise<Partial<AppData>>, setError: (error: string | null) => void) => {
      const area: SaveArea = setError === setDraftStorageError ? "drafts" : setError === setRecipeStorageError ? "recipes" : setError === setFoodJournalError ? "food" : setError === setNutritionPlanError ? "plan" : setError === setLiftStorageError ? "lifts" : "workouts";
      const feedback = (value: SaveFeedback) => setSaveFeedback(current => ({ ...current, [area]: value }));
      const stores = accountStores.current;
      const generation = accountGeneration.current;
      if (!dashboardHydrated || !stores) {
        setError("Your account data is still loading. Please try again once loading finishes.");
        return Promise.resolve(false);
      }
      const save = accountQueue.current.then(async () => {
        if (generation !== accountGeneration.current || accountStores.current !== stores) return false;
        feedback({ phase: "saving" });
        try {
          const changes = await operation(stores);
          if (generation !== accountGeneration.current || accountStores.current !== stores) return false;
          update((current) => ({ ...current, ...changes })); setError(null); setSyncError(null);
          const store = area === "food" ? stores.food : area === "recipes" ? stores.recipes : area === "plan" ? stores.plan : area === "lifts" ? stores.lifts : area === "drafts" ? stores.settings : stores.logs;
          feedback(store.status()); delete saveRetries.current[area]; return true;
        } catch (error) {
          if (generation === accountGeneration.current) {
            const message = accountSyncError(error); setError(message);
            feedback({ phase: "error", message });
            saveRetries.current[area] = () => generation === accountGeneration.current ? persistAccount(operation, setError) : Promise.resolve(false);
          }
          return false;
        }
      });
      accountQueue.current = save.catch(() => undefined);
      return save;
    };
    const persistPlan = (edit: (current: SavedNutritionPlan) => SavedNutritionPlan) => persistAccount(async (stores) => {
      const plans = await stores.plan.change((current) => [edit(current[0] ?? { goals: defaultNutrition, profile: null })]);
      return { nutrition: { ...defaultNutrition, ...plans[0].goals }, nutritionProfile: plans[0].profile, nutritionGoalSource: nutritionGoalSource(plans[0]) };
    }, setNutritionPlanError);
    const persistRecipes = (edit: (current: SavedMeal[]) => SavedMeal[]) => persistAccount(async (stores) => ({ savedMeals: await stores.recipes.change(edit) }), setRecipeStorageError);
    const persistFood = (edit: (current: FoodLogEntry[]) => FoodLogEntry[]) => persistAccount(async (stores) => ({ foodEntries: await stores.food.change(edit) }), setFoodJournalError);
    const persistLogs = (edit: (current: SessionLog[]) => SessionLog[]) => persistAccount(async (stores) => {
      const deletedWorkoutIds = await stores.deletions.refresh();
      const logs = await stores.logs.change((current) => edit(current).filter((log) => !deletedWorkoutIds.includes(workoutLogKey(log))));
      return { logs, deletedWorkoutIds };
    }, setWorkoutStorageError);

    return {
      async resolveSave(area, choice) {
        const stores = accountStores.current;
        if (!stores) return;
        const generation = accountGeneration.current;
        const store = area === "food" ? stores.food : area === "recipes" ? stores.recipes : area === "plan" ? stores.plan : area === "lifts" ? stores.lifts : area === "drafts" ? stores.settings : stores.logs;
        try {
          await store.resolve(choice);
          const snapshot = await refreshAccountStores(stores, defaultNutrition);
          if (generation !== accountGeneration.current) return;
          setData(current => ({ ...current, savedMeals: snapshot.recipes, foodEntries: snapshot.foodEntries, logs: snapshot.logs, trackedLifts: snapshot.lifts, workspaceSettings: snapshot.workspaceSettings,
            nutrition: { ...defaultNutrition, ...snapshot.plan.goals }, nutritionProfile: snapshot.plan.profile }));
          setSaveFeedback(current => ({ ...current, [area]: store.status() }));
        } catch (error) { if (generation === accountGeneration.current) setSyncError(accountSyncError(error)); }
      },
      ...data,
      saveFeedback,
      retrySave: (area) => saveRetries.current[area]?.() ?? Promise.resolve(false),
      liftStorageError,
      accountSyncError: syncError,
      retryAccountSync: () => setRetrySync((current) => current + 1),
      nutrition: data.nutrition ? { ...data.nutrition, ...sumFoodEntries(data.foodEntries, today) } : null,
      nutritionPlanReady: dashboardHydrated,
      nutritionPlanError,
      foodJournalReady: dashboardHydrated,
      foodJournalError,
      workoutStorageError,
      recipesReady: dashboardHydrated,
      recipeStorageError,
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
        return persistPlan((current) => ({ ...current, goals: nutrition, goalSource: "manual" }));
      },
      async addFoodEntry(entry, date = daysFromToday(0)) {
        const nextEntry: FoodLogEntry = { ...entry, id: `food-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date };
        if (!isFoodEntry(nextEntry)) return false;
        return persistFood((current) => [nextEntry, ...current]);
      },
      async updateFoodEntry(entryId, entry) {
        return persistFood((current) => current.map((saved) => saved.id === entryId ? { ...saved, ...entry } : saved));
      },
      async deleteFoodEntry(entryId) {
        return persistFood((current) => current.filter((item) => item.id !== entryId));
      },
      restoreFoodEntry(entry) {
        return persistAccount(async stores => ({ foodEntries: await stores.food.change(current => current.some(item => item.id===entry.id) ? current : [entry,...current], [entry.id]) }), setFoodJournalError);
      },
      copyFoodMeal(sourceDate, sourceMeal, destinationDate, destinationMeal) {
        return persistFood(current => {
          const copies = current.filter(entry => entry.date===sourceDate && entry.meal===sourceMeal).map(entry => ({ ...entry,id:`food-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,date:destinationDate,meal:destinationMeal }));
          if (!copies.length) throw new Error("No foods in that source meal.");
          return [...copies,...current];
        });
      },
      async saveMeal(meal) {
        return persistRecipes((current) => [{ ...meal, id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, ...current]);
      },
      async updateSavedMeal(mealId, meal) {
        return persistRecipes((current) => current.map((saved) => (saved.id === mealId ? { ...saved, ...meal } : saved)));
      },
      async deleteSavedMeal(mealId) {
        return persistRecipes((current) => current.filter((saved) => saved.id !== mealId));
      },
      updateNutritionProfile(profile) {
        return persistPlan((current) => {
          const weighIns = new Map([...(profile.weighIns ?? []), ...(current.profile?.weighIns ?? [])].map((entry) => [entry.date, entry]));
          const savedProfile = { ...profile, weighIns: [...weighIns.values()].sort((a, b) => a.date.localeCompare(b.date)) };
          return { profile: savedProfile, goals: goalsFromProfile(savedProfile), goalSource: "estimated" };
        });
      },
      logWeighIn(weightLb) {
        return persistPlan((current) => {
          if (!current.profile) throw new Error("Set up your macro plan first.");
          const profile = withCurrentWeight(current.profile, daysFromToday(0), weightLb);
          return planWithUpdatedWeight(current, profile);
        });
      },
      saveTrackedLift(id, details) {
        return persistAccount(async (stores) => ({ trackedLifts: await stores.lifts.change((current) => saveLiftDetails(current, id, details, daysFromToday(0))) }), setLiftStorageError);
      },
      deleteTrackedLift(id) {
        return persistAccount(async (stores) => ({ trackedLifts: await stores.lifts.change((current) => current.filter((lift) => lift.id !== id)) }), setLiftStorageError);
      },
      accountUserId: accountStores.current?.userId ?? null,
      saveWorkspaceSetting(id, content, owner, updatedAt) {
        if (accountStores.current?.userId !== owner) return Promise.resolve(false);
        return persistAccount(async stores => {
          const settings = await stores.settings.change(current => {
            const previous = current.find(item => item.id === id);
            if (typeof previous?.value === "object" && previous.value.updatedAt > updatedAt) return current;
            return [...current.filter(item => item.id !== id), { id, value: { content, updatedAt } }];
          });
          return { workspaceSettings: settings.filter(item => item.id !== "weekly-workout-goal") };
        }, setDraftStorageError);
      },
      updateWeeklyWorkoutGoal(goal) {
        const normalized = Math.max(1, Math.min(7, Math.round(goal)));
        return persistAccount(async (stores) => {
          const settings = await stores.settings.change(current => [...current.filter(item => item.id !== "weekly-workout-goal"), { id: "weekly-workout-goal", value: normalized }]);
          return { weeklyWorkoutGoal: Number(settings.find(item => item.id === "weekly-workout-goal")?.value ?? normalized) };
        }, setWorkoutStorageError);
      },
      logWorkout(title = "Solo workout", notes, date = daysFromToday(0), details = {}, recordId) {
        const log: SessionLog = { id: recordId ?? "log-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8), date, title, notes, loggedAt: new Date().toISOString(), verified: details.verified ?? false, ...details };
        return persistLogs((current) => current.some((saved) => saved.id === log.id || (details.plannedWorkoutId && saved.plannedWorkoutId === details.plannedWorkoutId && saved.date === date)) ? current : [log, ...current]);
      },
      syncVerifiedWorkoutLogs(logs) {
        if (!dashboardHydrated) return;
        // Verified attendance already lives on the server. Merge for display only;
        // never rewrite manually edited calendar records from periodic attendance.
        update((current) => ({ ...current, logs: mergeVerifiedLogs(current.logs, logs, current.deletedWorkoutIds) }));
      },
      updateWorkoutLog(logId, updates) {
        const shown = data.logs.find((item) => item.id === logId);
        if (!shown) return Promise.resolve(false);
        return persistLogs((current) => {
          const key = workoutLogKey(shown);
          const exists = current.some((log) => workoutLogKey(log) === key);
          return exists ? current.map((log) => workoutLogKey(log) === key ? { ...log, ...updates } : log) : [...current, { ...shown, ...updates }];
        });
      },
      async deleteWorkoutLog(logId) {
        const log = data.logs.find((item) => item.id === logId);
        if (!log) return true;
        return persistAccount(async (stores) => {
          const key = workoutLogKey(log);
          const deletedWorkoutIds = await stores.deletions.change((current) => current.includes(key) ? current : [...current, key]);
          const logs = await stores.logs.change((current) => current.filter((item) => !deletedWorkoutIds.includes(workoutLogKey(item))));
          return { logs, deletedWorkoutIds };
        }, setWorkoutStorageError);
      },
      resetDeck() {
        update((current) => ({ ...current, reviewed: [] }));
      },
    };
  }, [data, discoverPrefsLoaded, dashboardHydrated, recipeStorageError, foodJournalError, workoutStorageError, nutritionPlanError, liftStorageError, syncError, today, saveFeedback]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error("useAppData must be used within an AppDataProvider");
  }

  return context;
}
