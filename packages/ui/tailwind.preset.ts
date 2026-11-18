/**
 * GENERATED from packages/ui/src/tokens/source.ts by src/tokens/generate.ts — the
 * transcription of docs/OyoDigitalParliament/branding.md. Never hand-edit; regenerate with
 * `node src/tokens/generate.ts` from packages/ui.
 *
 * Maps Tailwind's colour, typography, spacing, radius, border and shadow scales onto the
 * custom properties that src/styles/theme.css defines, so a component never needs an
 * arbitrary value. Canonical Tailwind v4 consumption is the CSS import:
 *
 *   @import "tailwindcss";
 *   @import "@odp/ui/styles/theme.css";
 *
 * This preset serves config-driven consumers through `@config "@odp/ui/tailwind.preset";`.
 * The screens here replace Tailwind's defaults so only the branding breakpoints resolve:
 * mobile is the base, `tablet:` starts at 640px, `desktop:` at 1024px.
 */

const theme = {
  theme: {
    screens: {
      tablet: "640px",
      desktop: "1024px",
    },
    extend: {
      colors: {
        primary: {
          900: "var(--odp-color-primary-900)",
          700: "var(--odp-color-primary-700)",
          500: "var(--odp-color-primary-500)",
          300: "var(--odp-color-primary-300)",
          100: "var(--odp-color-primary-100)",
        },
        neutral: {
          900: "var(--odp-color-neutral-900)",
          700: "var(--odp-color-neutral-700)",
          500: "var(--odp-color-neutral-500)",
          300: "var(--odp-color-neutral-300)",
          100: "var(--odp-color-neutral-100)",
        },
        success: {
          900: "var(--odp-color-success-900)",
          700: "var(--odp-color-success-700)",
          500: "var(--odp-color-success-500)",
          300: "var(--odp-color-success-300)",
          100: "var(--odp-color-success-100)",
        },
        warning: {
          900: "var(--odp-color-warning-900)",
          700: "var(--odp-color-warning-700)",
          500: "var(--odp-color-warning-500)",
          300: "var(--odp-color-warning-300)",
          100: "var(--odp-color-warning-100)",
        },
        error: {
          900: "var(--odp-color-error-900)",
          700: "var(--odp-color-error-700)",
          500: "var(--odp-color-error-500)",
          300: "var(--odp-color-error-300)",
          100: "var(--odp-color-error-100)",
        },
        info: {
          900: "var(--odp-color-info-900)",
          700: "var(--odp-color-info-700)",
          500: "var(--odp-color-info-500)",
          300: "var(--odp-color-info-300)",
          100: "var(--odp-color-info-100)",
        },
        "surface": "var(--odp-surface)",
        "surface-secondary": "var(--odp-surface-secondary)",
        "text-primary": "var(--odp-text-primary)",
        "text-secondary": "var(--odp-text-secondary)",
        "border": "var(--odp-border)",
        theme: "var(--odp-theme-color)",
      },
      fontFamily: {
        display: "var(--odp-font-display)",
        body: "var(--odp-font-body)",
      },
      fontSize: {
        "display": [
          "var(--odp-font-size-display)",
          { lineHeight: "var(--odp-line-height-display)", fontWeight: "var(--odp-font-weight-display)" },
        ],
        "h1": [
          "var(--odp-font-size-h1)",
          { lineHeight: "var(--odp-line-height-h1)", fontWeight: "var(--odp-font-weight-h1)" },
        ],
        "h2": [
          "var(--odp-font-size-h2)",
          { lineHeight: "var(--odp-line-height-h2)", fontWeight: "var(--odp-font-weight-h2)" },
        ],
        "h3": [
          "var(--odp-font-size-h3)",
          { lineHeight: "var(--odp-line-height-h3)", fontWeight: "var(--odp-font-weight-h3)" },
        ],
        "body": [
          "var(--odp-font-size-body)",
          { lineHeight: "var(--odp-line-height-body)", fontWeight: "var(--odp-font-weight-body)" },
        ],
        "body-strong": [
          "var(--odp-font-size-body-strong)",
          { lineHeight: "var(--odp-line-height-body-strong)", fontWeight: "var(--odp-font-weight-body-strong)" },
        ],
        "small": [
          "var(--odp-font-size-small)",
          { lineHeight: "var(--odp-line-height-small)", fontWeight: "var(--odp-font-weight-small)" },
        ],
        "caption": [
          "var(--odp-font-size-caption)",
          { lineHeight: "var(--odp-line-height-caption)", fontWeight: "var(--odp-font-weight-caption)" },
        ],
      },
      spacing: {
        "xs": "var(--odp-space-xs)",
        "sm": "var(--odp-space-sm)",
        "md": "var(--odp-space-md)",
        "lg": "var(--odp-space-lg)",
        "xl": "var(--odp-space-xl)",
        "2xl": "var(--odp-space-2xl)",
        button: "var(--odp-button-height)",
        input: "var(--odp-input-height)",
        icon: "var(--odp-icon-size)",
      },
      borderRadius: {
        sm: "var(--odp-radius-sm)",
        md: "var(--odp-radius-md)",
        lg: "var(--odp-radius-lg)",
        full: "var(--odp-radius-full)",
      },
      borderWidth: {
        DEFAULT: "var(--odp-border-width)",
      },
      boxShadow: {
        sm: "var(--odp-shadow-sm)",
        md: "var(--odp-shadow-md)",
        lg: "var(--odp-shadow-lg)",
      },

      // Focus treatment (branding.md, Accessibility): a visible ring with offset, both tokens.
      ringColor: {
        DEFAULT: "var(--odp-focus-ring-color)",
      },
      ringWidth: {
        DEFAULT: "var(--odp-focus-width)",
      },
      ringOffsetWidth: {
        DEFAULT: "var(--odp-focus-offset)",
      },
    },
  },
};

export default theme;
