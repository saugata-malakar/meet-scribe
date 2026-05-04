# MeetScribe 🎙️

**🌍 Live Deployment:** [https://chi-square-2.onrender.com](https://chi-square-2.onrender.com)

MeetScribe is an AI-powered Meeting Intelligence application that seamlessly joins Google Meet sessions, transcribes conversations in real-time, and generates structured, actionable summaries using Google's Gemini AI models. 

## ✨ Features

- **Automated Audio Capture:** Effortlessly capture Google Meet audio directly from the browser tab without relying on clunky, server-side headless browsers.
- **Real-Time Transcription:** Get live meeting transcriptions powered by Google Cloud Speech-to-Text, with a robust fallback to Gemini Multimodal Audio Input.
- **AI-Powered Summaries:** Automatically generates meeting titles, key points, action items, sentiment analysis, and lists of participants using Gemini (`gemini-1.5-flash`).
- **Secure Authentication:** User authentication and session management powered by Clerk.
- **Cloud Storage Integration:** Stores audio chunks and transcriptions securely in Google Cloud Storage.
- **Single-Container Deployment:** The entire application (Next.js backend and frontend) is packaged into a unified Docker container for effortless hosting on Render.

## 🚀 Tech Stack

- **Frontend & Backend API:** [Next.js 15](https://nextjs.org/) (React)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Authentication:** [Clerk](https://clerk.com/)
- **AI & ML:** [Google Gemini](https://deepmind.google/technologies/gemini/), Google Cloud Speech-to-Text
- **Database:** PostgreSQL (via Prisma/SQLAlchemy depending on configuration)
- **Deployment:** Docker, Render

## 🛠️ Getting Started

### Prerequisites

You will need the following accounts and API keys to run MeetScribe locally or in production:
- **Clerk** (for Authentication)
- **Google Cloud / Gemini** (for Transcriptions & Summaries)
- **PostgreSQL Database** (e.g., Supabase, Render Postgres)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/saugata-malakar/meet-scribe.git
   cd meet-scribe/frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env.local` file in the `frontend` directory and add your keys:
   ```env
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
   NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
   NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
   GEMINI_API_KEY=your_gemini_api_key
   DATABASE_URL=your_postgres_database_url
   BOT_MODE=browser
   ```

4. **Run the application locally:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the app.

## 🚢 Deployment (Render)

MeetScribe is configured to deploy effortlessly on Render using a single Docker container. 

1. Create a new **Web Service** on Render.
2. Connect this GitHub repository.
3. Select `Docker` as the runtime.
4. Add the required Environment Variables in the Render dashboard.
5. Deploy!

## 🗑️ Deleting Legacy Code
*Note: This repository was recently unified. Legacy Python FastAPI code and multiple deployment configs (`fly.toml`, `vercel.json`) have been cleaned up in favor of a single Next.js unified deployment.*

## 📄 License
This project is open-source and available under the MIT License.
