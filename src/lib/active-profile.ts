import { useSyncExternalStore } from "react";

/** Implicit main profile id; existing history/favorites rows already use it. */
export const MAIN_PROFILE_ID = "00000000-0000-0000-0000-000000000000";
export const MAX_PROFILES = 6;

export type KidsMaxAge = "L" | "10" | "12";
export type ActiveProfile = { id: string; name: string; color: string; kidsMaxAge: KidsMaxAge | null };

const MAIN: ActiveProfile = { id: MAIN_PROFILE_ID, name: "Principal", color: "orange", kidsMaxAge: null };
const KIDS_RATINGS: Record<KidsMaxAge, string[]> = { L: ["L"], "10": ["L", "10"], "12": ["L", "10", "12"] };

let current: ActiveProfile = MAIN;
const listeners = new Set<() => void>();
const storageKey = (userId: string) => `bm-active-profile:${userId}`;

export function getActiveProfile() { return current; }
export function activeProfileId() { return current.id; }
/** Allowed age ratings for the active profile, or null when unrestricted. */
export function allowedAgeRatings(profile: ActiveProfile = current): string[] | null {
  return profile.kidsMaxAge ? KIDS_RATINGS[profile.kidsMaxAge] : null;
}
export function isWorkAllowed(ageRating: string | null | undefined, profile: ActiveProfile = current) {
  const allowed = allowedAgeRatings(profile);
  return !allowed || (!!ageRating && allowed.includes(ageRating));
}

export function setActiveProfile(userId: string | null, profile: ActiveProfile | null) {
  current = profile ?? MAIN;
  if (typeof window !== "undefined" && userId) {
    if (profile && profile.id !== MAIN_PROFILE_ID) localStorage.setItem(storageKey(userId), profile.id);
    else localStorage.removeItem(storageKey(userId));
  }
  listeners.forEach((listener) => listener());
}
export function storedProfileId(userId: string) {
  return typeof window === "undefined" ? null : localStorage.getItem(storageKey(userId));
}

/** Marks that the account already picked (or created) a reading profile; work pages require it. */
export function markProfileChosen(userId: string) {
  if (typeof window !== "undefined" && userId) localStorage.setItem(`bm-profile-chosen:${userId}`, "1");
}
export function hasProfileChosen(userId: string | null | undefined) {
  return typeof window !== "undefined" && !!userId && localStorage.getItem(`bm-profile-chosen:${userId}`) === "1";
}

export function useActiveProfile() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => current, () => MAIN);
}

/** Apply kids restriction to a series query builder. */
export function withKidsFilter<T extends { in: (column: string, values: string[]) => T }>(query: T, column = "age_rating"): T {
  const allowed = allowedAgeRatings();
  return allowed ? query.in(column, allowed) : query;
}
