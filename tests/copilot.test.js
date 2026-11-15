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
  const lowFitTrend = PRESET_TRENDS.find((t) => t.id === 'trend-low-fit-semiconductor'); // Semiconductor export report
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

test('Weekly 5-day Culture Magazine mode (Incheon tourism, food, K-Drama, Korean tradition) passes all validation rules and builds bilingual/image extras', async () => {
  const incheonTrend = PRESET_TRENDS.find((t) => t.pillar === 'incheon_tourism');
  const { output, validation, extras } = await runCopilot({
    mode: 'generate',
    date: '2026-11-18',
    contentType: 'culture_magazine',
    pillar: 'incheon_tourism',
    trend: incheonTrend
  });

  assert.equal(validation.valid, true, `Errors: ${validation.errors.join('; ')}`);
  assert.equal(validation.warnings.length, 0, `Warnings: ${validation.warnings.join('; ')}`);
  assert.equal(extras.contentType, 'culture_magazine');
  assert.equal(extras.blogBilingual.enSections.length, 4);
  assert.equal(extras.imageStudio.instagramCards.length, 4);
});

test('Different live RSS or custom trends dynamically change all 4 channels (Reels, Instagram, Threads, Naver Blog)', async () => {
  const resA = await runCopilot({
    mode: 'generate',
    date: '2026-11-15',
    contentType: 'culture_magazine',
    pillar: 'incheon_tourism',
    trend: {
      title: '송도 트라이보울 야간 국악·미디어아트 페스티벌 개막',
      summary: '인천 송도 센트럴파크 수변 무대에서 야간 국악 공연과 전시가 열린다.',
      source: 'Google News Live RSS',
      language: 'ko'
    }
  });

  const resB = await runCopilot({
    mode: 'generate',
    date: '2026-11-15',
    contentType: 'culture_magazine',
    pillar: 'incheon_tourism',
    trend: {
      title: '개항장 문화지구 근대건축 갤러리 주말 투어 인기',
      summary: '19세기 개항기 역사를 간직한 인천 중구 개항장 거리 투어가 호응을 얻고 있다.',
      source: 'Google News Live RSS',
      language: 'ko'
    }
  });

  assert.equal(resA.validation.valid, true, `Errors A: ${resA.validation.errors.join('; ')}`);
  assert.equal(resB.validation.valid, true, `Errors B: ${resB.validation.errors.join('; ')}`);
  assert.notDeepEqual(resA.output.reels.hook, resB.output.reels.hook);
  assert.notDeepEqual(resA.output.instagram_feed.cards[0], resB.output.instagram_feed.cards[0]);
  assert.notEqual(resA.output.threads.text, resB.output.threads.text);
  assert.notEqual(resA.output.naver_blog.title, resB.output.naver_blog.title);
  assert.notEqual(resA.output.naver_blog.sections[0].body, resB.output.naver_blog.sections[0].body);
});

