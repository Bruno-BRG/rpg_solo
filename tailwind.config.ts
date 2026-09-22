import type { Config } from "tailwindcss";

/**
 * Tailwind configuration.
 *
 * Design language: minimalist, utilitarian, high-contrast neutral palette.
 * No gradients, no heavy rounding — sharp edges and clear borders.
 *
 * Theming: every color is a CSS variable flipped by `html.dark` (see
 * globals.css) — components keep using the same class names in both
 * themes. The ink scale is a near-inversion tuned for contrast; accent
 * is slightly brighter on dark. `white` is the card surface, `black` the
 * inverted extreme.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral ink palette — the single accent is a restrained red,
        // used only for primary actions and danger states.
        ink: {
          50: "var(--ink-50)",
          100: "var(--ink-100)",
          200: "var(--ink-200)",
          300: "var(--ink-300)",
          400: "var(--ink-400)",
          500: "var(--ink-500)",
          600: "var(--ink-600)",
          700: "var(--ink-700)",
          800: "var(--ink-800)",
          900: "var(--ink-900)",
          950: "var(--ink-950)",
        },
        // Card/page surface + inverted extreme. Flips with the theme.
        white: "var(--c-white)",
        black: "var(--c-black)",
        // Accent supports Tailwind opacity modifiers (/5 etc.).
        accent: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          hover: "rgb(var(--accent-hover-rgb) / <alpha-value>)",
        },
      },
      borderRadius: {
        none: "0",
        sm: "2px",
        DEFAULT: "2px",
        md: "3px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
