/**
 * MotionForge Prompt Enhancer
 *
 * Transforms short user prompts into identity-safe, cinematic prompts
 * optimised for Runway Gen-4 video-to-video generation.
 *
 * Primary path: OpenAI API (gpt-4o-mini) — dynamic, no hardcoded templates.
 *   Supports optional scene frames (vision) for scene-aware enhancement.
 *
 * Fallback path: lightweight rule-based enhancement that prepends the
 *   identity-preservation header and strips transformation verbs.
 *   Activated only when OpenAI is unavailable.
 *
 * Output: plain text, 40–90 words, sentence-based.
 *   Always begins with the identity-preservation statement.
 */

import { log, warn } from './logger';

const TAG = 'promptEnhancer';

// ─── OpenAI config ────────────────────────────────────────────────────────────

const MODEL       = 'gpt-4o-mini';
const TEMPERATURE = 0.25;   // low = consistent, deterministic output
const MAX_TOKENS  = 220;    // generous headroom for 40–90 word output

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

type TextPart  = { type: 'text';      text: string };
type ImagePart = { type: 'image_url'; image_url: { url: string; detail: 'low' } };
type MessagePart = TextPart | ImagePart;

export interface EnhancementResult {
  enhancedPrompt: string;
  method: 'openai' | 'openai-vision' | 'fallback';
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

// ─── Fallback enhancement (no OpenAI) ────────────────────────────────────────

const TRANSFORMATION_VERBS = /\b(replace|change|make it|turn into|convert|transform|apply|set in|put in|move to|switch to)\b/gi;

/**
 * Minimal rule-based fallback: prepends the identity-preservation header,
 * strips transformation verbs, and returns a clean production prompt.
 *
 * This is NOT a template database — it applies simple grammar cleanup
 * only and relies on the user's own words for the creative content.
 *
 * Activated only when OpenAI is unavailable. Always marked method='fallback'.
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

// ─── OpenAI call ─────────────────────────────────────────────────────────────

/**
 * Calls the OpenAI Chat Completions API with the system prompt and optional
 * scene frames (vision mode). Returns the raw completion string.
 *
 * Throws on API error so the caller can decide whether to fallback.
 */
async function callOpenAI(
  userPrompt: string,
  sceneFrames: string[],
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');

  const hasFrames = sceneFrames.length > 0;

  // Build user message content
  let userContent: string | MessagePart[];

  if (hasFrames) {
    const parts: MessagePart[] = [
      {
        type: 'text',
        text:
          `You have ${sceneFrames.length} frames from the actual video clip (evenly sampled). ` +
          `Analyse the scene lighting, environment, and atmosphere, then write the best possible ` +
          `MotionForge prompt for: "${userPrompt}"`,
      },
    ];
    for (const frame of sceneFrames) {
      parts.push({
        type:      'image_url',
        image_url: { url: `data:image/jpeg;base64,${frame}`, detail: 'low' },
      });
    }
    userContent = parts;
  } else {
    userContent = `Write the best possible MotionForge prompt for: "${userPrompt}"`;
  }

  const body = JSON.stringify({
    model:       MODEL,
    temperature: TEMPERATURE,
    max_tokens:  MAX_TOKENS,
    n:           1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userContent },
    ],
  });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${key}`,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const raw = (json.choices?.[0]?.message?.content ?? '').trim();
  if (!raw) throw new Error('OpenAI returned empty completion');

  // Strip surrounding quotes if the model wrapped the output
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
    const enhanced = await callOpenAI(prompt, frames);

    // Guard: if output is suspiciously short, log a warning but still return it
    const wordCount = enhanced.split(/\s+/).length;
    if (wordCount < 15) {
      warn(TAG, `Unusually short OpenAI output (${wordCount} words) — may be degraded`, {
        output: enhanced.slice(0, 100),
      });
    }

    const method: EnhancementResult['method'] = hasFrames ? 'openai-vision' : 'openai';
    log(TAG, `Enhancement complete via ${method}`, { wordCount });

    return { enhancedPrompt: enhanced, method, sceneAnalysed: hasFrames };

  } catch (err) {
    warn(TAG, 'OpenAI enhancement failed — using fallback', {
      err: (err as Error).message,
    });

    const enhanced = fallbackEnhance(prompt);
    log(TAG, 'Fallback enhancement used', { wordCount: enhanced.split(/\s+/).length });

    return { enhancedPrompt: enhanced, method: 'fallback', sceneAnalysed: false };
  }
}
