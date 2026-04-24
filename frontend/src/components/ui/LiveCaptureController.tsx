"use client";

/**
 * LiveCaptureController — the in-browser "bot".
 *
 * The user keeps a Google Meet tab open themselves. When they click "Start
 * capture" here, the browser prompts for screen/tab share; they pick the Meet
 * tab and tick "Share tab audio". We slice that MediaStream with MediaRecorder
 * into ~5 s webm/opus chunks and stream them over a WebSocket to the backend.
 *
 * Why this is the right shape: Vercel/Render free tiers can't run a headful
 * Chromium with Xvfb + PulseAudio, and Google Meet aggressively blocks
 * headless automation anyway. Having the real user be the one "in" the
 * meeting sidesteps both problems entirely and matches how other consumer
 * meeting-scribes (tl;dv's extension, Otter, Fathom) capture audio.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import toast from "react-hot-toast";
import { Mic, MicOff, Loader2, Radio, Video, AlertTriangle } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { WS_URL } from "@/lib/api";

type Phase =
  | "idle"          // waiting for the user to click Start
  | "requesting"    // waiting for getDisplayMedia to resolve
  | "connecting"    // opening WS + handshake
  | "recording"     // audio flowing
  | "stopping"      // waiting for final chunks + finalize
  | "error";

interface Props {
  sessionId: string;
  meetUrl: string;
  onStopped?: () => void;
}

const CHUNK_MS = 5000; // slice every 5s so chunks arrive during the call

export default function LiveCaptureController({
  sessionId,
  meetUrl,
  onStopped,
}: Props) {
  const { getToken } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [lastTranscript, setLastTranscript] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingChunksRef = useRef<Blob[]>([]);
  const wsReadyRef = useRef(false);

  const openMeetTab = () => {
    window.open(meetUrl, "_blank", "noopener,noreferrer");
  };

  // ── Cleanup (always safe to call)
  const cleanup = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch { /* ignore */ }
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    try {
      if (wsRef.current && wsRef.current.readyState <= 1) {
        wsRef.current.close();
      }
    } catch { /* ignore */ }
    wsRef.current = null;
    wsReadyRef.current = false;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── Stop (graceful)
  const stop = useCallback(async () => {
    if (phase === "idle" || phase === "stopping") return;
    setPhase("stopping");
    try {
      // Flush the recorder so any buffered audio fires ondataavailable.
      try { recorderRef.current?.requestData(); } catch { /* ignore */ }
      try { recorderRef.current?.stop(); } catch { /* ignore */ }

      // Tell the backend we're done and let it finalize the summary.
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "stop" }));
        } catch { /* ignore */ }
      }

      // Give the server a moment to finalize before closing.
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      cleanup();
      setPhase("idle");
      setChunkCount(0);
      setElapsed(0);
      onStopped?.();
    }
  }, [phase, cleanup, onStopped]);

  // ── Start
  const start = useCallback(async () => {
    setErrorMsg(null);
    setChunkCount(0);
    setLastTranscript("");

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setErrorMsg("Your browser doesn't support tab audio capture. Use Chrome or Edge on desktop.");
      setPhase("error");
      return;
    }

    setPhase("requesting");

    // 1. Ask the user to share their Meet tab.
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
        `Couldn't start capture: ${m}. Tick "Share tab audio" when the browser asks.`
      );
      setPhase("error");
      return;
    }

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      setErrorMsg(
        "No audio track was shared. Re-try and make sure you tick \"Share tab audio\" in the dialog."
      );
      setPhase("error");
      return;
    }

    // Drop the video track — we only need audio, no point in uploading video.
    stream.getVideoTracks().forEach((t) => t.stop());
    const audioOnly = new MediaStream(stream.getAudioTracks());
    streamRef.current = audioOnly;

    // If the user stops sharing from the browser's native "Stop sharing" button,
    // gracefully finish.
    audioOnly.getAudioTracks()[0].addEventListener("ended", () => {
      stop();
    });

    // 2. Open the WS, authenticate.
    setPhase("connecting");
    const token = await getToken();
    if (!token) {
      setErrorMsg("Not signed in.");
      setPhase("error");
      cleanup();
      return;
    }

    const ws = new WebSocket(`${WS_URL}/api/bot/stream/${sessionId}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WS handshake timed out")), 15000);
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ type: "auth", token }));
      });
      ws.addEventListener("message", (e) => {
        try {
          const msg = JSON.parse(typeof e.data === "string" ? e.data : "");
          if (msg.type === "ready") {
            clearTimeout(timeout);
            resolve();
          } else if (msg.type === "error") {
            clearTimeout(timeout);
            reject(new Error(msg.error || "WS auth error"));
          } else if (msg.type === "chunk_ack") {
            setChunkCount((c) => c + 1);
            if (msg.text) setLastTranscript(String(msg.text));
          }
        } catch { /* non-JSON frames — ignore */ }
      });
      ws.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("WS connection error"));
      });
      ws.addEventListener("close", () => {
        wsReadyRef.current = false;
      });
    });

    try {
      await readyPromise;
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Couldn't connect to the scribe server: ${m}`);
      setPhase("error");
      cleanup();
      return;
    }

    wsReadyRef.current = true;

    // 3. Start the MediaRecorder, streaming chunks to the backend.
    const mimeType = pickSupportedMime();
    const recorder = new MediaRecorder(audioOnly, {
      mimeType,
      audioBitsPerSecond: 96_000,
    });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        pendingChunksRef.current.push(event.data);
        flushQueue();
      }
    };
    recorder.onerror = (e) => {
      console.error("MediaRecorder error", e);
    };
    recorder.start(CHUNK_MS);
    recorderRef.current = recorder;

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000));
    }, 1000);

    setPhase("recording");
    toast.success("Listening. Keep this tab open in the background.");
  }, [getToken, sessionId, cleanup, stop]);

  // Send any buffered chunks once the WS is ready (chunks can accumulate if
  // the recorder emits before auth finishes).
  const flushQueue = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    while (pendingChunksRef.current.length > 0) {
      const blob = pendingChunksRef.current.shift();
      if (!blob) continue;
      try {
        const buf = await blob.arrayBuffer();
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(buf);
      } catch (err) {
        console.error("chunk send failed", err);
      }
    }
  }, []);

  // ── UI helpers
  const mmss = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const r = (s % 60).toString().padStart(2, "0");
    return `${m}:${r}`;
  };

  const isRecording = phase === "recording";
  const isBusy = phase === "requesting" || phase === "connecting" || phase === "stopping";

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
              {phase === "requesting" ? "Waiting for permission…"
                : phase === "connecting" ? "Connecting…"
                : "Start capture"}
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
