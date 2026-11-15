import test from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../server.js';

test('HTTP Server API endpoints (/api/config, /api/generate, /api/revise, /api/subscription/*, /api/publish)', async (t) => {
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
  });

  // 1. GET /api/config
  const cfgRes = await fetch(`${base}/api/config`);
  assert.equal(cfgRes.status, 200);
  const cfg = await cfgRes.json();
  assert.ok(cfg.groundTruth.placeholders.PRODUCT_NAME_EN);
  assert.ok(cfg.systemPrompt.includes('[RAG_KnowledgeBase]'));
  assert.ok(Array.isArray(cfg.subscriptionProviders));

  // 2. POST /api/generate
  const genRes = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date: '2026-11-15',
      trend: cfg.presets[0],
      provider: 'local-rule-engine'
    })
  });
  assert.equal(genRes.status, 200);
  const genData = await genRes.json();
  assert.equal(genData.validation.valid, true);
  assert.equal(genData.output.instagram_feed.cards.length, 4);

  // 3. POST /api/subscription/prompt & /api/subscription/import
  const promptRes = await fetch(`${base}/api/subscription/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { mode: 'generate', date: '2026-11-15', trend: cfg.presets[0] }
    })
  });
  assert.equal(promptRes.status, 200);
  const promptData = await promptRes.json();
  assert.ok(promptData.promptBundle.combinedPrompt.includes('STRICT JSON SCHEMA'));

  const importRes = await fetch(`${base}/api/subscription/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawText: '```json\n' + JSON.stringify(genData.output) + '\n```',
      mode: 'generate',
      serviceName: 'ChatGPT Plus Web'
    })
  });
  assert.equal(importRes.status, 200);
  const importData = await importRes.json();
  assert.equal(importData.validation.valid, true);
  assert.equal(importData.engineUsed, 'web-subscription:ChatGPT Plus Web');

  // 4. POST /api/revise
  const revRes = await fetch(`${base}/api/revise`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'threads',
      instruction: '6시간 이상 인천공항 환승객 대상으로 수정해줘',
      previous_output: genData.output,
      provider: 'local-rule-engine'
    })
  });
  assert.equal(revRes.status, 200);
  const revData = await revRes.json();
  assert.equal(revData.output.mode, 'revise');
  assert.equal(revData.validation.valid, true);

  // 5. POST /api/publish
  const pubRes = await fetch(`${base}/api/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      output: revData.output,
      reviewer: 'Test Reviewer'
    })
  });
  assert.equal(pubRes.status, 200);
  const pubData = await pubRes.json();
  assert.equal(pubData.ok, true);
  assert.ok(!JSON.stringify(pubData.publishedPayload).includes('{{BOOKING_URL}}'));
});
