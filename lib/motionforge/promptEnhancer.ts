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
const MAX_TOKENS = 300; // Beeble prompts can be up to 60 words

export const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System prompt ────────────────────────────────────────────────────────────

/**
 * Mode-specific system prompts.
 * background + relight → Beeble SwitchX (descriptive scene/lighting prompts).
 * vfx → short action verb edit-instruction format.
 */
// ─── Mode-specific system prompts ────────────────────────────────────────────

const MODE_PROMPTS: Record<string, string> = {
  background: `You are a Beeble SwitchX prompt writer for background replacement.
Beeble SwitchX requires highly specific, descriptive prompts — NOT short action verbs.
The user wants to replace the background/environment of a video clip.

OUTPUT FORMAT:
Write a detailed scene description with environment, lighting, atmosphere and mood.
Example format: "A [location description], [lighting details], [atmosphere/mood details], [specific environmental props/elements]."

Rules:
- Be highly specific about the environment: location type, time of day, weather
- Describe the lighting: direction, color temperature, intensity, shadows
- Include atmospheric details: fog, particles, reflections, etc.
- Describe specific props or environmental elements
- Do NOT mention the subject/person at all
- No action verbs like "replace", "change", "transform"
- Just a rich descriptive scene — as if describing a movie set
- Max 60 words
- Plain text only. No quotes. No markdown.`,

  relight: `You are a Beeble SwitchX prompt writer for relighting footage.
Beeble SwitchX requires highly specific, descriptive prompts — NOT short action verbs.
The user wants to change the lighting and atmosphere of a video clip.

OUTPUT FORMAT:
Write a detailed lighting and mood description.
Example format: "[Lighting setup description], [color temperature], [shadow quality], [mood/atmosphere], [specific light sources]."

Rules:
- Be highly specific about: light direction, color temperature, intensity
- Describe shadow quality: hard/soft, depth, direction
- Include color grading mood: warm/cool, contrast, saturation
- Mention specific light sources if relevant: golden sun, neon signs, fire, etc.
- Do NOT mention changing the background or scene elements
- No action verbs like "relight", "change", "transform"
- Just a rich descriptive lighting atmosphere
- Max 50 words
- Plain text only. No quotes. No markdown.`,

  vfx: `You are a video edit prompt writer.
The model edits existing footage — write edit instructions, not scene captions.

OUTPUT FORMAT:
[Transformation verb + what changes]. Keep [unchanged elements] exactly as in the source.
Max 2 sentences.

Examples:
- Input: "add fire" → Output: "Add bright orange flames flickering upward from the ground with ember particles rising. Keep all subjects, camera motion, and surroundings exactly as in the source."
- Input: "money rain" → Output: "Add green dollar bills drifting and falling slowly through the air. Keep the subject, framing, lighting, and background exactly as in the source."
- Input: "winter scene" → Output: "Replace the background with a snowy winter landscape. Keep the subject, motion, and framing exactly as in the source."

Rules:
- Lead with: Change, Replace, Swap, Add, Remove, Restyle, Relight
- Describe ONLY what changes — the clip already has framing, lighting, and motion
- Always end with a keep clause naming what must stay unchanged
- Never write full scene descriptions or camera directions
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
 * background/relight (Beeble): pass cleaned prompt through as-is — descriptive format.
 * vfx: wrap in short action edit-instruction format.
 */
export function fallbackEnhance(userPrompt: string, mode?: string): string {
  const cleaned = userPrompt
    .replace(TRANSFORMATION_VERBS, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const body = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  const stmt = body.endsWith('.') ? body : body + '.';

  switch (mode) {
    case 'background':
      return stmt;
    case 'relight':
      return stmt;
    case 'vfx': {
      const lower = cleaned.toLowerCase();
      const verb  = /\b(remove|delete)\b/.test(lower) ? 'Remove'
        : /\b(replace|swap|background)\b/.test(lower) ? 'Replace'
        : /\b(relight|lighting)\b/.test(lower) ? 'Relight'
        : /\b(restyle|style)\b/.test(lower) ? 'Restyle'
        : /\b(change|color|colour)\b/.test(lower) ? 'Change'
        : 'Add';
      return `${verb} ${lower}. Keep the subject, framing, lighting, motion, and background exactly as in the source.`;
    }
    default:
      return stmt;
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
