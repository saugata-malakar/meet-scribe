"use client";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { useEffect } from "react";
import { useAuth, useUser } from "@clerk/nextjs";

// ── PostHog init ─────────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    autocapture: true,
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: { password: true },
    },
  });
}

// ── PostHog identity sync ────────────────────────────────────────────────────
function PostHogIdentitySync() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    if (isSignedIn && user) {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName,
      });
    } else if (!isSignedIn) {
      posthog.reset();
    }
  }, [isSignedIn, user]);

  return null;
}

// ── Clerk appearance (matches our dark plasma theme) ─────────────────────────
const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: "#4d6bff",
    colorBackground: "#06080f",
    colorInputBackground: "rgba(255,255,255,0.04)",
    colorInputText: "#f1f3ff",
    colorText: "#f1f3ff",
    colorTextSecondary: "rgba(200,210,255,0.5)",
    colorNeutral: "#1a1f3a",
    borderRadius: "0.75rem",
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSize: "14px",
  },
  elements: {
    card: {
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      backdropFilter: "blur(24px)",
      boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
    },
    headerTitle: {
      fontFamily: "'Syne', sans-serif",
      fontWeight: "700",
      fontSize: "1.5rem",
    },
    formButtonPrimary: {
      background: "linear-gradient(135deg, #4d6bff, #2334e0)",
      border: "1px solid rgba(112,144,255,0.4)",
      fontFamily: "'Syne', sans-serif",
      fontWeight: "600",
      "&:hover": { boxShadow: "0 0 24px rgba(77,107,255,0.5)" },
    },
    footerActionLink: { color: "#7090ff" },
    dividerLine: { background: "rgba(255,255,255,0.06)" },
  },
};

// ── Main providers wrapper ────────────────────────────────────────────────────
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      appearance={clerkAppearance}
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
      signInUrl="/login"
      signUpUrl="/signup"
    >
      <PostHogProvider client={posthog}>
        <PostHogIdentitySync />
        {children}
      </PostHogProvider>
    </ClerkProvider>
  );
}
