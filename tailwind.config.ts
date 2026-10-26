import type { Config } from "tailwindcss";

/*
 * The design follows the house style shared with William Loft's other sites
 * (lofty, pokidex): warm paper, ink, one brand colour for the name and for
 * things you can click, short hard "print" shadows instead of glows, one cut
 * corner on every panel, and capsule buttons with a pressed lip.
 *
 * Localify's brand colour is its green. Mint is the tint: the selected track,
 * the record label, text selection. Nothing else is green.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Sora Variable'", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["'Hanken Grotesk Variable'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        paper: "#fbfaf7",
        sunken: "#f3f1ec",
        surface: "#ffffff",
        ink: "#171a21",
        "ink-dim": "#5a616c",
        line: "#dedbd3",
        // Field borders: 3:1 against white, as WCAG asks of control edges.
        outline: "#6d7980",
        brand: "#106c48",
        "brand-deep": "#0b4f34",
        "brand-tint": "#e1f5ea",
        mint: "#a1f4c6",
        danger: "#b3261e",
        "danger-tint": "#fbeae8",
      },
      borderRadius: {
        panel: "14px",
        field: "10px",
      },
      boxShadow: {
        print: "0 1px 0 rgb(23 26 33 / 0.06), 0 4px 0 rgb(23 26 33 / 0.07)",
        lip: "0 3px 0 #0b4f34",
        "lip-hover": "0 4px 0 #0b4f34",
        "lip-pressed": "0 1px 0 #0b4f34",
      },
    },
  },
  plugins: [],
};
export default config;
