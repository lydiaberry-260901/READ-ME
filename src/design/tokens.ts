// Moca CRM design settings. Every colour and font used by the app and its charts lives here.
// To change the look, edit this file only.
//
// Look: "Control room", chosen by Moca on 28/09/2026. A dark canvas built from the charcoal of
// Moca's official logo, cream text, fine grid lines, and colour used only where it means something:
// green for actions and good results, amber for attention, red for errors and lost deals.
//
// Colours are named by their job (canvas, panel, fg for text, line), not by their hue, so the
// theme can change without renaming anything in the screens.
//
// Contrast notes (WCAG AA needs 4.5 to 1 for text, 3 to 1 for form borders):
//   fg on canvas 14.3, fg on panel 12.7, fgMuted on panel 5.9, greenText on panel 6.7,
//   amberText on panel 7.9, redText on panel 6.1, white on green 5.0, lineStrong on panel 3.4.

export const brand = {
  charcoal: "#353535", // Moca logo colour
  cream: "#F7F1EA",
  green: "#2E7D5B", // energy green
  amber: "#E8A33D", // sunrise amber
  stone: "#D9CFC4",
  red: "#B3392F",
} as const;

export const colours = {
  canvas: "#1E1E1E", // page background: deep logo charcoal
  canvasDeep: "#171717", // top bar and wells
  panel: "#282828", // main panels
  panelSunk: "#232323", // table headings, alternate rows
  panelRaised: "#313131", // hover and selected rows, menus
  fg: "#F2EDE6", // main text: Moca cream
  fgMuted: "#A9A39C", // secondary text
  fgSoft: "#8B857E", // hints on large text only
  line: "#3A3A3A", // grid lines and dividers
  lineStrong: "#7A746D", // form field borders
  green: brand.green, // main buttons, positive results
  greenHover: "#358E68",
  greenText: "#6FBF97", // green text and marks on dark
  greenTint: "#1F3A2E",
  amber: brand.amber, // attention
  amberText: "#F0B35A",
  amberTint: "#3D3121",
  red: brand.red, // errors and lost deals only
  redText: "#F08A7E",
  redTint: "#3E2422",
  focus: "#6FBF97",
} as const;

export const healthColours = {
  ON_TRACK: { fill: colours.greenText, tint: colours.greenTint, text: colours.greenText },
  AT_RISK: { fill: colours.amber, tint: colours.amberTint, text: colours.amberText },
  STALLED: { fill: colours.redText, tint: colours.redTint, text: colours.redText },
} as const;

// Starting colours for the default deal stages. Admins can recolour stages later.
export const defaultStageColours = {
  Prospect: "#8B857E",
  Contacted: "#A9A39C",
  Conversation: "#E8C27A",
  Demo: brand.amber,
  Proposal: "#9DBFA9",
  Negotiation: "#5E9C7C",
  Won: "#6FBF97",
  Lost: "#F08A7E",
} as const;

// Palette for charts, in order of use. Chosen to read clearly on the dark panels.
export const chartPalette = [
  colours.greenText,
  colours.amber,
  colours.fg,
  "#7FA88F", // soft green
  "#C98A5B", // copper
  colours.fgMuted,
  colours.redText,
] as const;

export const chart = {
  grid: colours.line,
  axis: colours.fgMuted,
  tooltipBg: colours.panelRaised,
  // Charts grow into the shape of the data when a page opens, and morph when filters change.
  animationMs: 900,
  animationEasing: "ease-out" as const,
} as const;

export const fonts = {
  // One typeface for everything: a geometric sans with a single storey "a", like the Moca logo.
  // Loaded in src/app/layout.tsx.
  sans: "Outfit",
  fallback: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, Arial, sans-serif",
} as const;

// Radius follows hierarchy: small for controls and panels (a technical feel), full for pills and dots.
export const radii = {
  sm: "4px",
  md: "6px",
  lg: "8px",
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
