import assert from "node:assert/strict";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const stylesSource = await loadStyles();

function styleBlock(selector) {
  return stylesSource.match(new RegExp(`(?:^|\\n)${selector} \\{[^}]*\\}`))?.[0] ?? "";
}

test("shell titlebar surfaces share the toolbar metric and borderless surface", () => {
  for (const selector of [
    "\\.main-titlebar",
    "\\.conversation-topbar",
    "\\.settings-titlebar",
  ]) {
    const block = styleBlock(selector);
    assert.match(block, /height:\s*var\(--ds-toolbar-height\);/);
    assert.match(block, /border-bottom:\s*0;/);
  }

  // The three bands reach the same tone by two different routes, because their
  // containers differ: the conversation bands are children of `.main-pane` and
  // so stay unpainted and inherit that pane's veil, while the settings band is
  // a sibling of `.settings-content` and has to carry the veil for the region
  // it covers. Painting a veil on *both* layers of either column is the failure
  // this pins: alphas compose (1-(1-0.56)^2 = 81%), so the band would read as a
  // lighter strip against the column beneath it.
  for (const selector of ["\\.main-titlebar", "\\.conversation-topbar"]) {
    assert.match(styleBlock(selector), /background:\s*transparent;/);
    assert.doesNotMatch(styleBlock(selector), /--ds-surface-veil/);
  }
  assert.match(styleBlock("\\.settings-titlebar"), /background:\s*var\(--ds-surface-veil\);/);
});

test("window chrome reserves the same titlebar height and native control band", () => {
  const controls = styleBlock("\\.window-controls");
  assert.match(controls, /height:\s*var\(--ds-toolbar-height\);/);
  assert.match(controls, /width:\s*var\(--ds-window-controls-width\);/);
  assert.match(stylesSource, /--ds-window-controls-width:\s*120px;/);
  assert.match(stylesSource, /--ds-toolbar-height:\s*46px;/);
});

test("window control band draws no boundary of its own", () => {
  // D297: the band carries the titlebar tone by *inheriting* it rather than by
  // painting a second layer over it; no side seam.
  const controls = styleBlock("\\.window-controls");
  assert.doesNotMatch(controls, /border-bottom:/);
  assert.doesNotMatch(controls, /border-left/);
  assert.match(controls, /background:\s*transparent;/);
});

test("sidebar and work-panel headers use the shared toolbar metric", () => {
  assert.match(styleBlock("\\.sidebar-header"), /height:\s*var\(--ds-toolbar-height\);/);
  assert.match(styleBlock("\\.sidebar-header"), /flex:\s*0 0 var\(--ds-toolbar-height\);/);
  assert.match(styleBlock("\\.work-panel-header"), /height:\s*var\(--ds-toolbar-height\);/);
  assert.match(
    styleBlock("\\.settings-content"),
    /padding:\s*calc\(var\(--ds-toolbar-height\) \+ 8px\) 48px 56px 40px;/,
  );
});
