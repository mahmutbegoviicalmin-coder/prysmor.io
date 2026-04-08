import Anthropic from '@anthropic-ai/sdk';
import {
  ANTI_ARTIFACT_PREFIX,
  sanitizeForRunway,
  normalizeCompiled,
  classifyPromptEffect,
} from './promptCompiler';

// ANTI_ARTIFACT_PREFIX is imported for callers that inspect this module's exports
// and to make the dependency explicit; normalizeCompiled prepends it internally.
void ANTI_ARTIFACT_PREFIX;

// Mirrors the unexported constant in promptCompiler — kept in sync intentionally.
// Placed BEFORE the VFX instruction so Runway weights identity preservation most heavily.
const FACE_PRESERVE_SUFFIX =
  'All subjects maintain their exact facial features, skin tone, hair color and style,' +
  ' clothing, and body proportions from the source video, appearing identical throughout' +
  ' the transformation.';

export interface ClaudeAnalyzeResult {
  compiledPrompt: string;
  method: 'claude-vision';
  effectType: 'overlay' | 'background';
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function analyzeSceneWithClaude(
  frameBase64: string,
  userPrompt?: string,
): Promise<ClaudeAnalyzeResult> {
  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: frameBase64,
            },
          },
          {
            type: 'text',
            text: `You are an expert prompt engineer for Runway Gen-4 video-to-video AI generation.

Analyze this video frame and write a Runway Gen-4 prompt that preserves subject identity.

MANDATORY RULES (non-negotiable):
• FORBIDDEN WORDS — never include any of these in your output (they trigger content moderation):
  scanlines, banding, CRT, interlacing, glitch, VHS, corrupted, static, distorted, artifacts,
  compression, shutter artifact, signal, data-moshing, interlaced, noise pattern, horizontal lines,
  digital defects.
• TRADEMARK RULE — never use real trademarked character names, superhero names, or franchise names.
  Describe the visual appearance in generic terms instead
  (e.g. "Spider-Man suit" → "form-fitting bodysuit with geometric web texture pattern in black and red").
• LENGTH — write a maximum of 3 sentences for the VFX instruction.
• LANGUAGE — use only positive descriptive language. Describe what SHOULD appear, never "no X" lists.
• CAMERA — write zero camera angle, camera movement, or shot-type language. Runway inherits camera
  position directly from the source video — any camera instruction in the prompt overrides it.

1. IDENTITY PRESERVATION (most critical):
   - Describe every person's exact facial features, skin tone, hair color/style/length
   - Describe exact clothing — pay extreme attention:
     • Exact garment type (shirt, jacket, coveralls, uniform, hoodie, etc.)
     • Exact color with precise shade (navy blue, light grey, olive green, etc.)
     • Any distinguishing features (logos, patches, zippers, collars, buttons)
     • Layering (what is worn over/under what)
     Incorrect clothing description will cause wrong outfit in output.
   - Describe body positions, poses, expressions

2. SCENE:
   - Lighting quality, direction, color temperature
   - Color grading and visual mood
   - Atmosphere and visual tone

3. ENVIRONMENT:
   User request: "${userPrompt || 'keep same environment'}"
   Apply environment change while keeping all subjects identical.

Output ONLY the final Runway prompt following this EXACT structure:

Line 1: "with [exact clothing color, garment type, and appearance details] maintaining identical appearance,"
Line 2: Start with action verb - "Transform [space] into [effect],"
Line 3: Describe the environment transformation in detail.

CRITICAL: Keep total prompt under 50 words.
Environment description maximum 2 sentences.
Subject description maximum 1 sentence.
Brevity is essential - Runway performs better with shorter prompts.

CORRECT example:
"with man in navy blue work coveralls and dark beard maintaining identical appearance, Transform the industrial garage workshop into a frozen arctic environment, thick crystalline ice coating every wall surface and ceiling beam, icicles hanging from exposed pipes, snow powder blanketing the conference table and chairs, cold blue-white lighting replacing warm tones, visible breath vapor in frigid air."

WRONG - never start with these:
- "Transform the scene..."
- "Cover every surface..."
- "The subject's exact..."
- "preserve exact identity..."

ALWAYS start with: "with [subject description] maintaining identical appearance,"`,
          },
        ],
      },
    ],
  });

  const rawPrompt = response.content[0].type === 'text' ? response.content[0].text : '';

  const effectType = classifyPromptEffect(rawPrompt);

  // For background effects: prepend identity sentence BEFORE the VFX instruction
  // so it lands right after the anti-artifact prefix — Runway weights early tokens most.
  let compiled = rawPrompt;
  if (effectType === 'background') {
    compiled = FACE_PRESERVE_SUFFIX + ' ' + compiled;
  }

  compiled = sanitizeForRunway(compiled);
  compiled = normalizeCompiled(compiled);

  return { compiledPrompt: compiled, method: 'claude-vision', effectType };
}

/**
 * Ensures the compiled prompt starts with "with [subject] maintaining identical appearance,".
 *
 * If Claude correctly started with "with" → returns as-is.
 * If Claude put the "with X maintaining..." clause at the END (old format) →
 *   extracts it and moves it to the front so Runway reads identity first.
 * Falls back to the original string if no pattern is found.
 */
function enforceWithFormat(raw: string): string {
  const trimmed = raw.trim();

  // Already correct — starts with "with "
  if (/^with\s/i.test(trimmed)) return trimmed;

  // Detect trailing "with X maintaining..." pattern (Claude's old format)
  // e.g. "Transform scene..., with man in red jacket maintaining identical appearance."
  const trailingWith = trimmed.match(/,?\s*(with\s+.+?maintaining[^.]*\.?)$/i);
  if (trailingWith) {
    const withClause  = trailingWith[1].trim().replace(/\.$/, '');
    const vfxPart     = trimmed.slice(0, trimmed.length - trailingWith[0].length).trim().replace(/,\s*$/, '');
    return `${withClause}, ${vfxPart}.`;
  }

  // No "with" found at all — return unchanged and let FACE_PRESERVE_SUFFIX cover it
  return trimmed;
}

/**
 * Prompt-enhancement variant of the Claude vision call.
 *
 * Called by the Enhance button flow — the user has typed an intent and wants
 * to see a fully-formed Runway prompt BEFORE clicking Generate.  The system
 * prompt is tuned for "what should I tell Runway to do to this clip" rather
 * than the generate-time "describe every detail of this frame".
 */
export async function enhancePromptWithClaude(
  frameBase64: string,
  userPrompt: string,
): Promise<ClaudeAnalyzeResult> {
  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: frameBase64,
            },
          },
          {
            type: 'text',
            text: `You are a Runway Gen-4 prompt writer. Write a single short prompt under 50 words.

User request: "${userPrompt}"

STRICT OUTPUT FORMAT — your response must match this exactly:
"with [exact clothing color and garment type of each person] maintaining identical appearance, [environment transformation in 1-2 sentences]"

RULES:
- First word MUST be "with" — no exceptions
- Describe clothing precisely: color + garment type (e.g. "bright red zip-up jacket", "blue denim jacket")
- For multiple people: "with man in red jacket and man in blue jacket maintaining identical appearance,"
- After the comma: describe the transformation concisely
- Forbidden words: scanlines, banding, CRT, glitch, VHS, corrupted, static, distorted, artifacts
- No camera language, no trademarked names

CORRECT: "with man in red jacket maintaining identical appearance, transform the alley into a nighttime scene with fireworks bursting overhead and warm ambient light on brick walls."
WRONG: "Transform the scene..." or "The subject maintains..."`,
          },
        ],
      },
    ],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const effectType = classifyPromptEffect(raw);
  // Programmatic enforcement: if Claude ignored the "with" rule, move the trailing
  // "with X maintaining..." clause to the front where Runway weights it most heavily.
  let normalized = enforceWithFormat(raw);
  // Prepend identity sentence BEFORE the VFX instruction — same ordering as promptCompiler.
  if (effectType === 'background') normalized = FACE_PRESERVE_SUFFIX + ' ' + normalized;
  const compiled = normalizeCompiled(sanitizeForRunway(normalized));

  return { compiledPrompt: compiled, method: 'claude-vision', effectType };
}
