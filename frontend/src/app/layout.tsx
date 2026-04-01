import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import Providers from "./providers";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "MeetScribe — AI Meeting Intelligence",
  description:
    "Deploy an AI bot to join Google Meet, transcribe every word, and generate structured summaries powered by Gemini.",
  keywords: ["google meet", "AI transcription", "meeting summary", "gemini"],
  openGraph: {
    title: "MeetScribe — AI Meeting Intelligence",
    description: "Let AI join your meetings and handle the notes.",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#03050a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="noise">
      <body>
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "rgba(10,14,30,0.95)",
                color: "#f1f3ff",
                border: "1px solid rgba(77,107,255,0.3)",
                backdropFilter: "blur(16px)",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "14px",
              },
              success: { iconTheme: { primary: "#00f5d4", secondary: "#03050a" } },
              error: { iconTheme: { primary: "#f43f5e", secondary: "#03050a" } },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
