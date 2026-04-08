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
const SYSTEM_PROMPT = `You are a Runway Gen-4 prompt writer for MotionForge video transformation.

STRICT OUTPUT FORMAT — your response must match this exactly:
"with [exact clothing color and garment type of each person] maintaining identical appearance, [environment transformation in 1-2 sentences]"

Rules:
• FIRST WORD MUST BE "with" — no exceptions. Never start with Transform, Cover, Fill, The, Cinematic, Preserve.
• Describe clothing precisely: color + garment type (e.g. "bright red zip-up jacket", "blue denim jacket").
• For multiple people: "with man in red jacket and man in blue jacket maintaining identical appearance,"
• After the comma: describe the transformation concisely and cinematically.
• Keep output under 60 words total.
• Use clear, production-ready language. Describe what SHOULD appear — positive visual detail only.
• CAMERA — zero camera angle, movement, or shot-type language. Runway inherits camera from source video.
• No explanations, disclaimers, options, or meta-commentary.
• Return only the final prompt as plain text. No quotes. No prefixes.
• When a specific car brand is requested, describe its distinctive visual characteristics: body shape, colour, stance, and placement relative to the subject (left side, right side, distant background).
• When adding background objects, specify exact position so they do not overlap the person.

CORRECT example: "with man in bright red jacket maintaining identical appearance, transform the alley into a nighttime scene with colorful fireworks bursting overhead and warm ambient light reflecting off brick walls."
WRONG example: "Transform the alley into..."

BANNED WORDS — never include any of these in your output (they trigger content moderation and block generation):
scanlines, banding, CRT, interlacing, glitch, VHS, corrupted, static, distorted, artifacts, compression artifacts,
shutter artifact, signal interference, data-moshing, interlaced, noise pattern, horizontal lines, digital defects,
video distortion, tape artifacts, scan effect.
Use only positive descriptive language — describe what SHOULD appear, never "no X" lists. Avoid words like
"clean", "pristine", or "sharp" when describing image quality, as these suppress atmospheric effects like fog,
haze, and particles that the user may have requested.

TRADEMARK / COPYRIGHT RULE — critical, always apply:
Never use trademarked character names, superhero names, licensed franchise names, or IP-protected costume names.
Runway's moderation will block any prompt containing them. Describe the visual appearance generically instead:
- "Spider-Man suit" → "form-fitting bodysuit with black geometric web texture pattern covering the full body"
- "Batman costume" → "sleek black armoured bodysuit with angular raised chest plate and pointed ear cowl"
- "Iron Man armor" → "full-body polished metallic red and gold powered armour suit with circular chest light"
- "Superman suit" → "bright blue form-fitting suit with flowing red cape and yellow shield chest emblem"
- "Deadpool suit" → "full-body red and black form-fitting suit with double holsters and utility belt"
- Apply this to ALL superhero names, movie characters, game characters, or any recognisable licensed IP.`;

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
    'with all subjects maintaining identical appearance, transform the scene — ' +
    body.charAt(0).toLowerCase() + body.slice(1) +
    (body.endsWith('.') ? '' : '.')
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
): Promise<string> {
  const hasFrames = sceneFrames.length > 0;
  const model     = hasFrames ? MODEL_VISION : MODEL_TEXT;

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

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userContent as Anthropic.MessageParam['content'] }],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  if (!raw) throw new Error('Claude returned empty completion');

  return raw.replace(/^["']|["']$/g, '').trim();
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
): Promise<EnhancementResult> {
  const prompt    = validatePrompt(userPrompt);
  const frames    = sceneFrames.filter(f => typeof f === 'string' && f.length > 0).slice(0, 5);
  const hasFrames = frames.length > 0;

  log(TAG, `Enhancing prompt (frames=${frames.length})`, { promptLen: prompt.length });

  try {
    const enhanced = await callClaude(prompt, frames);

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
