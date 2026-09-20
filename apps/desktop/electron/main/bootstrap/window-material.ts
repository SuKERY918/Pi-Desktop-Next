import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import type { Logger } from "../logger";

/**
 * The window-constructor fragment that decides the native surface material.
 *
 * Kept as a `Pick` so callers can spread it next to the other window options
 * without accidentally overriding `resizable`, `minWidth`, or the renderer's
 * `webPreferences`.
 */
export type MaterialOptions = Pick<
  BrowserWindowConstructorOptions,
  "frame" | "backgroundMaterial" | "transparent" | "backgroundColor"
>;

/**
 * Lowest Windows build that can draw the DWM acrylic material.
 *
 * Windows 11 22H2 is build 22621; Windows 10 and Windows 11 21H2 either ignore
 * the request or throw. The gate is a single constant so the platform check and
 * the version check cannot drift apart between call sites.
 */
export const WINDOWS_ACRYLIC_MIN_BUILD = 22621;

/**
 * Whether this OS can draw the native material at all.
 *
 * This is the ONE place that answers "is the native window material in play?".
 * The main window constructor, the readiness re-application, and the IPC layer
 * that must not paint over the material all read it, so they cannot disagree —
 * e.g. one applying acrylic and another immediately covering it with an opaque
 * background colour.
 *
 * `platform` and `systemVersion` are injectable so the gate is a pure function
 * that can be reasoned about (and unit-tested) without a real Windows host.
 * `process.getSystemVersion()` returns an OS version string such as
 * `"10.0.22621"`; the third segment is the Windows build number.
 */
export function usesNativeWindowMaterial(
  platform: NodeJS.Platform = process.platform,
  systemVersion: string = process.getSystemVersion(),
): boolean {
  if (platform !== "win32") return false;
  const build = Number.parseInt(systemVersion.split(".")[2] ?? "", 10);
  return Number.isFinite(build) && build >= WINDOWS_ACRYLIC_MIN_BUILD;
}

/**
 * Native material options for a frameless app window.
 *
 * A single "acrylic" sheet: the DWM compositor is the ONLY thing that can blur
 * the desktop wallpaper behind the window. The renderer's CSS
 * `backdrop-filter` samples the window's own web contents, so it can never blur
 * the desktop (Electron docs: the CSS `blur()` filter only applies to the
 * window's web contents). The renderer's job is to stay translucent so the
 * material shows through — see the surface-veil ladder in styles/tokens.css.
 *
 * ⛔ `transparent` MUST stay `false`. A transparent window is not resizable and
 * cannot be maximized through the system menu or by double-clicking the
 * titlebar (Electron docs + electron/electron#38454). This window is a
 * resizable editor shell, so transparency would be a net regression. The only
 * sanctioned fallback when the material is unavailable is an opaque
 * `backgroundColor` — never `transparent: true`.
 *
 * `backgroundColor: "#00000000"` lets the DWM material show through the
 * transparent renderer root; it is NOT the window being a transparent window.
 * On a platform/version without the material (`usesNativeWindowMaterial()` is
 * false) the constructor instead paints `fallbackBackground`, so Linux and old
 * Windows never fall back to a black or see-through window.
 */
export function windowMaterialOptions(
  fallbackBackground: string = WINDOW_FALLBACK_BACKGROUND,
): MaterialOptions {
  if (!usesNativeWindowMaterial()) {
    return {
      frame: false,
      transparent: false,
      backgroundColor: fallbackBackground,
    };
  }
  return {
    frame: false,
    transparent: false,
    backgroundMaterial: "acrylic",
    backgroundColor: WINDOW_MATERIAL_BACKGROUND,
  };
}

/**
 * Opaque plate used ONLY when the OS cannot draw the native material (Linux,
 * Windows 10, or Windows 11 below 22H2). This is a window-level fallback — a
 * different layer from the renderer's translucent surface veils — and it is
 * never a signal to switch to `transparent: true`. Callers on Windows/Linux
 * pass the active theme's `builtinWindowBackground(...)` so the fallback still
 * matches the app palette.
 */
export const WINDOW_FALLBACK_BACKGROUND = "#ffffff";

/**
 * Fully transparent window plate. Pairs with `backgroundMaterial: "acrylic"` so
 * the blurred desktop shows through the transparent renderer root. Because
 * `transparent` stays `false`, the alpha here is not "a transparent window": it
 * only removes the solid plate the compositor would otherwise draw.
 */
export const WINDOW_MATERIAL_BACKGROUND = "#00000000";

/** The two readiness moments at which the material is (re)applied. */
export type MaterialActivationPhase = "ready-to-show" | "did-finish-load";

/**
 * Apply the native material at a readiness moment.
 *
 * Electron can ignore the material declared in the constructor and there are
 * reports of the first frame dropping it (electron/electron#43345), so it is
 * re-applied idempotently at `ready-to-show` and `did-finish-load`. This never
 * touches `resizable`/`maximizable`. On a host without the material the call is
 * a no-op (the constructor already painted the opaque fallback).
 */
export function activateWindowMaterial(
  win: BrowserWindow,
  phase: MaterialActivationPhase,
  logger?: Pick<Logger, "app">,
): void {
  if (win.isDestroyed()) return;
  if (!usesNativeWindowMaterial()) return;
  try {
    win.setBackgroundMaterial("acrylic");
    logger?.app("lifecycle", "info", "applied window material", { data: { phase } });
  } catch (error) {
    // A platform without the material throws or no-ops; either way the window
    // keeps the opaque `backgroundColor` the constructor painted. Never crash
    // the window over a cosmetic material.
    logger?.app("lifecycle", "warn", "window material apply failed", {
      data: { phase, error: String(error) },
    });
  }
}

/**
 * Report which material the window is running with.
 *
 * Electron exposes no `getBackgroundMaterial`, so this cannot read the live
 * value; it reports from the platform/version gate. Pixel-level verification is
 * the QA visual matrix's job, not something to fake here.
 */
export function probeWindowMaterial(win: BrowserWindow): "acrylic" | "fallback" {
  if (win.isDestroyed()) return "fallback";
  return usesNativeWindowMaterial() ? "acrylic" : "fallback";
}
