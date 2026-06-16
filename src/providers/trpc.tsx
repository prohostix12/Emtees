"use client";

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import superjson from "superjson";
import type { AppRouter } from "../../server/router";
import type { ReactNode } from "react";

export const trpc = createTRPCReact<AppRouter>();

let isRedirecting = false;

const handleGlobalError = (error: any) => {
  const message = error?.message || "";
  if (message.includes("Your account has been logged in from another device") && !isRedirecting) {
    isRedirecting = true;
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      window.location.href = `/login?reason=${encodeURIComponent(
        "Your account has been logged in from another device. You have been signed out."
      )}`;
    }
  }
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      handleGlobalError(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      handleGlobalError(error);
    },
  }),
});
const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

export function TRPCProvider({ children }: { children: ReactNode }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
