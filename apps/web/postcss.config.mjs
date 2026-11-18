/**
 * The PostCSS pipeline for the deployable (`apps/web/AGENTS.md` Structure: "styles/ — stylesheet
 * entry and the token bridge to packages/ui"). Tailwind v4 processes the stylesheet entry here:
 * it consumes the `@config` preset (the token bridge) and generates the utilities the screens
 * compose, so every design value resolves against the generated custom properties.
 */
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
