// Moca CRM design settings. Every colour and font used by the app and its charts lives here.
// To change the look, edit this file only.
//
// Brand: the ink colour is the charcoal of Moca's official logo (public/brand/moca-logo.png),
// which replaces the brief's suggested mocha brown. The other colours are the brief's suggestions
// and should be replaced if Moca supplies official codes for them.
//
// Contrast notes (WCAG AA needs 4.5 to 1 for normal text):
//   ink on cream 10.9, inkMuted on cream 5.6, white on green 5.0, greenInk on cream 5.7,
//   red on cream 5.3, amberInk on amberTint 5.0, inkSoft on ink 6.2.
//   Amber and stone are too light for text, so they are only used for fills and borders.

export const brand = {
  ink: "#353535", // Moca logo charcoal: headings, side menu, main text
  cream: "#F7F1EA", // page backgrounds
  green: "#2E7D5B", // main buttons, positive results
  amber: "#E8A33D", // highlights, warnings, things needing attention
  stone: "#D9CFC4", // borders and dividers
  red: "#B3392F", // errors and lost deals only
} as const;

export const colours = {
  ...brand,
  surface: "#FFFFFF", // main panels on the cream background
  surfaceSunk: "#FBF7F2", // subtle alternate rows and wells
  inkMuted: "#65605A", // secondary text
  inkSoft: "#BDB8B2", // secondary text on the charcoal side menu
  inkDeep: "#262626", // pressed states on the side menu
  greenInk: "#256B4D", // link text and green text on light backgrounds
  greenHover: "#256B4D",
  greenTint: "#E6F0EA",
  greenOnInk: "#6FBF97", // green used on the charcoal side menu
  amberInk: "#8A5A12", // warning text
  amberTint: "#FBEBD2",
  redInk: "#8F2D25",
  redTint: "#F8E4E1",
  stoneStrong: "#8A8178", // form field borders (3.4 to 1 or more against the background)
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
  Contacted: colours.inkSoft,
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
  colours.ink,
  "#7FA88F", // soft green
  "#C98A5B", // copper
  colours.inkMuted,
  colours.red,
] as const;

export const fonts = {
  // One typeface for everything: a geometric sans with a single storey "a", like the Moca logo.
  // Loaded in src/app/layout.tsx.
  sans: "Outfit",
  fallback: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, Arial, sans-serif",
} as const;

// Radius follows hierarchy: large for main panels, medium for controls, full for pills and dots.
export const radii = {
  sm: "6px",
  md: "8px",
  lg: "14px",
} as const;

export const logo = {
  src: "/brand/moca-logo.png",
  width: 1147,
  height: 414,
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
