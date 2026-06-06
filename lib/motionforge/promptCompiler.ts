/**
 * MotionForge VFX Prompt Compiler
 *
 * Rewrites short user input into targeted edit instructions:
 *   [Verb + change]. Keep [unchanged elements] exactly as in the source.
 *
 * Primary path: Claude Haiku. Fallback: lightweight template.
 */

import { log, warn } from './logger';
import { validatePrompt, client } from './promptEnhancer';

const TAG = 'promptCompiler';

const MODEL      = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 200;

const SYSTEM_PROMPT = `You are a video edit prompt writer.

The model receives an existing video and applies a targeted edit. The clip already contains framing, lighting, camera motion, and subjects — do NOT redescribe the scene.

Write like a compositor giving an edit note, not like an image caption.

Rules:
- Lead with a transformation verb: Change, Replace, Swap, Add, Remove, Restyle, Relight
- Describe ONLY what should change — one clear edit target
- End with a short keep clause: "Keep [subject/framing/lighting/motion/background] exactly as in the source."
- Max 2 sentences. Plain text only. No quotes. No markdown.
- Never write full scene descriptions or camera directions
- Never use quality words: cinematic, photorealistic, film-quality, professional

Examples:
- "money rain" → "Add green dollar bills drifting and falling slowly through the air. Keep the subject, framing, lighting, and background exactly as in the source."
- "fire effect" → "Add bright orange flames flickering upward from the ground with ember particles rising. Keep all subjects, camera motion, and surroundings exactly as in the source."
- "winter background" → "Replace the background with a snowy winter landscape and overcast sky. Keep the subject, motion, and framing exactly as in the source."
- "make sneakers red" → "Change the sneakers to a deep glossy crimson red. Keep the rest of the outfit, background, and motion exactly as in the source."`;

const KEEP_CLAUSE =
  'Keep the subject, framing, lighting, motion, and background exactly as in the source.';

const TRANSFORM_VERBS =
  /^(change|replace|swap|add|remove|restyle|relight|make|apply)\b/i;

/**
 * Classifies a prompt as overlay (effect on top) or background (environment swap).
 * Used for downstream compositing hints — both use the same edit-instruction style.
 */
export function classifyPromptEffect(prompt: string): 'overlay' | 'background' {
  const p = prompt.toLowerCase();

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

  if (backgroundScore > 0 && backgroundScore >= overlayScore) return 'background';
  return 'overlay';
}

export interface CompileResult {
  compiledPrompt: string;
  method: 'claude' | 'fallback';
  effectType: 'overlay' | 'background';
}

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

const BANNED_WORD_PATTERN =
  /\b(scanlines?|horizontal\s+lines?|banding|crt|interlac(ing|ed)?|glitch(ed|ing)?|vhs|corrupted?|static|distorted?|artifacts?|compression\s+artifacts?|shutter\s+artifact|signal\s+interference|data[\s-]?moshing|noise\s+pattern|digital\s+defects?|video\s+distortion|tape\s+artifacts?|scan\s+effects?)\b/gi;

export function sanitizeForRunway(text: string): string {
  let result = text;

  for (const [pattern, replacement] of TRADEMARK_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  result = result.replace(BANNED_WORD_PATTERN, 'clean');
  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
}

/** Ensures the prompt ends with a keep clause if missing. */
export function normalizeCompiled(raw: string): string {
  let text = raw.replace(/\s{2,}/g, ' ').trim();
  if (text && !text.endsWith('.') && !text.endsWith('!') && !text.endsWith('?')) {
    text += '.';
  }
  if (!/\bkeep\b.*\bas in the source\b/i.test(text)) {
    text = text.replace(/\.$/, '') + '. ' + KEEP_CLAUSE;
  }
  return text;
}

/** Infer the best leading verb from user intent when missing. */
function inferVerb(userPrompt: string, effectType: 'overlay' | 'background'): string {
  const p = userPrompt.toLowerCase();
  if (/\b(remove|delete|erase|hide)\b/.test(p)) return 'Remove';
  if (/\b(replace|swap|change\s+(the\s+)?background|transport)\b/.test(p) || effectType === 'background') {
    return 'Replace';
  }
  if (/\b(relight|lighting|light\s+ing)\b/.test(p)) return 'Relight';
  if (/\b(restyle|style|anime|cartoon|noir|vintage)\b/.test(p)) return 'Restyle';
  if (/\b(change|color|colour|make)\b/.test(p)) return 'Change';
  return 'Add';
}

export function fallbackCompile(userPrompt: string, effectType: 'overlay' | 'background' = 'overlay'): string {
  const cleaned = userPrompt.trim();
  const body    = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  const stmt    = body.endsWith('.') ? body.slice(0, -1) : body;

  if (TRANSFORM_VERBS.test(stmt)) {
    return normalizeCompiled(stmt);
  }

  const verb = inferVerb(cleaned, effectType);
  return normalizeCompiled(`${verb} ${stmt.toLowerCase()}`);
}

async function callClaude(userPrompt: string): Promise<string> {
  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system:     SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `Compile this edit instruction: "${userPrompt}"` },
    ],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  if (!raw) throw new Error('Claude returned empty completion');

  return raw.replace(/^["']|["']$/g, '').trim();
}

export async function compileVfxPrompt(userPrompt: string): Promise<CompileResult> {
  const prompt     = validatePrompt(userPrompt);
  const effectType = classifyPromptEffect(prompt);

  log(TAG, 'Compile request', { promptLen: prompt.length, effectType });

  function assemble(vfxBody: string): string {
    return sanitizeForRunway(normalizeCompiled(vfxBody)).slice(0, 1000);
  }

  try {
    const raw      = await callClaude(prompt);
    const compiled = assemble(raw);

    log(TAG, 'Compile complete via claude', { wordCount: compiled.split(/\s+/).length, effectType });
    return { compiledPrompt: compiled, method: 'claude', effectType };

  } catch (err) {
    warn(TAG, 'Claude compile failed — using fallback', {
      err: (err as Error).message,
    });

    const compiled = assemble(fallbackCompile(prompt, effectType));
    log(TAG, 'Fallback compile used', { wordCount: compiled.split(/\s+/).length, effectType });
    return { compiledPrompt: compiled, method: 'fallback', effectType };
  }
}
