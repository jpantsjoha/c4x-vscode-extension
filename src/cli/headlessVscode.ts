/**
 * Stands in for the `vscode` module in the headless render bundles (#353):
 * `mcp/c4x-mcp-server.bundle.cjs` and `cli/c4x.cjs`. esbuild.config.js
 * resolves every `vscode` import there to this file, so neither bundle
 * requires a module named `vscode` and both load on bare Node.
 *
 * Every member the engine modules read is undefined. ThemeManager, the
 * layout's settings and warning channel, and SvgBuilder's edges-on-top
 * setting already treat a missing `workspace` or `window` as "no VS Code"
 * and use their defaults; the headless render passes theme, spacing and
 * edges-on-top explicitly, so no default decides the picture. The names are
 * declared only so esbuild does not warn that each import is undefined.
 */
export const workspace = undefined;
export const window = undefined;
export const ColorThemeKind = undefined;
export const ConfigurationTarget = undefined;
