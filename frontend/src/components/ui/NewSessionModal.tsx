"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link as LinkIcon, Video, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { sessionsApi, api } from "@/lib/api";
import { Button, Input } from "@/components/ui";

const schema = z.object({
  meet_url: z
    .string()
    .url("Must be a valid URL")
    .includes("meet.google.com", { message: "Must be a Google Meet link" }),
  title: z.string().max(100).optional(),
  transcript: z.string().min(10, "Transcript must be at least 10 characters"),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function NewSessionModal({ open, onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      // 1. Create session record
      const sessRes = await sessionsApi.create(data.meet_url, data.title || undefined);
      const sessionId = sessRes.data.id;

      // 2. Submit transcript for Gemini summarization
      await api.post(`/api/sessions/${sessionId}/transcript`, {
        text: data.transcript,
      });

      toast.success("Transcript submitted! Gemini is generating your summary.");
      reset();
      onCreated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail ?? "Failed to process transcript";
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
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glass-bright rounded-3xl p-8 w-full max-w-md shadow-plasma border border-plasma/20 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="w-11 h-11 rounded-xl bg-plasma/15 border border-plasma/25 flex items-center justify-center mb-4">
                    <FileText size={20} className="text-plasma-400" />
                  </div>
                  <h2 className="font-display font-700 text-xl text-white">New Session</h2>
                  <p className="text-white/40 text-sm font-body mt-1">
                    Paste your meeting transcript and Gemini will generate a summary.
                  </p>
                </div>
                <button onClick={onClose} className="text-white/25 hover:text-white/60 transition-colors mt-1">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
                <Input
                  label="Google Meet URL"
                  placeholder="https://meet.google.com/abc-defg-hij"
                  icon={<LinkIcon size={14} />}
                  error={errors.meet_url?.message}
                  {...register("meet_url")}
                />
                <Input
                  label="Title (optional)"
                  placeholder="Weekly standup, Design review…"
                  error={errors.title?.message}
                  {...register("title")}
                />

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-white/50 font-mono uppercase tracking-wider">
                    Meeting Transcript
                  </label>
                  <textarea
                    placeholder="Paste the meeting transcript here..."
                    rows={6}
                    className="w-full bg-white/4 border rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 transition-all duration-200 font-body border-white/8 focus:border-plasma/60 focus:ring-plasma/20 hover:border-white/15 resize-y"
                    {...register("transcript")}
                  />
                  {errors.transcript && (
                    <p className="text-xs text-aurora-rose">{errors.transcript.message}</p>
                  )}
                </div>

                <div className="rounded-xl bg-plasma/8 border border-plasma/15 p-4">
                  <p className="text-xs text-plasma-300 font-body leading-relaxed">
                    ℹ️ Paste your meeting transcript above. <strong>Gemini AI</strong> will
                    analyze it and generate action items, key decisions, participants, and
                    a structured summary automatically.
                  </p>
                </div>

                <div className="flex gap-3 mt-2">
                  <Button variant="ghost" type="button" onClick={onClose} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" loading={loading} className="flex-1">
                    {loading ? "Processing…" : "Generate Summary"}
                  </Button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
