/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7f2",
          100: "#d9ecdf",
          200: "#b4d9c3",
          300: "#84bfa0",
          400: "#52a17b",
          500: "#2e8560",
          600: "#1f6a4c",
          700: "#1a5540",
          800: "#164433",
          900: "#12362a",
          950: "#0a2119",
        },
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d5dae2",
          300: "#b0b9c8",
          400: "#8493a9",
          500: "#64768f",
          600: "#4f5e76",
          700: "#414c5f",
          800: "#384150",
          900: "#313846",
          950: "#1a1e26",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.06)",
        pop: "0 12px 32px -8px rgba(16,24,40,.22), 0 4px 10px -4px rgba(16,24,40,.12)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
