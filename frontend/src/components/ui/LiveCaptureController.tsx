"use client";

/**
 * LiveCaptureController — the in-browser "bot".
 *
 * The user keeps a Google Meet tab open themselves. When they click "Start
 * capture" here, the browser prompts for screen/tab share; they pick the Meet
 * tab and tick "Share tab audio". MediaRecorder slices that stream into ~5s
 * webm/opus chunks and each chunk is POSTed to /api/bot/chunk.
 *
 * HTTP, not WebSocket: Next.js route handlers on a single Render dyno handle
 * form-data POSTs natively. No custom server, no WS upgrade, no nginx.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { Mic, MicOff, Loader2, Radio, Video, AlertTriangle } from "lucide-react";
import { Button, Card } from "@/components/ui";

type Phase =
  | "idle"
  | "requesting"
  | "recording"
  | "stopping"
  | "error";

interface Props {
  sessionId: string;
  meetUrl: string;
  onStopped?: () => void;
}

const CHUNK_MS = 5000;

export default function LiveCaptureController({
  sessionId,
  meetUrl,
  onStopped,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [lastTranscript, setLastTranscript] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sequenceRef = useRef(0);
  const inFlightRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const openMeetTab = () => {
    window.open(meetUrl, "_blank", "noopener,noreferrer");
  };

  const cleanup = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch { /* ignore */ }
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const uploadChunk = useCallback(async (blob: Blob, seq: number) => {
    if (blob.size === 0) return;
    inFlightRef.current += 1;
    try {
      const form = new FormData();
      form.append("session_id", sessionId);
      form.append("sequence", String(seq));
      form.append("audio", blob, `chunk-${seq}.webm`);

      const res = await fetch("/api/bot/chunk", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        console.error("chunk POST failed", res.status);
        return;
      }
      const data = await res.json().catch(() => null);
      setChunkCount((c) => c + 1);
      if (data?.text) setLastTranscript(String(data.text));
    } catch (err) {
      console.error("chunk upload error", err);
    } finally {
      inFlightRef.current -= 1;
    }
  }, [sessionId]);

  const stop = useCallback(async () => {
    if (phase === "idle" || phase === "stopping") return;
    setPhase("stopping");
    try {
      try { recorderRef.current?.requestData(); } catch { /* ignore */ }
      try { recorderRef.current?.stop(); } catch { /* ignore */ }

      // Wait briefly for any final chunk POSTs to drain.
      const deadline = Date.now() + 8000;
      while (inFlightRef.current > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }

      // Tell the backend we're done — it runs the summary.
      await fetch("/api/bot/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
        credentials: "include",
      }).catch(() => { /* best-effort */ });
    } finally {
      cleanup();
      setPhase("idle");
      setChunkCount(0);
      setElapsed(0);
      onStopped?.();
    }
  }, [phase, cleanup, onStopped, sessionId]);

  const start = useCallback(async () => {
    setErrorMsg(null);
    setChunkCount(0);
    setLastTranscript("");
    sequenceRef.current = 0;
    inFlightRef.current = 0;

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setErrorMsg("Your browser doesn't support tab audio capture. Use Chrome or Edge on desktop.");
      setPhase("error");
      return;
    }

    setPhase("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        // @ts-expect-error — non-standard hint to Chrome to default to a tab.
        preferCurrentTab: false,
        video: {
          displaySurface: "browser",
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 1 },
        },
      });
    } catch (err) {
      const m = err instanceof Error ? err.message : "Permission denied";
      setErrorMsg(
        `Couldn't start capture: ${m}. Tick "Share tab audio" when the browser asks.`,
      );
      setPhase("error");
      return;
    }

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      setErrorMsg(
        "No audio track was shared. Re-try and make sure you tick \"Share tab audio\" in the dialog.",
      );
      setPhase("error");
      return;
    }

    stream.getVideoTracks().forEach((t) => t.stop());
    const audioOnly = new MediaStream(stream.getAudioTracks());
    streamRef.current = audioOnly;

    audioOnly.getAudioTracks()[0].addEventListener("ended", () => { stop(); });

    const mimeType = pickSupportedMime();
    const recorder = new MediaRecorder(audioOnly, {
      mimeType,
      audioBitsPerSecond: 96_000,
    });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        const seq = sequenceRef.current++;
        void uploadChunk(event.data, seq);
      }
    };
    recorder.onerror = (e) => { console.error("MediaRecorder error", e); };
    recorder.start(CHUNK_MS);
    recorderRef.current = recorder;

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000));
    }, 1000);

    setPhase("recording");
    toast.success("Listening. Keep this tab open in the background.");
  }, [stop, uploadChunk]);

  const mmss = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const r = (s % 60).toString().padStart(2, "0");
    return `${m}:${r}`;
  };

  const isRecording = phase === "recording";
  const isBusy = phase === "requesting" || phase === "stopping";

  return (
    <Card className="border-plasma/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            isRecording
              ? "bg-aurora-rose/15 border-aurora-rose/30"
              : "bg-plasma/10 border-plasma/20"
          }`}>
            {isRecording ? (
              <Radio size={18} className="text-aurora-rose animate-pulse" />
            ) : (
              <Mic size={18} className="text-plasma-400" />
            )}
          </div>
          <div>
            <h3 className="font-display font-700 text-white text-base">
              {isRecording ? "Live capture in progress" : "Live AI Capture"}
            </h3>
            <p className="text-white/40 text-xs font-body mt-0.5">
              {isRecording
                ? `${mmss(elapsed)} · ${chunkCount} chunks transcribed`
                : "Capture the Meet tab audio. Works in Chrome, Edge, and Arc."}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {!isRecording && (
            <Button variant="ghost" size="sm" onClick={openMeetTab}>
              <Video size={14} /> Open Meet
            </Button>
          )}
          {!isRecording && phase !== "stopping" && (
            <Button size="sm" onClick={start} loading={isBusy} disabled={isBusy}>
              <Mic size={14} />
              {phase === "requesting" ? "Waiting for permission…" : "Start capture"}
            </Button>
          )}
          {isRecording && (
            <Button variant="danger" size="sm" onClick={stop}>
              <MicOff size={14} /> Stop & summarize
            </Button>
          )}
        </div>
      </div>

      {phase === "error" && errorMsg && (
        <div className="mt-3 p-3 rounded-lg bg-aurora-rose/10 border border-aurora-rose/20 flex gap-2 items-start">
          <AlertTriangle size={14} className="text-aurora-rose mt-0.5 shrink-0" />
          <p className="text-xs text-aurora-rose/90 font-body leading-relaxed">{errorMsg}</p>
        </div>
      )}

      {phase === "idle" && (
        <div className="mt-3 p-3 rounded-lg bg-plasma/5 border border-plasma/15">
          <p className="text-xs text-plasma-200 font-body leading-relaxed">
            <strong>How it works:</strong> open your Google Meet in a new tab (use
            the <em>Open Meet</em> button). Come back here, click <em>Start
            capture</em>, pick the Meet tab in the browser dialog, and tick
            <em> Share tab audio</em>. We&apos;ll stream the audio to Gemini,
            transcribe it live, and generate the full summary when you stop.
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

      {phase === "stopping" && (
        <div className="mt-3 flex items-center gap-2 text-xs text-aurora-amber font-mono">
          <Loader2 size={12} className="animate-spin" />
          Finalizing and generating summary…
        </div>
      )}
    </Card>
  );
}

function pickSupportedMime(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) {
      return c;
    }
  }
  return "audio/webm";
}
