import { create } from "@bufbuild/protobuf";
import { version } from "../../package.json";
import { type Device, DeviceSchema } from "../gen/laterna/v1/auth_pb";

const storageKey = "laterna.device";

/** Browser and system, read from the user agent: "Chrome · Windows". */
export function guessDeviceName(userAgent: string = navigator.userAgent): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const system = /Android/.test(userAgent)
    ? "Android"
    : /iPhone|iPad/.test(userAgent)
      ? "iOS"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return system ? `${browser} · ${system}` : browser;
}

/** This device's name, as the user chose it, otherwise guessed. */
export function deviceName(): string {
  try {
    return localStorage.getItem(storageKey) ?? guessDeviceName();
  } catch {
    return guessDeviceName();
  }
}

export function saveDeviceName(name: string): void {
  try {
    localStorage.setItem(storageKey, name);
  } catch {
    // Storage unavailable: the name lasts for this login.
  }
}

/** Device declared to the server at login; it shows in the list of devices. */
export function currentDevice(name: string = deviceName()): Device {
  return create(DeviceSchema, {
    name,
    client: "Laterna Web",
    clientVersion: version,
    platform: guessDeviceName().split(" · ")[1] ?? "Web",
  });
}
