// ESM loader hook for verify-stream.mjs: redirects dependencies to inline stub modules
// so the test runs with no network and no pi-ai peer dep.
// - @earendil-works/pi-ai  -> minimal faithful AssistantMessageEventStream replica
// - ./lib/deliberation.js  -> Deliberator stub that drives onProgress + returns a synthesis
// - ./lib/api.js           -> ApiClient stub: returns canned content/usage/toolCalls

const PI_AI_SOURCE = `
export function createAssistantMessageEventStream() {
  return makeStream(e => e.type === 'done' || e.type === 'error', e => e.type === 'done' ? e.message : e.error);
}
function makeStream(isComplete, extract) {
  let queue = []; let waiting = []; let done = false;
  let resolveResult; const resultP = new Promise(r => { resolveResult = r; });
  return {
    push(event) {
      if (done) return;
      if (isComplete(event)) { done = true; resolveResult(extract(event)); }
      const w = waiting.shift();
      if (w) w({ value: event, done: false }); else queue.push(event);
    },
    end(result) {
      done = true;
      if (result !== undefined) resolveResult(result);
      while (waiting.length) waiting.shift()({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (queue.length) return Promise.resolve({ value: queue.shift(), done: false });
          if (done) return Promise.resolve({ value: undefined, done: true });
          return new Promise(resolve => waiting.push(resolve));
        }
      };
    },
    result() { return resultP; }
  };
}
export function getProviders() { return ['opencode-go']; }
export function getModels() { return []; }
export function calculateCost(model, usage) {
  const c = model?.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  usage.cost.input = (usage.input / 1e6) * c.input;
  usage.cost.output = (usage.output / 1e6) * c.output;
  usage.cost.cacheRead = (usage.cacheRead / 1e6) * c.cacheRead;
  usage.cost.cacheWrite = (usage.cacheWrite / 1e6) * c.cacheWrite;
  usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
}
`;

const DELIB_SOURCE = `
export class Deliberator {
  constructor(opts) { this.opts = opts; }
  async deliberate(prompt, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const onSynthesisDelta = options.onSynthesisDelta || (() => {});
    const models = { jobs: 'jobs-model', woz: 'woz-model', ive: 'ive-model', karpathy: 'karpathy-model', mastnacek: 'mastnacek-model', synthesis: 'synth-model' };
    const withHtml = String(prompt).startsWith('HTML:');
    const synthesis = withHtml
      ? 'Here is the file:\\n\\n\`\`\`html\\n<!DOCTYPE html><html></html>\\n\`\`\`\\n'
      : 'TEST APPLE SYNTHESIS\\n\\nFinal verdict.';
    onProgress('panel-start', {
      models: { jobs: models.jobs, woz: models.woz, ive: models.ive, karpathy: models.karpathy }
    });
    onProgress('panel-end', { panelResponses: { jobs: 'j', woz: 'w', ive: 'i', karpathy: 'k' } });
    onProgress('context-start', { model: models.mastnacek });
    onProgress('context-end', { contextAdvocateResponse: 'mastnacek context check' });
    onProgress('synthesis-start', { model: models.synthesis });
    if (withHtml) onSynthesisDelta(synthesis); else
      for (const tok of ['TEST ', 'APPLE ', 'SYNTHESIS', '\\n\\n', 'Final ', 'verdict.']) onSynthesisDelta(tok);
    onProgress('synthesis-end', { synthesis });
    return {
      synthesis,
      panelResponses: { jobs: 'j', woz: 'w', ive: 'i', karpathy: 'k' },
      contextAdvocateResponse: 'mastnacek context check',
      models,
      usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 150,
               cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
    };
  }
}
`;

const API_SOURCE = `
export class ApiClient {
  constructor(opts) { this.opts = opts; this.callCount = 0; }
  async chatCompletion({ model, messages, onDelta, tools }) {
    this.callCount++;
    const userText = JSON.stringify(messages).toLowerCase();
    if (tools && tools.length > 0) {
      if (userText.includes('none:')) {
        if (onDelta) onDelta('Nothing to save.');
        return { content: 'Nothing to save.', usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { input:0, output:0, cacheRead:0, cacheWrite:0, total:0 } }, toolCalls: [] };
      }
      if (userText.includes('multi:')) {
        return { content: '', usage: { input: 20, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input:0, output:0, cacheRead:0, cacheWrite:0, total:0 } },
          toolCalls: [
            { id: 'call_a', name: 'write', arguments: { path: 'index.html', content: '<html>a</html>' } },
            { id: 'call_b', name: 'write', arguments: { path: 'style.css', content: 'body{}' } },
          ] };
      }
      return { content: '', usage: { input: 15, output: 8, cacheRead: 0, cacheWrite: 0, totalTokens: 23, cost: { input:0, output:0, cacheRead:0, cacheWrite:0, total:0 } },
        toolCalls: [{ id: 'call_solo', name: 'write', arguments: { path: 'test-app.html', content: '<!DOCTYPE html><html></html>' } }] };
    }
    const content = 'CANNED RESPONSE';
    if (onDelta) onDelta(content);
    return { content, usage: { input: 30, output: 15, cacheRead: 0, cacheWrite: 0, totalTokens: 45, cost: { input:0, output:0, cacheRead:0, cacheWrite:0, total:0 } }, toolCalls: [] };
  }
  async testConnection() { return true; }
}
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@earendil-works/pi-ai") {
    return {
      url: "data:text/javascript," + encodeURIComponent(PI_AI_SOURCE),
      shortCircuit: true,
    };
  }
  if (specifier === "./lib/deliberation.js") {
    return {
      url: "data:text/javascript," + encodeURIComponent(DELIB_SOURCE),
      shortCircuit: true,
    };
  }
  if (specifier === "./lib/api.js") {
    return {
      url: "data:text/javascript," + encodeURIComponent(API_SOURCE),
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
