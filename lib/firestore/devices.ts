import { db } from "@/lib/firebaseAdmin";

export interface DeviceDoc {
  id: string;
  platform: string;
  hostApp?: string;
  hostAppVersion?: string;
  cepVersion?: string;
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

export async function registerDevice(
  userId: string,
  deviceId: string,
  platform: string,
  name?: string,
  extra?: {
    hostApp?: string;
    hostAppVersion?: string;
    cepVersion?: string;
  }
) {
  const userRef   = db.collection("users").doc(userId);
  const deviceRef = userRef.collection("devices").doc(deviceId);

  const [existing, devicesSnap, userSnap] = await Promise.all([
    deviceRef.get(),
    userRef.collection("devices").get(),
    userRef.get(),
  ]);

  // Enforce limit only for brand-new devices (not heartbeat/reconnect)
  if (!existing.exists) {
    const limit: number = userSnap.exists
      ? (userSnap.data()?.deviceLimit ?? 1)
      : 1;
    if (devicesSnap.size >= limit) {
      throw new DeviceLimitError(limit);
    }
  }

  if (existing.exists) {
    // Device already registered — only refresh lastActive timestamp
    await deviceRef.update({ lastActive: new Date() });
  } else {
    // First time seeing this device — write all fields
    await deviceRef.set({
      platform,
      name:           name ?? deviceId,
      firstConnected: new Date(),
      lastActive:     new Date(),
      ...(extra?.hostApp        && { hostApp: extra.hostApp }),
      ...(extra?.hostAppVersion && { hostAppVersion: extra.hostAppVersion }),
      ...(extra?.cepVersion     && { cepVersion: extra.cepVersion }),
    });
  }
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
