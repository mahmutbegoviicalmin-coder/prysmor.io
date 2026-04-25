/**
 * MotionForge Prompt Enhancer
 *
 * Transforms short user prompts into identity-safe, cinematic prompts
 * optimised for Runway Gen-4 video-to-video generation.
 *
 * Primary path: Claude Haiku (text-only) or Claude Opus with vision (when frames provided).
 *
 * Fallback path: lightweight rule-based enhancement that prepends the
 *   identity-preservation header and strips transformation verbs.
 *   Activated only when Claude is unavailable.
 *
 * Output: plain text, under 60 words, sentence-based.
 *   Always begins with "with [subject description] maintaining identical appearance,"
 */

import Anthropic from '@anthropic-ai/sdk';
import { log, warn } from './logger';

const TAG = 'promptEnhancer';

// ─── Claude config ────────────────────────────────────────────────────────────

const MODEL_TEXT   = 'claude-haiku-4-5-20251001';  // fast + cheap for text-only
const MODEL_VISION = 'claude-haiku-4-5-20251001';  // vision-capable for frame analysis
const MAX_TOKENS   = 220;

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
"Replace the background with [new environment, lighting, atmosphere]. Keep all people, faces, clothing and positions completely unchanged."

Rules:
- Always start with "Replace the background with"
- Describe only the new environment: location, time of day, weather, atmosphere
- Never mention people, faces, clothing, or body in the transformation part
- Always end with "Keep all people, faces, clothing and positions completely unchanged."
- Max 30 words total
- Plain text only. No quotes. No markdown.`,

  relight: `You are a Runway Gen-4 Aleph prompt writer.
The user wants to change the lighting or atmosphere of a video clip.
Analyse the user intent and write a single Runway prompt.

OUTPUT FORMAT (strict):
"Re-light the scene with [lighting style, color temperature, mood, shadow direction]. Keep all people and scene elements unchanged."

Rules:
- Always start with "Re-light the scene with"
- Describe only: light quality, direction, color temperature, mood
- Never mention people, clothing or changing any subjects
- Always end with "Keep all people and scene elements unchanged."
- Max 25 words total
- Plain text only. No quotes. No markdown.`,

  style: `You are a Runway Gen-4 Aleph prompt writer for clothing transformation.
The user wants to change what a person is wearing in a video clip.
Aleph already sees the video — do NOT describe faces, body, or background.

OUTPUT FORMAT (strict):
"Re-style the clothing into [garment type, fabric, color, fit, key details]. Keep the person's face, body and position unchanged throughout the entire clip."

Rules:
- Always start with "Re-style the clothing into"
- Describe only: garment type, fabric texture, color, fit, specific details
- Never mention face, skin, hair, or background
- Always end with "Keep the person's face, body and position unchanged throughout the entire clip."
- Max 30 words total
- Plain text only. No quotes. No markdown.`,

  vfx: `You are a Runway Gen-4 Aleph prompt writer for visual effects.
The user wants to add a cinematic visual effect to a video clip.
Analyse the user intent and write a single Runway prompt.

OUTPUT FORMAT (strict):
"Add [specific VFX: particles, fire, fog, rain, smoke, energy, sparks, etc] to the scene. Keep all people and objects completely unchanged."

Rules:
- Always start with "Add"
- Be specific and cinematic: describe the effect's appearance, color, intensity
- Never mention changing people, clothing, or background
- Always end with "Keep all people and objects completely unchanged."
- Max 25 words total
- Plain text only. No quotes. No markdown.`,
};

// Fallback for unknown modes
const DEFAULT_MODE = 'background';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnhancementResult {
  enhancedPrompt: string;
  method: 'claude' | 'claude-vision' | 'fallback';
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
      return `Replace the background with ${stmt.charAt(0).toLowerCase() + stmt.slice(1)}. Keep all people, faces, clothing and positions completely unchanged.`;
    case 'relight':
      return `Re-light the scene with ${stmt.charAt(0).toLowerCase() + stmt.slice(1)}. Keep all people and scene elements unchanged.`;
    case 'style':
      return `Re-style the clothing into ${stmt.charAt(0).toLowerCase() + stmt.slice(1)}. Keep the person's face, body and position unchanged throughout the entire clip.`;
    case 'vfx':
      return `Add ${stmt.charAt(0).toLowerCase() + stmt.slice(1)} to the scene. Keep all people and objects completely unchanged.`;
    default:
      return `Replace the background with ${stmt.charAt(0).toLowerCase() + stmt.slice(1)}. Keep all people and their appearance unchanged.`;
  }
}

// ─── Claude call ──────────────────────────────────────────────────────────────

/**
 * Calls Claude with the system prompt and optional scene frames (vision mode).
 * Uses Haiku for text-only, Opus for vision. Returns the raw completion string.
 *
 * Throws on API error so the caller can decide whether to fallback.
 */
async function callClaude(
  userPrompt: string,
  sceneFrames: string[],
  mode: string = DEFAULT_MODE,
): Promise<string> {
  const hasFrames  = sceneFrames.length > 0;
  const model      = hasFrames ? MODEL_VISION : MODEL_TEXT;
  const systemPrompt = MODE_PROMPTS[mode] ?? MODE_PROMPTS[DEFAULT_MODE];

  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'; data: string } };

  let userContent: string | ContentBlock[];

  if (hasFrames) {
    const parts: ContentBlock[] = [
      {
        type: 'text',
        text:
          `You have ${sceneFrames.length} frame(s) from the actual video clip. ` +
          `Analyse the scene lighting, environment, and atmosphere, then write the best possible ` +
          `MotionForge prompt for: "${userPrompt}"`,
      },
    ];
    for (const frame of sceneFrames) {
      parts.push({
        type:   'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: frame },
      });
    }
    userContent = parts;
  } else {
    userContent = `Write the best possible MotionForge prompt for: "${userPrompt}"`;
  }

  console.log('[claude-vision] callClaude — model:', model, '— frames sent:', sceneFrames.length);

  console.log('[claude] mode:', mode, '— system prompt length:', systemPrompt.length);

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system:     systemPrompt,
    messages:   [{ role: 'user', content: userContent as Anthropic.MessageParam['content'] }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  if (!raw) throw new Error('Claude returned empty completion');

  const cleaned = raw.replace(/^["']|["']$/g, '').trim();

  console.log('[claude-vision] Full response:', JSON.stringify(response, null, 2));
  console.log('[claude-vision] What it sees:', raw);
  console.log('[claude-vision] Final compiled prompt:', cleaned);

  return cleaned;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Enhances a user prompt into a production-ready MotionForge prompt.
 *
 * @param userPrompt  - Short user input ("add fireworks", "make it snowy", etc.)
 * @param sceneFrames - Optional base64 JPEG frames for scene-aware enhancement.
 *                      Pass [] or omit for text-only mode.
 * @returns           - EnhancementResult with the enhanced prompt and method used.
 *
 * Never throws: on any failure the fallback result is returned so the caller
 * can always proceed with generation.
 */
export async function enhanceMotionForgePrompt(
  userPrompt:  string,
  sceneFrames: string[] = [],
  mode: string = DEFAULT_MODE,
): Promise<EnhancementResult> {
  const prompt    = validatePrompt(userPrompt);
  const frames    = sceneFrames.filter(f => typeof f === 'string' && f.length > 0).slice(0, 5);
  const hasFrames = frames.length > 0;

  log(TAG, `Enhancing prompt (frames=${frames.length}, mode=${mode})`, { promptLen: prompt.length });

  try {
    const enhanced = await callClaude(prompt, frames, mode);

    const wordCount = enhanced.split(/\s+/).length;
    if (wordCount < 15) {
      warn(TAG, `Unusually short Claude output (${wordCount} words) — may be degraded`, {
        output: enhanced.slice(0, 100),
      });
    }

    const method: EnhancementResult['method'] = hasFrames ? 'claude-vision' : 'claude';
    log(TAG, `Enhancement complete via ${method}`, { wordCount });

    return { enhancedPrompt: enhanced, method, sceneAnalysed: hasFrames };

  } catch (err) {
    warn(TAG, 'Claude enhancement failed — using fallback', {
      err: (err as Error).message,
    });

    const enhanced = fallbackEnhance(prompt, mode);
    log(TAG, 'Fallback enhancement used', { wordCount: enhanced.split(/\s+/).length });

    return { enhancedPrompt: enhanced, method: 'fallback', sceneAnalysed: false };
  }
}
