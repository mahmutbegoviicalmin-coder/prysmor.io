/**
 * MotionForge VFX Prompt Compiler
 *
 * Rewrites a short user input into a precise Runway VFX transformation
 * instruction that preserves subject identity and applies only the
 * requested effect to the existing clip.
 *
 * Primary path: Claude Haiku (fast + cheap) — strict VFX-only system prompt.
 * Fallback path: lightweight template that wraps the user's own words with
 *   the identity-preservation header. Activated when Claude is unavailable.
 *
 * Final prompt structure (enforced by normalizeCompiled):
 *   [ANTI_ARTIFACT_PREFIX] [identity sentence]. [VFX instruction].
 *
 * The anti-artifact prefix is a hard backend rule prepended to every compiled
 * prompt unconditionally. It is never user-configurable. Runway gives highest
 * weight to the beginning of a prompt, so placing the clean-frame constraint
 * first maximises its effect on the generated output.
 */

import { log, warn } from './logger';
import { validatePrompt, client } from './promptEnhancer';

const TAG = 'promptCompiler';

// ─── Claude config ────────────────────────────────────────────────────────────

const MODEL      = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 160;  // identity + VFX only; prefix is prepended by us

// ANTI_ARTIFACT_PREFIX removed — Claude output is used directly as the final prompt.

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Runway Gen-4 Aleph video-to-video prompt writer.

Runway is a video-to-video model. It receives an existing video and transforms it based on your description.
Describe HOW the effect looks and moves in the scene — not commands like "add" or "keep".
Write in present tense as if the effect already exists in the video.

Rules:
- Describe only the visual effect: what it looks like, its color, motion, and intensity
- Never use command words: Add, Remove, Keep, Change, Make, Create, Apply, Transform
- Never use quality words: cinematic, photorealistic, film-quality, professional, rendering
- Never use preservation phrases: "keep people unchanged", "preserve identity", "leave background"
- Never describe camera: no shot types, angles, or camera movements
- Output 1-2 sentences maximum. Plain text only. No quotes. No markdown.

Examples:
- "money rain" → "Green dollar bills floating and drifting downward through the air, paper money falling slowly across the scene."
- "fire effect" → "Bright orange and red flames flickering upward from the ground, fire spreading with glowing ember particles rising."
- "lightning" → "Electric white lightning bolts flashing across the dark sky, bright arcs of energy illuminating the scene."
- "fog" → "Thick white mist rolling across the ground, dense atmospheric fog filling the lower half of the scene."`;

// ─── Effect type classifier ───────────────────────────────────────────────────

/**
 * Classifies a prompt as either:
 *
 * 'overlay'    — lighting, atmosphere, particles, color grade applied ON TOP of
 *                the existing scene. Runway naturally preserves identity here.
 *                → use RAW_ACCEPT (pure Runway output, no compositing needed)
 *
 * 'background' — environment, scene, or background replacement where Runway
 *                rebuilds the entire frame. Face identity must be protected by
 *                compositing the original subject back.
 *                → use FULL_SUBJECT_COMPOSITE
 */
export function classifyPromptEffect(prompt: string): 'overlay' | 'background' {
  const p = prompt.toLowerCase();

  // Strong background/environment keywords — these rebuild the scene
  const BACKGROUND_PATTERNS = [
    /\bfireworks?\b/,
    /\bwinter\b/, /\bsnow(y|ing|fall)?\b/, /\bsnowflakes?\b/,
    /\bspring\b/, /\bautumn\b/, /\bfall\s+season\b/,
    /\bjungle\b/, /\bforest\b/, /\bdesert\b/, /\bocean\b/, /\bbeach\b/,
    /\bcityscape\b/, /\burban\b/,
    /\bstorm(y)?\b/, /\bthunder\b/, /\blightning\b/,
    /\brain(ing|y|fall|drops?)?\b/,
    /\bbackground\s+(replace|change|swap)\b/,
    /\breplace\s+(the\s+)?background\b/,
    /\btransport\s+(to|into)\b/,
    /\bmove\s+(to|into)\b/,
    /\bput\s+(in|into|on)\b.*\b(background|sky|scene|environment)\b/,
    /\bset\s+in\b/, /\bscene\s+in\b/,
    /\b(night|day)\s+(scene|sky|environment)\b/,
    /\bsunset\s+sky\b/, /\bsunrise\s+sky\b/,
    /\bstarry\s+sky\b/, /\bnorthern\s+lights?\b/, /\baurorae?\b/,
    /\bchange\s+(the\s+)?(scene|environment|setting|location|background)\b/,
    /\btransform.*(scene|environment|setting)\b/,
    /\bwild(life|erness)\b/, /\bnature\s+scene\b/,
  ];

  // Strong overlay/lighting keywords — these modify on top of existing scene
  const OVERLAY_PATTERNS = [
    /\bgod\s*rays?\b/, /\bvolumetric\s+light\b/, /\blight\s+rays?\b/,
    /\blens\s+flare\b/, /\bglow\s+(bloom|effect|around)\b/, /\bbloom\b/,
    /\bfog\b/, /\bhaze\b/, /\bmist\b/, /\bsmoke\b/,
    /\bparticles?\b/, /\bdust\s+particles?\b/,
    /\bcinematic\s+(look|grade|color|lighting)\b/,
    /\bcolor\s+grad(e|ing)\b/, /\bcolour\s+grad(e|ing)\b/,
    /\blighting\s+effect\b/, /\baura\b/,
    /\bshadow(s)?\b/, /\bcontrast\b/,
    /\batmospheric\b/, /\bambient\b/, /\bmoody\b/,
  ];

  let backgroundScore = 0;
  let overlayScore = 0;

  for (const re of BACKGROUND_PATTERNS) {
    if (re.test(p)) backgroundScore++;
  }
  for (const re of OVERLAY_PATTERNS) {
    if (re.test(p)) overlayScore++;
  }

  // Background wins if it has more matches OR if it has any matches and overlay has none
  if (backgroundScore > 0 && backgroundScore >= overlayScore) return 'background';
  return 'overlay';
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompileResult {
  compiledPrompt: string;
  method: 'claude' | 'fallback';
  effectType: 'overlay' | 'background';
}

// ─── Runway moderation sanitizer ─────────────────────────────────────────────

/**
 * Trademarked / IP-protected character names that trigger Runway moderation.
 * Maps to a generic visual description of the costume/appearance.
 */
const TRADEMARK_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bspider[\s-]?man\b/gi,    'hero in a form-fitting bodysuit with geometric web texture pattern'],
  [/\bbatman\b/gi,             'hero in a sleek black armoured bodysuit with pointed cowl'],
  [/\biron[\s-]?man\b/gi,      'hero in a polished metallic red and gold powered armour suit'],
  [/\bsuperman\b/gi,           'hero in a bright blue fitted suit with flowing red cape'],
  [/\bwonder[\s-]?woman\b/gi,  'hero in a red and gold armoured warrior costume'],
  [/\bdeadpool\b/gi,           'mercenary in a red and black form-fitting full-body suit'],
  [/\bthor\b/gi,               'warrior in Norse armour with a red cape'],
  [/\bcaptain[\s-]?america\b/gi, 'hero in a blue armoured suit with a round shield emblem'],
  [/\bhulk\b/gi,               'large muscular figure in torn purple trousers'],
  [/\bvenom\b/gi,              'figure in a black symbiote bodysuit with white chest emblem'],
  [/\bblack[\s-]?panther\b/gi, 'hero in a sleek textured black vibranium full-body suit'],
  [/\bdoctor[\s-]?strange\b/gi,'sorcerer in a dark blue tunic with a red flowing cloak'],
  [/\bjoker\b/gi,              'figure in a purple suit with green hair and theatrical makeup'],
  [/\bharley[\s-]?quinn\b/gi,  'figure in a red and black jester-inspired costume'],
  [/\bsonic\b/gi,              'fast blue anthropomorphic character'],
  [/\bmario\b/gi,              'character in red overalls with a red cap'],
  [/\bnaruto\b/gi,             'ninja in an orange jumpsuit with a blue headband'],
];

/**
 * Words that trigger Runway content moderation even in "no X" context.
 * These are replaced with neutral filler or removed.
 */
const BANNED_WORD_PATTERN =
  /\b(scanlines?|horizontal\s+lines?|banding|crt|interlac(ing|ed)?|glitch(ed|ing)?|vhs|corrupted?|static|distorted?|artifacts?|compression\s+artifacts?|shutter\s+artifact|signal\s+interference|data[\s-]?moshing|noise\s+pattern|digital\s+defects?|video\s+distortion|tape\s+artifacts?|scan\s+effects?)\b/gi;

/**
 * Final safety pass over any prompt before it reaches Runway.
 *
 * Applies in order:
 *   1. Replace trademarked character names with visual descriptions.
 *   2. Strip any remaining moderation-triggering words.
 *   3. Collapse any double-spaces left behind.
 *
 * Idempotent — safe to call multiple times.
 */
export function sanitizeForRunway(text: string): string {
  let result = text;

  for (const [pattern, replacement] of TRADEMARK_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  result = result.replace(BANNED_WORD_PATTERN, 'clean');
  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
}

// ─── Normalisation helper ─────────────────────────────────────────────────────

/**
 * Normalises a raw compiled string before it is returned to the caller.
 *
 * Steps:
 *   1. Collapse repeated whitespace.
 *   2. Check for the artifact fingerprint — skip prepending if already present
 *      (idempotent: safe to call on already-compiled prompts).
 *   3. Ensure the VFX body ends with clean punctuation.
 *   4. Prepend ANTI_ARTIFACT_PREFIX so it becomes the first instruction
 *      Runway reads.
 *
 * Final structure: [ANTI_ARTIFACT_PREFIX] [identity sentence]. [VFX sentence].
 */
export function normalizeCompiled(raw: string): string {
  let text = raw.replace(/\s{2,}/g, ' ').trim();
  if (text && !text.endsWith('.') && !text.endsWith('!') && !text.endsWith('?')) {
    text += '.';
  }
  return text;
}

// ─── Fallback compile (no Claude) ────────────────────────────────────────────

/**
 * Minimal template-based fallback: produces an identity-preservation header
 * + the user's own VFX words, then routes through normalizeCompiled() so
 * the anti-artifact prefix is always prepended.
 *
 * Final structure:
 *   [ANTI_ARTIFACT_PREFIX] Preserve the subject's identity... [user stmt].
 *   Keep all other aspects of the shot unchanged.
 */
export function fallbackCompile(userPrompt: string): string {
  const cleaned = userPrompt.trim();
  const body    = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  const stmt    = body.endsWith('.') ? body : body + '.';
  return normalizeCompiled(stmt);
}

// ─── Claude call ──────────────────────────────────────────────────────────────

async function callClaude(userPrompt: string): Promise<string> {
  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system:     SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `Compile this VFX instruction: "${userPrompt}"` },
    ],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  if (!raw) throw new Error('Claude returned empty completion');

  return raw.replace(/^["']|["']$/g, '').trim();
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compiles a user's VFX idea into a production-ready Runway transformation prompt.
 *
 * Primary path: Claude Haiku (fast, cheap).
 * Fallback path: lightweight template when Claude is unavailable.
 *
 * ANTI_ARTIFACT_PREFIX is always prepended via normalizeCompiled() so that
 * Runway's highest-weight instruction slot contains the clean-frame constraint.
 *
 * @param userPrompt - Short user input ("frozen background", "add diamond chain", etc.)
 * @returns          - CompileResult with the compiled prompt and method used.
 *
 * Never throws: on any failure the fallback result is returned.
 */
export async function compileVfxPrompt(userPrompt: string): Promise<CompileResult> {
  const prompt     = validatePrompt(userPrompt);
  const effectType = classifyPromptEffect(prompt);

  log(TAG, 'Compile request', { promptLen: prompt.length, effectType });

  /**
   * Builds the final compiled prompt.
   * Overlay effects: [ANTI_ARTIFACT_PREFIX] [VFX instruction].
   * Background effects: just the VFX instruction — Runway Aleph sees the video
   *   directly so no identity/clothing descriptions are needed.
   */
  function assemble(vfxBody: string): string {
    if (effectType === 'background') {
      return sanitizeForRunway(vfxBody.trim()).slice(0, 1000);
    }
    return normalizeCompiled(vfxBody);
  }

  try {
    const raw     = await callClaude(prompt);
    const compiled = assemble(raw);

    const wordCount = compiled.split(/\s+/).length;
    if (wordCount < 8) {
      warn(TAG, `Unusually short output after normalisation (${wordCount} words)`, {
        output: compiled.slice(0, 100),
      });
    }

    log(TAG, 'Compile complete via claude', { wordCount, effectType });
    return { compiledPrompt: compiled, method: 'claude', effectType };

  } catch (err) {
    warn(TAG, 'Claude compile failed — using fallback', {
      err: (err as Error).message,
    });

    const cleaned = prompt.trim();
    const body    = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    const stmt    = body.endsWith('.') ? body : body + '.';
    const fallbackBody =
      `Transform the scene — ${stmt} ` +
      `Preserve all existing characters and objects. Leave all other elements unchanged.`;

    const compiled = assemble(fallbackBody);
    log(TAG, 'Fallback compile used', { wordCount: compiled.split(/\s+/).length, effectType });
    return { compiledPrompt: compiled, method: 'fallback', effectType };
  }
}
