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
const FACE_PRESERVE_SUFFIX =
  ' All subjects maintain their exact facial features, skin tone, hair color and style,' +
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
    max_tokens: 1024,
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
   - Use phrase "preserve exact identity and appearance of all subjects from source video"

2. SCENE:
   - Lighting quality, direction, color temperature
   - Color grading and visual mood
   - Atmosphere and visual tone

3. ENVIRONMENT:
   User request: "${userPrompt || 'keep same environment'}"
   Apply environment change while keeping all subjects identical.

Output ONLY the final Runway prompt following this EXACT structure:

Line 1: Start with action verb - example: "Transform [space] into [effect],"
Line 2: Describe the environment transformation in detail
Line 3: "with [subject description - exact clothing color and type] maintaining identical appearance throughout."

CORRECT example:
"Transform the industrial garage workshop into a frozen arctic environment, thick crystalline ice coating every wall surface and ceiling beam, icicles hanging from exposed pipes, snow powder blanketing the conference table and chairs, cold blue-white lighting replacing warm tones, visible breath vapor in frigid air, with man in navy blue work coveralls and dark beard maintaining identical appearance throughout."

WRONG - never start with these:
- "The subject's exact..."
- "preserve exact identity..."
- "Maintaining the subject..."

ALWAYS start with: "Transform", "Cover", "Fill", "Replace", "Add", "Convert"`,
          },
        ],
      },
    ],
  });

  const rawPrompt = response.content[0].type === 'text' ? response.content[0].text : '';

  const effectType = classifyPromptEffect(rawPrompt);

  let compiled = rawPrompt;
  if (effectType === 'background') {
    compiled = compiled + FACE_PRESERVE_SUFFIX;
  }

  compiled = sanitizeForRunway(compiled);
  compiled = normalizeCompiled(compiled);

  return { compiledPrompt: compiled, method: 'claude-vision', effectType };
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
    max_tokens: 1024,
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

The user wants to transform this video with the following request: "${userPrompt}"

Analyze this frame carefully and write the best possible Runway Gen-4 prompt that:

1. IDENTITY PRESERVATION (non-negotiable):
   - Describe every person's exact facial features, skin tone, hair color/style/length
   - Describe exact clothing — pay extreme attention:
     • Exact garment type (shirt, jacket, coveralls, uniform, hoodie, etc.)
     • Exact color with precise shade (navy blue, light grey, olive green, etc.)
     • Any distinguishing features (logos, patches, zippers, collars, buttons)
     • Layering (what is worn over/under what)
     Incorrect clothing description will cause wrong outfit in output.
   - Start with "preserve exact identity and appearance of all subjects from source video"

2. VFX INSTRUCTION:
   - Apply the user's requested transformation: "${userPrompt}"
   - Be specific and visual (concrete terms, not vague labels)
   - Max 3 sentences total

3. MANDATORY RULES:
   - Positive descriptive language only — describe what SHOULD appear, never "no X" lists
   - Forbidden output words (trigger Runway moderation): scanlines, banding, CRT, glitch, VHS,
     corrupted, static, distorted, artifacts, compression, interlacing
   - Trademarked character names are blocked — describe the visual appearance in generic terms instead
   - Write zero camera angle, camera movement, or shot-type language — Runway inherits camera from source

Output ONLY the final Runway prompt following this EXACT structure:

Line 1: Start with action verb - example: "Transform [space] into [effect],"
Line 2: Describe the environment transformation in detail
Line 3: "with [subject description - exact clothing color and type] maintaining identical appearance throughout."

CORRECT example:
"Transform the industrial garage workshop into a frozen arctic environment, thick crystalline ice coating every wall surface and ceiling beam, icicles hanging from exposed pipes, snow powder blanketing the conference table and chairs, cold blue-white lighting replacing warm tones, visible breath vapor in frigid air, with man in navy blue work coveralls and dark beard maintaining identical appearance throughout."

WRONG - never start with these:
- "The subject's exact..."
- "preserve exact identity..."
- "Maintaining the subject..."

ALWAYS start with: "Transform", "Cover", "Fill", "Replace", "Add", "Convert"`,
          },
        ],
      },
    ],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  const effectType = classifyPromptEffect(raw);
  let compiled = raw;
  if (effectType === 'background') compiled = compiled + FACE_PRESERVE_SUFFIX;
  compiled = sanitizeForRunway(compiled);
  compiled = normalizeCompiled(compiled);

  return { compiledPrompt: compiled, method: 'claude-vision', effectType };
}
