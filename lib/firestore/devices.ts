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
  const ref = db
    .collection("users")
    .doc(userId)
    .collection("devices")
    .doc(deviceId);

  const existing = await ref.get();

  await ref.set(
    {
      platform,
      name: name ?? deviceId,
      lastActive: new Date(),
      // Only write firstSeen on first registration
      ...(!existing.exists && { firstSeen: new Date() }),
      ...(extra?.hostApp        && { hostApp: extra.hostApp }),
      ...(extra?.hostAppVersion && { hostAppVersion: extra.hostAppVersion }),
      ...(extra?.cepVersion     && { cepVersion: extra.cepVersion }),
    },
    { merge: true }
  );
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
