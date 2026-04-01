"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui";
import { RefreshCw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);

  return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <div className="fixed inset-0 bg-glow-plasma pointer-events-none" />
      <div className="relative z-10 text-center px-6">
        <p className="font-mono text-aurora-rose text-sm tracking-widest uppercase mb-4">Error</p>
        <h1 className="font-display font-800 text-4xl text-white mb-4">Something went wrong</h1>
        <p className="text-white/40 font-body mb-8 max-w-sm mx-auto">
          {error.message || "An unexpected error occurred. It has been reported automatically."}
        </p>
        <Button onClick={reset}>
          <RefreshCw size={14} /> Try again
        </Button>
      </div>
    </div>
  );
}
