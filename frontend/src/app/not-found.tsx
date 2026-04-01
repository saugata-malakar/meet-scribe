"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center relative overflow-hidden">
      <div className="fixed inset-0 bg-grid-void bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-glow-plasma pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 text-center px-6"
      >
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-plasma/20 border border-plasma/40 flex items-center justify-center">
            <Zap size={20} className="text-plasma-400" />
          </div>
          <span className="font-display font-700 text-white text-lg">MeetScribe</span>
        </div>

        <p className="font-mono text-plasma-400 text-sm tracking-widest uppercase mb-4">404</p>
        <h1 className="font-display font-800 text-5xl text-white mb-4">Page not found</h1>
        <p className="text-white/40 font-body text-lg mb-10 max-w-sm mx-auto">
          This page doesn&apos;t exist or was moved. Let&apos;s get you back.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/">
            <Button variant="ghost"><ArrowLeft size={14} /> Home</Button>
          </Link>
          <Link href="/dashboard">
            <Button>Dashboard</Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
