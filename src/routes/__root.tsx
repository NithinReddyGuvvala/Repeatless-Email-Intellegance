import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {error && (
          <div className="mt-4 p-4 rounded-xl border border-red-200 bg-red-50/50 text-left text-xs font-mono text-red-800 whitespace-pre-wrap max-h-64 overflow-y-auto">
            {error.message || String(error)}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

import { AlertCircle, RotateCcw, Home } from "lucide-react";

export function RouteErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("Route render error caught:", error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_route_error_boundary" });
  }, [error]);

  return (
    <div className="surface-card p-6 md:p-8 flex flex-col items-center text-center max-w-lg mx-auto mt-10">
      <div className="h-12 w-12 rounded-full bg-rust/10 flex items-center justify-center text-rust mb-4">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h3 className="font-serif text-lg font-semibold text-charcoal sm:text-xl">
        Something went wrong
      </h3>
      <p className="mt-2 text-sm text-muted-foreground leading-normal">
        {error?.message || "An unexpected error occurred while loading this page."}
      </p>
      {error?.stack && (
        <pre className="mt-4 max-h-32 w-full overflow-y-auto rounded-lg bg-charcoal p-3 text-left font-mono text-[10px] text-ivory/80 leading-relaxed border border-border">
          {error.stack}
        </pre>
      )}
      <div className="mt-6 flex flex-wrap gap-3 justify-center">
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="inline-flex items-center gap-1.5 justify-center rounded-xl bg-navy px-4 py-2.5 text-xs font-semibold text-ivory shadow-soft hover:bg-navy/90 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Try again
        </button>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-charcoal-soft hover:bg-beige transition-colors"
        >
          <Home className="h-3.5 w-3.5" />
          Dashboard
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lovable App" },
      { name: "description", content: "Lovable Generated Project" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Lovable App" },
      { property: "og:description", content: "Lovable Generated Project" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    (typeof process !== "undefined"
      ? process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
      : "") ||
    "";
  const supabaseAnonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    (typeof process !== "undefined"
      ? process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
      : "") ||
    "";

  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // Default theme is 'light' (Ivory) — only override if the user explicitly set 'dark'
                  const theme = localStorage.getItem('repeatless_theme') || 'light';
                  if (!localStorage.getItem('repeatless_theme')) {
                    localStorage.setItem('repeatless_theme', 'light');
                  }
                  const isDark = theme === 'dark';
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify({
              SUPABASE_URL: supabaseUrl,
              SUPABASE_ANON_KEY: supabaseAnonKey,
            })};`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { setupBackgroundSync } from "@/lib/gmail/backgroundSync";
import { Toaster } from "@/components/ui/sonner";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    setupBackgroundSync();

    const clearCookieIfAuthenticated = async () => {
      const supabase = getSupabaseBrowser();
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          document.cookie = "inbox_harmony_logged_out=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
      }
    };
    clearCookieIfAuthenticated();

    const handlePageShow = async (event: PageTransitionEvent) => {
      if (event.persisted) {
        const supabase = getSupabaseBrowser();
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (!data?.session) {
            queryClient.clear();
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace("/signin");
          }
        }
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}

