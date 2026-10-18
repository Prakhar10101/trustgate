import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LLMClient, LLMRequest, LLMResponse } from './types';

export type Mode = 'live' | 'record' | 'replay' | 'auto';

export class RecordReplayClient implements LLMClient {
  constructor(
    private inner: LLMClient | null,
    private mode: Mode,
    private dir: string,
    private modelTag: string,
  ) {}

  private fileFor(req: LLMRequest): string {
   
    const key = createHash('sha256').update(JSON.stringify({ m: this.modelTag, req })).digest('hex').slice(0, 24);
    return path.join(this.dir, key + '.json');
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
  const file = this.fileFor(req);
  const useFixture = this.mode === 'replay' || (this.mode === 'auto' && fs.existsSync(file));
  if (useFixture) {
    if (!fs.existsSync(file)) throw new Error('FIXTURE_MISSING: ' + file);
    return JSON.parse(fs.readFileSync(file, 'utf8')) as LLMResponse;
  }
  if (!this.inner) throw new Error('No live client configured');
  const res = await this.inner.complete(req);
  if (this.mode === 'record' || this.mode === 'auto') {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(res, null, 2));
  }
  return res;
}
}