export type Block =
  | { type: 'text'; text: string; raw?: unknown }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; raw?: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface Msg { role: 'user' | 'assistant'; content: string | Block[] }

export interface ToolDef { name: string; description: string; inputSchema: Record<string, unknown> }

export interface LLMRequest {
  system: string;
  messages: Msg[];
  tools?: ToolDef[];
  maxTokens: number;
  temperature?: number;
}

export interface LLMResponse {
  content: Block[];
  stopReason: 'end_turn' | 'tool_use' | 'other';
  usage: { inputTokens: number; outputTokens: number };
}

export interface LLMClient { complete(req: LLMRequest): Promise<LLMResponse> }

export function textOf(content: Block[]): string {
  return content
    .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();
}