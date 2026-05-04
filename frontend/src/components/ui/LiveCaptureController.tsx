"use client";

/**
 * BotStatusPanel — formerly the in-browser tab-audio capturer.
 *
 * Now that the server runs a real Playwright bot that joins the Meet as a
 * participant, this component just shows the bot's status and gives the user
 * a button to stop the bot when the meeting's done.
 */

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  Mic, MicOff, Loader2, Radio, Video, AlertTriangle, CheckCircle,
} from "lucide-react";
import { Button, Card } from "@/components/ui";

interface Props {
  sessionId: string;
  meetUrl: string;
  status: string;
  chunkCount?: number;
  lastTranscript?: string;
  errorMessage?: string;
  onStopped?: () => void;
}

export default function LiveCaptureController({
  sessionId,
  meetUrl,
  status,
  chunkCount = 0,
  lastTranscript,
  errorMessage,
  onStopped,
}: Props) {
  const [stopping, setStopping] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRecording = status === "recording";
  const isJoining = status === "joining";
  const isProcessing = status === "processing";
  const isFailed = status === "failed";
  const isDone = status === "completed";

  useEffect(() => {
    if (isRecording && !startRef.current) startRef.current = Date.now();
    if (!isRecording && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (isRecording && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - (startRef.current ?? Date.now())) / 1000));
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const openMeetTab = () => {
    window.open(meetUrl, "_blank", "noopener,noreferrer");
  };

  const stop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      const res = await fetch("/api/bot/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Bot stopped — generating summary");
      onStopped?.();
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to stop: ${m}`);
    } finally {
      setStopping(false);
    }
  };

  const mmss = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const r = (s % 60).toString().padStart(2, "0");
    return `${m}:${r}`;
  };

  const headlineByStatus: Record<string, string> = {
    pending: "Waiting to launch",
    joining: "Bot is asking to join the meeting…",
    recording: "Bot is in the meeting and recording",
    processing: "Generating summary…",
    completed: "Done — summary ready",
    failed: "Bot couldn't join",
    stopped: "Stopped",
  };

  return (
    <Card className="border-plasma/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            isRecording
              ? "bg-aurora-rose/15 border-aurora-rose/30"
              : isFailed
                ? "bg-aurora-rose/15 border-aurora-rose/30"
                : isDone
                  ? "bg-aurora-cyan/15 border-aurora-cyan/30"
                  : "bg-plasma/10 border-plasma/20"
          }`}>
            {isRecording ? (
              <Radio size={18} className="text-aurora-rose animate-pulse" />
            ) : isFailed ? (
              <AlertTriangle size={18} className="text-aurora-rose" />
            ) : isDone ? (
              <CheckCircle size={18} className="text-aurora-cyan" />
            ) : isJoining || isProcessing ? (
              <Loader2 size={18} className="text-plasma-400 animate-spin" />
            ) : (
              <Mic size={18} className="text-plasma-400" />
            )}
          </div>
          <div>
            <h3 className="font-display font-700 text-white text-base">
              {headlineByStatus[status] ?? "AI Scribe Bot"}
            </h3>
            <p className="text-white/40 text-xs font-body mt-0.5">
              {isRecording && `${mmss(elapsed)} · ${chunkCount} chunks transcribed`}
              {isJoining && "The Meet host needs to click \"Admit\" — usually takes a few seconds."}
              {isProcessing && "Gemini is writing the summary."}
              {isDone && "Switch to the Summary tab to read it."}
              {isFailed && (errorMessage ?? "See logs.")}
              {!isRecording && !isJoining && !isProcessing && !isDone && !isFailed &&
                "Idle."}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={openMeetTab}>
            <Video size={14} /> Open Meet
          </Button>
          {(isRecording || isJoining) && (
            <Button variant="danger" size="sm" onClick={stop} loading={stopping}>
              <MicOff size={14} /> Stop & summarize
            </Button>
          )}
        </div>
      </div>

      {isFailed && errorMessage && (
        <div className="mt-3 p-3 rounded-lg bg-aurora-rose/10 border border-aurora-rose/20 flex gap-2 items-start">
          <AlertTriangle size={14} className="text-aurora-rose mt-0.5 shrink-0" />
          <p className="text-xs text-aurora-rose/90 font-body leading-relaxed whitespace-pre-wrap">
            {errorMessage}
          </p>
        </div>
      )}

      {isJoining && (
        <div className="mt-3 p-3 rounded-lg bg-plasma/5 border border-plasma/15">
          <p className="text-xs text-plasma-200 font-body leading-relaxed">
            <strong>Almost there:</strong> the AI Scribe Bot just sent a join
            request to your Meet. Open the meeting tab and click{" "}
            <strong>Admit</strong> when you see the request from{" "}
            <em>AI Scribe Bot</em>. It will start recording the moment it&apos;s in.
          </p>
        </div>
      )}

      {isRecording && lastTranscript && (
        <div className="mt-3 p-3 rounded-lg bg-white/3 border border-white/10">
          <p className="text-[10px] text-white/30 font-mono uppercase tracking-wider mb-1">
            Latest chunk
          </p>
          <p className="text-xs text-white/70 font-body line-clamp-3">{lastTranscript}</p>
        </div>
      )}
    </Card>
  );
}
