import Anthropic from '@anthropic-ai/sdk';
import {
  sanitizeForRunway,
  classifyPromptEffect,
} from './promptCompiler';

export interface ClaudeAnalyzeResult {
  compiledPrompt: string;
  method: 'claude-vision';
  effectType: 'overlay' | 'background';
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Runway Aleph already sees the video — no need to describe clothing or faces.
 * Just tell it what to change and that all characters must be preserved.
 * Max 30 words.
 */
const SCENE_INSTRUCTION = (userRequest: string) =>
  `Write a Runway Gen-4 video transformation prompt in maximum 30 words.

User wants: "${userRequest}"

Format your response exactly as:
"Transform [specific element the user asked about] into [transformation]. Keep all people unchanged."

Rules:
- Maximum 30 words total
- Do NOT describe clothing, faces, or people
- Only describe what should change in the environment/scene
- Forbidden words: scanlines, banding, CRT, glitch, VHS, corrupted, static, distorted, artifacts, interlacing
- No camera language, no trademarked names
- Return only the prompt, no quotes, no explanation`;

export async function analyzeSceneWithClaude(
  frameBase64: string,
  userPrompt?: string,
): Promise<ClaudeAnalyzeResult> {
  console.log('[claude-vision] analyzeScene — frames sent: 1');

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 120,
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
            text: SCENE_INSTRUCTION(userPrompt || 'keep same environment'),
          },
        ],
      },
    ],
  });

  const raw        = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  const effectType = classifyPromptEffect(raw);
  const compiled   = sanitizeForRunway(raw);

  console.log('[claude-vision] Full response:', JSON.stringify(response, null, 2));
  console.log('[claude-vision] What it sees:', raw);
  console.log('[claude-vision] Final compiled prompt:', compiled);

  return { compiledPrompt: compiled, method: 'claude-vision', effectType };
}

/**
 * Prompt-enhancement variant — called by the Enhance button.
 * Same philosophy: Runway sees the video, just describe what to change.
 */
export async function enhancePromptWithClaude(
  frameBase64: string,
  userPrompt: string,
): Promise<ClaudeAnalyzeResult> {
  console.log('[claude-vision] enhancePrompt — frames sent: 1, user prompt:', userPrompt);

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 120,
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
            text: SCENE_INSTRUCTION(userPrompt),
          },
        ],
      },
    ],
  });

  const raw        = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  const effectType = classifyPromptEffect(raw);
  const compiled   = sanitizeForRunway(raw);

  console.log('[claude-vision] Full response:', JSON.stringify(response, null, 2));
  console.log('[claude-vision] What it sees:', raw);
  console.log('[claude-vision] Final compiled prompt:', compiled);

  return { compiledPrompt: compiled, method: 'claude-vision', effectType };
}
