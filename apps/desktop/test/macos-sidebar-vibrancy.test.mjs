import { readMainModule, readMainSource } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const mainSource = await readMainSource();
const windowSource = await readMainModule("bootstrap/window.ts");
const windowMaterialSource = await readMainModule("bootstrap/window-material.ts");
const lifecycleSource = await readMainModule("bootstrap/app-lifecycle.ts");
const appShellSource = await readFile(
  new URL("../src/features/app/AppShell.tsx", import.meta.url),
  "utf8",
);
const stylesSource = await loadStyles();

const createWindowSource = windowSource.slice(windowSource.indexOf("export async function createWindow("));
const mainWindowBlock =
  createWindowSource.match(/mainWindow = new BrowserWindow\(\{[\s\S]*?\n  \}\);/)?.[0] ?? "";
const macOptions =
  mainWindowBlock.match(
    /\.\.\.\(process\.platform === "darwin"[\s\S]*?\n      : windowMaterialOptions\([\s\S]*?\n        \)\),/,
  )?.[0] ?? "";

function styleBlock(selector) {
  return stylesSource.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`))?.[0] ?? "";
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `expected function ${name}`);
  const next = source.indexOf("\n  function ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

test("macOS main window enables native sidebar vibrancy only in its platform branch", () => {
  assert.match(macOptions, /titleBarStyle:\s*"hiddenInset"/);
  // The position itself lives in @pi-desktop/shared so the renderer's reserve
  // for it (styles/tokens.css) is derived from the same numbers.
  assert.match(macOptions, /trafficLightPosition:\s*MAC_TRAFFIC_LIGHT_POSITION/);
  assert.match(macOptions, /vibrancy:\s*"sidebar"/);
  assert.match(macOptions, /visualEffectState:\s*"followWindow"/);
  assert.match(macOptions, /transparent:\s*true/);
  assert.match(macOptions, /backgroundColor:\s*"#00000000"/);
  assert.doesNotMatch(
    mainWindowBlock,
    /vibrancy:\s*"under-window"/,
    "non-mac branch must not set under-window vibrancy",
  );

  // The shared opaque fallback remains in place for Windows/Linux, and comes
  // from the built-in theme table rather than a local literal — now passed into
  // windowMaterialOptions() (window-material.ts), which also owns the frameless
  // flag and the "acrylic on Windows 11 22H2+, opaque otherwise" gate.
  assert.match(
    mainWindowBlock,
    /windowMaterialOptions\(\s*builtinWindowBackground\(\s*nativeTheme\.shouldUseDarkColors \? "dark" : "light",?\s*\)/,
  );
  assert.match(windowMaterialSource, /frame: false/);
  assert.doesNotMatch(
    mainWindowBlock.replace(macOptions, ""),
    /vibrancy:\s*"sidebar"/,
    "sidebar vibrancy stays in the darwin branch",
  );
});

test("native theme source maps preferences and only resets vibrancy on change", () => {
  const applyNative = functionSource(lifecycleSource, "applyNativeThemeSource");
  const applyMenu = functionSource(lifecycleSource, "applyApplicationMenuSettings");
  const send = functionSource(mainSource, "sendToRenderer");

  assert.match(applyNative, /let next: "system" \| "light" \| "dark" = "system"/);
  assert.match(
    applyNative,
    /if \(isThemeColorScheme\(preference\)\) \{\s*next = preference;/,
  );
  assert.match(applyNative, /preference\.startsWith\("plugin:"\)/);
  assert.match(
    applyNative,
    /pluginTheme\?\.base === "light" \|\| pluginTheme\?\.base === "dark"/,
  );
  assert.match(applyNative, /next = pluginTheme\.base/);
  assert.doesNotMatch(
    applyNative,
    /next = pluginTheme\?\.base \?\?/,
    "a missing plugin theme must keep the system default, not a guessed base",
  );
  assert.match(applyNative, /if \(nativeTheme\.themeSource === next\) return;/);
  assert.match(
    applyNative,
    /nativeTheme\.themeSource = next;\s*if \(process\.platform === "darwin" && state\.mainWindow && !state\.mainWindow\.isDestroyed\(\)\) \{\s*state\.mainWindow\.setVibrancy\("sidebar"\);/,
  );

  // The theme mapping lives in `applyAppThemePreference` so the narrow plugin
  // `setTheme` path can never re-derive locale, keybindings, or dev-mode menu
  // state (ADR 0260). The full-settings path delegates to the same function.
  const applyTheme = functionSource(lifecycleSource, "applyAppThemePreference");
  assert.match(applyTheme, /applyNativeThemeSource\(\{\s*theme: preference \}\)/);
  assert.match(applyMenu, /applyAppThemePreference\(settings\?\.theme\)/);
  assert.match(
    send,
    /if \(channel === IPC\.event\.pluginChanged\) \{\s*applicationLifecycle\?\.applyNativeThemeSource\(\{\s*theme: applicationAppearanceState\.appThemePreference,/,
  );
});

test("the macOS startup splash shares the sidebar glass tint and sheen", () => {
  const macGlassBlock =
    stylesSource.match(
      /:root\[data-platform="darwin"\] \.startup-splash,\n:root\[data-platform="darwin"\] \.sidebar-surface,\n:root\[data-platform="darwin"\] \.sidebar-rail\s*\{[^}]*\}/,
    )?.[0] ?? "";
  assert.match(macGlassBlock, /background-color:\s*var\(--ds-sidebar-glass-tint\)/);
  assert.match(macGlassBlock, /var\(--ds-sidebar-glass-sheen-top\)/);
  assert.match(macGlassBlock, /var\(--ds-sidebar-glass-sheen-bottom\)/);
  assert.doesNotMatch(macGlassBlock, /var\(--ds-bg-primary\)/);
  // Keep splash `position: fixed`; relative is only for the dock surfaces.
  assert.doesNotMatch(macGlassBlock, /position:\s*relative/);

  // Other platforms keep the opaque boot surface; the glass is darwin-only.
  const baseSplashBlock = stylesSource.match(/\n\.startup-splash\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(baseSplashBlock, /background:\s*var\(--ds-surface-veil\)/);
  assert.doesNotMatch(baseSplashBlock, /glass/);

  assert.match(
    stylesSource,
    /:root\[data-platform="darwin"\] \.app-shell\.is-booting:has\(\.startup-splash:not\(\.is-exiting\)\)\s*>\s*:not\(\.startup-splash\)\s*\{\s*visibility:\s*hidden;/,
  );
  assert.match(
    stylesSource,
    /:root\[data-platform="darwin"\] \.app-shell\.is-booting:has\(\.startup-splash\.is-exiting\)\s*>\s*:not\(\.startup-splash\)\s*\{\s*opacity:\s*1;\s*transition:\s*opacity/,
  );
});

test("only macOS sidebar and splash surfaces receive the translucent glass treatment", () => {
  const macGlassBlock =
    stylesSource.match(
      /:root\[data-platform="darwin"\] \.startup-splash,\n:root\[data-platform="darwin"\] \.sidebar-surface,\n:root\[data-platform="darwin"\] \.sidebar-rail\s*\{[^}]*\}/,
    )?.[0] ?? "";
  assert.match(macGlassBlock, /background-color:\s*var\(--ds-sidebar-glass-tint\)/);
  // Sheen, not a flat tint — this is what keeps the material reading as glass.
  assert.match(macGlassBlock, /var\(--ds-sidebar-glass-sheen-top\)/);
  assert.match(macGlassBlock, /var\(--ds-sidebar-glass-sheen-bottom\)/);
  // No dock seam on any platform (D297): neither the macOS glass rule nor the
  // base `.sidebar` rule draws a right edge, so the glass meets the opaque main
  // pane flush and no transparent override is needed.
  assert.doesNotMatch(macGlassBlock, /border-right/);
  const baseSidebarBlock = stylesSource.match(/\n\.sidebar\s*\{[^}]*\}/)?.[0] ?? "";
  assert.doesNotMatch(baseSidebarBlock, /border-right/);

  const macAncestorBlock =
    stylesSource.match(
      /:root\[data-platform="darwin"\],\n:root\[data-platform="darwin"\] body,\n:root\[data-platform="darwin"\] #root,\n:root\[data-platform="darwin"\] \.app-shell,\n:root\[data-platform="darwin"\] \.settings-shell\s*\{[^}]*\}/,
    )?.[0] ?? "";
  assert.match(macAncestorBlock, /background:\s*transparent/);

  const mainPaneBlock = styleBlock("\\.main-pane");
  const mainTitlebarBlock = styleBlock("\\.main-titlebar");
  const conversationTopbarBlock = styleBlock("\\.conversation-topbar");

  // `.main-pane` is the conversation column's cover: on macOS the veil resolves
  // to the opaque page colour, which is what keeps the vibrancy inside the
  // sidebar. It must never become transparent.
  assert.match(mainPaneBlock, /background:\s*var\(--ds-surface-veil\)/);
  assert.doesNotMatch(mainPaneBlock, /transparent/);

  // The two bands are unpainted on purpose. They sit *inside* the pane, so the
  // pane's plate already covers their region on every platform; giving them a
  // veil of their own would compose with it (56% over 56% = 81%) instead of
  // matching it, and would show up as a step at the band's lower edge. The
  // source assertion below is what makes "inside the pane" a checked fact
  // rather than an assumption.
  for (const block of [mainTitlebarBlock, conversationTopbarBlock]) {
    assert.match(block, /background:\s*transparent;/);
    assert.doesNotMatch(block, /--ds-surface-veil/);
  }
  const paneStart = appShellSource.indexOf('<section className="main-pane">');
  assert.ok(paneStart > 0, "expected the main pane section in AppShell");
  const paneEnd = appShellSource.indexOf("\n          </section>", paneStart);
  assert.ok(paneEnd > paneStart, "expected the main pane section to close");
  const paneSource = appShellSource.slice(paneStart, paneEnd);
  assert.match(paneSource, /<ConversationTopbar/);
  assert.match(paneSource, /"main-titlebar"/);
});

test("the sidebar glass tint stays thin enough to reveal the vibrancy material", () => {
  // Slice at the @theme block so later partials cannot fake a token, and match
  // the light selector at a line start — the file header comment quotes it.
  const tokenSource = stylesSource.slice(0, stylesSource.indexOf("@theme {"));
  const lightIndex = /\n:root\[data-theme="light"\]\s*\{/.exec(tokenSource)?.index ?? -1;
  assert.ok(lightIndex > 0, "expected a light theme token block");
  const themes = {
    dark: tokenSource.slice(0, lightIndex),
    light: tokenSource.slice(lightIndex),
  };

  for (const [theme, block] of Object.entries(themes)) {
    for (const token of [
      "--ds-sidebar-glass-tint",
      "--ds-sidebar-glass-sheen-top",
      "--ds-sidebar-glass-sheen-bottom",
    ]) {
      assert.match(block, new RegExp(`${token}:`), `${theme} must define ${token}`);
    }
    const tint = block.match(
      /--ds-sidebar-glass-tint:\s*color-mix\(in oklab,\s*var\(--ds-bg-sidebar\)\s*(\d+)%,\s*transparent\)/,
    );
    assert.ok(tint, `${theme}: tint must derive from --ds-bg-sidebar`);
    assert.ok(
      Number(tint[1]) <= 60,
      `${theme}: tint ${tint[1]}% is too opaque for the material to show through`,
    );
  }
});
