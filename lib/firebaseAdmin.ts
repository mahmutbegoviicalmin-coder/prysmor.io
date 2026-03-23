import admin from "firebase-admin";

// Skip initialization at build time when env vars are not available
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!admin.apps.length && privateKey) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: "prysmor-4841d",
      clientEmail: "firebase-adminsdk-fbsvc@prysmor-4841d.iam.gserviceaccount.com",
      privateKey,
    }),
    storageBucket: "prysmor-4841d.appspot.com",
  });
}

export const db = admin.apps.length ? admin.firestore() : null as any;
export const bucket = admin.apps.length ? admin.storage().bucket() : null as any;
