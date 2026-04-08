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
 * Output: plain text, 40–90 words, sentence-based.
 *   Always begins with the identity-preservation statement.
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
const SYSTEM_PROMPT = `You are a cinematic prompt enhancement engine for MotionForge, an AI video transformation system.

Your job is to rewrite short user prompts into clear, realistic, identity-safe prompts for Runway video-to-video generation.

Rules:
• Always begin with: "Preserve the exact original subject identity, facial structure, expression, pose, and body proportions. Do not alter the person."
• Never modify the person's face, skin tone, hair, clothing, or body proportions unless the user explicitly asks.
• Prefer environment, background, atmosphere, and lighting modifications.
• Expand the user's idea cinematically but keep it grounded and photorealistic.
• Avoid surreal, fantasy-heavy, cartoonish, or abstract wording unless explicitly requested.
• Avoid warped anatomy, distorted faces, or excessive style-transfer language.
• Keep the output concise: 40–90 words total.
• Use clear, production-ready language. No excessive adjectives.
• Do not include explanations, disclaimers, options, or meta-commentary.
• Return only the final enhanced prompt as plain text. No quotes. No prefixes.
• When a specific car brand or model is requested (e.g. Lamborghini, Ferrari, Rolls-Royce), describe its distinctive visual characteristics: body shape, colour, stance, and placement in the scene. This helps the AI model render a recognisable vehicle rather than a generic car.
• When adding objects to the background (cars, architecture, props), specify their exact position relative to the subject (left side, right side, behind, distant background) so they do not overlap or merge with the person.

BANNED WORDS — never include any of these in your output (they will trigger content moderation and block generation):
scanlines, banding, CRT, interlacing, glitch, VHS, corrupted, static, distorted, artifacts, compression artifacts,
shutter artifact, signal interference, data-moshing, interlaced, noise pattern, horizontal lines, digital defects,
video distortion, tape artifacts, scan effect.
Use positive language only: "clean", "pristine", "sharp", "smooth", "film-quality" — never "no X" lists.

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
    'Preserve the exact original subject identity, facial structure, expression, pose, and body proportions. ' +
    'Do not alter the person. ' +
    body +
    (body.endsWith('.') ? '' : '.') +
    ' Maintain a photorealistic, cinematic result.'
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
