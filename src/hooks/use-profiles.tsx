import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import {
  MAIN_PROFILE_ID, hasProfileChosen, markProfileChosen, setActiveProfile, storedProfileId, useActiveProfile,
  type ActiveProfile, type KidsMaxAge,
} from "@/lib/active-profile";

export type AccountProfile = ActiveProfile & { hasPin: boolean };

type ProfilesState = {
  profiles: AccountProfile[];
  active: ActiveProfile;
  loading: boolean;
  needsPick: boolean;
  /** Switches after PIN validation; throws when the PIN is wrong. */
  switchTo: (profile: AccountProfile, pin?: string) => Promise<void>;
  refresh: () => Promise<unknown>;
};

const Ctx = createContext<ProfilesState | null>(null);

export function ProfilesProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const active = useActiveProfile();
  const [picked, setPicked] = useState(false);
  const query = useQuery({
    queryKey: ["account-profiles", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<AccountProfile[]> => {
      const [rows, mainPin] = await Promise.all([
        supabase.from("account_profiles").select("id, name, color, kids_max_age, has_pin").order("created_at"),
        supabase.rpc("main_profile_has_pin"),
      ]);
      if (rows.error) throw rows.error;
      const main: AccountProfile = { id: MAIN_PROFILE_ID, name: "Principal", color: "orange", kidsMaxAge: null, hasPin: !!mainPin.data };
      return [main, ...(rows.data ?? []).map((row) => ({
        id: row.id, name: row.name, color: row.color,
        kidsMaxAge: (row.kids_max_age as KidsMaxAge | null) ?? null, hasPin: !!row.has_pin,
      }))];
    },
  });
  const profiles = query.data ?? [];

  const apply = useCallback(async (profile: ActiveProfile | null) => {
    setActiveProfile(user?.id ?? null, profile);
    await queryClient.cancelQueries();
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "account-profiles" });
    void queryClient.invalidateQueries();
  }, [queryClient, user?.id]);

  // Restore the remembered profile, or fall back to main when it no longer exists.
  useEffect(() => {
    if (!user) { if (active.id !== MAIN_PROFILE_ID) void apply(null); setPicked(false); return; }
    if (!query.data) return;
    const stored = storedProfileId(user.id);
    const found = stored ? query.data.find((p) => p.id === stored) : undefined;
    if (found) { setPicked(true); markProfileChosen(user.id); if (found.id !== active.id || found.kidsMaxAge !== active.kidsMaxAge) void apply(found); }
    else if (active.id !== MAIN_PROFILE_ID) void apply(null);
  }, [user, query.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTo = useCallback(async (profile: AccountProfile, pin?: string) => {
    if (profile.hasPin && profile.id !== active.id) {
      const { data, error } = await supabase.rpc("verify_profile_pin", { _profile: profile.id === MAIN_PROFILE_ID ? null : profile.id, _pin: pin ?? "" } as never);
      if (error) throw error;
      if (!data) throw new Error("PIN incorreto.");
    }
    if (user) markProfileChosen(user.id);
    setPicked(true);
    if (profile.id !== active.id || profile.kidsMaxAge !== active.kidsMaxAge) await apply(profile);
  }, [active, apply, user]);

  const needsPick = !!user && !picked && !hasProfileChosen(user.id);
  return (
    <Ctx.Provider value={{ profiles, active, loading: query.isLoading, needsPick, switchTo, refresh: query.refetch }}>
      {children}
    </Ctx.Provider>
  );
}

export function useProfiles() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useProfiles fora do ProfilesProvider");
  return value;
}
