// Self-check for the apple-rada provider streamSimple event protocol.
// Run: node verify-stream.mjs   (no network, no pi-ai peer dep needed)
import { register } from "node:module";
import assert from "node:assert/strict";

register("./verify-stream-loader.mjs", import.meta.url);

const mod = await import("./index.js");

let appleProvider = null;
const pi = {
  on: () => {},
  registerCommand: () => {},
  registerTool: () => {},
  registerProvider: (name, config) => {
    if (name === "apple-rada") appleProvider = config;
  },
};
mod.default(pi);

assert.ok(appleProvider, "apple-rada provider registered");
assert.ok(
  typeof appleProvider.streamSimple === "function",
  "streamSimple registered",
);

const model = {
  id: "apple-rada",
  api: "apple-rada-api",
  provider: "apple-rada",
  cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
};
const context = {
  messages: [
    { role: "user", content: "posuď novou feature", timestamp: Date.now() },
  ],
};
let onResponseCalled = false;
const options = {
  signal: new AbortController().signal,
  onResponse: () => {
    onResponseCalled = true;
  },
};

const origWarn = console.warn;
console.warn = () => {};
try {
  const stream = appleProvider.streamSimple(model, context, options);
  const evs = [];
  for await (const e of stream) evs.push(e);

  // 1. start must be first
  assert.equal(evs[0]?.type, "start", 'first event must be "start"');

  // 2. every partial/message/error must be a complete AssistantMessage
  const required = [
    "role",
    "content",
    "api",
    "provider",
    "model",
    "usage",
    "stopReason",
    "timestamp",
  ];
  for (const e of evs) {
    const obj = e.partial ?? e.message ?? e.error;
    for (const f of required)
      assert.ok(f in obj, `event ${e.type} missing field ${f}`);
    assert.ok(
      obj.usage && typeof obj.usage.cost === "object",
      `event ${e.type} missing usage.cost`,
    );
  }

  // 3. terminates with done (toolUse due to file agent default stub)
  const last = evs[evs.length - 1];
  assert.equal(last.type, "done", "stream must end with done");
  assert.equal(
    last.reason,
    "toolUse",
    "default path: file agent emits write -> toolUse",
  );
  assert.ok(
    last.message.content[0].text.includes("TEST APPLE SYNTHESIS"),
    "final message text contains synthesis",
  );

  // 4. progress deltas flowed through
  const deltas = evs.filter((e) => e.type === "text_delta");
  assert.ok(
    deltas.some((d) => d.delta.includes("Svolávám Apple Advisory Board")),
    "progress delta emitted",
  );

  // 5. synthesis streamed live tokens
  const synthDeltas = deltas.filter((d) =>
    ["TEST ", "APPLE ", "SYNTHESIS", "\n\n", "Final ", "verdict."].includes(
      d.delta,
    ),
  );
  assert.equal(
    synthDeltas.length,
    6,
    "synthesis must stream as 6 live token deltas",
  );
  assert.equal(
    synthDeltas.map((d) => d.delta).join(""),
    "TEST APPLE SYNTHESIS\n\nFinal verdict.",
    "synthesis tokens in order",
  );

  assert.ok(onResponseCalled, "onResponse callback invoked");

  // 6. abort path
  const ac = new AbortController();
  ac.abort();
  const stream2 = appleProvider.streamSimple(model, context, {
    signal: ac.signal,
  });
  const evs2 = [];
  for await (const e of stream2) evs2.push(e);
  assert.equal(evs2[0]?.type, "error", "aborted stream must start with error");
  assert.equal(evs2[0]?.reason, "aborted");

  // 7. multi-file case
  const multiCtx = {
    messages: [
      { role: "user", content: "MULTI: navrhni kód", timestamp: Date.now() },
    ],
  };
  const streamMulti = appleProvider.streamSimple(model, multiCtx, {
    signal: new AbortController().signal,
    onResponse: () => {},
  });
  const evsMulti = [];
  for await (const e of streamMulti) evsMulti.push(e);
  const doneMulti = evsMulti[evsMulti.length - 1];
  const multiTcEnds = evsMulti.filter((e) => e.type === "toolcall_end");
  assert.equal(multiTcEnds.length, 2, "multi-file: two toolcall_end events");
  assert.equal(doneMulti.type, "done", "multi-file: done");
  assert.equal(doneMulti.reason, "toolUse", "multi-file: done reason toolUse");

  // 8. no-file case
  const noneCtx = {
    messages: [
      { role: "user", content: "NONE: vysvětli vizi", timestamp: Date.now() },
    ],
  };
  const streamNone = appleProvider.streamSimple(model, noneCtx, {
    signal: new AbortController().signal,
    onResponse: () => {},
  });
  const evsNone = [];
  for await (const e of streamNone) evsNone.push(e);
  const doneNone = evsNone[evsNone.length - 1];
  assert.equal(doneNone.type, "done", "no-file: done");
  assert.equal(doneNone.reason, "stop", "no-file: done reason stop");

  // 9. follow-up short circuit
  const followCtx = {
    messages: [
      { role: "user", content: "MULTI: navrhni kód", timestamp: Date.now() },
      {
        role: "assistant",
        content: [
          { type: "text", text: "synthesis..." },
          {
            type: "toolCall",
            id: "call_a",
            name: "write",
            arguments: { path: "index.html", content: "x" },
          },
          {
            type: "toolCall",
            id: "call_b",
            name: "write",
            arguments: { path: "style.css", content: "y" },
          },
        ],
        api: "apple-rada-api",
        provider: "apple-rada",
        model: "apple-rada",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: "toolUse",
        timestamp: Date.now(),
      },
      {
        role: "toolResult",
        toolCallId: "call_a",
        toolName: "write",
        content: [{ type: "text", text: "wrote" }],
        isError: false,
        timestamp: Date.now(),
      },
      {
        role: "toolResult",
        toolCallId: "call_b",
        toolName: "write",
        content: [{ type: "text", text: "wrote" }],
        isError: false,
        timestamp: Date.now(),
      },
    ],
  };
  const streamFollow = appleProvider.streamSimple(model, followCtx, {
    signal: new AbortController().signal,
    onResponse: () => {},
  });
  const evsFollow = [];
  for await (const e of streamFollow) evsFollow.push(e);
  const followDeltas = evsFollow.filter((e) => e.type === "text_delta");
  const followText = followDeltas.map((d) => d.delta).join("");
  const doneFollow = evsFollow[evsFollow.length - 1];
  assert.ok(
    followText.includes("Uloženo 2 souborů"),
    "follow-up confirms 2 files saved",
  );
  assert.equal(doneFollow.type, "done");
  assert.equal(doneFollow.reason, "stop");

  console.log(
    `verify-stream: OK — ${evs.length} events, live deltas, multi-file, no-file, abort, follow-up OK`,
  );
} finally {
  console.warn = origWarn;
}
