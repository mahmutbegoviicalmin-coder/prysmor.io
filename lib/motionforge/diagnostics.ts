/**
 * VFXPilot Identity Diagnostics
 *
 * Writes per-frame diagnostics as JSONL to:
 *   ./logs/identity_{clipId}_{timestamp}.jsonl
 *
 * Helpers:
 *   openDiagnosticsSession  — creates / re-opens a session
 *   appendFrameDiagnostics  — append one FrameDiagnostics record (never throws)
 *   appendMetadata          — append a non-frame metadata record
 *   readDiagnostics         — read most-recent log for a clipId
 *   listDiagnosticClipIds   — list all known clip IDs
 */

import * as fs   from 'fs';
import * as path from 'path';
import { log }   from './logger';

import type { EmbeddingQuality, EmbeddingModel } from './sidecar';
import type { RestorationMode }                  from './config';

const TAG = 'diagnostics';

// ─── Directory ────────────────────────────────────────────────────────────────

const LOGS_DIR = path.join(process.cwd(), 'logs');

function ensureLogsDir(): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DetectionMethod = 'ultraface' | 'retinaface' | 'skin_heuristic' | 'tracking';

export interface FrameDiagnostics {
  frameIndex:          number;
  detectionMethod:     DetectionMethod;
  detectionConfidence: number;
  embeddingModel:      EmbeddingModel | 'none';
  embeddingConfidence: number;
  frameQuality:        EmbeddingQuality;
  identityScore:       number;
  adjustedScore:       number;
  restorationMode:     RestorationMode;
  subjectId:           string;
  anchorUsed:          number;   // index into anchor array, -1 = no anchor
  timestamp?:          number;   // seconds into video
}

export interface ClipDiagnosticsSession {
  clipId:    string;
  logPath:   string;
  startedAt: string;
}

// In-memory index reset per process lifetime
const _sessions = new Map<string, ClipDiagnosticsSession>();

// ─── Session management ───────────────────────────────────────────────────────

function _sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

/**
 * Opens a diagnostics session for a clip.
 * Re-uses the existing session if already open in this process.
 */
export function openDiagnosticsSession(clipId: string): ClipDiagnosticsSession {
  const existing = _sessions.get(clipId);
  if (existing) return existing;

  ensureLogsDir();
  const ts      = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(LOGS_DIR, `identity_${_sanitize(clipId)}_${ts}.jsonl`);
  const session: ClipDiagnosticsSession = {
    clipId,
    logPath,
    startedAt: new Date().toISOString(),
  };
  _sessions.set(clipId, session);
  log(TAG, `Session opened: ${logPath}`);
  return session;
}

/** Closes (removes) an in-memory session. The JSONL file is kept on disk. */
export function closeDiagnosticsSession(clipId: string): void {
  _sessions.delete(clipId);
}

// ─── Write helpers ────────────────────────────────────────────────────────────

/** Append one FrameDiagnostics record. Never throws. */
export function appendFrameDiagnostics(
  session: ClipDiagnosticsSession,
  record:  FrameDiagnostics,
): void {
  try {
    fs.appendFileSync(session.logPath, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    log(TAG, `appendFrame silent error: ${(err as Error).message}`);
  }
}

/** Append a non-frame metadata record (session start, anchor summary, etc.). */
export function appendMetadata(
  session: ClipDiagnosticsSession,
  kind:    string,
  payload: Record<string, unknown>,
): void {
  try {
    const line = JSON.stringify({ __kind: kind, __ts: Date.now(), ...payload }) + '\n';
    fs.appendFileSync(session.logPath, line, 'utf8');
  } catch { /* silent */ }
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

export interface DiagnosticsReadResult {
  clipId:  string;
  logPath: string;
  records: Array<FrameDiagnostics | Record<string, unknown>>;
  count:   number;
}

/**
 * Reads all JSONL records for a clipId.
 * Scans ./logs/ for files matching identity_{clipId}_*.jsonl
 * and returns the most-recent file's contents.
 */
export function readDiagnostics(clipId: string): DiagnosticsReadResult | null {
  ensureLogsDir();
  const prefix  = `identity_${_sanitize(clipId)}_`;
  const matches = fs.existsSync(LOGS_DIR)
    ? fs.readdirSync(LOGS_DIR)
        .filter(f => f.startsWith(prefix) && f.endsWith('.jsonl'))
        .sort()
        .reverse()   // most-recent ISO timestamp first
    : [];

  if (matches.length === 0) return null;

  const logPath = path.join(LOGS_DIR, matches[0]);
  const records = _parseJsonl(logPath);
  return { clipId, logPath, records, count: records.length };
}

/** Lists all clip IDs that have at least one diagnostics file. */
export function listDiagnosticClipIds(): string[] {
  ensureLogsDir();
  const seen = new Set<string>();
  if (!fs.existsSync(LOGS_DIR)) return [];
  for (const f of fs.readdirSync(LOGS_DIR)) {
    if (!f.endsWith('.jsonl')) continue;
    const m = f.match(/^identity_(.+?)_\d{4}-\d{2}/);
    if (m?.[1]) seen.add(m[1]);
  }
  return [...seen];
}

function _parseJsonl(
  filePath: string,
): Array<FrameDiagnostics | Record<string, unknown>> {
  try {
    return fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as FrameDiagnostics | Record<string, unknown>);
  } catch {
    return [];
  }
}
