"use client";
import { SignIn } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center relative overflow-hidden px-4">
      <div className="fixed inset-0 bg-grid-void bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-glow-plasma pointer-events-none" />
      <div className="fixed top-1/4 left-1/4 w-64 h-64 rounded-full bg-plasma/10 blur-3xl pointer-events-none animate-pulse-slow" />
      <div className="fixed bottom-1/3 right-1/4 w-48 h-48 rounded-full bg-aurora-violet/10 blur-3xl pointer-events-none animate-float" />

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
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
      </motion.div>
    </div>
  );
}
