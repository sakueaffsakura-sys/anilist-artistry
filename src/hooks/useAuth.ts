import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface SessionState {
  session: Session | null;
  user: Session["user"] | null;
  loading: boolean;
}

const SessionContext = createContext<SessionState>({ session: null, user: null, loading: true });

/** One auth subscription for the entire mounted app, rather than one per cover. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Mantém a sessão viva: renova o token periodicamente e sempre que o
  // usuário volta para a aba, evitando que a sessão expire por inatividade.
  useEffect(() => {
    let active = true;
    const refreshIfNeeded = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const expiresAt = data.session?.expires_at;
        const expiringSoon = !expiresAt || expiresAt * 1000 - Date.now() < 10 * 60_000;
        if (!active || !data.session || !expiringSoon) return;
        await supabase.auth.refreshSession();
      } catch {
        // Falhou agora: o próximo ciclo tenta de novo sem deslogar ninguém.
      }
    };
    void refreshIfNeeded();
    const interval = setInterval(() => {
      if (!document.hidden) void refreshIfNeeded();
    }, 5 * 60_000);
    const onVisible = () => {
      if (!document.hidden) void refreshIfNeeded();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return createElement(SessionContext.Provider, {
    value: { session, user: session?.user ?? null, loading },
  }, children);
}

export function useSession() {
  return useContext(SessionContext);
}

export function useProfile(userId?: string) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, level")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useRoles(userId?: string) {
  const query = useQuery({
    queryKey: ["roles", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) throw error;
      return data.map((row) => row.role as string);
    },
  });
  const roles = query.data ?? [];
  return {
    ...query,
    roles,
    isAdmin: roles.includes("admin"),
    isStaff: roles.includes("admin") || roles.includes("uploader"),
  };
}
