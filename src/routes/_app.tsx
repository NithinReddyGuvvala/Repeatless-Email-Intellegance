import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/gmail/demoDb";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    if (isDemoMode()) {
      return;
    }

    let isAuthenticated = false;

    if (typeof window === "undefined") {
      const user = await getAuthenticatedUser();
      isAuthenticated = !!user;
    } else {
      const supabase = getSupabaseBrowser();
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        isAuthenticated = !!data?.session;
      }
    }

    if (!isAuthenticated) {
      throw redirect({
        to: "/signin",
      });
    }
  },
  component: () => <Outlet />,
});
