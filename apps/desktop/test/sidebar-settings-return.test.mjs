import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { nextSidebarTransition } from "../src/features/app/useSidebarTransition.ts";
import { loadStyles } from "./helpers/styles.mjs";

const idle = (collapsed = false, presented = true) => ({ collapsed, presented, phase: "idle" });

test("initial shell presentation and settings return never play sidebar entrance", () => {
  assert.deepEqual(nextSidebarTransition(idle(false, false), false, true), idle());
  for (const collapsed of [false, true]) {
    const hidden = nextSidebarTransition(idle(collapsed), collapsed, false);
    assert.deepEqual(hidden, idle(collapsed, false));
    assert.deepEqual(nextSidebarTransition(hidden, collapsed, true), idle(collapsed));
  }
});

test("only a collapsed-state change on a presented shell animates", () => {
  const leaving = nextSidebarTransition(idle(), true, true);
  assert.equal(leaving.phase, "exiting");
  assert.strictEqual(nextSidebarTransition(leaving, true, true), leaving);
  const reopening = nextSidebarTransition(leaving, false, true);
  assert.equal(reopening.phase, "entering");
  assert.equal(nextSidebarTransition(reopening, true, true).phase, "exiting");
  assert.equal(nextSidebarTransition(idle(true), false, true).phase, "entering");
});

test("settings interrupts either phase and rapid return cannot replay it", () => {
  for (const phase of ["entering", "exiting"]) {
    const collapsed = phase === "exiting";
    const hidden = nextSidebarTransition({ collapsed, presented: true, phase }, collapsed, false);
    assert.equal(hidden.phase, "idle");
    assert.equal(nextSidebarTransition(hidden, collapsed, true).phase, "idle");
  }
  const restoredWhileHidden = nextSidebarTransition(idle(true, false), false, false);
  assert.deepEqual(restoredWhileHidden, idle(false, false));
  assert.deepEqual(nextSidebarTransition(restoredWhileHidden, false, true), idle());
  assert.deepEqual(nextSidebarTransition(idle(true, false), false, true), idle());
});

test("home and settings use the same material without animating the settings plate", async () => {
  const [styles, sidebar, settings] = await Promise.all([
    loadStyles(),
    readFile(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/settings/SettingsPage.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(sidebar, /cx\("sidebar", "sidebar-surface", className\)/);
  assert.match(settings, /className="settings-nav sidebar-surface"/);
  assert.match(styles, /\.sidebar-surface,\s*\.sidebar-rail\s*\{[^}]*background-color:\s*var\(--ds-bg-sidebar[^}]*background-image:\s*var\(--ds-bg-sidebar-image/);
  assert.match(styles, /:root\[data-platform="darwin"\] \.sidebar-surface,/);
  assert.match(styles, /:root\[data-platform="darwin"\] \.settings-shell\s*\{\s*background:\s*transparent;/);
  // The settings band paints its own veil for the region it covers.
  assert.match(styles, /\.settings-titlebar\s*\{[^}]*background:\s*var\(--ds-surface-veil\);/);
  // …and the column's tint starts at the band's lower edge, so the absolutely
  // positioned band above it cannot stack a second veil over this one.
  assert.match(
    styles,
    /\.settings-content\s*\{[^}]*background:\s*linear-gradient\(\s*to bottom,\s*transparent 0 var\(--ds-toolbar-height\),\s*var\(--ds-surface-veil\) var\(--ds-toolbar-height\)\s*\);/,
  );
  assert.doesNotMatch(styles, /\.settings-shell-full \.settings-nav\s*\{[^}]*background:/);
  assert.match(styles, /\.route-surface,\s*\.settings-content-enter\s*\{[^}]*animation:\s*route-surface-in/);
  assert.doesNotMatch(styles, /\.route-surface,\s*\.settings-shell-full\s*\{/);
  assert.match(styles, /--ds-bg-sidebar:\s*var\(--ds-settings-rail-bg, var\(--ds-bg-under\)\)/);
  assert.match(styles, /--ds-bg-sidebar:\s*var\(--ds-settings-rail-bg, #f3f3f3\)/);
  // The rail's opaque origin is the same as before (`--ds-bg-under` dark /
  // `#f3f3f3` light); the acrylic veil is now derived from it inside the token,
  // so the surface rule can stay a direct pass-through.
  assert.match(styles, /--ds-settings-rail-plate:\s*var\(--ds-bg-under\)/);
  assert.match(styles, /--ds-settings-rail-plate:\s*#f3f3f3/);
  assert.match(styles, /--ds-settings-rail-bg:\s*color-mix\(in oklab,\s*var\(--ds-settings-rail-plate\)\s*56%,\s*transparent\)/);
  assert.doesNotMatch(styles, /--ds-settings-rail-bg:\s*var\(--ds-bg-sidebar/);
});
