/**
 * MotionForge structured logger.
 * Adds a consistent prefix and optional JSON metadata to every log line.
 * Never logs secret values — callers must sanitize before passing data.
 */

const PREFIX = '[MotionForge]';

function fmt(tag: string, msg: string): string {
  return `${PREFIX}[${tag}] ${msg}`;
}

function serializeData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return '';
  try {
    return ' ' + JSON.stringify(data);
  } catch {
    return '';
  }
}

export function log(tag: string, msg: string, data?: Record<string, unknown>): void {
  console.log(fmt(tag, msg) + serializeData(data));
}

export function warn(tag: string, msg: string, data?: Record<string, unknown>): void {
  console.warn(fmt(tag, `⚠ ${msg}`) + serializeData(data));
}

export function error(tag: string, msg: string, err?: unknown): void {
  const errMsg = err instanceof Error ? err.message : (err !== undefined ? String(err) : '');
  console.error(fmt(tag, `✗ ${msg}`) + (errMsg ? ` — ${errMsg}` : ''));
}
