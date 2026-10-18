import { GoogleGenAI } from '@google/genai';
import type { LLMClient, LLMRequest, LLMResponse, Block, Msg } from './types';

// Free-tier pacing: calls within one process are spaced at least MIN_INTERVAL_MS apart.
let nextSlot = 0;
async function throttle(): Promise<void> {
  const gap = Number(process.env.MIN_INTERVAL_MS ?? 2200);
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + gap;
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
}

// Retry rate-limit and transient server errors with exponential backoff.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const retryable = [429, 500, 503].includes(e?.status);
      if (!retryable || attempt >= 4) throw e;
      await new Promise(r => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

// Convert our neutral messages to Gemini contents. Provider data in `raw` is sent back untouched.
function toContents(messages: Msg[]): any[] {
  const names = new Map<string, string>(); // tool_use id -> tool name
  return messages.map(m => {
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (typeof m.content === 'string') return { role, parts: [{ text: m.content }] };
    const parts = m.content.map((b: Block): any => {
      if (b.type === 'text') return b.raw ?? { text: b.text };
      if (b.type === 'tool_use') {
        names.set(b.id, b.name);
        return b.raw ?? { functionCall: { id: b.id, name: b.name, args: b.input } };
      }
      return {
        functionResponse: {
          ...(!b.tool_use_id.startsWith('synthetic_') && { id: b.tool_use_id }),
          name: names.get(b.tool_use_id) ?? 'unknown',
          response: { result: b.content },
        },
      };
    });
    return { role, parts };
  });
}

export class GeminiClient implements LLMClient {
  private ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  constructor(private model: string) {}

  async complete(req: LLMRequest): Promise<LLMResponse> {
    await throttle();
    const res = await withRetry(() =>
      this.ai.models.generateContent({
        model: this.model,
        contents: toContents(req.messages),
        config: {
          systemInstruction: req.system,
          // The output budget may include thinking tokens, so never go below 1024.
          maxOutputTokens: Math.max(req.maxTokens, 1024),
          // temperature is deliberately NOT sent: Google recommends the default for Gemini 3.
          ...(req.tools && {
            tools: [
              {
                functionDeclarations: req.tools.map(t => ({
                  name: t.name,
                  description: t.description,
                  parametersJsonSchema: t.inputSchema,
                })),
              },
            ],
          }),
        },
      }),
    );

    const parts: any[] = res.candidates?.[0]?.content?.parts ?? [];
    const content: Block[] = [];
    parts.forEach((p, i) => {
      if (p.functionCall) {
        content.push({
          type: 'tool_use',
          id: p.functionCall.id ?? 'synthetic_' + i,
          name: p.functionCall.name,
          input: p.functionCall.args ?? {},
          raw: p,
        });
      } else if (typeof p.text === 'string' && p.text && !p.thought) {
        content.push({ type: 'text', text: p.text, raw: p });
      }
    });

    const u = res.usageMetadata;
    return {
      content,
      stopReason: content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
      usage: {
        inputTokens: u?.promptTokenCount ?? 0,
        outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
      },
    };
  }
}