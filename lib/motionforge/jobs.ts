/**
 * MotionForge job data model.
 * Extended for Identity Lock v2 with identity analysis and compositing metadata.
 */

import { db } from '@/lib/firebaseAdmin';
import type { DriftSeverity } from './identityAnalysis';
import type { RestorationMode } from './config';

// ─── Status ────────────────────────────────────────────────────────────────────

export type JobStatus =
  | 'created'
  | 'uploading'
  | 'generating'
  | 'compositing'   // Identity Lock v2 post-processing running
  | 'completed'
  | 'failed';

// ─── Identity metadata ─────────────────────────────────────────────────────────

/**
 * Lightweight snapshot of IdentityAnalysis saved to Firestore.
 * Excludes heavyweight fields (frameScores array, originalFaceBoxes)
 * to avoid oversized Firestore documents.
 */
export interface IdentityAnalysisMeta {
  driftScore:            number;
  driftSeverity:         DriftSeverity;
  similarity:            number;
  averageSimilarity:     number;
  comparedFrames:        number;
  analysisMethod:        string;
  detectorUsed:          string;
  faceDetectedOriginal:  boolean;
  faceDetectedGenerated: boolean;
  warnings:              string[];
}

export interface CompositingMeta {
  restorationMode:        RestorationMode;
  analysisMethod:         string;
  detectorUsed:           string;
  averageSimilarity:      number;
  identityDrift:          number;
  comparedFrames:         number;
  segmentationProvider:   string;
  harmonizationApplied:   boolean;
  advancedMattingApplied: boolean;
  dynamicFaceBoxes:       boolean;
  fallbacksUsed:          string[];
  totalMs:                number;
}

// ─── Full job document ────────────────────────────────────────────────────────

export interface MotionForgeJob {
  id: string;
  userId: string;
  status: JobStatus;

  // ── Prompt ────────────────────────────────────────────────────────────────
  prompt?: string;
  /** Classified effect type — determines which restoration mode to use. */
  effectType?: 'overlay' | 'background';

  // ── Asset paths ───────────────────────────────────────────────────────────
  /** Local path of the trimmed clip saved during /upload */
  assetUrl?: string;
  /** Stable copy of original clip preserved for compositing */
  originalVideoPath?: string;

  // ── Identity Lock v2 anchors ──────────────────────────────────────────────
  /** Local paths of extracted identity anchor frames */
  identityAnchorPaths?: string[];
  /** Timestamps (seconds) of the anchor frames */
  identityFrameTimestamps?: number[];

  // ── Generation backend ────────────────────────────────────────────────────
  runwayTaskId?: string;

  // ── Output URLs ───────────────────────────────────────────────────────────
  /** Raw Runway output URL (pre-compositing) */
  rawOutputUrl?: string;
  /** Final output URL (post Identity Lock v2) */
  outputUrl?: string;

  // ── Analysis & compositing metadata ───────────────────────────────────────
  identityAnalysis?:  IdentityAnalysisMeta;
  compositingMeta?:   CompositingMeta;

  // ── Diagnostics ───────────────────────────────────────────────────────────
  error?:    string;
  warnings?: string[];
  progress?: number; // 0-100

  // ── Timestamps ────────────────────────────────────────────────────────────
  createdAt: FirebaseFirestore.Timestamp | Date;
  updatedAt: FirebaseFirestore.Timestamp | Date;
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

const COLLECTION = 'motionforge_jobs';

export async function createJob(userId: string): Promise<string> {
  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    userId,
    status:    'created' as JobStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return ref.id;
}

export async function getJob(jobId: string): Promise<MotionForgeJob | null> {
  const doc = await db.collection(COLLECTION).doc(jobId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as MotionForgeJob;
}

export async function updateJob(
  jobId: string,
  data: Partial<Omit<MotionForgeJob, 'id' | 'createdAt'>>,
): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(jobId)
    .update({ ...data, updatedAt: new Date() });
}
