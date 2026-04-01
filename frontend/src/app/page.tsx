"use client";
import Link from "next/link";
import { Zap, Mic, Brain, FileText, Shield, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui";

const features = [
  {
    icon: <Mic size={22} />,
    title: "Bot Joins Your Meet",
    desc: "Deploy an intelligent bot that joins any Google Meet link instantly — no plugins, no extensions needed.",
    accent: "plasma",
  },
  {
    icon: <Brain size={22} />,
    title: "Gemini-Powered Intelligence",
    desc: "Google's Gemini 1.5 Pro processes every word, extracting meaning, sentiment, and actionable insights.",
    accent: "cyan",
  },
  {
    icon: <FileText size={22} />,
    title: "Structured Summaries",
    desc: "Get action items, key decisions, participant names, and a crisp executive summary — all in seconds.",
    accent: "violet",
  },
  {
    icon: <Shield size={22} />,
    title: "Secure & Private",
    desc: "All data encrypted in transit and at rest. Audio deleted after transcription. GCP-grade security.",
    accent: "amber",
  },
];

const accentStyles: Record<string, string> = {
  plasma: "border-plasma/25 hover:border-plasma/50 [&>div]:bg-plasma/10 [&>div]:text-plasma-400",
  cyan: "border-aurora-cyan/20 hover:border-aurora-cyan/40 [&>div]:bg-aurora-cyan/10 [&>div]:text-aurora-cyan",
  violet: "border-aurora-violet/20 hover:border-aurora-violet/40 [&>div]:bg-aurora-violet/10 [&>div]:text-aurora-violet",
  amber: "border-aurora-amber/20 hover:border-aurora-amber/40 [&>div]:bg-aurora-amber/10 [&>div]:text-aurora-amber",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-void relative overflow-hidden">
      <div className="fixed inset-0 bg-grid-void bg-grid pointer-events-none opacity-100" />
      <div className="fixed inset-0 bg-glow-plasma pointer-events-none" />
      <div className="fixed inset-0 bg-glow-cyan pointer-events-none" />

      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-8 py-4 border-b border-white/5 bg-void/80 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-plasma/20 border border-plasma/40 flex items-center justify-center">
            <Zap size={16} className="text-plasma-400" />
          </div>
          <span className="font-display font-700 text-white text-sm tracking-wide">MeetScribe</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Get Started <ArrowRight size={14} /></Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-20">
        <div className="absolute inset-0 z-10 bg-radial-fade pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, rgba(3,5,10,0.6) 70%, rgba(3,5,10,1) 100%)"
          }}
        />

        <div className="relative z-20 text-center px-6 max-w-4xl mx-auto">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-plasma/30 bg-plasma/10 text-plasma-300 text-xs font-mono mb-8">
              <span className="status-dot recording" />
              Powered by Google Gemini 1.5 Pro
            </div>

            <h1 className="font-display font-800 text-6xl md:text-7xl lg:text-8xl leading-none tracking-tight text-white mb-6">
              Your meetings,{" "}
              <span className="text-plasma-gradient">finally</span>
              <br />
              understood.
            </h1>

            <p className="text-lg text-white/50 font-body max-w-xl mx-auto mb-10 leading-relaxed">
              Deploy an AI bot to join Google Meet, transcribe every word in real time,
              and generate structured summaries with action items — automatically.
            </p>

            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link href="/signup">
                <Button size="lg" className="shadow-plasma">
                  Launch Your Bot <ArrowRight size={16} />
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost" size="lg">
                  Sign in
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 text-white/20">
          <span className="text-xs font-mono tracking-widest uppercase">Scroll</span>
          <ChevronDown size={16} className="animate-bounce" />
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 px-6 pb-24 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-display font-700 text-4xl md:text-5xl text-white mb-4">
            Everything your team needs
          </h2>
          <p className="text-white/40 font-body max-w-lg mx-auto">
            From joining to summarizing — MeetScribe handles the entire pipeline so your team can focus on doing, not note-taking.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f, i) => (
            <div
              key={i}
              className={`group glass rounded-2xl p-7 border transition-all duration-300 ${accentStyles[f.accent]}`}
            >
              <div className="w-12 h-12 rounded-xl border flex items-center justify-center mb-5 transition-colors duration-300">
                {f.icon}
              </div>
              <h3 className="font-display font-700 text-xl text-white mb-3">{f.title}</h3>
              <p className="text-white/40 font-body leading-relaxed text-sm">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="mt-24 text-center">
          <h2 className="font-display font-700 text-4xl text-white mb-16">How it works</h2>
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-0">
            {[
              { step: "01", title: "Paste Meet link", desc: "Drop in any Google Meet URL" },
              { step: "02", title: "Bot joins", desc: "AI bot enters as a silent participant" },
              { step: "03", title: "Live transcription", desc: "Google STT captures every word" },
              { step: "04", title: "Gemini summarizes", desc: "Structured summary ready instantly" },
            ].map((s, i) => (
              <div key={i} className="flex flex-col md:flex-row items-center flex-1">
                <div className="flex flex-col items-center text-center px-6">
                  <span className="text-4xl font-display font-800 text-plasma-gradient mb-3">{s.step}</span>
                  <h4 className="font-display font-600 text-white text-base mb-2">{s.title}</h4>
                  <p className="text-white/35 text-xs font-body">{s.desc}</p>
                </div>
                {i < 3 && (
                  <div className="hidden md:block w-12 h-px bg-gradient-to-r from-plasma/40 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div
          className="mt-24 glass rounded-3xl p-12 text-center border border-plasma/20"
          style={{ background: "radial-gradient(ellipse 80% 80% at 50% 50%, rgba(77,107,255,0.07), transparent)" }}
        >
          <h2 className="font-display font-700 text-4xl text-white mb-4">Ready to take better notes?</h2>
          <p className="text-white/40 mb-8 font-body">Join in seconds. No credit card required.</p>
          <Link href="/signup">
            <Button size="lg" className="shadow-plasma">
              Start for Free <ArrowRight size={16} />
            </Button>
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-16 flex items-center justify-between text-white/20 text-xs font-mono">
          <span>© 2026 MeetScribe</span>
          <span>Built with Next.js · FastAPI · Gemini · GCP</span>
        </div>
      </section>
    </div>
  );
}
