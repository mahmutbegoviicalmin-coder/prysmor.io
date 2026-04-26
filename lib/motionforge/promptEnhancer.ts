/**
 * MotionForge Prompt Enhancer
 *
 * Transforms short user prompts into identity-safe, cinematic prompts
 * optimised for Runway Gen-4 / Beeble SwitchX generation.
 *
 * Primary path: Claude Haiku (text-only).
 * Fallback path: lightweight rule-based enhancement.
 */

import Anthropic from '@anthropic-ai/sdk';
import { log, warn } from './logger';

const TAG = 'promptEnhancer';

// ─── Claude config ────────────────────────────────────────────────────────────

const MODEL_TEXT = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 220;

export const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System prompt ────────────────────────────────────────────────────────────

/**
 * The system prompt controls identity safety, realism, and output format.
 * It is intentionally strict to prevent common Runway generation failures
 * (distorted faces, warped anatomy, changed clothing).
 */
// ─── Mode-specific system prompts ────────────────────────────────────────────

const MODE_PROMPTS: Record<string, string> = {
  background: `You are a Runway Gen-4 Aleph prompt writer.
The user wants to change the background or environment of a video clip.
Analyse the user intent and write a single Runway prompt.

OUTPUT FORMAT (strict):
"Replace the background with [3-5 word environment]. Keep the person unchanged."

Rules:
- Always start with "Replace the background with"
- Describe only the new environment in 3-5 words: location, time of day, weather, atmosphere
- Never mention people, faces, clothing, or body in the transformation part
- Always end with "Keep the person unchanged."
- Max 15 words total
- Plain text only. No quotes. No markdown.`,

  relight: `You are a Runway Gen-4 Aleph prompt writer.
The user wants to change the lighting or atmosphere of a video clip.
Analyse the user intent and write a single Runway prompt.

OUTPUT FORMAT (strict):
"Change the lighting to [3-5 word description]. Keep everything else the same."

Rules:
- Always start with "Change the lighting to"
- Describe only: light quality, direction, color temperature, mood in 3-5 words
- Never mention people, clothing or changing any subjects
- Always end with "Keep everything else the same."
- Max 12 words total
- Plain text only. No quotes. No markdown.`,

  vfx: `You are a Runway Gen-4 Aleph prompt writer for visual effects.
The user wants to add a cinematic visual effect to a video clip.
Analyse the user intent and write a single Runway prompt.

OUTPUT FORMAT (strict):
"Add [3-5 word effect description] to the scene. Keep all people unchanged."

Rules:
- Always start with "Add"
- Describe the effect in 3-5 words: type, color, intensity
- Never mention changing people, clothing, or background
- Always end with "Keep all people unchanged."
- Max 12 words total
- Plain text only. No quotes. No markdown.`,
};

// Fallback for unknown modes
const DEFAULT_MODE = 'background';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnhancementResult {
  enhancedPrompt: string;
  method: 'claude' | 'fallback';
  sceneAnalysed: boolean;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates and normalises a raw user prompt.
 * Throws if empty after trimming.
 */
export function validatePrompt(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) throw new Error('Prompt must not be empty');
  if (trimmed.length > 1000) throw new Error('Prompt exceeds 1000 character limit');
  return trimmed;
}

// ─── Fallback enhancement (no Claude) ────────────────────────────────────────

const TRANSFORMATION_VERBS = /\b(replace|change|make it|turn into|convert|transform|apply|set in|put in|move to|switch to)\b/gi;

/**
 * Mode-aware rule-based fallback. Activated only when Claude is unavailable.
 * Mirrors the output format of each mode's system prompt so the result is
 * structurally consistent with what Claude would have produced.
 */
export function fallbackEnhance(userPrompt: string, mode?: string): string {
  const cleaned = userPrompt
    .replace(TRANSFORMATION_VERBS, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const body = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  const stmt = body.endsWith('.') ? body.slice(0, -1) : body;

  switch (mode) {
    case 'background':
      return `Replace the background with ${stmt.charAt(0).toLowerCase() + stmt.slice(1)}. Keep the person unchanged.`;
    case 'relight':
      return `Change the lighting to ${stmt.charAt(0).toLowerCase() + stmt.slice(1)}. Keep everything else the same.`;
    case 'vfx':
      return `Add ${stmt.charAt(0).toLowerCase() + stmt.slice(1)} to the scene. Keep all people unchanged.`;
    default:
      return `Replace the background with ${stmt.charAt(0).toLowerCase() + stmt.slice(1)}. Keep the person unchanged.`;
  }
}

// ─── Claude call ──────────────────────────────────────────────────────────────

/**
 * Calls Claude (text-only) with the mode system prompt.
 * Throws on API error so the caller can fall back to rule-based enhancement.
 */
async function callClaude(
  userPrompt: string,
  mode: string = DEFAULT_MODE,
): Promise<string> {
  const systemPrompt = MODE_PROMPTS[mode] ?? MODE_PROMPTS[DEFAULT_MODE];

  console.log('[claude] callClaude — model:', MODEL_TEXT, '— mode:', mode);

  const response = await client.messages.create({
    model:      MODEL_TEXT,
    max_tokens: MAX_TOKENS,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: `Write the best possible MotionForge prompt for: "${userPrompt}"` }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  if (!raw) throw new Error('Claude returned empty completion');

  const cleaned = raw.replace(/^["']|["']$/g, '').trim();
  console.log('[claude] Final compiled prompt:', cleaned);

  return cleaned;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Enhances a user prompt into a production-ready MotionForge prompt.
 *
 * @param userPrompt - Short user input ("add fireworks", "make it snowy", etc.)
 * @param mode       - Generation mode: background | relight | vfx
 * @returns          - EnhancementResult with the enhanced prompt and method used.
 *
 * Never throws: on any failure the fallback result is returned.
 */
export async function enhanceMotionForgePrompt(
  userPrompt: string,
  mode: string = DEFAULT_MODE,
): Promise<EnhancementResult> {
  const prompt = validatePrompt(userPrompt);

  log(TAG, `Enhancing prompt (mode=${mode})`, { promptLen: prompt.length });

  try {
    const enhanced = await callClaude(prompt, mode);

    const wordCount = enhanced.split(/\s+/).length;
    if (wordCount < 3) {
      warn(TAG, `Unusually short Claude output (${wordCount} words) — may be degraded`, {
        output: enhanced.slice(0, 100),
      });
    }

    log(TAG, `Enhancement complete via claude`, { wordCount });
    return { enhancedPrompt: enhanced, method: 'claude', sceneAnalysed: false };

  } catch (err) {
    warn(TAG, 'Claude enhancement failed — using fallback', { err: (err as Error).message });

    const enhanced = fallbackEnhance(prompt, mode);
    log(TAG, 'Fallback enhancement used', { wordCount: enhanced.split(/\s+/).length });

    return { enhancedPrompt: enhanced, method: 'fallback', sceneAnalysed: false };
  }
}
