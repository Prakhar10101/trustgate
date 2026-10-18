import 'dotenv/config';
import { makeClient } from '../llm';

(async () => {
  const llm = makeClient('app');
  const res = await llm.complete({
    system: 'Reply in one short sentence.',
    messages: [{ role: 'user', content: 'Say hello to TrustGate.' }],
    maxTokens: 50,
    temperature: 0,
  });
  console.log(JSON.stringify(res, null, 2));
})();