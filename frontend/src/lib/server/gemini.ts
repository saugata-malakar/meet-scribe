/**
 * Gemini wrapper for transcription + summarization.
 * Both operations run inside Next.js API routes on the server — the
 * GEMINI_API_KEY env var MUST be set on the Render service (server-only,
 * no NEXT_PUBLIC_ prefix).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ScribeConfig } from "./sessionStore";

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server. Set it in Render → Environment.",
    );
  }
  return new GoogleGenerativeAI(key);
}

// ─── Transcription ──────────────────────────────────────────────────────────

export async function transcribeAudio(
  audioBytes: Uint8Array,
  mimeType: string,
  config?: ScribeConfig,
): Promise<string> {
  try {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const languageHint =
      config?.language && config.language !== "auto"
        ? `Primary language hint: ${config.language}. `
        : "";
    const speakers = (config?.speaker_hints ?? []).filter(Boolean);
    const speakerHint =
      speakers.length > 0
        ? `Known speakers (label utterances by name when you can tell): ${speakers.join(", ")}. Fall back to "Speaker 1/2/3" otherwise. `
        : "Prefix each utterance with 'Speaker N: ' if multiple speakers are detectable. ";

    const prompt =
      `You are an expert meeting transcriptionist. Transcribe the audio verbatim in the original spoken language. ` +
      languageHint +
      speakerHint +
      `Produce clean, punctuated prose. If the audio is silent, empty, or unintelligible, reply with the single word NONE and nothing else.`;

    const b64 = bytesToBase64(audioBytes);
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: b64, mimeType } },
    ]);

    const text = result.response.text().trim();
    if (!text || text.toUpperCase().startsWith("NONE")) return "";
    return text;
  } catch (err) {
    console.error("[gemini] transcription failed:", err);
    return "";
  }
}

// ─── Summarization ──────────────────────────────────────────────────────────

export interface SummaryOutput {
  title: string;
  summary: string;
  key_points: string[];
  action_items: string[];
  participants: string[];
  sentiment: "positive" | "neutral" | "negative" | "mixed";
}

export async function generateSummary(
  transcript: string,
  config?: ScribeConfig,
): Promise<SummaryOutput | null> {
  if (!transcript.trim()) return null;
  try {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const style = config?.summary_style ?? "standard";
    const audience = config?.summary_audience?.trim() ?? "";
    const summaryLang = config?.summary_language ?? "same";
    const extra = config?.extra_instructions?.trim() ?? "";

    const styleInstruction =
      style === "brief"
        ? "Summary: 3–5 concise bullet points."
        : style === "detailed"
          ? "Summary: a detailed multi-paragraph breakdown organized by topic."
          : "Summary: 2–3 paragraph executive summary.";

    const langInstruction =
      summaryLang === "same"
        ? "Write the summary in the same language as the transcript."
        : `Write the summary in ${summaryLang}.`;

    const audienceInstruction = audience
      ? `Target audience / tone: ${audience}.`
      : "";

    const prompt = `You are an expert meeting notes writer. Analyze this meeting transcript and return a JSON object with these keys:

- "title": a short, descriptive meeting title (max 10 words)
- "summary": ${styleInstruction}
- "key_points": an array of 3–7 bullet-style key discussion points
- "action_items": an array of concrete action items mentioned (who, what, by when — if not stated, just "what")
- "participants": an array of distinct speaker names mentioned
- "sentiment": one of "positive" | "neutral" | "negative" | "mixed"

${langInstruction}
${audienceInstruction}
${extra ? `Extra instructions: ${extra}` : ""}

Return ONLY the JSON object, nothing else.

TRANSCRIPT:
"""
${transcript}
"""`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned);

    return {
      title: String(parsed.title ?? "Untitled Meeting"),
      summary: String(parsed.summary ?? ""),
      key_points: Array.isArray(parsed.key_points)
        ? parsed.key_points.map(String)
        : [],
      action_items: Array.isArray(parsed.action_items)
        ? parsed.action_items.map(String)
        : [],
      participants: Array.isArray(parsed.participants)
        ? parsed.participants.map(String)
        : [],
      sentiment: ["positive", "neutral", "negative", "mixed"].includes(
        parsed.sentiment,
      )
        ? parsed.sentiment
        : "neutral",
    };
  } catch (err) {
    console.error("[gemini] summary failed:", err);
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // Works in Node 20.
  return Buffer.from(bytes).toString("base64");
}
