/**
 * The token source — the single transcription of `docs/OyoDigitalParliament/branding.md` into code,
 * and the only file in this package permitted to hold a literal colour, pixel value, shadow string
 * or duration (`packages/ui/AGENTS.md`, "One source for design values").
 *
 * Everything else in the token layer is generated from this file by `src/tokens/generate.ts`
 * (run from `packages/ui`: `node src/tokens/generate.ts`) and must never be hand-edited:
 * - `src/styles/theme.css`  — namespaced `--odp-*` custom properties, light and dark columns,
 *   structural role mappings, plus the Tailwind v4 `@theme inline` mapping.
 * - `src/styles/fonts.css`  — `@font-face` for the two font slots A-042 and A-043.
 * - `tailwind.preset.ts`    — the same scales as a Tailwind preset for config-driven consumers.
 *
 * A value the branding document does not define is a specification gap. Gaps found during
 * transcription are documented at the value they affect with a `GAP:` note and reported to the
 * coordinator; none of them is resolved by a local decision here.
 */

/** The two token families every colour, shadow and surface value is defined for. */
export type ColorMode = "light" | "dark";

/**
 * The colour stops `branding.md` defines. Its primary and neutral tables are titled "9-shade
 * scale" but define exactly these five stops each; the four missing stops (800, 600, 400, 200)
 * are a specification gap (GAP: 9-shade tables define 5 stops), so hover/pressed derivation below
 * works over declared stops only.
 */
export type ColorShade = 100 | 300 | 500 | 700 | 900;

/** Device classes from `branding.md`, Responsive & Device Targets. Mobile is the base value. */
export type DeviceClass = "mobile" | "tablet" | "desktop";

/** One colour value per mode; every family defines both columns. */
export interface ColorValue {
  readonly light: string;
  readonly dark: string;
}

/** Device-scaled value; the mobile value is the base and larger classes override it. */
export type DeviceValue = Record<DeviceClass, number>;

/**
 * Colour palette (`branding.md`, Color Palette). Keys and values are verbatim; the warm-neutral
 * and laterite families avoid the party colours the document rules out.
 */
export const colorFamilies = {
  primary: {
    900: { light: "#2E1108", dark: "#F6D9C9" },
    700: { light: "#5E2814", dark: "#E7B49C" },
    500: { light: "#9A4A26", dark: "#C67C55" },
    300: { light: "#DCAE95", dark: "#6E3520" },
    100: { light: "#FAEDE4", dark: "#241009" },
  },
  neutral: {
    900: { light: "#1B1815", dark: "#F3F0EC" },
    700: { light: "#3D3733", dark: "#D8D2CB" },
    500: { light: "#6B635C", dark: "#A79E96" },
    300: { light: "#DCD5CE", dark: "#4A443F" },
    100: { light: "#F5F2EE", dark: "#221E1B" },
  },
  success: {
    900: { light: "#1E2C13", dark: "#DDE7C8" },
    700: { light: "#3F5A28", dark: "#B4C99A" },
    500: { light: "#5F7F3E", dark: "#8FAE6A" },
    300: { light: "#A9C086", dark: "#4E6A34" },
    100: { light: "#EDF3E2", dark: "#1E2A12" },
  },
  warning: {
    900: { light: "#3A2504", dark: "#FBE3B0" },
    700: { light: "#6E4A0A", dark: "#EFC97A" },
    500: { light: "#A8700F", dark: "#E0A93C" },
    300: { light: "#D9B268", dark: "#7A5410" },
    100: { light: "#FDF3DE", dark: "#2E1D04" },
  },
  error: {
    900: { light: "#3D0B0B", dark: "#FBC9C9" },
    700: { light: "#7A1717", dark: "#F09A9A" },
    500: { light: "#B32626", dark: "#E06A6A" },
    300: { light: "#E39A9A", dark: "#8A2A2A" },
    100: { light: "#FCEAEA", dark: "#2A0C0C" },
  },
  info: {
    900: { light: "#122334", dark: "#CFE0F0" },
    700: { light: "#244A68", dark: "#A6C4DE" },
    500: { light: "#36648B", dark: "#7BA6C8" },
    300: { light: "#8FB4D0", dark: "#3B5C78" },
    100: { light: "#E9F1F8", dark: "#10202E" },
  },
} as const satisfies Record<string, Record<ColorShade, ColorValue>>;

export type ColorFamilyName = keyof typeof colorFamilies;

/** Structural role mappings (`branding.md`, Color Palette → Structural Role Mappings). */
export const structuralRoles = {
  surface: { family: "neutral", shade: 100 },
  "surface-secondary": { family: "neutral", shade: 300 },
  "text-primary": { family: "neutral", shade: 900 },
  "text-secondary": { family: "neutral", shade: 500 },
  border: { family: "neutral", shade: 300 },
  "theme-color": { family: "primary", shade: 900 },
} as const satisfies Record<string, { family: ColorFamilyName; shade: ColorShade }>;

export type RoleName = keyof typeof structuralRoles;

/**
 * A reference to a colour token, either a family shade or a structural role. Component tokens
 * reference colours only through this type, so a rename cannot leave a stale mapping behind.
 */
export type ColorRef =
  | { readonly kind: "family"; readonly family: ColorFamilyName; readonly shade: ColorShade }
  | { readonly kind: "role"; readonly role: RoleName };

/** Resolve a colour reference for one mode. Used by tests and by the contrast audit. */
export function resolveColor(ref: ColorRef, mode: ColorMode): string {
  if (ref.kind === "role") {
    const mapped = structuralRoles[ref.role];
    return resolveColor({ kind: "family", family: mapped.family, shade: mapped.shade }, mode);
  }
  return colorFamilies[ref.family][ref.shade][mode];
}

/** A family-shade reference constructor, so component tokens stay declarative. */
export function familyRef(
  family: ColorFamilyName,
  shade: ColorShade,
): { readonly kind: "family"; readonly family: ColorFamilyName; readonly shade: ColorShade } {
  return { kind: "family", family, shade };
}

/** A structural-role reference constructor. */
export function roleRef(role: RoleName): { readonly kind: "role"; readonly role: RoleName } {
  return { kind: "role", role };
}

/** Font family stacks (`branding.md`, Typography → Font Family), verbatim incl. fallbacks. */
export const fontFamilies = {
  display: { stack: "'Noto Serif', Georgia, serif" },
  body: { stack: "'Noto Sans', sans-serif" },
} as const;

export type FontRole = keyof typeof fontFamilies;

/**
 * The two font slots (`assets/ASSETS.md`, A-042 and A-043). `publicPath` is the serving path the
 * deployable is expected to expose the slot files at — the assets area owns the files and no
 * assets path is served directly, so this convention is stated in the task report.
 */
export const fontAssets = {
  body: {
    slot: "A-042",
    file: "assets/fonts/noto-sans-latin-yoruba.woff2",
    publicPath: "/fonts/noto-sans-latin-yoruba.woff2",
    /** Variable `wght` axis kept at 400–600 so body, body-strong and caption come from one file. */
    weightRange: "400 600",
  },
  display: {
    slot: "A-043",
    file: "assets/fonts/noto-serif-latin-yoruba.woff2",
    publicPath: "/fonts/noto-serif-latin-yoruba.woff2",
    /** Noto Serif is requested at 600 only (ASSETS.md Font family settings). */
    weightRange: "600",
  },
} as const;

/** A type-scale token (`branding.md`, Typography → Type Scale). */
export interface TypeToken {
  readonly sizes: DeviceValue;
  readonly weight: number;
  readonly lineHeight: number;
  readonly family: FontRole;
}

/**
 * The eight-step type scale, verbatim. `display` covers page titles and the report-card
 * headline; headings share the display (Noto Serif) family, body roles the body (Noto Sans)
 * family, per the two-role Font Family table.
 */
export const typeScale = {
  display: { sizes: { mobile: 28, tablet: 32, desktop: 36 }, weight: 600, lineHeight: 1.2, family: "display" },
  h1: { sizes: { mobile: 24, tablet: 26, desktop: 28 }, weight: 600, lineHeight: 1.25, family: "display" },
  h2: { sizes: { mobile: 20, tablet: 22, desktop: 24 }, weight: 600, lineHeight: 1.3, family: "display" },
  h3: { sizes: { mobile: 18, tablet: 18, desktop: 20 }, weight: 600, lineHeight: 1.35, family: "display" },
  body: { sizes: { mobile: 16, tablet: 16, desktop: 16 }, weight: 400, lineHeight: 1.6, family: "body" },
  "body-strong": { sizes: { mobile: 16, tablet: 16, desktop: 16 }, weight: 600, lineHeight: 1.6, family: "body" },
  small: { sizes: { mobile: 14, tablet: 14, desktop: 14 }, weight: 400, lineHeight: 1.5, family: "body" },
  caption: { sizes: { mobile: 12, tablet: 12, desktop: 12 }, weight: 500, lineHeight: 1.4, family: "body" },
} as const satisfies Record<string, TypeToken>;

export type TypeTokenName = keyof typeof typeScale;

/** Spacing scale (`branding.md`, Spacing), device-scaled. */
export const spacing = {
  xs: { mobile: 4, tablet: 4, desktop: 4 },
  sm: { mobile: 8, tablet: 8, desktop: 10 },
  md: { mobile: 12, tablet: 16, desktop: 20 },
  lg: { mobile: 16, tablet: 24, desktop: 28 },
  xl: { mobile: 24, tablet: 32, desktop: 40 },
  "2xl": { mobile: 40, tablet: 56, desktop: 64 },
} as const satisfies Record<string, DeviceValue>;

export type SpacingTokenName = keyof typeof spacing;

/** Interactive sizing (`branding.md`, Sizing → Scales by device). */
export const sizing = {
  "button-height": { mobile: 48, tablet: 44, desktop: 40 },
  "input-height": { mobile: 48, tablet: 44, desktop: 40 },
  "icon-size": { mobile: 20, tablet: 22, desktop: 24 },
} as const satisfies Record<string, DeviceValue>;

export type SizingTokenName = keyof typeof sizing;

/** Fixed radii and border widths (`branding.md`, Sizing → Fixed). */
export const radii = {
  sm: 2,
  md: 4,
  lg: 8,
  full: 9999,
} as const;

export type RadiusTokenName = keyof typeof radii;

/** Default border width in px (`branding.md`, Sizing → Fixed). */
export const borderWidth = 1;

/**
 * Focus treatment (`branding.md`, Accessibility): a visible 2px ring with 2px offset on every
 * interactive element. The ring colour is `primary-500` per the Accessibility section.
 * GAP: the primary-300 family row also names "focus rings" among its roles; the Accessibility
 * section is the normative treatment and is transcribed here.
 */
export const focusTreatment = {
  width: 2,
  offset: 2,
  color: familyRef("primary", 500),
} as const;

/**
 * Shadows (`branding.md`, Shadows). The rgba ink matches the light neutral-900 (27,24,21); the
 * dark column is a pure black veil at higher opacity, verbatim.
 */
export const shadows = {
  sm: {
    light: "0 1px 2px rgba(27,24,21,0.06)",
    dark: "0 1px 2px rgba(0,0,0,0.5)",
  },
  md: {
    light: "0 4px 12px rgba(27,24,21,0.10)",
    dark: "0 4px 16px rgba(0,0,0,0.6)",
  },
  lg: {
    light: "0 12px 32px rgba(27,24,21,0.14)",
    dark: "0 12px 40px rgba(0,0,0,0.7)",
  },
} as const;

export type ShadowTokenName = keyof typeof shadows;

/**
 * Device breakpoints (`branding.md`, Responsive & Device Targets): mobile is the base posture,
 * tablet starts at 640px, desktop at 1024px.
 */
export const breakpoints = {
  tablet: 640,
  desktop: 1024,
} as const;

/**
 * Motion tokens. `branding.md` defines the character ("Movement appears only to confirm that a
 * write was accepted, and never as decoration") but defines no duration or easing value, so none
 * is transcribed — a duration a primitive needs is a specification gap to report, not a local
 * decision. Reduced-motion behaviour is a token: it disables motion entirely, and applying it is
 * the `src/a11y/` utilities' obligation.
 */
export const motion = {
  /** Motion appears only to confirm that a write was accepted. */
  character: "confirm-write-accepted",
  /** Never as decoration; never delays reading; never animates data into place. */
  decoration: "none",
  /** `prefers-reduced-motion` removes all motion. */
  reducedMotion: "disabled",
} as const;

/** A button variant's colour mapping (`branding.md`, Component Tokens → Buttons). */
export interface ButtonVariantColors {
  /** `null` for the transparent-background variants (outline, ghost). */
  readonly background: ColorRef | null;
  readonly text: ColorRef;
  /** `null` where the variant has no border. */
  readonly border: ColorRef | null;
}

/**
 * The five button variants, verbatim. Transparent backgrounds resolve against the `surface` role
 * for contrast checking and rendering.
 */
export const buttonVariants = {
  primary: {
    background: familyRef("primary", 700),
    text: familyRef("primary", 100),
    border: null,
  },
  secondary: {
    background: familyRef("primary", 100),
    text: familyRef("primary", 700),
    border: null,
  },
  outline: {
    background: null,
    text: familyRef("primary", 500),
    border: familyRef("primary", 500),
  },
  ghost: {
    background: null,
    text: roleRef("text-secondary"),
    border: null,
  },
  destructive: {
    background: familyRef("error", 900),
    text: familyRef("error", 100),
    border: null,
  },
} as const satisfies Record<string, ButtonVariantColors>;

export type ButtonVariant = keyof typeof buttonVariants;

/** Shared button geometry (`branding.md`, Component Tokens → Buttons). */
export const buttonLayout = {
  radius: "md",
  height: "button-height",
  /** `space-md space-lg`: block padding `md`, inline padding `lg`. */
  padding: { block: "md", inline: "lg" },
} as const satisfies { radius: RadiusTokenName; height: SizingTokenName; padding: { block: SpacingTokenName; inline: SpacingTokenName } };

/**
 * branding.md: "Hover and pressed map to the adjacent darker shade of the variant's background."
 * With only the five stops the document defines, "adjacent" is the next darker declared stop.
 * GAP: `900` has no darker declared stop, and outline/ghost have no background fill, so the hover
 * state of the destructive, outline and ghost variants is undefined in the specification; it is
 * reported, not invented here.
 */
export function nextDarkerShade(shade: ColorShade): ColorShade | null {
  switch (shade) {
    case 100:
      return 300;
    case 300:
      return 500;
    case 500:
      return 700;
    case 700:
      return 900;
    case 900:
      return null;
  }
}

/** The hover/pressed background of each variant that has a resolvable one, per `nextDarkerShade`. */
export const buttonHoverBackground = {
  primary: familyRef("primary", 900),
  secondary: familyRef("primary", 300),
} as const satisfies Record<string, ColorRef>;

/** The disabled-state rule (`branding.md`, Component Tokens → Buttons). */
export const buttonDisabled = {
  /** The variant's background reduces to its family's tinted (100) shade. */
  background: "tinted-shade-of-variant-background-family",
  /** GAP: "at reduced opacity" defines no value; reported, not invented. */
  opacity: null,
} as const;

/** An input state's colour mapping (`branding.md`, Component Tokens → Inputs). */
export const inputStates = {
  default: { border: roleRef("border"), background: roleRef("surface"), text: roleRef("text-primary") },
  focus: { border: familyRef("primary", 500), background: roleRef("surface"), text: roleRef("text-primary") },
  error: { border: familyRef("error", 500), background: roleRef("surface"), text: roleRef("text-primary") },
  disabled: { border: roleRef("border"), background: roleRef("surface-secondary"), text: roleRef("text-secondary") },
} as const satisfies Record<string, { border: ColorRef; background: ColorRef; text: ColorRef }>;

export type InputState = keyof typeof inputStates;

/** The ten statuses of the register (`branding.md`, Component Tokens → Status labels). */
export type StatusKey =
  | "awaiting-decision"
  | "overdue"
  | "committed"
  | "referred"
  | "delivered"
  | "slipped"
  | "dropped"
  | "declined"
  | "withdrawn"
  | "withheld";

/** A status label token: the word belongs to the caller; the key selects tone and marker. */
export interface StatusToken {
  readonly background: ColorRef;
  readonly text: ColorRef;
  /** The marker shape name and its `assets/ASSETS.md` slot. Shape carries the status second, after the word. */
  readonly marker: { readonly shape: string; readonly slot: string };
}

/** The status label mapping, verbatim from the branding table; marker slots are A-030…A-039. */
export const statusLabels = {
  "awaiting-decision": {
    background: familyRef("neutral", 100),
    text: familyRef("neutral", 900),
    marker: { shape: "outline-dot", slot: "A-030" },
  },
  overdue: {
    background: familyRef("warning", 100),
    text: familyRef("warning", 900),
    marker: { shape: "outline-triangle", slot: "A-031" },
  },
  committed: {
    background: familyRef("info", 100),
    text: familyRef("info", 900),
    marker: { shape: "filled-circle", slot: "A-032" },
  },
  referred: {
    background: familyRef("info", 100),
    text: familyRef("info", 900),
    marker: { shape: "filled-diamond", slot: "A-033" },
  },
  delivered: {
    background: familyRef("success", 100),
    text: familyRef("success", 900),
    marker: { shape: "filled-square", slot: "A-034" },
  },
  slipped: {
    background: familyRef("warning", 100),
    text: familyRef("warning", 900),
    marker: { shape: "filled-triangle", slot: "A-035" },
  },
  dropped: {
    background: familyRef("error", 100),
    text: familyRef("error", 900),
    marker: { shape: "filled-bar", slot: "A-036" },
  },
  declined: {
    background: familyRef("neutral", 100),
    text: familyRef("neutral", 900),
    marker: { shape: "outline-circle", slot: "A-037" },
  },
  withdrawn: {
    background: familyRef("neutral", 100),
    text: familyRef("neutral", 700),
    marker: { shape: "outline-bar", slot: "A-038" },
  },
  withheld: {
    background: familyRef("error", 100),
    text: familyRef("error", 900),
    marker: { shape: "outline-square", slot: "A-039" },
  },
} as const satisfies Record<StatusKey, StatusToken>;

/** The declared colour stops in the order the branding tables list them. */
export const declaredShades: readonly ColorShade[] = [900, 700, 500, 300, 100];

/** The colour family names in the order the branding document presents them. */
export const declaredFamilies: readonly ColorFamilyName[] = [
  "primary",
  "neutral",
  "success",
  "warning",
  "error",
  "info",
];
