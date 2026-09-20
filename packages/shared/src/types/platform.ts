/** Shared public types grouped by the owning application domain. */
import type { Mode } from "./common.js";

export type AppVersionInfo = {
  name: string;
  version: string;
  protocolVersion: number;
  hostProtocolVersion?: number;
  hostVersion?: string;
  platform: string;
  arch: string;
};

export type HostHealth = {
  ok: boolean;
  protocolVersion: number;
  version: string;
  uptimeMs: number;
};

/** Payload of the `hostStatus` push event (backend supervision state). */
export type HostStatusEvent = {
  ok: boolean;
  component?: "host" | "sidecar";
  restarting?: boolean;
  restarted?: boolean;
  fatal?: boolean;
  /** Free text, or a status token such as `GLIBC_UNSUPPORTED` / `DB_SCHEMA_TOO_NEW`. */
  message?: string;
  /** Schema numbers behind `DB_SCHEMA_TOO_NEW`. */
  schema?: { found: number; supported: number };
  /** Set on the boot status when the build is not native to this CPU. */
  archMismatch?: { platform: string; processArch: string; machineArch: string };
};

export type OnboardingState = {
  showChecklist: boolean;
  steps: Array<{
    id: string;
    title: string;
    done: boolean;
    action?: string;
  }>;
};


export type ScheduledTaskCadence = "manual" | "hourly" | "daily" | "weekly";

export type ScheduledTask = {
  id: string;
  title: string;
  prompt: string;
  cadence: ScheduledTaskCadence;
  mode: Mode;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
};
