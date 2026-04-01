"use client";
import { SignUp } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center relative overflow-hidden px-4">
      <div className="fixed inset-0 bg-grid-void bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-glow-plasma pointer-events-none" />
      <div className="fixed top-1/4 right-1/4 w-72 h-72 rounded-full bg-aurora-violet/8 blur-3xl pointer-events-none animate-float" />
      <div className="fixed bottom-1/3 left-1/4 w-52 h-52 rounded-full bg-plasma/8 blur-3xl pointer-events-none animate-pulse-slow" />

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

        <SignUp
          path="/signup"
          routing="path"
          signInUrl="/login"
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
