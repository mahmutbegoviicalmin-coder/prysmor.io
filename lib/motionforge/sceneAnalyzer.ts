/**
 * MotionForge Scene Analyzer
 *
 * Uses GPT-4o Vision to analyze a key frame from the uploaded video,
 * then generates an optimized Runway VFX prompt tailored to that exact scene.
 *
 * Flow:
 *   1. Receive a JPEG/PNG frame extracted from the video
 *   2. Send to GPT-4o vision with a scene-analysis system prompt
 *   3. Get back structured scene metadata (subjects, background, lighting, mood)
 *   4. Use scene metadata + user's brief intent to generate a precise Runway prompt
 *
 * The generated prompt is:
 *   - Tailored to the specific scene content (not generic)
 *   - Optimized for our overlay/background classification system
 *   - Within Runway's 1000-char limit
 *   - Free of banned/moderation-triggering words
 */

import * as fs   from 'fs';
import { log, warn } from './logger';
import { sanitizeForRunway, classifyPromptEffect } from './promptCompiler';

const TAG   = 'sceneAnalyzer';
const MODEL = 'gpt-4o';

// ─── Scene analysis result ────────────────────────────────────────────────────

export interface SceneAnalysis {
  sceneType:    string;   // e.g. "outdoor night action", "indoor studio portrait"
  subjects:     string;   // e.g. "one man riding jet ski", "two people standing"
  background:   string;   // e.g. "dark trees and building on shore", "plain yellow wall"
  lighting:     string;   // e.g. "blue ambient night light", "flat studio lighting"
  mood:         string;   // e.g. "action, dramatic", "calm, minimal"
  keyElements:  string[]; // elements that should be preserved: ["jet ski", "water spray"]
  bgElements:   string[]; // elements safe to replace: ["trees", "building", "sky"]
}

export interface EnhancedPromptResult {
  prompt:      string;
  effectType:  'overlay' | 'background';
  sceneAnalysis: SceneAnalysis;
  method:      'vision' | 'fallback';
}

// ─── System prompts ───────────────────────────────────────────────────────────

const SCENE_ANALYSIS_PROMPT = `You are a professional VFX supervisor analyzing a video frame to plan a visual effects transformation.

Analyze the image and return a JSON object with these exact fields:
{
  "sceneType": "brief description of scene type (indoor/outdoor, day/night, location type)",
  "subjects": "description of people/main subjects and their positions",
  "background": "what is visible in the background behind the subjects",
  "lighting": "current lighting conditions, direction, color temperature",
  "mood": "emotional tone and cinematic mood of the scene",
  "keyElements": ["list", "of", "elements", "that", "must", "be", "preserved"],
  "bgElements": ["list", "of", "background", "elements", "safe", "to", "replace"]
}

Rules:
- Be specific and visual — describe what you actually see
- keyElements = subjects, their clothing, props they hold, foreground water/surfaces they are on
- bgElements = sky, distant background, walls, trees, buildings behind subjects
- Keep descriptions concise (1 sentence max per field)
- Return ONLY valid JSON, no explanation`;

const PROMPT_GENERATION_SYSTEM = `You are a Runway video-to-video VFX prompt specialist.

Given a scene analysis and user's transformation intent, write the PERFECT Runway prompt.

Rules:
- Maximum 2-3 sentences
- Be extremely specific and visual
- Only transform what's in bgElements — never touch keyElements
- End with: "Keep [keyElements description] completely unchanged."
- Use positive language only — never "no X" or "without X"
- Do NOT add elements that conflict with keyElements (e.g. don't add water where person stands)
- Make it cinematic and dramatically impactful
- Avoid these banned words: scanlines, banding, CRT, glitch, VHS, artifacts, distorted
- Output ONLY the prompt text, no explanation, no quotes`;

// ─── GPT-4o Vision call ───────────────────────────────────────────────────────

async function analyzeFrameWithVision(imagePath: string): Promise<SceneAnalysis> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');

  const imageBytes  = fs.readFileSync(imagePath);
  const base64Image = imageBytes.toString('base64');
  const ext         = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${key}`,
    },
    body: JSON.stringify({
      model:       MODEL,
      temperature: 0.1,
      max_tokens:  500,
      messages: [
        {
          role:    'system',
          content: SCENE_ANALYSIS_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${ext};base64,${base64Image}`, detail: 'high' },
            },
            {
              type: 'text',
              text: 'Analyze this video frame for VFX planning.',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`GPT-4o vision failed ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw  = (json.choices?.[0]?.message?.content ?? '').trim();

  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  try {
    return JSON.parse(cleaned) as SceneAnalysis;
  } catch {
    throw new Error(`Vision returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
}

// ─── Prompt generation from scene + intent ────────────────────────────────────

async function generatePromptFromScene(
  sceneAnalysis: SceneAnalysis,
  userIntent:    string,
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');

  const sceneContext = `
SCENE ANALYSIS:
- Scene type: ${sceneAnalysis.sceneType}
- Subjects: ${sceneAnalysis.subjects}
- Background: ${sceneAnalysis.background}
- Lighting: ${sceneAnalysis.lighting}
- Mood: ${sceneAnalysis.mood}
- MUST PRESERVE (keyElements): ${sceneAnalysis.keyElements.join(', ')}
- SAFE TO REPLACE (bgElements): ${sceneAnalysis.bgElements.join(', ')}

USER WANTS: "${userIntent}"

Write the perfect Runway VFX transformation prompt for this scene.`.trim();

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${key}`,
    },
    body: JSON.stringify({
      model:       'gpt-4o-mini',
      temperature: 0.3,
      max_tokens:  200,
      messages: [
        { role: 'system', content: PROMPT_GENERATION_SYSTEM },
        { role: 'user',   content: sceneContext },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Prompt generation failed ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return (json.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '');
}

// ─── Fallback (no vision) ─────────────────────────────────────────────────────

function fallbackPrompt(userIntent: string): EnhancedPromptResult {
  const effectType = classifyPromptEffect(userIntent);
  const prompt     = sanitizeForRunway(
    `Cinematic film-quality footage, photorealistic rendering. ${userIntent}. Keep all people and subjects completely unchanged.`
  ).slice(0, 1000);

  return {
    prompt,
    effectType,
    sceneAnalysis: {
      sceneType:   'unknown',
      subjects:    'unknown',
      background:  'unknown',
      lighting:    'unknown',
      mood:        'unknown',
      keyElements: ['subjects'],
      bgElements:  ['background'],
    },
    method: 'fallback',
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Analyzes a video frame with GPT-4o Vision and generates an optimized
 * Runway VFX prompt tailored to the exact scene content.
 *
 * @param framePath   - Path to a JPEG/PNG frame extracted from the video
 * @param userIntent  - Brief user description of desired transformation
 *                      (e.g. "dramatic storm", "luxury city background", "fireworks")
 */
export async function generateSceneAwarePrompt(
  framePath:   string,
  userIntent:  string,
): Promise<EnhancedPromptResult> {
  log(TAG, 'Starting scene-aware prompt generation', { framePath, userIntent });

  try {
    // Step 1: Analyze the scene
    log(TAG, 'Analyzing frame with GPT-4o Vision…');
    const sceneAnalysis = await analyzeFrameWithVision(framePath);
    log(TAG, 'Scene analysis complete', sceneAnalysis);

    // Step 2: Generate the optimized prompt
    log(TAG, 'Generating scene-tailored prompt…');
    const rawPrompt = await generatePromptFromScene(sceneAnalysis, userIntent);
    log(TAG, 'Raw prompt generated', { rawPrompt });

    // Step 3: Classify and sanitize
    const effectType = classifyPromptEffect(rawPrompt);
    const prompt     = sanitizeForRunway(
      `Cinematic film-quality footage, photorealistic rendering. ${rawPrompt}`
    ).slice(0, 1000);

    log(TAG, 'Scene-aware prompt ready', { effectType, promptLen: prompt.length });

    return { prompt, effectType, sceneAnalysis, method: 'vision' };

  } catch (err) {
    warn(TAG, 'Scene analysis failed — using fallback', { err: (err as Error).message });
    return fallbackPrompt(userIntent);
  }
}
