import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: "prysmor-4841d",
      clientEmail: "firebase-adminsdk-fbsvc@prysmor-4841d.iam.gserviceaccount.com",
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: "prysmor-4841d.appspot.com",
  });
}

export const db = admin.firestore();
export const bucket = admin.storage().bucket();
