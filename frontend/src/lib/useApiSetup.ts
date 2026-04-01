"use client";
import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { registerTokenGetter } from "@/lib/api";

/**
 * Call this once in the root dashboard layout.
 * It registers the Clerk getToken function as the global token getter for axios.
 */
export function useApiSetup() {
  const { getToken } = useAuth();

  useEffect(() => {
    registerTokenGetter(() => getToken());
  }, [getToken]);
}
