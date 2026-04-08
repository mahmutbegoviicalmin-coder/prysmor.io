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
  ' All human faces, skin, facial features, expressions, and body proportions' +
  ' must remain completely identical to the original. Do not alter any person.';

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
• LANGUAGE — use only positive descriptive language. Never write "no X" negation lists.

1. IDENTITY PRESERVATION (most critical):
   - Describe every person's exact facial features, skin tone, hair color/style/length
   - Describe exact clothing: colors, style, fit
   - Describe body positions, poses, expressions
   - Use phrase "preserve exact identity and appearance of all subjects from source video"

2. SCENE:
   - Lighting quality, direction, color temperature
   - Camera angle and framing
   - Color grading and mood

3. ENVIRONMENT:
   User request: "${userPrompt || 'keep same environment'}"
   Apply environment change while keeping all subjects identical.

Output ONLY the final Runway prompt, no explanation. Start with:
"preserve exact identity and appearance of all subjects from source video,"`,
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
   - Describe every person's exact facial features, skin tone, hair
   - Describe exact clothing: colors, style, fit
   - Start with "preserve exact identity and appearance of all subjects from source video"

2. VFX INSTRUCTION:
   - Apply the user's requested transformation: "${userPrompt}"
   - Be specific and visual (concrete terms, not vague labels)
   - Max 3 sentences total

3. MANDATORY RULES:
   - Positive language only, never "no X" lists
   - NEVER use: scanlines, banding, CRT, glitch, VHS, corrupted, static, distorted, artifacts, compression, interlacing
   - NEVER use trademarked character names — describe visual appearance instead
   - Output ONLY the final prompt, no explanation

Output ONLY the final Runway prompt. Start with:
"preserve exact identity and appearance of all subjects from source video,"`,
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
