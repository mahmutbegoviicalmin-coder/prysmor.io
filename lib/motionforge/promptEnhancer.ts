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
const MODEL_VISION = 'claude-opus-4-5';             // vision-capable for frame analysis
const MAX_TOKENS   = 220;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System prompt ────────────────────────────────────────────────────────────

/**
 * The system prompt controls identity safety, realism, and output format.
 * It is intentionally strict to prevent common Runway generation failures
 * (distorted faces, warped anatomy, changed clothing).
 */
// ─── Mode-specific system prompts ────────────────────────────────────────────

const SHARED_RULES = `
Rules:
• Start with "Transform"
• Keep output under 30 words total
• Positive visual description only — describe what SHOULD appear
• No camera angle, movement, or shot-type language
• No explanations, disclaimers, or meta-commentary
• Return only the final prompt as plain text. No quotes. No prefixes

BANNED WORDS: scanlines, banding, CRT, interlacing, glitch, VHS, corrupted, static, distorted,
artifacts, compression artifacts, shutter artifact, signal interference, data-moshing, noise pattern.

TRADEMARK RULE: Never use character/franchise names. Describe appearance generically instead.`;

const MODE_PROMPTS: Record<string, string> = {
  background: `You are a Runway Gen-4 prompt writer. Transform ONLY the scene, environment, or location.
Do NOT mention people, faces, clothing, or any person's appearance.
Output: "Transform [scene element] into [new environment]. Keep all people unchanged."
${SHARED_RULES}`,

  relight: `You are a Runway Gen-4 prompt writer. Transform ONLY the lighting, atmosphere, and color grade.
Do NOT change the scene layout, people, or objects — only light, shadow, color mood.
Output: "Transform the lighting into [lighting style and mood]. Keep all people and scene elements unchanged."
${SHARED_RULES}`,

  style: `You are a video prompt writer for Runway Aleph clothing transformation.
Aleph already sees the video — do NOT describe faces, body, or background.
Use action verb 're-style' — never 'transform' or 'change'.
Describe only what the new clothing looks like in positive visual detail.

OUTPUT FORMAT — maximum 25 words:
"Re-style the clothing into [specific fabric, color, fit, garment details]. The [outfit name] is worn naturally throughout the entire clip."

Rules:
- Always start with "Re-style"
- Describe fabric, color, fit, specific details
- Always end with "worn naturally throughout the entire clip"
- No negative language
- No camera language
- No face or body descriptions
- Return only plain text, no quotes`,

  vfx: `You are a Runway Gen-4 prompt writer. Add cinematic visual effects: particles, fire, smoke, magic, energy, weather phenomena.
Be dramatic and specific. Do NOT change people's appearance or the core scene structure.
Output: "Transform the scene with [specific VFX description]. Keep all people unchanged."
${SHARED_RULES}`,
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
 * Minimal rule-based fallback: prepends the identity-preservation header,
 * strips transformation verbs, and returns a clean production prompt.
 *
 * This is NOT a template database — it applies simple grammar cleanup
 * only and relies on the user's own words for the creative content.
 *
 * Activated only when Claude is unavailable. Always marked method='fallback'.
 */
export function fallbackEnhance(userPrompt: string): string {
  const cleaned = userPrompt
    .replace(TRANSFORMATION_VERBS, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Capitalise first letter
  const body = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  return (
    'Transform the scene — ' +
    body.charAt(0).toLowerCase() + body.slice(1) +
    (body.endsWith('.') ? '' : ',') +
    ' while preserving all existing characters and objects in the scene. Leave all other elements unchanged.'
  );
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

    const enhanced = fallbackEnhance(prompt);
    log(TAG, 'Fallback enhancement used', { wordCount: enhanced.split(/\s+/).length });

    return { enhancedPrompt: enhanced, method: 'fallback', sceneAnalysed: false };
  }
}
