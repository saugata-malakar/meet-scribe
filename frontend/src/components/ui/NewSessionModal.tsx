"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Link as LinkIcon, Mic, FileText, Sparkles, ArrowRight,
  Globe, Users, Layers, Wand2, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import {
  sessionsApi, botApi, api, warmBackend, ScribeConfig,
} from "@/lib/api";
import { Button, Input } from "@/components/ui";

type Mode = "choose" | "live" | "live_config" | "manual";

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

// ── Scribe customization state (third step of live flow) ────────────────────

const LANGUAGES: { code: string; label: string }[] = [
  { code: "auto", label: "Auto-detect" },
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-IN", label: "English (India)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "mr-IN", label: "Marathi" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese (BR)" },
  { code: "it-IT", label: "Italian" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "ar-SA", label: "Arabic" },
  { code: "ru-RU", label: "Russian" },
];

const SUMMARY_LANG_OPTIONS = [
  { code: "same", label: "Same as transcript" },
  ...LANGUAGES.filter((l) => l.code !== "auto"),
];

const SUMMARY_STYLES: { code: "brief" | "standard" | "detailed"; label: string; help: string }[] = [
  { code: "brief", label: "Brief", help: "3–5 bullet recap" },
  { code: "standard", label: "Standard", help: "2–3 paragraph summary" },
  { code: "detailed", label: "Detailed", help: "Per-topic deep breakdown" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface CustomizationState {
  language: string;
  additional_languages: string[];
  summary_language: string;
  summary_style: "brief" | "standard" | "detailed";
  summary_audience: string;
  speaker_hints_raw: string;
  long_meeting_mode: boolean;
  extra_instructions: string;
}

const defaultConfig: CustomizationState = {
  language: "auto",
  additional_languages: [],
  summary_language: "same",
  summary_style: "standard",
  summary_audience: "",
  speaker_hints_raw: "",
  long_meeting_mode: false,
  extra_instructions: "",
};

export default function NewSessionModal({ open, onClose, onCreated }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [loading, setLoading] = useState(false);
  const [pendingLive, setPendingLive] = useState<LiveForm | null>(null);
  const [config, setConfig] = useState<CustomizationState>(defaultConfig);

  const liveForm = useForm<LiveForm>({ resolver: zodResolver(liveSchema) });
  const manualForm = useForm<ManualForm>({ resolver: zodResolver(manualSchema) });

  // Warm Render's dyno the moment the modal opens so /launch doesn't
  // cold-start 40+s later while the user's already clicked Continue.
  useEffect(() => {
    if (open) warmBackend();
  }, [open]);

  const resetAll = () => {
    setMode("choose");
    setLoading(false);
    setPendingLive(null);
    setConfig(defaultConfig);
    liveForm.reset();
    manualForm.reset();
  };

  const close = () => {
    resetAll();
    onClose();
  };

  // Step 1 of live flow: URL + title → goes to customization step.
  const onLiveDetails = (data: LiveForm) => {
    setPendingLive(data);
    setMode("live_config");
  };

  // Step 2 of live flow: customization → create + launch + navigate.
  const onLaunchLive = async () => {
    if (!pendingLive) return;
    setLoading(true);

    const scribeConfig: ScribeConfig = {
      language: config.language,
      additional_languages: config.additional_languages,
      summary_language: config.summary_language,
      summary_style: config.summary_style,
      summary_audience: config.summary_audience.trim(),
      speaker_hints: parseSpeakers(config.speaker_hints_raw),
      long_meeting_mode: config.long_meeting_mode,
      extra_instructions: config.extra_instructions.trim(),
    };

    try {
      const sessRes = await sessionsApi.create(
        pendingLive.meet_url, pendingLive.title || undefined
      );
      const sessionId: string = sessRes.data.id;

      await botApi.launch(sessionId, { config: scribeConfig });

      toast.success("Bot ready — taking you to the capture page.");
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

  // Manual flow unchanged.
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

  const titleByMode: Record<Mode, string> = {
    choose: "New Session",
    live: "Launch AI Scribe Bot",
    live_config: "Customize the Scribe",
    manual: "Paste a Transcript",
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
            <div className="glass-bright rounded-3xl p-8 w-full max-w-xl shadow-plasma border border-plasma/20 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="w-11 h-11 rounded-xl bg-plasma/15 border border-plasma/25 flex items-center justify-center mb-4">
                    {mode === "live" && <Mic size={20} className="text-plasma-400" />}
                    {mode === "live_config" && <Wand2 size={20} className="text-plasma-400" />}
                    {mode === "manual" && <FileText size={20} className="text-plasma-400" />}
                    {mode === "choose" && <Sparkles size={20} className="text-plasma-400" />}
                  </div>
                  <h2 className="font-display font-700 text-xl text-white">
                    {titleByMode[mode]}
                  </h2>
                  <p className="text-white/40 text-sm font-body mt-1">
                    {mode === "live" && "The bot joins your Meet via tab-audio capture and transcribes it live."}
                    {mode === "live_config" && "Tune language, speaker labels, and how the summary is written."}
                    {mode === "manual" && "Already have the transcript? Paste it and Gemini summarizes it."}
                    {mode === "choose" && "How would you like to scribe this meeting?"}
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
                          Gemini for real-time multi-speaker transcription and summary.
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
                          Already have the meeting transcript? Paste it and Gemini
                          generates the structured summary.
                        </p>
                      </div>
                      <ArrowRight size={16} className="text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all mt-1 shrink-0" />
                    </div>
                  </button>
                </div>
              )}

              {mode === "live" && (
                <form onSubmit={liveForm.handleSubmit(onLiveDetails)} className="flex flex-col gap-5">
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
                      Next: customize the scribe, then start capture.
                    </p>
                    <ol className="text-xs text-white/60 font-body leading-relaxed space-y-1 list-decimal list-inside marker:text-plasma-400">
                      <li>Choose language(s), speaker names, and summary style.</li>
                      <li>Open the Meet link in a new tab on the next screen.</li>
                      <li>Click <strong>Start capture</strong>, pick that tab, and tick
                        <strong> &ldquo;Share tab audio&rdquo;</strong>.</li>
                    </ol>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="ghost" type="button" onClick={() => setMode("choose")} className="flex-1">
                      Back
                    </Button>
                    <Button type="submit" className="flex-1">
                      Continue <ArrowRight size={14} />
                    </Button>
                  </div>
                </form>
              )}

              {mode === "live_config" && (
                <div className="flex flex-col gap-5">
                  {/* Languages */}
                  <Section icon={<Globe size={14} />} title="Languages">
                    <LabeledSelect
                      label="Primary spoken language"
                      value={config.language}
                      onChange={(v) => setConfig({ ...config, language: v })}
                      options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                    />
                    <MultiSelect
                      label="Additional languages (code-switching)"
                      values={config.additional_languages}
                      onChange={(vs) => setConfig({ ...config, additional_languages: vs })}
                      options={LANGUAGES.filter((l) => l.code !== "auto").map((l) => ({
                        value: l.code, label: l.label,
                      }))}
                      hint="Tick any extras for multilingual meetings (e.g. Hinglish = English + Hindi)."
                    />
                    <LabeledSelect
                      label="Summary language"
                      value={config.summary_language}
                      onChange={(v) => setConfig({ ...config, summary_language: v })}
                      options={SUMMARY_LANG_OPTIONS.map((l) => ({ value: l.code, label: l.label }))}
                    />
                  </Section>

                  {/* Speakers */}
                  <Section icon={<Users size={14} />} title="Speakers">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-white/50 font-mono uppercase tracking-wider">
                        Participant names (comma separated)
                      </label>
                      <input
                        type="text"
                        value={config.speaker_hints_raw}
                        onChange={(e) => setConfig({ ...config, speaker_hints_raw: e.target.value })}
                        placeholder="Priya, Alex, Jordan"
                        className="w-full bg-white/4 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-plasma/60 focus:ring-1 focus:ring-plasma/20 font-body"
                      />
                      <p className="text-[11px] text-white/35 font-body mt-0.5">
                        Used to label each speaker in the transcript. Skip to use
                        generic &ldquo;Speaker 1 / 2 / 3&rdquo;.
                      </p>
                    </div>
                  </Section>

                  {/* Summary style */}
                  <Section icon={<Layers size={14} />} title="Summary">
                    <div>
                      <label className="text-xs font-medium text-white/50 font-mono uppercase tracking-wider mb-2 block">
                        Style
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {SUMMARY_STYLES.map((s) => (
                          <button
                            key={s.code}
                            type="button"
                            onClick={() => setConfig({ ...config, summary_style: s.code })}
                            className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                              config.summary_style === s.code
                                ? "bg-plasma/15 border-plasma/40"
                                : "bg-white/3 border-white/8 hover:border-white/20"
                            }`}
                          >
                            <p className={`text-xs font-display font-600 ${
                              config.summary_style === s.code ? "text-plasma-300" : "text-white/80"
                            }`}>{s.label}</p>
                            <p className="text-[10px] text-white/40 font-body mt-0.5">{s.help}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-white/50 font-mono uppercase tracking-wider">
                        Audience / tone (optional)
                      </label>
                      <input
                        type="text"
                        value={config.summary_audience}
                        onChange={(e) => setConfig({ ...config, summary_audience: e.target.value })}
                        placeholder="Non-technical executive, engineering team, client recap…"
                        className="w-full bg-white/4 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-plasma/60 focus:ring-1 focus:ring-plasma/20 font-body"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-white/50 font-mono uppercase tracking-wider">
                        Extra instructions (optional)
                      </label>
                      <textarea
                        rows={3}
                        value={config.extra_instructions}
                        onChange={(e) => setConfig({ ...config, extra_instructions: e.target.value })}
                        placeholder="E.g. Call out every risk and open question. Flag anything about the Q3 roadmap."
                        className="w-full bg-white/4 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-plasma/60 focus:ring-1 focus:ring-plasma/20 font-body resize-y"
                      />
                    </div>
                  </Section>

                  {/* Long meeting */}
                  <Section icon={<Clock size={14} />} title="Meeting length">
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={config.long_meeting_mode}
                        onChange={(e) => setConfig({ ...config, long_meeting_mode: e.target.checked })}
                        className="mt-0.5 accent-plasma-400"
                      />
                      <div>
                        <p className="text-sm text-white/80 font-display font-600 group-hover:text-white transition-colors">
                          Long meeting mode (&gt; 60 min)
                        </p>
                        <p className="text-[11px] text-white/40 font-body mt-0.5">
                          Summarize section-by-section first, then fold into the final summary.
                          Keeps detail in long meetings instead of losing it.
                        </p>
                      </div>
                    </label>
                  </Section>

                  <div className="flex gap-3 pt-1">
                    <Button variant="ghost" type="button" onClick={() => setMode("live")} className="flex-1">
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={onLaunchLive}
                      loading={loading}
                      className="flex-1"
                    >
                      {loading ? "Launching…" : "Launch bot"}
                    </Button>
                  </div>
                </div>
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

// ── Helpers + small subcomponents ───────────────────────────────────────────

function parseSpeakers(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function extractError(err: unknown): string | null {
  const maybe = err as {
    response?: { data?: { detail?: string } };
    message?: string;
    code?: string;
  };
  if (maybe?.code === "ECONNABORTED") {
    return "Server is waking up (free-tier cold start). Try again in 30s.";
  }
  return maybe?.response?.data?.detail ?? maybe?.message ?? null;
}

function Section({
  icon, title, children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-plasma-400">{icon}</span>
        <h3 className="text-xs font-display font-700 uppercase tracking-wider text-white/70">{title}</h3>
        <div className="flex-1 h-px bg-white/8" />
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function LabeledSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-white/50 font-mono uppercase tracking-wider">
        {label}
      </label>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/4 border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-plasma/60 focus:ring-1 focus:ring-plasma/20 font-body"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#14121e] text-white">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MultiSelect({
  label, values, onChange, options, hint,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  const toggle = (code: string) => {
    if (values.includes(code)) onChange(values.filter((v) => v !== code));
    else onChange([...values, code]);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-white/50 font-mono uppercase tracking-wider">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-white/3 border border-white/8 max-h-28 overflow-y-auto">
        {options.map((o) => {
          const on = values.includes(o.value);
          return (
            <button
              type="button"
              key={o.value}
              onClick={() => toggle(o.value)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-mono border transition-all ${
                on
                  ? "bg-plasma/20 border-plasma/40 text-plasma-200"
                  : "bg-white/3 border-white/10 text-white/50 hover:border-white/25"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="text-[11px] text-white/35 font-body">{hint}</p>}
    </div>
  );
}
