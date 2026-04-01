"use client";
import { SignIn } from "@clerk/nextjs";
import { Zap } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center relative overflow-hidden px-4">
      <div className="fixed inset-0 bg-grid-void bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-glow-plasma pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-plasma/20 border border-plasma/40 flex items-center justify-center shadow-plasma">
              <Zap size={20} className="text-plasma-400" />
            </div>
            <span className="font-display font-700 text-white text-lg">MeetScribe</span>
          </Link>
        </div>

        <SignIn
          path="/login"
          routing="path"
          signUpUrl="/signup"
          redirectUrl="/dashboard"
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "w-full !shadow-none !bg-transparent !border-0",
            },
          }}
        />
      </div>
    </div>
  );
}
