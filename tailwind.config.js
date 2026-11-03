/** Tailwind config for the Vite/PostCSS build (client/src/index.css).
 * Pastel palette with a blue predominance: frost (primary blue), lilac
 * (secondary), seaglass (success/mint), sorbet (warm accent), ink (blue-tinted
 * text grays). */
export default {
  content: ["client/index.html", "client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        frost: { 50: "#F5F9FF", 100: "#E8F1FE", 200: "#D3E4FD", 300: "#B3D3FA", 400: "#8BBDF6", 500: "#649FEE", 600: "#4580DD", 700: "#3466B8", 800: "#2D5494", 900: "#28467A", 950: "#1B2E54" },
        lilac: { 50: "#F7F6FE", 100: "#EEEDFC", 200: "#DCD9F8", 300: "#C3BEF2", 400: "#A79FE9", 500: "#8C81DE", 600: "#7566CC", 700: "#6153B0", 800: "#50468D", 900: "#433B75", 950: "#2C2650" },
        seaglass: { 50: "#F2FBF8", 100: "#E0F6EE", 200: "#C2EDDD", 300: "#94DFC7", 400: "#5FCBAA", 500: "#3DB48F", 600: "#2D9676", 700: "#277A62", 800: "#236352", 900: "#1E5245", 950: "#10312A" },
        ink: { 50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1", 400: "#94A3B8", 500: "#64748B", 600: "#475569", 700: "#3B4A63", 800: "#2C3A52", 900: "#1E2A40", 950: "#131C31" },
        sorbet: { 50: "#FFF7F3", 100: "#FFEAE1", 200: "#FFD3C4", 300: "#FFB59D", 400: "#FD9272", 500: "#F97A53", 600: "#E85E3B", 700: "#C44A2D", 800: "#A03D27", 900: "#833525", 950: "#4A1B11" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
