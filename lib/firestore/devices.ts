import { db } from "@/lib/firebaseAdmin";

export interface DeviceDoc {
  id: string;
  platform: string;
  hostApp?: string;
  hostApps?: string[];
  hostAppVersion?: string;
  cepVersion?: string;
  machineKey?: string;
  firstSeen: FirebaseFirestore.Timestamp | Date;
  lastActive: FirebaseFirestore.Timestamp | Date;
  name?: string;
}

export class DeviceLimitError extends Error {
  code = "device_limit_reached";
  constructor(public limit: number) {
    super(`Device limit reached (${limit}). Sign out from the Prysmor panel on your current device first.`);
  }
}

/** Stable key for one physical machine (Premiere + AE share the same key). */
export function machineKeyFromFingerprint(fp?: string | null): string {
  if (!fp) return "";
  return fp.replace(/^ae-/i, "").replace(/^mfp-/i, "").slice(0, 12);
}

/** Preferred device doc id for new registrations. */
export function buildPanelDeviceId(userId: string, fingerprint?: string | null): string {
  const key = machineKeyFromFingerprint(fingerprint);
  return key ? `panel-${userId}-${key}` : `panel-${userId}`;
}

function machineKeyFromDeviceDoc(deviceId: string, data?: FirebaseFirestore.DocumentData): string {
  if (data?.machineKey) return String(data.machineKey);
  const suffix = deviceId.replace(/^panel(?:-ae)?-[^-]+-/, "");
  if (suffix && suffix !== deviceId) {
    return machineKeyFromFingerprint(suffix);
  }
  return "";
}

export async function registerDevice(
  userId: string,
  deviceId: string,
  platform: string,
  name?: string,
  extra?: {
    hostApp?: string;
    hostAppVersion?: string;
    cepVersion?: string;
    machineFingerprint?: string;
  }
) {
  const userRef = db.collection("users").doc(userId);
  const machineKey = machineKeyFromFingerprint(extra?.machineFingerprint);

  const [devicesSnap, userSnap] = await Promise.all([
    userRef.collection("devices").get(),
    userRef.get(),
  ]);

  // Reuse an existing device doc for this physical machine (legacy PR + new AE ids)
  let resolvedDeviceId = deviceId;
  let existingRef = userRef.collection("devices").doc(resolvedDeviceId);
  let existingSnap = await existingRef.get();

  if (!existingSnap.exists && machineKey) {
    for (const doc of devicesSnap.docs) {
      const docKey = machineKeyFromDeviceDoc(doc.id, doc.data());
      if (docKey && docKey === machineKey) {
        resolvedDeviceId = doc.id;
        existingRef = doc.ref;
        existingSnap = doc;
        break;
      }
    }
  }

  // Enforce limit only for brand-new physical machines
  if (!existingSnap.exists) {
    const limit: number = userSnap.exists
      ? (userSnap.data()?.deviceLimit ?? 1)
      : 1;

    const distinctMachines = new Set<string>();
    for (const doc of devicesSnap.docs) {
      const key = machineKeyFromDeviceDoc(doc.id, doc.data());
      if (key) distinctMachines.add(key);
    }

    if (distinctMachines.size >= limit && (!machineKey || !distinctMachines.has(machineKey))) {
      throw new DeviceLimitError(limit);
    }
  }

  const hostApp = extra?.hostApp;
  const prevHostApps: string[] = existingSnap.exists
    ? (existingSnap.data()?.hostApps as string[] | undefined) ?? []
    : [];
  const hostApps = hostApp
    ? [...new Set([...prevHostApps, hostApp])]
    : prevHostApps;

  if (existingSnap.exists) {
    await existingRef.update({
      lastActive: new Date(),
      ...(name                  && { name }),
      ...(machineKey            && { machineKey }),
      ...(hostApp               && { hostApp }),
      ...(hostApps.length > 0   && { hostApps }),
      ...(extra?.hostAppVersion && { hostAppVersion: extra.hostAppVersion }),
      ...(extra?.cepVersion     && { cepVersion: extra.cepVersion }),
    });
  } else {
    await existingRef.set({
      platform,
      name:       name ?? resolvedDeviceId,
      firstSeen:  new Date(),
      lastActive: new Date(),
      ...(machineKey            && { machineKey }),
      ...(hostApp               && { hostApp }),
      ...(hostApps.length > 0   && { hostApps }),
      ...(extra?.hostAppVersion && { hostAppVersion: extra.hostAppVersion }),
      ...(extra?.cepVersion     && { cepVersion: extra.cepVersion }),
    });
  }

  return resolvedDeviceId;
}

export async function getDevices(userId: string): Promise<DeviceDoc[]> {
  const snap = await db
    .collection("users")
    .doc(userId)
    .collection("devices")
    .orderBy("lastActive", "desc")
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeviceDoc));
}
