/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Syne'", "sans-serif"],
        body: ["'DM Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        void: "#03050a",
        plasma: {
          50: "#f0f4ff",
          100: "#dde8ff",
          200: "#c2d4ff",
          300: "#9bb5ff",
          400: "#7090ff",
          500: "#4d6bff",
          600: "#2e45f5",
          700: "#2334e0",
          800: "#1e2cb5",
          900: "#1e2b8f",
        },
        aurora: {
          cyan: "#00f5d4",
          violet: "#8b5cf6",
          amber: "#f59e0b",
          rose: "#f43f5e",
        },
      },
      backgroundImage: {
        "grid-void":
          "linear-gradient(rgba(77,107,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(77,107,255,0.06) 1px, transparent 1px)",
        "glow-plasma":
          "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(77,107,255,0.3), transparent)",
        "glow-cyan":
          "radial-gradient(ellipse 60% 40% at 80% 60%, rgba(0,245,212,0.12), transparent)",
      },
      backgroundSize: {
        grid: "60px 60px",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
        "scan-line": "scan 3s linear infinite",
        shimmer: "shimmer 2s linear infinite",
        "fade-up": "fadeUp 0.6s ease-out forwards",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      boxShadow: {
        plasma: "0 0 40px rgba(77,107,255,0.4), 0 0 80px rgba(77,107,255,0.15)",
        cyan: "0 0 30px rgba(0,245,212,0.3)",
        card: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
      },
    },
  },
  plugins: [],
};
