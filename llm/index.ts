import path from 'node:path';
import { GeminiClient } from './gemini';
import { RecordReplayClient, type Mode } from './record-replay';
import type { LLMClient } from './types';

export function makeClient(kind: 'app' | 'judge'): LLMClient {
  const mode = (process.env.LLM_MODE ?? 'replay') as Mode;
  const model =
    kind === 'judge'
      ? process.env.JUDGE_MODEL ?? 'gemini-3.5-flash-lite'
      : process.env.LLM_MODEL ?? 'gemini-3.5-flash-lite';
  const inner = mode === 'replay' ? null : new GeminiClient(model);
  const dir = path.resolve(__dirname, '..', 'fixtures', kind);
  return new RecordReplayClient(inner, mode, dir, model);
}