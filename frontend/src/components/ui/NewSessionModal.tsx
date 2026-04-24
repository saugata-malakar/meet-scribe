"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link as LinkIcon, Mic, FileText, Sparkles, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { sessionsApi, botApi, api } from "@/lib/api";
import { Button, Input } from "@/components/ui";

type Mode = "choose" | "live" | "manual";

const liveSchema = z.object({
  meet_url: z
    .string()
    .url("Must be a valid URL")
    .includes("meet.google.com", { message: "Must be a Google Meet link" }),
  title: z.string().max(100).optional(),
});
type LiveForm = z.infer<typeof liveSchema>;

const manualSchema = liveSchema.extend({
  transcript: z.string().min(10, "Transcript must be at least 10 characters"),
});
type ManualForm = z.infer<typeof manualSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewSessionModal({ open, onClose, onCreated }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [loading, setLoading] = useState(false);

  const liveForm = useForm<LiveForm>({ resolver: zodResolver(liveSchema) });
  const manualForm = useForm<ManualForm>({ resolver: zodResolver(manualSchema) });

  const resetAll = () => {
    setMode("choose");
    setLoading(false);
    liveForm.reset();
    manualForm.reset();
  };

  const close = () => {
    resetAll();
    onClose();
  };

  // ── Live bot flow: create session → launch bot → push user to detail page.
  const onLive = async (data: LiveForm) => {
    setLoading(true);
    try {
      const sessRes = await sessionsApi.create(data.meet_url, data.title || undefined);
      const sessionId: string = sessRes.data.id;

      await botApi.launch(sessionId);

      toast.success("Session created — taking you to the capture page.");
      onCreated();
      resetAll();
      router.push(`/dashboard/sessions/${sessionId}`);
    } catch (err: unknown) {
      const msg = extractError(err) ?? "Failed to launch bot";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Manual flow: create session → submit transcript → Gemini summarizes.
  const onManual = async (data: ManualForm) => {
    setLoading(true);
    try {
      const sessRes = await sessionsApi.create(data.meet_url, data.title || undefined);
      const sessionId: string = sessRes.data.id;

      await api.post(`/api/sessions/${sessionId}/transcript`, { text: data.transcript });

      toast.success("Transcript submitted — Gemini is generating your summary.");
      onCreated();
      resetAll();
      router.push(`/dashboard/sessions/${sessionId}`);
    } catch (err: unknown) {
      const msg = extractError(err) ?? "Failed to process transcript";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={close}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glass-bright rounded-3xl p-8 w-full max-w-lg shadow-plasma border border-plasma/20 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="w-11 h-11 rounded-xl bg-plasma/15 border border-plasma/25 flex items-center justify-center mb-4">
                    {mode === "live" ? <Mic size={20} className="text-plasma-400" />
                      : mode === "manual" ? <FileText size={20} className="text-plasma-400" />
                      : <Sparkles size={20} className="text-plasma-400" />}
                  </div>
                  <h2 className="font-display font-700 text-xl text-white">
                    {mode === "live" ? "Launch AI Scribe Bot"
                      : mode === "manual" ? "Paste a Transcript"
                      : "New Session"}
                  </h2>
                  <p className="text-white/40 text-sm font-body mt-1">
                    {mode === "live"
                      ? "The bot joins your Meet (via tab-audio capture) and transcribes it live."
                      : mode === "manual"
                      ? "Already have the transcript? Paste it here and Gemini summarizes it."
                      : "How would you like to scribe this meeting?"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close dialog"
                  onClick={close}
                  className="text-white/25 hover:text-white/60 transition-colors mt-1"
                >
                  <X size={20} />
                </button>
              </div>

              {mode === "choose" && (
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setMode("live")}
                    className="text-left group relative overflow-hidden rounded-2xl border border-plasma/25 bg-plasma/8 hover:bg-plasma/12 hover:border-plasma/40 transition-all p-5"
                  >
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-xl bg-plasma/20 border border-plasma/30 flex items-center justify-center shrink-0">
                        <Mic size={18} className="text-plasma-300" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display font-600 text-white text-sm mb-1 flex items-center gap-2">
                          Launch AI Bot (recommended)
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-aurora-cyan/15 text-aurora-cyan border border-aurora-cyan/20">
                            LIVE
                          </span>
                        </p>
                        <p className="text-xs text-white/50 font-body leading-relaxed">
                          Bot joins your Meet tab, listens live, and streams audio to
                          Gemini for real-time transcription and summarization.
                        </p>
                      </div>
                      <ArrowRight size={16} className="text-white/30 group-hover:text-plasma-300 group-hover:translate-x-0.5 transition-all mt-1 shrink-0" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("manual")}
                    className="text-left group relative overflow-hidden rounded-2xl border border-white/10 bg-white/3 hover:bg-white/6 hover:border-white/20 transition-all p-5"
                  >
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <FileText size={18} className="text-white/60" />
                      </div>
                      <div className="flex-1">
                        <p className="font-display font-600 text-white text-sm mb-1">
                          Paste a transcript
                        </p>
                        <p className="text-xs text-white/50 font-body leading-relaxed">
                          Already have the meeting transcript (from Meet captions or
                          another tool)? Paste it and Gemini generates the summary.
                        </p>
                      </div>
                      <ArrowRight size={16} className="text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all mt-1 shrink-0" />
                    </div>
                  </button>
                </div>
              )}

              {mode === "live" && (
                <form onSubmit={liveForm.handleSubmit(onLive)} className="flex flex-col gap-5">
                  <Input
                    label="Google Meet URL"
                    placeholder="https://meet.google.com/abc-defg-hij"
                    icon={<LinkIcon size={14} />}
                    error={liveForm.formState.errors.meet_url?.message}
                    {...liveForm.register("meet_url")}
                  />
                  <Input
                    label="Title (optional)"
                    placeholder="Weekly standup, Design review…"
                    error={liveForm.formState.errors.title?.message}
                    {...liveForm.register("title")}
                  />

                  <div className="rounded-xl bg-plasma/8 border border-plasma/15 p-4 space-y-2">
                    <p className="text-xs text-plasma-300 font-display font-600">
                      One-time setup on the next screen:
                    </p>
                    <ol className="text-xs text-white/60 font-body leading-relaxed space-y-1 list-decimal list-inside marker:text-plasma-400">
                      <li>Open the Meet link in a new tab (we give you a button).</li>
                      <li>Click <strong>Start capture</strong>, pick that tab in the dialog.</li>
                      <li>
                        <strong>Tick &ldquo;Share tab audio&rdquo;</strong> before hitting Share —
                        that&apos;s the whole trick.
                      </li>
                    </ol>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="ghost" type="button" onClick={() => setMode("choose")} className="flex-1">
                      Back
                    </Button>
                    <Button type="submit" loading={loading} className="flex-1">
                      {loading ? "Creating…" : "Continue"}
                    </Button>
                  </div>
                </form>
              )}

              {mode === "manual" && (
                <form onSubmit={manualForm.handleSubmit(onManual)} className="flex flex-col gap-5">
                  <Input
                    label="Google Meet URL"
                    placeholder="https://meet.google.com/abc-defg-hij"
                    icon={<LinkIcon size={14} />}
                    error={manualForm.formState.errors.meet_url?.message}
                    {...manualForm.register("meet_url")}
                  />
                  <Input
                    label="Title (optional)"
                    placeholder="Weekly standup, Design review…"
                    error={manualForm.formState.errors.title?.message}
                    {...manualForm.register("title")}
                  />

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-white/50 font-mono uppercase tracking-wider">
                      Meeting Transcript
                    </label>
                    <textarea
                      placeholder="Paste the meeting transcript here..."
                      rows={6}
                      className="w-full bg-white/4 border rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 transition-all duration-200 font-body border-white/8 focus:border-plasma/60 focus:ring-plasma/20 hover:border-white/15 resize-y"
                      {...manualForm.register("transcript")}
                    />
                    {manualForm.formState.errors.transcript && (
                      <p className="text-xs text-aurora-rose">
                        {manualForm.formState.errors.transcript.message}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button variant="ghost" type="button" onClick={() => setMode("choose")} className="flex-1">
                      Back
                    </Button>
                    <Button type="submit" loading={loading} className="flex-1">
                      {loading ? "Processing…" : "Generate Summary"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function extractError(err: unknown): string | null {
  const maybe = err as { response?: { data?: { detail?: string } }; message?: string };
  return maybe?.response?.data?.detail ?? maybe?.message ?? null;
}
