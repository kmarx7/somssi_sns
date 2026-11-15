import { loadGroundTruth } from './promptRenderer.js';

const FORBIDDEN_SUPERLATIVES = [
  /\bthe best\b/i,
  /\bthe only\b/i,
  /\bno\.?\s*1\b/i,
  /최고/,
  /유일/,
  /최초/
];

const FORBIDDEN_GUARANTEES = [/\byou will master\b/i, /\bmaster in\b/i, /완벽히 마스터/];

const FORBIDDEN_INSTRUMENT_CLAIMS = [
  /same as (?:the )?(?:chinese )?guzheng/i,
  /version of (?:the )?(?:chinese )?guzheng/i,
  /same as (?:the )?(?:japanese )?koto/i,
  /version of (?:the )?(?:japanese )?koto/i,
  /고쟁과 같/,
  /고토와 같/
];

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

export function countEmojis(str = '') {
  const matches = str.match(EMOJI_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Validates the SOMSSI marketing output JSON against both the JSON Schema
 * and the Section 2, 3, 6, 7, 9 rules in somssi_system_prompt.md.
 */
export function validateMarketingOutput(output, groundTruth = loadGroundTruth()) {
  const errors = [];
  const warnings = [];
  const checklist = {
    schema_valid: true,
    ground_truth_matched: true,
    only_booking_url_placeholder: true,
    no_forbidden_claims: true,
    layover_rule_met: true,
    channel_limits_met: true,
    cards_and_threads_question: true,
    facts_used_populated: true
  };

  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return {
      valid: false,
      errors: ['Output must be a single JSON object.'],
      warnings: [],
      checklist: Object.fromEntries(Object.keys(checklist).map((k) => [k, false])),
      metrics: {}
    };
  }

  const requiredTop = [
    'mode',
    'trend_fit',
    'reels',
    'instagram_feed',
    'threads',
    'naver_blog',
    'facts_used',
    'reviewer_notes'
  ];

  for (const key of requiredTop) {
    if (!(key in output)) {
      errors.push(`Missing required top-level property: "${key}"`);
      checklist.schema_valid = false;
    }
  }

  if (!['generate', 'revise'].includes(output.mode)) {
    errors.push(`Invalid mode: "${output.mode}". Must be "generate" or "revise".`);
    checklist.schema_valid = false;
  }

  // 1. Check all text for URLs other than {{BOOKING_URL}}
  const serialized = JSON.stringify(output);
  const urlMatches = serialized.match(/https?:\/\/[^\s"']+/gi) || [];
  if (urlMatches.length > 0) {
    errors.push(`Found prohibited raw URL(s): ${urlMatches.join(', ')}. Use literal {{BOOKING_URL}} only.`);
    checklist.only_booking_url_placeholder = false;
  }

  // 2. Check forbidden superlatives, guarantees, and instrument comparisons
  for (const regex of FORBIDDEN_SUPERLATIVES) {
    if (regex.test(serialized)) {
      errors.push(`Found prohibited superlative matching ${regex}`);
      checklist.no_forbidden_claims = false;
    }
  }
  for (const regex of FORBIDDEN_GUARANTEES) {
    if (regex.test(serialized)) {
      errors.push(`Found prohibited guarantee claim matching ${regex}`);
      checklist.no_forbidden_claims = false;
    }
  }
  for (const regex of FORBIDDEN_INSTRUMENT_CLAIMS) {
    if (regex.test(serialized)) {
      errors.push(`Found prohibited instrument equivalence claim matching ${regex}`);
      checklist.no_forbidden_claims = false;
    }
  }

  // Check currency conversions (e.g. $, USD, EUR, JPY)
  if (/\b(?:USD|EUR|JPY|CNY)\b|\$\d+/i.test(serialized)) {
    errors.push('Found currency conversion. Keep price strictly in KRW (99,000 KRW).');
    checklist.no_forbidden_claims = false;
  }

  // 3. Layover rule check per channel
  const minHours = String(groundTruth?.placeholders?.MIN_LAYOVER_HOURS || '6');
  const checkLayoverChannel = (channelName, text) => {
    const mentionsLayover = /\blayover\b|\btransit\b|환승|경유/i.test(text);
    if (!mentionsLayover) return;
    const hasMinHours = new RegExp(`\\b${minHours}\\s*(?:hours|hr|h|\\+)|${minHours}시간`, 'i').test(text);
    const hasVisaNotice = /K-ETA/i.test(text) && (/visa/i.test(text) || /비자/.test(text));
    if (!hasMinHours) {
      warnings.push(
        `[${channelName}] Mentions layover but does not explicitly state the ${minHours}+ hours minimum requirement.`
      );
      checklist.layover_rule_met = false;
    }
    if (!hasVisaNotice) {
      warnings.push(
        `[${channelName}] Mentions layover but is missing the visa / K-ETA eligibility notice.`
      );
      checklist.layover_rule_met = false;
    }
  };

  if (output.reels) checkLayoverChannel('reels', JSON.stringify(output.reels));
  if (output.instagram_feed) checkLayoverChannel('instagram_feed', JSON.stringify(output.instagram_feed));
  if (output.threads) checkLayoverChannel('threads', JSON.stringify(output.threads));
  if (output.naver_blog) checkLayoverChannel('naver_blog', JSON.stringify(output.naver_blog));

  // 4. Channel specs & metrics
  const metrics = {
    reels: {},
    instagram_feed: {},
    threads: {},
    naver_blog: {}
  };

  if (output.reels) {
    const r = output.reels;
    const hookKrLen = (r.hook?.kr || '').length;
    const hookEnLen = (r.hook?.en || '').length;
    const captionLen = (r.caption || '').length;
    const onscreenCount = Array.isArray(r.onscreen_text) ? r.onscreen_text.length : 0;
    const hashtagCount = Array.isArray(r.hashtags) ? r.hashtags.length : 0;

    metrics.reels = {
      hookKrLen,
      hookEnLen,
      captionLen,
      onscreenCount,
      hashtagCount,
      emojis: countEmojis(JSON.stringify(r))
    };

    if (hookKrLen > 40 || hookEnLen > 40) {
      warnings.push(`[reels] hook exceeds 40 chars (KR: ${hookKrLen}, EN: ${hookEnLen}).`);
      checklist.channel_limits_met = false;
    }
    if (onscreenCount < 3 || onscreenCount > 4) {
      warnings.push(`[reels] onscreen_text should have 3–4 lines (got ${onscreenCount}).`);
      checklist.channel_limits_met = false;
    }
    for (const [i, line] of (r.onscreen_text || []).entries()) {
      if (line.length > 30) {
        warnings.push(`[reels] onscreen_text[${i}] exceeds 30 chars (${line.length}).`);
        checklist.channel_limits_met = false;
      }
    }
    if (captionLen > 150) {
      warnings.push(`[reels] caption exceeds 150 chars (${captionLen}).`);
      checklist.channel_limits_met = false;
    }
    if (hashtagCount < 5 || hashtagCount > 8) {
      warnings.push(`[reels] hashtags count should be 5–8 (got ${hashtagCount}).`);
      checklist.channel_limits_met = false;
    }
  }

  if (output.instagram_feed) {
    const ig = output.instagram_feed;
    const cards = Array.isArray(ig.cards) ? ig.cards : [];
    const captionLen = (ig.caption || '').length;
    const hashtagCount = Array.isArray(ig.hashtags) ? ig.hashtags.length : 0;

    metrics.instagram_feed = {
      cardCount: cards.length,
      captionLen,
      hashtagCount,
      emojis: countEmojis(JSON.stringify(ig))
    };

    if (cards.length !== 4) {
      errors.push(`[instagram_feed] Must have exactly 4 cards (got ${cards.length}).`);
      checklist.cards_and_threads_question = false;
    }
    cards.forEach((card, i) => {
      const tKr = (card.title?.kr || '').length;
      const tEn = (card.title?.en || '').length;
      const bKr = (card.body?.kr || '').length;
      const bEn = (card.body?.en || '').length;
      if (tKr > 20 || tEn > 20) {
        warnings.push(`[instagram_feed] Card ${i + 1} title exceeds 20 chars (KR: ${tKr}, EN: ${tEn}).`);
        checklist.channel_limits_met = false;
      }
      if (bKr > 80 || bEn > 80) {
        warnings.push(`[instagram_feed] Card ${i + 1} body exceeds 80 chars (KR: ${bKr}, EN: ${bEn}).`);
        checklist.channel_limits_met = false;
      }
    });
    if (captionLen < 300 || captionLen > 600) {
      warnings.push(`[instagram_feed] caption should be 300–600 chars (got ${captionLen}).`);
      checklist.channel_limits_met = false;
    }
    if (hashtagCount < 10 || hashtagCount > 15) {
      warnings.push(`[instagram_feed] hashtags should be 10–15 (got ${hashtagCount}).`);
      checklist.channel_limits_met = false;
    }
  }

  if (output.threads) {
    const tText = (output.threads.text || '').trim();
    const tLen = tText.length;
    const endsWithQuestion = tText.endsWith('?');
    const hashtagMatches = tText.match(/#[\w가-힣]+/g) || [];

    metrics.threads = {
      length: tLen,
      endsWithQuestion,
      hashtagCount: hashtagMatches.length,
      emojis: countEmojis(tText)
    };

    if (tLen > 450) {
      warnings.push(`[threads] text exceeds 450 chars (${tLen}).`);
      checklist.channel_limits_met = false;
    }
    if (!endsWithQuestion) {
      errors.push('[threads] text must end with an open question ("?").');
      checklist.cards_and_threads_question = false;
    }
    if (hashtagMatches.length > 1) {
      warnings.push(`[threads] max 1 hashtag allowed (got ${hashtagMatches.length}).`);
      checklist.channel_limits_met = false;
    }
  }

  if (output.naver_blog) {
    const nb = output.naver_blog;
    const titleLen = (nb.title || '').length;
    const sections = Array.isArray(nb.sections) ? nb.sections : [];
    const totalBodyLength = sections.reduce((acc, s) => acc + (s.body || '').length, 0);
    const keywordCount = Array.isArray(nb.keywords) ? nb.keywords.length : 0;

    metrics.naver_blog = {
      titleLen,
      sectionCount: sections.length,
      totalBodyLength,
      keywordCount,
      emojis: countEmojis(JSON.stringify(nb))
    };

    if (titleLen > 40) {
      warnings.push(`[naver_blog] title exceeds 40 chars (${titleLen}).`);
      checklist.channel_limits_met = false;
    }
    if (sections.length < 3 || sections.length > 5) {
      warnings.push(`[naver_blog] should have 3–5 sections (got ${sections.length}).`);
      checklist.channel_limits_met = false;
    }
    if (totalBodyLength < 1500 || totalBodyLength > 2500) {
      warnings.push(`[naver_blog] total body length should be 1,500–2,500 chars (got ${totalBodyLength}).`);
      checklist.channel_limits_met = false;
    }
    if (keywordCount < 5 || keywordCount > 8) {
      warnings.push(`[naver_blog] keywords should be 5–8 items (got ${keywordCount}).`);
      checklist.channel_limits_met = false;
    }
  }

  if (!Array.isArray(output.facts_used) || output.facts_used.length === 0) {
    errors.push('facts_used must list every product fact used and its source.');
    checklist.facts_used_populated = false;
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    checklist,
    metrics
  };
}
