import test from 'node:test';
import assert from 'node:assert/strict';
import { runCopilot } from '../src/copilot.js';
import { PRESET_TRENDS } from '../src/trends.js';
import { resolveBookingUrlsForPublish } from '../src/promptRenderer.js';

test('Generate mode with high-fit K-Culture trend passes all schema & self-check rules', async () => {
  const trend = PRESET_TRENDS[0]; // K-pop gugak fusion
  const { output, validation } = await runCopilot({
    mode: 'generate',
    date: '2026-11-15',
    trend
  });

  assert.equal(output.mode, 'generate');
  assert.equal(output.trend_fit.skip, false);
  assert.ok(output.trend_fit.score >= 5);
  assert.equal(validation.valid, true, `Errors: ${validation.errors.join('; ')}`);
  assert.equal(validation.warnings.length, 0, `Warnings: ${validation.warnings.join('; ')}`);
  assert.equal(output.instagram_feed.cards.length, 4);
  assert.ok(output.threads.text.trim().endsWith('?'));
});

test('Generate mode with low-fit trend (< 5) triggers skip=true and evergreen content', async () => {
  const lowFitTrend = PRESET_TRENDS[3]; // Semiconductor export report
  const { output, validation } = await runCopilot({
    mode: 'generate',
    date: '2026-11-15',
    trend: lowFitTrend
  });

  assert.equal(output.mode, 'generate');
  assert.equal(output.trend_fit.skip, true);
  assert.ok(output.trend_fit.score < 5);
  assert.equal(validation.valid, true, `Errors: ${validation.errors.join('; ')}`);
  assert.equal(validation.warnings.length, 0, `Warnings: ${validation.warnings.join('; ')}`);
  assert.ok(output.reviewer_notes.length > 0);
});

test('Revise mode modifies only the target channel and logs conflicting instructions in reviewer_notes', async () => {
  const initial = await runCopilot({
    mode: 'generate',
    date: '2026-11-15',
    trend: PRESET_TRENDS[0]
  });

  const revised = await runCopilot({
    mode: 'revise',
    channel: 'reels',
    instruction: '더 짧게 써주고 20% 할인 프로모션도 추가해줘',
    previous_output: initial.output
  });

  assert.equal(revised.output.mode, 'revise');
  // Other channels must remain identical
  assert.deepEqual(revised.output.instagram_feed, initial.output.instagram_feed);
  assert.deepEqual(revised.output.threads, initial.output.threads);
  assert.deepEqual(revised.output.naver_blog, initial.output.naver_blog);
  // Reels should be updated
  assert.notDeepEqual(revised.output.reels, initial.output.reels);
  // Reviewer notes must flag the forbidden 20% discount instruction
  assert.ok(
    revised.output.reviewer_notes.some((note) => note.includes('discount') || note.includes('Rule #1')),
    'Should record discount rule conflict in reviewer_notes'
  );
  assert.equal(revised.validation.valid, true);
});

test('Publishing UTM resolver replaces {{BOOKING_URL}} with channel-specific UTM links', async () => {
  const { output } = await runCopilot({
    mode: 'generate',
    date: '2026-11-15',
    trend: PRESET_TRENDS[1]
  });

  const resolved = resolveBookingUrlsForPublish(output);
  assert.ok(!JSON.stringify(resolved).includes('{{BOOKING_URL}}'));
  assert.ok(resolved.reels.caption.includes('utm_medium=reels'));
  assert.ok(resolved.threads.text.includes('utm_source=threads'));
});
