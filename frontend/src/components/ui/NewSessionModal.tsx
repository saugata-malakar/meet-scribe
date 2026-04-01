"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link as LinkIcon, Video, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { sessionsApi, botApi } from "@/lib/api";
import { Button, Input } from "@/components/ui";

const schema = z.object({
  meet_url: z
    .string()
    .url("Must be a valid URL")
    .includes("meet.google.com", { message: "Must be a Google Meet link" }),
  title: z.string().max(100).optional(),
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

      // 2. Launch the bot
      await botApi.launch(sessionId);

      toast.success("Bot launched! It will join the meeting shortly.");
      reset();
      onCreated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail ?? "Failed to launch bot";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glass-bright rounded-3xl p-8 w-full max-w-md shadow-plasma border border-plasma/20">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="w-11 h-11 rounded-xl bg-plasma/15 border border-plasma/25 flex items-center justify-center mb-4">
                    <Video size={20} className="text-plasma-400" />
                  </div>
                  <h2 className="font-display font-700 text-xl text-white">Launch AI Bot</h2>
                  <p className="text-white/40 text-sm font-body mt-1">
                    Bot will join as a silent participant and transcribe the meeting.
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

                {/* Info box */}
                <div className="rounded-xl bg-plasma/8 border border-plasma/15 p-4">
                  <p className="text-xs text-plasma-300 font-body leading-relaxed">
                    ℹ️ The bot will appear as <strong>&quot;AI Scribe Bot&quot;</strong> in the meeting.
                    It captures audio, transcribes with Google STT, and generates a Gemini summary when
                    you stop it or when the meeting ends.
                  </p>
                </div>

                <div className="flex gap-3 mt-2">
                  <Button variant="ghost" type="button" onClick={onClose} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" loading={loading} className="flex-1">
                    {loading ? "Launching…" : "Launch Bot"}
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
