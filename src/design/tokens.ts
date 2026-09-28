// Moca CRM design settings. Every colour and font used by the app and its charts lives here.
// To change the look, edit this file only. If Moca's official colour codes are supplied,
// replace the brand values below.
//
// Contrast notes (WCAG AA needs 4.5 to 1 for normal text):
//   mocha on cream 12.2, white on green 5.0, greenInk on cream 5.7,
//   red on cream 5.3, amberInk on amberTint 5.0, mochaMuted on cream 5.8.
//   Amber and stone are too light for text, so they are only used for fills and borders.

export const brand = {
  mocha: "#3B2A20", // headings, side menu, main text
  cream: "#F7F1EA", // page backgrounds
  green: "#2E7D5B", // main buttons, positive results
  amber: "#E8A33D", // highlights, warnings, things needing attention
  stone: "#D9CFC4", // borders and dividers
  red: "#B3392F", // errors and lost deals only
} as const;

export const colours = {
  ...brand,
  surface: "#FFFFFF", // cards and panels on the cream background
  surfaceSunk: "#FBF7F2", // subtle alternate rows and wells
  mochaMuted: "#6E5A4C", // secondary text
  mochaSoft: "#C9B8A8", // secondary text on the mocha side menu
  mochaDeep: "#2A1D16", // pressed states on the side menu
  greenInk: "#256B4D", // link text and green text on light backgrounds
  greenHover: "#256B4D",
  greenTint: "#E6F0EA",
  amberInk: "#8A5A12", // warning text
  amberTint: "#FBEBD2",
  redInk: "#8F2D25",
  redTint: "#F8E4E1",
  stoneStrong: "#8E7A6B", // form field borders (needs 3 to 1 against the background)
  focus: "#2E7D5B",
} as const;

export const healthColours = {
  ON_TRACK: { fill: colours.green, tint: colours.greenTint, ink: colours.greenInk },
  AT_RISK: { fill: colours.amber, tint: colours.amberTint, ink: colours.amberInk },
  STALLED: { fill: colours.red, tint: colours.redTint, ink: colours.redInk },
} as const;

// Starting colours for the default deal stages. Admins can recolour stages later.
export const defaultStageColours = {
  Prospect: colours.stone,
  Contacted: colours.mochaSoft,
  Conversation: "#E8C27A", // light amber
  Demo: colours.amber,
  Proposal: "#9DBFA9", // light green
  Negotiation: "#5E9C7C", // mid green
  Won: colours.green,
  Lost: colours.red,
} as const;

// Palette for charts, in order of use. Starts with the brand colours so charts match the app.
export const chartPalette = [
  colours.green,
  colours.amber,
  colours.mocha,
  "#7FA88F", // soft green
  "#C98A5B", // copper
  colours.mochaMuted,
  colours.red,
] as const;

export const fonts = {
  // One clean, readable typeface for everything. Loaded in src/app/layout.tsx.
  sans: "Figtree",
  fallback: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, Arial, sans-serif",
} as const;

export const radii = {
  sm: "6px",
  md: "10px",
  lg: "16px",
} as const;

// Turns the settings above into CSS variables that Tailwind reads (see globals.css).
export function tokensToCss(): string {
  const toKebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  const lines = [
    ...Object.entries(colours).map(([k, v]) => `--moca-${toKebab(k)}: ${v};`),
    ...Object.entries(radii).map(([k, v]) => `--moca-radius-${k}: ${v};`),
  ];
  return `:root{${lines.join("")}}`;
}
