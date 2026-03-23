/**
 * MotionForge VFX Prompt Compiler
 *
 * Rewrites a short user input into a precise Runway VFX transformation
 * instruction that preserves subject identity and applies only the
 * requested effect to the existing clip.
 *
 * Primary path: OpenAI API (gpt-4o-mini) — strict VFX-only system prompt.
 * Fallback path: lightweight template that wraps the user's own words with
 *   the identity-preservation header. Activated when OpenAI is unavailable.
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
import { validatePrompt } from './promptEnhancer';

const TAG = 'promptCompiler';

// ─── OpenAI config ────────────────────────────────────────────────────────────

const MODEL       = 'gpt-4o-mini';
const TEMPERATURE = 0.2;  // very consistent — VFX instructions should be deterministic
const MAX_TOKENS  = 160;  // GPT writes identity + VFX only; prefix is prepended by us

// ─── Anti-artifact prefix (hard rule, always first) ──────────────────────────

/**
 * Prepended unconditionally to every compiled prompt — both OpenAI and fallback.
 *
 * Placed at the START of the prompt because Runway weights early instructions
 * more heavily. This is the primary mechanism for suppressing banding and
 * display-overlay artifacts in generated video.
 *
 * IMPORTANT: Uses only POSITIVE language ("clean film", "pristine") —
 * never negative keyword lists. Runway moderation keyword-matches the prompt
 * and will block requests that contain artifact-related words even in a
 * "no X" context (e.g. "no scanlines", "no CRT" both trigger moderation).
 *
 * This is a non-negotiable backend constraint — never exposed in the UI and
 * the user should never need to type this manually.
 */
// NOTE: Do NOT include "clean", "sharp", "pristine" adjectives about the image
// quality here — those words tell Runway to remove fog, haze, particles and other
// atmospheric effects the user may have requested. Keep it focused on film/cinematic
// framing quality, not image "cleanliness".
export const ANTI_ARTIFACT_PREFIX =
  'Cinematic film-quality footage, photorealistic rendering, professional cinematography.';

/**
 * Fingerprint used to detect whether the prefix is already present (idempotency).
 * Must match the opening phrase of ANTI_ARTIFACT_PREFIX exactly (lowercase).
 */
const ARTIFACT_FINGERPRINT = 'cinematic film-quality footage';

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a VFX prompt compiler for Runway video-to-video generation.

Your job is to rewrite a short user input into a concise Runway VFX transformation instruction.

FIRST PRIORITY — Photorealistic film output (mandatory, non-negotiable):
• The generated video MUST be photorealistic, film-quality cinematography.
• Use only POSITIVE descriptive language for the visual quality. Never write "no X" lists.
  - WRONG: "no scanlines, no banding, no artifacts"
  - RIGHT: "cinematic film-quality footage, professional cinematography"
• The output should look like professional film — not a screen recording or display capture.
• CRITICAL: Do NOT use words like "clean", "sharp", "pristine" to describe image quality —
  these suppress fog, haze, mist, particles and other atmospheric effects the user requested.
• IMPORTANT: Do NOT add phrases like "smooth uniform lighting" or "solid flat colours" — these would
  cancel out any lighting effects, atmosphere, or colour grading the user has requested.
  If the user asks for god rays, volumetric light, fog, glow, or any lighting effect, HONOUR it fully.
• FORBIDDEN WORDS — never include these anywhere in your output (they trigger content moderation):
  scanlines, banding, CRT, interlacing, glitch, VHS, corrupted, static, distorted, artifacts, compression,
  shutter artifact, signal, data-moshing, interlaced, noise pattern, horizontal lines, digital defects.

TRADEMARK / COPYRIGHT RULE (critical):
• NEVER use real trademarked character names, superhero names, or franchise names in your output.
  These will be blocked by content moderation.
• Instead, describe the VISUAL APPEARANCE of the costume/style in generic terms:
  - "Spider-Man suit" → "form-fitting bodysuit with geometric web texture pattern in black and red"
  - "Batman costume" → "sleek black armoured bodysuit with angular chest plate and pointed cowl"
  - "Iron Man armor" → "full-body metallic red and gold powered armour suit with chest arc detail"
  - "Superman suit" → "bright blue fitted suit with red cape and yellow chest emblem"
  - Apply this rule to ALL trademarked characters, brands in costume context, or licensed IP.

Transformation rules:
• This is a TRANSFORMATION of an existing video clip — NOT a new scene generation.
• Always preserve: the subject's identity, face, pose, body proportions, camera framing, and performance.
• Only modify what the user explicitly requested: VFX effects, environment, atmosphere, lighting, wardrobe additions, accessories, or scene elements.
• Do NOT add generic cinematic language such as "cinematic shot", "dramatic composition", "shallow depth of field", "camera push-in", "wide-angle lens", or "film grain" unless the user explicitly asked for it.
• Do NOT invent creative additions the user did not ask for.
• Output must be 1 to 3 sentences maximum.
• The output must read as a direct transformation instruction, not a description of a new scene.
• Be specific and visual — describe effects in concrete terms (e.g. "frosted surfaces, cold mist, blue-white lighting") rather than vague labels.
• Do not include explanations, options, alternatives, meta-commentary, or a preamble.
• Return only the final compiled prompt as plain text. No quotes. No prefixes. No labels.

Vehicle and named-object rules (critical for realism):
• When the user names a specific car brand or model, you MUST describe its distinctive physical characteristics so Runway renders the correct vehicle — not a generic car.
  - Lamborghini: ultra-low aggressive supercar body, sharp angular wedge silhouette, wide rear haunches, scissor-door profile, flat aggressive nose
  - Ferrari: sleek low-slung sports car, pronounced rear haunches, iconic prancing-horse proportions, bold hood lines
  - Rolls-Royce: large imposing luxury saloon or SUV, upright tall grille, long bonnet, coach-built proportions, chrome detailing
  - Bentley: wide muscular luxury grand tourer, rounded haunches, chrome matrix grille, substantial road presence
  - McLaren: lightweight mid-engine supercar, dihedral doors, low streamlined nose, racing-derived aerodynamic body
  - Porsche 911: rear-engine sports car, rounded fastback roofline, flared rear arches, compact and low stance
  - Mercedes G-Class: boxy upright SUV, flat vertical panels, round headlights, exposed door hinges, square footprint
  - BMW M3/M4: compact sport saloon or coupe, wide kidney grille, muscular flared arches, athletic stance
  - For any other named car: describe its most visually distinctive body shape, roofline, proportions, and stance in enough detail for an AI to identify it.
• Always include the user-specified colour on the vehicle description (e.g. "pearl white", "matte black", "red").
• Always specify exact placement of the vehicle relative to the subject so it does not overlap the person:
  use phrases like "parked in the distant background", "positioned to the left side of the frame behind the subject", "visible in the background to the right", "in the far background".
• The vehicle must appear parked or stationary unless the user explicitly asks for motion.`;

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
  method: 'openai' | 'fallback';
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
  // 1. Collapse extra whitespace
  let text = raw.replace(/\s{2,}/g, ' ').trim();

  // 2. Idempotent guard — skip prepending if prefix already present
  if (text.toLowerCase().includes(ARTIFACT_FINGERPRINT)) {
    return text;
  }

  // 3. Ensure the VFX body ends cleanly before joining
  if (text && !text.endsWith('.') && !text.endsWith('!') && !text.endsWith('?')) {
    text += '.';
  }

  // 4. Prepend — Runway weights the start of the prompt most heavily
  return `${ANTI_ARTIFACT_PREFIX} ${text}`;
}

// ─── Fallback compile (no OpenAI) ────────────────────────────────────────────

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

  const base =
    `Preserve the subject's identity, face, pose, and framing. ` +
    `${stmt} ` +
    `Keep all other aspects of the shot unchanged.`;

  return normalizeCompiled(base);
}

// ─── OpenAI call ─────────────────────────────────────────────────────────────

async function callOpenAI(userPrompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');

  const body = JSON.stringify({
    model:       MODEL,
    temperature: TEMPERATURE,
    max_tokens:  MAX_TOKENS,
    n:           1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: `Compile this VFX instruction: "${userPrompt}"` },
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

  return raw.replace(/^["']|["']$/g, '').trim();
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compiles a user's VFX idea into a production-ready Runway transformation prompt.
 *
 * ANTI_ARTIFACT_PREFIX is always prepended via normalizeCompiled() so that
 * Runway's highest-weight instruction slot contains the clean-frame constraint.
 * This applies to both the OpenAI and fallback paths.
 *
 * @param userPrompt - Short user input ("frozen background", "add diamond chain", etc.)
 * @returns          - CompileResult with the compiled prompt and method used.
 *
 * Never throws: on any failure the fallback result is returned.
 */
/**
 * Injected into background-effect prompts to ensure Runway does not alter
 * any person's face. Placed after the VFX instruction so it reads as a
 * hard constraint on the transformation.
 */
const FACE_PRESERVE_SUFFIX =
  ' All human faces, skin, facial features, expressions, and body proportions' +
  ' must remain completely identical to the original. Do not alter any person.';

export async function compileVfxPrompt(userPrompt: string): Promise<CompileResult> {
  const prompt     = validatePrompt(userPrompt);
  const effectType = classifyPromptEffect(prompt);

  log(TAG, 'Compile request', { promptLen: prompt.length, effectType });

  try {
    const raw      = await callOpenAI(prompt);
    let compiled   = normalizeCompiled(raw);

    // For background/environment effects, append a hard face-preservation
    // constraint so Runway doesn't alter any person in the scene.
    if (effectType === 'background') {
      compiled = sanitizeForRunway(compiled + FACE_PRESERVE_SUFFIX).slice(0, 1000);
    }

    const wordCount = compiled.split(/\s+/).length;
    if (wordCount < 8) {
      warn(TAG, `Unusually short output after normalisation (${wordCount} words)`, {
        output: compiled.slice(0, 100),
      });
    }

    log(TAG, 'Compile complete via openai', { wordCount, effectType });
    return { compiledPrompt: compiled, method: 'openai', effectType };

  } catch (err) {
    warn(TAG, 'OpenAI compile failed — using fallback', {
      err: (err as Error).message,
    });

    let compiled = fallbackCompile(prompt);
    if (effectType === 'background') {
      compiled = sanitizeForRunway(compiled + FACE_PRESERVE_SUFFIX).slice(0, 1000);
    }

    log(TAG, 'Fallback compile used', { wordCount: compiled.split(/\s+/).length, effectType });
    return { compiledPrompt: compiled, method: 'fallback', effectType };
  }
}
