import { spawn } from 'node:child_process';
import fs from 'node:fs';
import {
  buildFullSystemPrompt,
  loadGroundTruth,
  loadOutputSchema,
  loadRagKnowledgeBase
} from './promptRenderer.js';
import { validateMarketingOutput } from './validator.js';

const CLI_PATHS = {
  'claude-cli': ['/Users/kapital/.local/bin/claude', 'claude'],
  'codex-cli': ['/opt/homebrew/bin/codex', 'codex'],
  'gemini-cli': ['/Users/kapital/.hermes/node/bin/gemini', 'gemini']
};

const CULTURE_KEYWORDS = [
  'gayageum',
  'gugak',
  'k-pop',
  'kpop',
  'k-drama',
  'kdrama',
  'hanbok',
  'tea',
  'yakgwa',
  'dagwa',
  'arirang',
  'incheon',
  'songdo',
  'chinatown',
  'sinpo',
  'dakgangjeong',
  'tri-bowl',
  'hanok',
  'layover',
  'transit',
  'korea',
  'travel',
  'traditional',
  'craft',
  'music',
  'zither',
  '가야금',
  '국악',
  '한복',
  '전통',
  '인천',
  '송도',
  '개항장',
  '차이나타운',
  '신포',
  '닭강정',
  '약과',
  '한옥마을',
  '트라이보울',
  '환승',
  '경유',
  '아리랑',
  '다과',
  '원데이클래스',
  '외국인',
  '문화',
  '체험',
  '관광',
  '음식',
  '미식',
  '드라마'
];

export function resolveSubscriptionCliBinary(provider) {
  const candidates = CLI_PATHS[provider] || [];
  for (const candidate of candidates) {
    if (candidate.startsWith('/') && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[candidates.length - 1] || null;
}

export function getSubscriptionProvidersStatus() {
  const home = process.env.HOME || '/Users/kapital';
  return [
    {
      id: 'claude-cli',
      name: '🟣 Claude Pro/Max 구독 (Claude CLI)',
      binPath: '/Users/kapital/.local/bin/claude',
      installed: fs.existsSync('/Users/kapital/.local/bin/claude'),
      authenticated: fs.existsSync(`${home}/.claude`),
      loginCommand: 'claude login',
      mode: 'cli-subscription'
    },
    {
      id: 'codex-cli',
      name: '🟢 ChatGPT Plus/Pro 구독 (Codex CLI)',
      binPath: '/opt/homebrew/bin/codex',
      installed: fs.existsSync('/opt/homebrew/bin/codex'),
      authenticated: fs.existsSync(`${home}/.codex/auth.json`),
      loginCommand: 'codex login',
      mode: 'cli-subscription'
    },
    {
      id: 'gemini-cli',
      name: '🔵 Gemini Advanced 구독 (Gemini CLI)',
      binPath: '/Users/kapital/.hermes/node/bin/gemini',
      installed: fs.existsSync('/Users/kapital/.hermes/node/bin/gemini'),
      authenticated: fs.existsSync(`${home}/.gemini/oauth_creds.json`),
      loginCommand: 'gemini',
      mode: 'cli-subscription'
    },
    {
      id: 'web-subscription',
      name: '🌐 웹 브라우저 구독 연동 (ChatGPT·Claude·Gemini 웹 복사/붙여넣기)',
      installed: true,
      authenticated: true,
      mode: 'web-subscription'
    },
    {
      id: 'local-rule-engine',
      name: '⚡ 내장 솜씨 룰 엔진 (즉시 생성 · 오프라인)',
      installed: true,
      authenticated: true,
      mode: 'local'
    }
  ];
}

export function buildSubscriptionPromptBundle(
  input,
  groundTruth = loadGroundTruth(),
  ragKb = loadRagKnowledgeBase()
) {
  const systemPrompt = buildFullSystemPrompt(groundTruth, ragKb);
  const outputSchema = loadOutputSchema();
  const userJson = JSON.stringify(input, null, 2);

  const combinedPrompt = [
    systemPrompt.trim(),
    '',
    '---',
    '## STRICT JSON SCHEMA',
    'Return ONLY a single valid JSON object conforming strictly to this schema (no extra commentary):',
    JSON.stringify(outputSchema.schema, null, 2),
    '',
    '---',
    '## INPUT JSON',
    userJson
  ].join('\n');

  return {
    systemPrompt,
    userJson,
    combinedPrompt
  };
}

export function extractJsonFromSubscriptionOutput(rawText = '') {
  const trimmed = String(rawText).trim();
  if (!trimmed) {
    throw new Error('구독 모델 응답이 비어 있습니다.');
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    // Check markdown fenced blocks from the end
    const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
    for (let i = fencedMatches.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(fencedMatches[i][1].trim());
      } catch {
        // continue
      }
    }
    // Scan from the last '}' and try matching '{' positions from the end backward
    const lastBrace = trimmed.lastIndexOf('}');
    if (lastBrace !== -1) {
      let searchPos = lastBrace;
      while (searchPos >= 0) {
        const openBrace = trimmed.lastIndexOf('{', searchPos);
        if (openBrace === -1) break;
        const candidate = trimmed.slice(openBrace, lastBrace + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === 'object' && ('reels' in parsed || 'mode' in parsed)) {
            return parsed;
          }
        } catch {
          // continue searching earlier '{'
        }
        searchPos = openBrace - 1;
      }
    }
    throw new Error(`응답에서 유효한 JSON 객체를 찾을 수 없습니다: ${trimmed.slice(0, 120)}`);
  }
}

export function callSubscriptionCli(provider, combinedPrompt, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const bin = resolveSubscriptionCliBinary(provider);
    if (!bin) {
      return reject(new Error(`Unknown subscription CLI provider: ${provider}`));
    }

    const tmpOutFile = `/tmp/somssi_cli_out_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
    let args = [];
    if (provider === 'claude-cli') {
      args = ['-p', '--output-format', 'text', '--tools', ''];
    } else if (provider === 'codex-cli') {
      args = [
        'exec',
        '--skip-git-repo-check',
        '-c',
        'model_reasoning_effort="low"',
        '-o',
        tmpOutFile,
        '-'
      ];
    } else if (provider === 'gemini-cli') {
      args = ['-p', 'Follow the instructions piped via stdin and output ONLY the JSON object.'];
    } else {
      return reject(new Error(`Unsupported CLI provider: ${provider}`));
    }

    const child = spawn(bin, args, {
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    child.stdin.write(combinedPrompt);
    child.stdin.end();

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${provider} 실행 시간이 초과되었습니다 (${timeoutMs / 1000}s).`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        if (provider === 'codex-cli' && fs.existsSync(tmpOutFile)) {
          const fileContent = fs.readFileSync(tmpOutFile, 'utf8');
          fs.unlinkSync(tmpOutFile);
          const parsed = extractJsonFromSubscriptionOutput(fileContent);
          return resolve(parsed);
        }
        if (code !== 0 && !stdout.trim()) {
          return reject(
            new Error(`${provider} 종료 코드 ${code}: ${stderr.trim() || '구독 로그인/한도 상태를 확인해주세요.'}`)
          );
        }
        const parsed = extractJsonFromSubscriptionOutput(stdout);
        resolve(parsed);
      } catch (err) {
        if (fs.existsSync(tmpOutFile)) {
          try { fs.unlinkSync(tmpOutFile); } catch {}
        }
        reject(new Error(`${provider} 실행 안내: ${stdout.trim().slice(0, 140) || err.message}`));
      }
    });
  });
}

export function scoreTrendFit(trend = {}) {
  const text = `${trend.title || ''} ${trend.summary || ''}`.toLowerCase();
  let hits = 0;
  for (const kw of CULTURE_KEYWORDS) {
    if (text.includes(kw)) hits += 1;
  }
  if (/gayageum|gugak|가야금|국악|환승|layover|hanbok|한복|incheon|songdo|인천|송도|k-pop|k-drama/.test(text)) {
    hits += 3;
  }
  return Math.min(10, Math.max(1, hits * 2));
}

function sanitizeTrendText(raw = '', maxLen = 60) {
  const cleaned = String(raw || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:the best|the only|no\.?\s*1)\b/gi, 'popular')
    .replace(/최고|유일|최초/g, '대표')
    .replace(/[-–—|]\s*[^-–—|]+$/, '') // strip trailing "- 언론사명" from RSS titles
    .replace(/["'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1).trim() + '…' : cleaned;
}

/**
 * Generates a 100% rule-compliant 4-channel draft for the 5-day/week Cultural Magazine mode
 * that dynamically incorporates the selected trend/news item across all 4 channels.
 */
function generateCultureMagazineDraft(input, groundTruth, score, skip) {
  const p = groundTruth.placeholders || {};
  const airportMin = p.N || '25';
  const trend = input.trend || {};
  const pillar = input.pillar || trend.pillar || 'incheon_tourism';

  const shortHeadline = sanitizeTrendText(trend.title, 26) || '인천·한국 문화 트렌드';
  const shortCardTitleKr = sanitizeTrendText(trend.title, 18) || '오늘의 문화 포커스';
  const shortSummary = sanitizeTrendText(trend.summary || trend.title, 68) || '한국 전통 문화와 인천 로컬 여행 소식을 전해드려요.';
  const isKoreanTrend = /[가-힣]/.test(trend.title || '');

  const pillarConfigs = {
    k_pop_drama: {
      angle: `Curating "${sanitizeTrendText(trend.title, 70)}" for K-Pop & K-Drama fans: connecting today's news with Songdo Central Park, Tri-bowl, and Korean cultural arts in Incheon.`,
      reelsHook: {
        kr: isKoreanTrend ? sanitizeTrendText(trend.title, 36) : `K-콘텐츠 화제: ${shortHeadline}`.slice(0, 38),
        en: (!isKoreanTrend ? sanitizeTrendText(trend.title, 36) : 'K-Culture & Songdo Spotlight!').slice(0, 38)
      },
      reelsLines: [
        sanitizeTrendText(trend.title, 28) || 'K-Drama & K-Pop spotlight',
        'Songdo Central Park & Tri-bowl',
        'Hanok roofs & Korean strings',
        '25m from Incheon Int’l Airport'
      ],
      reelsCaption:
        'Explore K-Drama & K-Culture spots in Songdo, Incheon—plus Korean arts at SOMSSI! Guide: {{BOOKING_URL}}',
      igCards: [
        {
          title: { kr: shortCardTitleKr, en: 'K-Culture News' },
          body: {
            kr: `${shortSummary.slice(0, 74)}`,
            en: 'Discover how Korean pop culture connects with Songdo Central Park in Incheon.'
          }
        },
        {
          title: { kr: '트라이보울 & 센트럴파크', en: 'Tri-bowl & Canal' },
          body: {
            kr: '물 위에 떠 있는 듯한 복합문화공간 트라이보울과 해수 수로가 미래적인 풍경을 선사해요.',
            en: 'The floating Tri-bowl arts center and seawater canal create an iconic skyline.'
          }
        },
        {
          title: { kr: '한옥마을과 한국의 소리', en: 'Hanok & Korean Sound' },
          body: {
            kr: '빌딩 숲 사이 고즈넉한 한옥마을과 송도 실내 공간에서 만나는 12현 가야금 선율까지 즐겨보세요.',
            en: 'Pair Hanok Village strolls with serene 12-string gayageum melodies in Songdo.'
          }
        },
        {
          title: { kr: '송도 신규 관광상품 예고', en: 'New Tour Coming Soon' },
          body: {
            kr: '송도에서 곧 판매 예정인 가야금·한복 관광상품 《줄을 다루는 솜씨》 소식은 {{BOOKING_URL}} 참고!',
            en: 'Our Songdo gayageum & Hanbok class is coming soon! Info at {{BOOKING_URL}}'
          }
        }
      ],
      igCaption: `[오늘의 문화 소식: ${shortHeadline}] 최근 K-컬처와 한국 문화예술 소식과 함께 주목받는 인천 송도 센트럴파크 일대를 소개해요! 복합문화공간 트라이보울과 수상택시, 고즈넉한 송도 한옥마을 산책을 즐기고, 센트럴파크 인근 솜씨(SOMSSI)에서 새롭게 선보일 예정인 한국 전통 차·한복·12현 가야금 문화관광 상품 《줄을 다루는 솜씨》(상품 판매 예정)도 기대해 주세요.\n\nInspired by today's K-Culture spotlight (${sanitizeTrendText(trend.title, 48)})? Just ${airportMin} mins from Incheon Airport, Songdo Central Park pairs Tri-bowl with traditional roofs—where SOMSSI is preparing an upcoming gayageum & Hanbok tourism program (Coming Soon). Guide: {{BOOKING_URL}}`,
      threadsText: `Have you seen today's spotlight on "${sanitizeTrendText(trend.title, 58)}"? In Incheon (about ${airportMin} mins from Incheon Int'l Airport), Songdo Central Park blends modern K-Drama architecture with Hanok rooftops—where SOMSSI is preparing an upcoming #gayageum (가야금) & Hanbok tourism experience (Coming Soon: {{BOOKING_URL}}). What part of Korean culture would you love to explore next?`,
      blogTitle: `인천 송도 가볼만한곳 ${sanitizeTrendText(trend.title, 22)} 문화 가이드`.slice(0, 39),
      blogKeywords: ['송도 가볼만한곳', '인천 관광지', '트라이보울', '송도 센트럴파크', '인천 문화예술', '외국인 한국문화체험']
    },
    incheon_tourism: {
      angle: `Highlighting "${sanitizeTrendText(trend.title, 70)}" alongside Incheon's cultural tourism corridor—from Songdo Central Park and Hanok Village to the Gaehangjang Open Port district—and introducing SOMSSI's upcoming cultural tourism product.`,
      reelsHook: {
        kr: isKoreanTrend ? sanitizeTrendText(trend.title, 36) : '과거와 미래가 만나는 인천 문화 산책',
        en: (!isKoreanTrend ? sanitizeTrendText(trend.title, 36) : 'Incheon’s Past & Future Walk!').slice(0, 38)
      },
      reelsLines: [
        sanitizeTrendText(trend.title, 28) || 'Incheon cultural travel spot',
        'Songdo Central Park & Hanok',
        'Tri-bowl cultural arts space',
        'New gayageum tour coming soon'
      ],
      reelsCaption:
        'Explore Incheon’s Open Port & Songdo Central Park—plus SOMSSI’s upcoming cultural class (Coming Soon): {{BOOKING_URL}}',
      igCards: [
        {
          title: { kr: shortCardTitleKr, en: 'Incheon Arts Walk' },
          body: {
            kr: `${shortSummary.slice(0, 74)}`,
            en: 'Walk through Incheon’s Open Port galleries and modern Songdo Central Park.'
          }
        },
        {
          title: { kr: '개항장 문화지구와 역사', en: 'Historic Open Port' },
          body: {
            kr: '19세기 말 개항기 건축물들이 박물관과 아트 스페이스, 감성 카페로 보존되어 있어요.',
            en: 'Late-19th-century architecture now hosts intimate museums, galleries, and cafes.'
          }
        },
        {
          title: { kr: '송도 센트럴파크 & 한옥', en: 'Songdo Park & Hanok' },
          body: {
            kr: '해수 수로를 따라 걷다 보면 트라이보울과 고풍스러운 송도 한옥마을이 한눈에 펼쳐져요.',
            en: 'Stroll along the seawater canal past Tri-bowl and traditional tiled Hanok roofs.'
          }
        },
        {
          title: { kr: '송도 신규 관광상품 예고', en: 'New Tour Coming Soon' },
          body: {
            kr: '센트럴파크 인근 솜씨(SOMSSI)가 준비 중인 가야금·한복 관광상품(판매 예정) 안내는 {{BOOKING_URL}} 참고!',
            en: 'SOMSSI’s new gayageum & Hanbok tour in Songdo is coming soon: {{BOOKING_URL}}'
          }
        }
      ],
      igCaption: `[인천 로컬 큐레이션: ${shortHeadline}] 인천은 19세기 개항기의 역사를 간직한 개항장 문화지구·차이나타운부터 바닷물이 흐르는 송도 센트럴파크와 한옥마을, 복합문화공간 트라이보울까지 다채로운 매력을 지닌 문화예술 도시예요. 센트럴파크 인근 솜씨(SOMSSI)에서 현재 준비 중인 신규 문화관광 상품 《줄을 다루는 솜씨》(상품 판매 예정) 소식도 함께 확인해 보세요.\n\nExploring Incheon (${sanitizeTrendText(trend.title, 45)})? Pair the historic Gaehangjang Open Port district with Songdo Central Park, where SOMSSI is preparing a new 120-min gayageum & Hanbok tourism program (Coming Soon, 25m from ICN). Pre-launch guide: {{BOOKING_URL}}`,
      threadsText: `Following today's Incheon travel topic ("${sanitizeTrendText(trend.title, 55)}"), have you explored Songdo Central Park's Hanok Village or the 19th-century galleries of Gaehangjang Open Port? Right near Songdo Central Park, SOMSSI is also preparing a new Korean tea & #gayageum (가야금) tourism program (Coming Soon: {{BOOKING_URL}}). What is your favorite neighborhood in Korea?`,
      blogTitle: `인천 관광지 추천 ${sanitizeTrendText(trend.title, 24)} 코스`.slice(0, 39),
      blogKeywords: ['인천 관광지', '송도 가볼만한곳', '개항장 문화지구', '송도 한옥마을', '인천 문화예술', '인천 이색체험']
    },
    incheon_food_tea: {
      angle: `Connecting "${sanitizeTrendText(trend.title, 70)}" with Incheon's culinary & tea heritage: Sinpo Market dakgangjeong, Chinatown delicacies, and SOMSSI's upcoming Korean tea & gayageum tourism program in Songdo.`,
      reelsHook: {
        kr: isKoreanTrend ? sanitizeTrendText(trend.title, 36) : '신포 닭강정부터 전통 다과까지 인천 미식',
        en: (!isKoreanTrend ? sanitizeTrendText(trend.title, 36) : 'Incheon Food & Korean Tea!').slice(0, 38)
      },
      reelsLines: [
        sanitizeTrendText(trend.title, 28) || 'Incheon local food & tea',
        'Sinpo Market & Chinatown eats',
        'Songdo Korean tea & yakgwa',
        'New tea & string tour soon!'
      ],
      reelsCaption:
        'Taste Incheon’s street food & discover our upcoming Korean tea and gayageum class in Songdo (Coming Soon)! {{BOOKING_URL}}',
      igCards: [
        {
          title: { kr: shortCardTitleKr, en: 'Incheon Food & Tea' },
          body: {
            kr: `${shortSummary.slice(0, 74)}`,
            en: 'From lively market street food to tranquil Korean tea and handmade sweets.'
          }
        },
        {
          title: { kr: '신포시장 & 차이나타운', en: 'Markets & Chinatown' },
          body: {
            kr: '신포국제시장의 매콤달콤한 닭강정과 차이나타운의 역사 깊은 중화요리는 인천의 별미예요.',
            en: 'Savor crispy glazed dakgangjeong at Sinpo Market and historic Chinatown dishes.'
          }
        },
        {
          title: { kr: '한국 전통 다과와 차(茶)', en: 'Korean Tea & Dagwa' },
          body: {
            kr: '식사 후에는 송도에서 약과·다식·정과 등 정갈한 전통 다과와 따뜻한 차 한 잔의 여유를 즐겨보세요.',
            en: 'Unwind in Songdo with seasonal Korean tea paired with yakgwa and dasik.'
          }
        },
        {
          title: { kr: '다도·가야금 상품 판매예정', en: 'Tea & Music Soon' },
          body: {
            kr: '전통 다과·차와 가야금 연주를 즐기는 송도 솜씨(SOMSSI) 신규 관광상품이 곧 판매 예정이에요: {{BOOKING_URL}}',
            en: 'Our Songdo tea & gayageum class is coming soon: {{BOOKING_URL}}'
          }
        }
      ],
      igCaption: `[오늘의 미식·다과 토픽: ${shortHeadline}] 인천 미식 여행의 매력은 활기찬 로컬 먹거리와 정갈한 전통 다과 문화를 하루에 모두 만날 수 있다는 점이에요! 신포국제시장의 바삭한 닭강정이나 차이나타운 별미를 맛본 뒤, 송도 센트럴파크 인근 솜씨(SOMSSI)가 새롭게 선보일 한국 전통 차·다과·가야금 문화관광 상품(상품 판매 예정)도 만나보세요.\n\nCraving an Incheon food & tea itinerary (${sanitizeTrendText(trend.title, 45)})? Start at Sinpo Market, then look forward to SOMSSI's upcoming Korean tea, refreshments & gayageum tourism experience near Songdo Central Park (Coming Soon). Details: {{BOOKING_URL}}`,
      threadsText: `Inspired by "${sanitizeTrendText(trend.title, 55)}"—are you team street food or team quiet tea house when traveling in Korea? In Incheon, you can try crispy dakgangjeong at Sinpo Market, and soon you'll also be able to join SOMSSI's upcoming Korean tea, dagwa & #gayageum (가야금) tourism program in Songdo (Coming Soon: {{BOOKING_URL}}). What is your favorite Korean snack?`,
      blogTitle: `인천 미식 여행 ${sanitizeTrendText(trend.title, 24)} 다과 코스`.slice(0, 39),
      blogKeywords: ['인천 맛집', '신포국제시장', '송도 가볼만한곳', '한국 전통 다과', '인천 여행 코스', '외국인 한국문화체험']
    },
    korean_tradition: {
      angle: `Sharing the philosophy of Korean traditional aesthetics around "${sanitizeTrendText(trend.title, 70)}"—paulownia wood, 12 silk strings, and graceful Hanbok lines—while introducing SOMSSI's upcoming Songdo cultural tourism program.`,
      reelsHook: {
        kr: isKoreanTrend ? sanitizeTrendText(trend.title, 36) : '오동나무와 명주실 12줄이 만드는 여운',
        en: (!isKoreanTrend ? sanitizeTrendText(trend.title, 36) : 'The Calm Beauty of 12 Strings').slice(0, 38)
      },
      reelsLines: [
        sanitizeTrendText(trend.title, 28) || 'Korean traditional heritage',
        'Bare hands & 12 silk strings',
        'Nonghyeon: gentle vibrato',
        'Songdo class coming soon!'
      ],
      reelsCaption:
        'Discover the harmony of Hanbok & the 12-string gayageum in Songdo—new tourism class coming soon! {{BOOKING_URL}}',
      igCards: [
        {
          title: { kr: shortCardTitleKr, en: 'Korean Aesthetics' },
          body: {
            kr: `${shortSummary.slice(0, 74)}`,
            en: 'How natural materials in Hanbok and Korean instruments create calm beauty.'
          }
        },
        {
          title: { kr: '오동나무와 명주실 12줄', en: '12 Silk Strings' },
          body: {
            kr: '가야금은 오동나무 울림통 위에 명주실 12줄과 기러기 발 모양의 안족을 얹은 한국 고유 악기예요.',
            en: 'The gayageum rests 12 silk strings over paulownia wood on wild-goose bridges.'
          }
        },
        {
          title: { kr: '손끝의 호흡, 농현(弄絃)', en: 'Art of Nonghyeon' },
          body: {
            kr: '피크 없이 맨손끝으로 줄을 뜯고 왼손으로 줄을 흔들어 한국 음악 특유의 깊은 여운을 만들어요.',
            en: 'Bare right fingertips pluck while the left hand bends each note with warmth.'
          }
        },
        {
          title: { kr: '송도 관광상품 오픈 예정', en: 'Coming Soon Songdo' },
          body: {
            kr: '송도 센트럴파크 인근 솜씨(SOMSSI)가 준비 중인 가야금·한복 관광상품(판매 예정) 안내는 {{BOOKING_URL}} 참고!',
            en: 'Our Songdo gayageum & Hanbok tourism program is coming soon: {{BOOKING_URL}}'
          }
        }
      ],
      igCaption: `[한국 전통문화 이야기: ${shortHeadline}] 빠르게 흘러가는 일상 속에서 한국 전통 문화가 지닌 큰 매력은 '비움과 여운'이에요. 오동나무 울림통과 명주실 12줄, 기러기 발 모양의 안족으로 이루어진 가야금은 피크 없이 맨손끝으로 줄을 뜯고 왼손으로 '농현'을 더해 깊은 숨결을 담아냅니다. 송도에서 곧 선보일 솜씨(SOMSSI)의 신규 가야금·한복 관광상품(판매 예정)도 기대해 주세요.\n\nExploring "${sanitizeTrendText(trend.title, 45)}"? Played with bare fingertips on 12 silk strings, the gayageum celebrates the space between notes. SOMSSI's new cultural tourism class in Songdo is coming soon: {{BOOKING_URL}}`,
      threadsText: `Thinking about "${sanitizeTrendText(trend.title, 55)}"—did you know the traditional Korean 12-string #gayageum (가야금) is played with bare fingertips rather than picks, resting silk strings on bridges shaped like wild-goose feet (안족)? We are preparing a new hands-on tourism program in Songdo (Coming Soon: {{BOOKING_URL}}). What traditional craft fascinates you most?`,
      blogTitle: `한국 전통 문화 ${sanitizeTrendText(trend.title, 24)} 이야기`.slice(0, 39),
      blogKeywords: ['한국 전통 문화', '가야금', '한복 체험', '송도 가볼만한곳', '인천 문화예술', '외국인 한국문화체험']
    }
  };

  const cfg = pillarConfigs[pillar] || pillarConfigs.incheon_tourism;

  const naverSections = [
    {
      h2: `오늘의 문화·관광 포커스: ${sanitizeTrendText(trend.title, 34) || '인천·송도 로컬 문화예술'}`,
      body: `최근 주목받고 있는 **${sanitizeTrendText(trend.title, 50)}** 소식(${sanitizeTrendText(trend.summary, 110)})과 함께, 한국을 찾는 외국인 개별 여행객(FIT)과 주말 나들이객 사이에서 인천의 다채로운 로컬 문화가 큰 관심을 모으고 있어요. 드라마와 뮤직비디오 촬영지로 사랑받는 **송도 센트럴파크**와 물 위에 떠 있는 듯한 복합문화공간 **트라이보울**, 고즈넉한 기와지붕이 인상적인 **송도 한옥마을**, 그리고 19세기 말 개항기의 근대 건축물들이 갤러리와 박물관으로 보존된 **개항장 문화지구**가 대표적인 인천 관광지 코스로 손꼽히고 있어요. 바닷물이 흐르는 센트럴파크 수로를 따라 수상택시를 타거나 산책로를 걸으며 현대 건축과 전통 한옥의 조화를 감상하는 시간은 사계절 내내 특별한 영감을 주는 인천 문화예술 여행의 백미예요.`
    },
    {
      h2: '신포국제시장·차이나타운 로컬 미식부터 고요한 한국 전통 다과·차 문화까지',
      body: `여행에서 빼놓을 수 없는 즐거움은 단연 지역의 역사와 삶이 담긴 음식이에요. 인천에서는 백 년 넘는 역사를 지닌 **차이나타운**의 다채로운 중화 미식과 **신포국제시장**의 매콤달콤하고 바삭한 닭강정을 맛보며 활기찬 로컬 시장의 에너지를 오감으로 느낄 수 있어요. 활기찬 골목 미식 탐방을 마친 오후에는 송도 센트럴파크 인근의 조용한 실내 문화 공간으로 자리를 옮겨 따뜻한 한국 전통 차와 정갈한 계절 다과(약과·다식·정과 등)를 곁들이며 차분하게 휴식을 취하는 코스가 외국인 한국문화체험으로도 큰 호응을 얻고 있어요. 자극적이지 않고 은은하게 퍼지는 한국 전통 차의 향기와 손으로 빚은 다과의 달콤함은 여행의 피로를 부드럽게 풀어주며 한국적인 환대의 정서를 느끼게 해준답니다.`
    },
    {
      h2: '오동나무와 명주실 12줄이 전하는 한국 고유의 소리, 가야금과 한복 이야기',
      body: `한국의 전통 예술과 미학을 이야기할 때 빼놓을 수 없는 상징이 바로 자연스러운 곡선미를 지닌 전통 의복 **한복**과 12현 전통 현악기 **가야금**이에요. 가야금은 속을 비워낸 오동나무 울림통 위에 명주실 12줄과 기러기 발 모양의 나무 기둥인 안족(雁足)을 얹어 만드는데, 인위적인 피크를 쓰지 않고 오른손 끝으로 직접 줄을 뜯고 왼손으로 줄을 지그시 누르거나 흔드는 **농현(弄絃)** 기법을 통해 자연의 바람과 물결을 닮은 깊은 여운을 만들어내요. 최근 다양한 K-컬처 음악과 예술 무대에서도 이러한 국악 현악기의 독창적인 음색이 자주 조명되면서, 귀로만 듣던 한국의 소리를 직접 손끝으로 뜯어보고 한복의 단아한 실루엣을 경험하려는 국내외 여행객들의 관심이 꾸준히 높아지고 있어요.`
    },
    {
      h2: '송도 센트럴파크 인근 신규 관광상품 《줄을 다루는 솜씨》 오픈 및 판매 예정 안내',
      body: `저희 **솜씨(SOMSSI)**는 인천 송도 센트럴파크 인근(인천국제공항에서 택시 또는 공항리무진 약 ${airportMin}분 거리)에서 한국 전통 문화와 인천 지역의 아름다운 문화·예술·관광 소식을 전하면서, 국내외 여행객을 위한 특별한 문화관광 상품인 **솜씨(SOMSSI) 가야금·한복 원데이클래스(자체 교재 《줄을 다루는 솜씨》 기반)**의 정식 오픈을 준비하고 있어요(현재 상품 준비 중 · 곧 판매 예정). 총 120분 동안 한복 착용, 전통 다과 및 차 시음, 그리고 악보를 전혀 읽지 못하는 입문자와 6시간 이상 여유가 있는 인천공항 환승객(공항 밖으로 나가기 전 비자·K-ETA 요건을 꼭 확인하세요)도 한국어·영어(KR / EN) 안내로 한국의 대표 민요 아리랑 주선율을 직접 연주해 보는 올인클루시브 프로그램(1인 99,000 KRW 부가세 포함 정찰제 출시 예정)으로 기획되고 있어요. 호텔 컨시어지 및 인바운드 여행사 담당자분들께서도 향후 송도·개항장 관광 코스와 연계할 수 있는 신규 관광상품으로 미리 확인하실 수 있으며, 정식 판매 오픈 알림 및 사전 안내는 {{BOOKING_URL}} 에서 확인하실 수 있어요.`
    }
  ];

  return {
    mode: 'generate',
    trend_fit: {
      score,
      skip,
      angle: cfg.angle
    },
    reels: {
      hook: cfg.reelsHook,
      onscreen_text: cfg.reelsLines,
      caption: cfg.reelsCaption,
      hashtags: [
        '#incheontravel',
        '#송도가볼만한곳',
        '#koreanculture',
        '#인천여행',
        '#songdo',
        '#gayageum',
        '#한국전통문화'
      ]
    },
    instagram_feed: {
      cards: cfg.igCards,
      caption: cfg.igCaption,
      hashtags: [
        '#incheontravel',
        '#송도가볼만한곳',
        '#인천관광지',
        '#송도센트럴파크',
        '#한국전통문화',
        '#koreanculture',
        '#songdotravel',
        '#kdramalocation',
        '#koreantea',
        '#gayageum',
        '#가야금',
        '#somssi'
      ]
    },
    threads: {
      text: cfg.threadsText
    },
    naver_blog: {
      title: cfg.blogTitle,
      sections: naverSections,
      en_summary: `Inspired by "${sanitizeTrendText(trend.title, 65)}", discover Incheon's vibrant cultural landscape—from Songdo Central Park, Tri-bowl, and Songdo Hanok Village to the historic 19th-century Gaehangjang Open Port and Sinpo Market culinary scene. Near Songdo Central Park (about ${airportMin} minutes from Incheon Int'l Airport), SOMSSI is preparing to launch an upcoming 120-minute gayageum, Hanbok, and traditional tea tourism class (Coming Soon — scheduled to open for sales at 99,000 KRW per person, VAT included; for 6+ hour layovers, check your visa / K-ETA eligibility before leaving the airport). Explore our cultural guide and pre-launch updates at {{BOOKING_URL}}.`,
      keywords: cfg.blogKeywords
    },
    facts_used: [
      { fact: `Trend topic integrated: ${sanitizeTrendText(trend.title, 80)} (${trend.source || 'Input'})`, source: 'rag' },
      { fact: 'Incheon cultural & tourism landmarks: Songdo Central Park, Hanok Village, Tri-bowl, Gaehangjang Open Port', source: 'rag' },
      { fact: 'Incheon culinary & traditional tea culture: Sinpo International Market, Chinatown, traditional Korean tea & dagwa', source: 'rag' },
      { fact: 'Product status: Coming Soon — SOMSSI 120-min class (99,000 KRW) near Songdo Central Park is currently in preparation and scheduled to open for sales', source: 'ground_truth' }
    ],
    reviewer_notes: [
      `주간 편성 전략에 따라 문화·관광·예술 매거진 모드(${pillar})로 "${sanitizeTrendText(trend.title, 50)}" 트렌드를 반영해 작성되었으며, 하단에 송도 솜씨(SOMSSI)의 신규 관광상품 《줄을 다루는 솜씨》(상품 판매 예정 / Coming Soon) 소식을 자연스럽게 연결했습니다.`
    ]
  };
}

/**
 * Generates a deterministic, 100% rule-compliant 4-channel draft.
 */
export function generateRuleCompliantDraft(input, groundTruth = loadGroundTruth()) {
  const p = groundTruth.placeholders || {};
  const minLayover = p.MIN_LAYOVER_HOURS || '6';
  const airportMin = p.N || '25';
  const trend = input.trend || {
    title: 'Korean cultural travel experience in Songdo',
    summary: 'Travelers seek hands-on Korean music and Hanbok experiences near Incheon.',
    source: 'Manual Input',
    language: 'en'
  };

  const contentType = input.contentType || trend.contentType || 'somssi_class';
  const score = scoreTrendFit(trend);
  const skip = score < 5;

  // If this is one of the 5-day/week Cultural Magazine posts (and not a low-fit skip test)
  if (contentType === 'culture_magazine' && !skip) {
    return generateCultureMagazineDraft(input, groundTruth, score, skip);
  }

  const shortHeadline = sanitizeTrendText(trend.title, 26) || '송도 가야금 신규 관광상품';
  const shortSummary = sanitizeTrendText(trend.summary || trend.title, 70);
  const isKoreanTrend = /[가-힣]/.test(trend.title || '');
  const isLayoverFocused =
    skip || /layover|transit|환승|경유|공항|airport/i.test(`${trend.title} ${trend.summary}`);

  const angle = skip
    ? `Today's trend has low relevance to traditional music (score ${score}/10), so we pivot to an evergreen pre-launch preview: introducing how travelers with a ${minLayover}+ hour Incheon Airport layover or a quiet day in Songdo will soon be able to wear Hanbok, sip traditional tea, and learn "Arirang" in 120 minutes (Coming Soon / 상품 판매 예정).`
    : `[주 2회 신규 관광상품 출시 예고] Connecting "${sanitizeTrendText(trend.title, 65)}" to SOMSSI's upcoming 120-minute gayageum & Hanbok tourism product (《줄을 다루는 솜씨》 — Coming Soon / 상품 판매 예정) in Songdo, introducing what this new cultural experience will offer when sales open.`;

  const reelsCaption = isLayoverFocused
    ? `${minLayover}h+ Incheon layover? New Songdo gayageum & Hanbok class coming soon! Check your visa / K-ETA eligibility before leaving the airport. {{BOOKING_URL}}`
    : `New in Songdo! Our 120-min gayageum & Hanbok tourism class is coming soon (scheduled for sale). Pre-launch info: {{BOOKING_URL}}`;

  const igCaption = isLayoverFocused
    ? `[신규 관광상품 오픈 예정] 긴 인천공항 환승 시간(${minLayover}시간 이상)이나 송도 여행 중 특별한 한국 문화를 경험하고 싶다면(${shortHeadline}), 송도 센트럴파크 인근 솜씨(SOMSSI)가 새롭게 선보일 120분 가야금·한복·전통 다과 문화관광 상품 《줄을 다루는 솜씨》(상품 판매 예정)를 주목해 주세요! 공항 밖으로 나가기 전 비자·K-ETA 요건을 꼭 확인하세요.\n\nHave a ${minLayover}+ hour layover at Incheon Int'l Airport? Just ${airportMin} mins away in Songdo, SOMSSI's upcoming 120-minute gayageum, Hanbok & tea tourism class (99,000 KRW, VAT included) is coming soon! Check your visa / K-ETA eligibility before leaving the airport. Info: {{BOOKING_URL}}`
    : `[신규 관광상품 예고: ${shortHeadline}] 인천 송도 센트럴파크 인근에 한국 전통 현악기 가야금과 한복, 전통 다과를 한 번에 경험하는 새로운 문화관광 상품 《줄을 다루는 솜씨》(솜씨 가야금·한복 원데이클래스)가 곧 찾아옵니다! 현재 오픈 준비 중이며 곧 정식 판매 예정으로, 악보를 못 읽는 입문자도 120분 만에 '아리랑'을 연주할 수 있도록 기획되었어요.\n\nComing soon to Songdo, Incheon (about ${airportMin} mins from Incheon Int'l Airport)! Our upcoming 120-minute gayageum, Hanbok & tea tourism class (scheduled at 99,000 KRW per person, VAT included) will open for sales soon. Pre-launch updates: {{BOOKING_URL}}`;

  const naverSections = [
    {
      h2: skip
        ? '인천 송도 가볼만한곳, 새롭게 선보일 실내 한국문화 관광상품 프리뷰'
        : `오늘의 K-컬처 트렌드(${shortHeadline})와 송도 신규 전통문화 관광상품 예고`,
      body: skip
        ? `인천 송도를 찾는 외국인 개별 여행객(FIT)이나 인천국제공항에서 ${minLayover}시간 이상 긴 환승 시간을 보내는 여행객들에게 가장 큰 고민은 이동 부담이 적으면서도 한국적인 정취를 깊이 있게 느낄 수 있는 코스를 찾는 일이에요. 공항 밖으로 나가기 전 비자·K-ETA 요건을 꼭 확인하세요. 이러한 여행객들을 위해 송도 센트럴파크 인근(인천국제공항에서 택시 또는 공항리무진 약 ${airportMin}분 거리)에서 한복과 전통 다과, 그리고 12현 가야금 연주를 한자리에서 경험할 수 있는 새로운 문화관광 상품인 **솜씨(SOMSSI) 가야금·한복 원데이클래스**가 현재 오픈을 준비하고 있어요(상품 판매 예정). 쾌적한 실내 공간에서 날씨와 계절에 구애받지 않고 한국의 소리와 의복, 다과를 오감으로 만날 수 있도록 기획된 신규 인천 이색체험 프로그램이에요.`
        : `최근 **${sanitizeTrendText(trend.title, 48)}** 흐름(${shortSummary})에서 볼 수 있듯, 단순한 랜드마크 방문을 넘어 한국의 전통 사운드와 공예, 로컬 문화를 직접 손으로 경험하려는 국내외 여행객들의 관심이 높아지고 있어요. 이러한 흐름에 발맞추어 인천 송도 센트럴파크 인근(인천국제공항에서 택시 또는 공항리무진 약 ${airportMin}분 거리)에서 한국 고유 12현 현악기인 가야금과 한복, 전통 다과를 함께 경험하는 새로운 문화관광 상품인 **솜씨(SOMSSI) 가야금·한복 원데이클래스**가 현재 정식 오픈을 준비하고 있어요(곧 상품 판매 예정). 송도 가볼만한곳을 찾는 여행객은 물론 ${minLayover}시간 이상 여유가 있는 환승객에게도 특별한 한국문화체험 코스가 될 예정이에요. 공항 밖으로 나가기 전 비자·K-ETA 요건을 꼭 확인하세요.`
    },
    {
      h2: '악보를 몰라도 괜찮아요, 출시 준비 중인 자체 교재 《줄을 다루는 솜씨》 이야기',
      body: `현악기를 처음 접하는 분들도 걱정 없이 참여할 수 있도록 세심한 커리큘럼을 준비하고 있어요. 곧 선보일 솜씨(SOMSSI) 클래스는 음악적 배경지식이 전혀 없는 입문자와 외국인 여행객을 위해 자체 기획·제작 중인 교재 **《줄을 다루는 솜씨》**를 바탕으로 진행될 예정이에요. 복잡한 오선보 대신 직관적인 가이드에 따라 오동나무 울림통 위 명주실 12줄을 오른손 끝으로 뜯고, 기러기 발 모양의 안족 위에서 왼손으로 줄을 누르며 여운을 만드는 기본 주법을 차근차근 익히도록 구성했어요. 한국어와 영어(KR / EN) 동시 안내를 통해 참가자 누구나 한국의 대표 민요인 **아리랑**의 주선율을 직접 연주하는 성취감을 느낄 수 있도록 막바지 준비에박차를 가하고 있답니다.`
    },
    {
      h2: '120분 동안 여유롭게 즐기는 한복·전통 다과·가야금 관광상품 구성 미리보기',
      body: `정식 판매 오픈을 앞둔 전체 프로그램은 한복 착용을 포함해 총 **120분** 동안 체계적이고 여유로운 4단계 흐름으로 구성되어 있어요.\n- **웰컴 티타임 및 한복 착용**: 공간에 도착하면 따뜻한 전통 차와 정갈한 다과를 즐기며 단아한 한복을 골라 입어요.\n- **가야금 구조 이해와 기초 주법 연습**: 자체 교재 《줄을 다루는 솜씨》를 활용해 12현 가야금의 구조와 손가락 자세를 배워요.\n- **아리랑 주선율 단계별 레슨**: 강사의 한·영 안내에 맞춰 한 소절씩 아리랑 멜로디를 연결해 연주해요.\n- **연주 기록 및 포토타임**: 한복을 입고 가야금을 연주하는 모습을 사진과 영상으로 남기며 특별한 한국 여행의 추억을 완성해요.`
    },
    {
      h2: '상품 판매 예정 안내 및 호텔 컨시어지·여행사 B2B 사전 제휴·오픈 알림 안내',
      body: `현재 오픈 준비 중인 **솜씨(SOMSSI) 가야금·한복 원데이클래스**의 출시 예정 스펙과 구성을 미리 안내해 드려요.\n- **상품명**: 솜씨(SOMSSI) 가야금·한복 원데이클래스 (SOMSSI Gayageum & Hanbok One-Day Class)\n- **판매 상태**: 현재 오픈 준비 중 · 곧 정식 상품 판매 예정 (Coming Soon)\n- **위치**: 인천 송도 — 송도 센트럴파크 인근 (인천국제공항에서 택시 또는 공항리무진 약 ${airportMin}분)\n- **소요 시간**: 120분 (한복 착용 포함)\n- **출시 예정 요금**: 1인 99,000 KRW (부가세 포함 정찰제)\n- **포함 내역**: 수업 중 가야금 대여, 한복 대여, 전통 차 및 다과, 가야금 레슨\n- **진행 언어**: 한국어 / 영어 (KR / EN)\n\n호텔 컨시어지 및 인바운드 여행사 담당자분들께서는 120분 정시 운영과 추가 비용 없는 올인클루시브 정찰가(1인 99,000원, 부가세 포함), 그리고 한·영 진행 시스템을 갖춘 신규 문화관광 상품으로 향후 외국인 VIP 투숙객 및 FIT 투어 코스에 미리 기획·연계하실 수 있어요. 정식 상품 판매 오픈 알림 신청과 사전 안내는 {{BOOKING_URL}} 에서 확인하실 수 있어요.`
    }
  ];

  const reviewerNotes = [];
  if (skip) {
    reviewerNotes.push(
      `Input trend "${trend.title}" scored ${score}/10 (< 5), so skip=true was set and evergreen Songdo/layover pre-launch teaser content (상품 판매 예정) was generated per Section 5.`
    );
  } else {
    reviewerNotes.push(
      `[신규 관광상품 출시 예고 모드] 입력 트렌드 "${sanitizeTrendText(trend.title, 48)}"(적합도 ${score}/10)를 반영해 《줄을 다루는 솜씨》 상품이 현재 준비 중이며 곧 판매 예정(Coming Soon)임을 알리는 4개 채널 초안을 생성했습니다.`
    );
  }

  return {
    mode: 'generate',
    trend_fit: {
      score,
      skip,
      angle
    },
    reels: {
      hook: {
        kr: skip
          ? '송도 120분 가야금·한복 관광상품 오픈 예정!'
          : isKoreanTrend
            ? sanitizeTrendText(trend.title, 36)
            : '송도 120분 가야금·한복 관광상품 오픈 예정!',
        en: skip
          ? 'New Songdo Gayageum Class Soon!'
          : !isKoreanTrend
            ? sanitizeTrendText(trend.title, 36)
            : 'New Songdo Gayageum Class Soon!'
      },
      onscreen_text: [
        skip ? '25 mins from Incheon Airport' : sanitizeTrendText(trend.title, 28) || '25 mins from Incheon Airport',
        'Wear Hanbok & sip Korean tea',
        'Learn Arirang on 12 strings',
        '99,000 KRW · Coming Soon!'
      ],
      caption: reelsCaption,
      hashtags: [
        '#gayageum',
        '#가야금',
        '#incheontravel',
        '#송도',
        '#koreanculture',
        '#hanbok',
        '#송도원데이클래스'
      ]
    },
    instagram_feed: {
      cards: [
        {
          title: {
            kr: skip ? '송도 신규 문화관광 상품' : sanitizeTrendText(trend.title, 18) || '송도 신규 문화관광 상품',
            en: 'New Tour Coming Soon'
          },
          body: {
            kr: '인천 송도 센트럴파크 인근에서 곧 선보일 한국 전통 가야금·한복 문화관광 상품이에요(판매 예정).',
            en: 'A new 12-string gayageum & Hanbok tourism program coming soon to Songdo.'
          }
        },
        {
          title: {
            kr: isLayoverFocused ? '긴 환승·송도 여행 코스' : 'K-사운드 직접 배워보기',
            en: isLayoverFocused ? `${minLayover}h+ Layover Idea` : 'Try Korean Music'
          },
          body: {
            kr: isLayoverFocused
              ? `인천공항에서 약 ${airportMin}분! ${minLayover}시간 이상 환승객과 여행객을 위해 준비 중인 실내 코스예요.`
              : `${shortSummary.slice(0, 44)} 송도에서 직접 배워볼 수 있는 상품이 준비 중이에요.`,
            en: isLayoverFocused
              ? `About ${airportMin} mins from Incheon Airport—ideal for ${minLayover}h+ layovers.`
              : 'Go beyond listening and experience Korean traditional string music hands-on.'
          }
        },
        {
          title: {
            kr: '한복·다과·아리랑 120분',
            en: '120 Mins All-In-One'
          },
          body: {
            kr: '한복 착용과 전통 다과·차, 자체 교재 《줄을 다루는 솜씨》로 배우는 아리랑 코스예요(오픈 준비 중).',
            en: 'Includes Hanbok fitting, traditional tea & refreshments, and playing "Arirang".'
          }
        },
        {
          title: {
            kr: '1인 99,000원 판매 예정',
            en: 'Coming Soon · 99K'
          },
          body: {
            kr: '현재 오픈 준비 중이며 곧 정식 판매 예정이에요! 사전 안내는 {{BOOKING_URL}} 참고!',
            en: 'Scheduled to open for sales soon! See pre-launch details at {{BOOKING_URL}}'
          }
        }
      ],
      caption: igCaption,
      hashtags: [
        '#gayageum',
        '#가야금',
        '#가야금원데이클래스',
        '#송도가볼만한곳',
        '#인천이색체험',
        '#외국인한국문화체험',
        '#incheonlayover',
        '#songdotravel',
        '#koreantraditionalmusic',
        '#hanbokexperience',
        '#thingstodoinincheon',
        '#somssi'
      ]
    },
    threads: {
      text: isLayoverFocused
        ? `Got a ${minLayover}h+ layover at Incheon Airport (${sanitizeTrendText(trend.title, 34)})? Check your visa / K-ETA eligibility before leaving the airport! Just ${airportMin} mins away in Songdo, SOMSSI is preparing a new 120-min #gayageum (가야금) & Hanbok tourism class using 《줄을 다루는 솜씨》 (Coming Soon, 99,000 KRW). Info: {{BOOKING_URL}} ✨ How do you spend long layovers?`
        : `Have you ever wanted to pluck a 12-string #gayageum (가야금) while wearing Hanbok? Following "${sanitizeTrendText(trend.title, 44)}", SOMSSI is preparing a new 120-minute cultural tourism class near Songdo Central Park (about ${airportMin} mins from Incheon Airport) using our textbook 《줄을 다루는 솜씨》. Scheduled to open for sales soon (99,000 KRW, VAT included)—pre-launch info at {{BOOKING_URL}} ✨ What Korean craft would you love to try?`
    },
    naver_blog: {
      title: skip
        ? '송도 가볼만한곳 솜씨 가야금·한복 관광상품 오픈·판매 예정 안내'
        : `송도 가볼만한곳 솜씨 가야금 관광상품 판매예정 · ${sanitizeTrendText(trend.title, 11)}`.slice(0, 39),
      sections: naverSections,
      en_summary: `SOMSSI is preparing to launch a new 120-minute gayageum and Hanbok cultural tourism class near Songdo Central Park in Incheon, about ${airportMin} minutes from Incheon International Airport by taxi or airport limousine (Coming Soon — scheduled to open for sales). Priced at 99,000 KRW per person (VAT included), the upcoming session will include gayageum use, Hanbok rental, traditional tea and refreshments, and a beginner-friendly lesson in Korean and English using our textbook 《줄을 다루는 솜씨》 where guests learn to play "Arirang". Designed for independent travelers and transit passengers with layovers of ${minLayover} hours or more (check your visa / K-ETA eligibility before leaving the airport), pre-launch updates and launch notifications are available at {{BOOKING_URL}}.`,
      keywords: [
        '송도 가볼만한곳',
        '인천 이색체험',
        '외국인 한국문화체험',
        '가야금 원데이클래스',
        '인천공항 환승 투어',
        '송도 실내데이트'
      ]
    },
    facts_used: [
      { fact: 'Product name: SOMSSI Gayageum & Hanbok One-Day Class (솜씨 가야금·한복 원데이클래스)', source: 'ground_truth' },
      { fact: 'Product status: Coming Soon — currently in preparation and scheduled to open for sales (상품 오픈 준비 중 · 판매 예정)', source: 'ground_truth' },
      { fact: "Curriculum basis: SOMSSI's own textbook 《줄을 다루는 솜씨》 (in preparation for launch)", source: 'ground_truth' },
      { fact: 'Location: Songdo, Incheon — Near Songdo Central Park (about 25 minutes from Incheon Int\'l Airport by taxi or airport limousine)', source: 'ground_truth' },
      { fact: 'Duration: 120 minutes (including Hanbok fitting)', source: 'ground_truth' },
      { fact: 'Price: 99,000 KRW per person, VAT included (scheduled launch price)', source: 'ground_truth' },
      { fact: 'Included: Gayageum use during class, Hanbok rental, traditional tea & refreshments, lesson', source: 'ground_truth' },
      { fact: 'Outcome: Beginners with no musical background learn to play the main melody of "Arirang"', source: 'ground_truth' },
      { fact: 'Languages of instruction: KR / EN', source: 'ground_truth' },
      { fact: 'Layover eligibility: 6 hours or more + visa / K-ETA eligibility notice', source: 'ground_truth' },
      { fact: '120-minute 4-stage session flow & B2B concierge pre-launch preview points', source: 'rag' }
    ],
    reviewer_notes: reviewerNotes
  };
}

export function detectInstructionViolations(instruction = '') {
  const violations = [];
  if (/할인|discount|프로모션|promo|특가|패키지|package|\d+%\s*off/i.test(instruction)) {
    violations.push(
      'Instruction requested a discount/promotion/package, which violates Section 3 Rule #1 (only Ground Truth pricing 99,000 KRW is allowed). Kept Ground Truth price.'
    );
  }
  if (/후기|리뷰|별점|명이 다녀간|수상|review|testimonial|rating|award/i.test(instruction)) {
    violations.push(
      'Instruction requested unverified reviews/ratings/statistics, which violates Section 3 Rule #2. Omitted invented social proof.'
    );
  }
  if (/아이돌|연예인|셀럽|방탄|블랙핑크|아이유|뉴진스|celebrity|idol|endorsed|visited/i.test(instruction)) {
    violations.push(
      'Instruction requested celebrity/idol endorsement or visit claim, which violates Section 3 Rule #3. Kept focus on public cultural trend only.'
    );
  }
  if (/고쟁|고토|guzheng|koto/i.test(instruction)) {
    violations.push(
      'Instruction mentioned Chinese guzheng or Japanese koto comparison, which violates Section 3 Rule #4. Omitted comparison.'
    );
  }
  if (/달러|엔화|유로|환율|USD|EUR|JPY|\$/i.test(instruction)) {
    violations.push(
      'Instruction requested currency conversion, which violates Section 3 Rule #5. Kept price in KRW only.'
    );
  }
  if (/최고|유일|최초|No\.?\s*1|the best|the only/i.test(instruction)) {
    violations.push(
      'Instruction requested superlatives/exclusivity claims, which violates Section 3 Rule #7. Used warm, factual phrasing instead.'
    );
  }
  if (/마스터|보장|you will master|guarantee/i.test(instruction)) {
    violations.push(
      'Instruction requested guaranteed mastery, which violates Section 3 Rule #8. Used "learn to play" / "experience" instead.'
    );
  }
  if (/(?:[1-5])\s*(?:시간|hour|hr)\s*(?:환승|경유|layover)|짧은\s*환승|short\s*layover/i.test(instruction)) {
    violations.push(
      'Instruction suggested a short layover (< 6 hours), which violates Section 2 Layover eligibility rule. Kept minimum 6+ hours requirement and visa/K-ETA notice.'
    );
  }
  return violations;
}

export function reviseRuleCompliantDraft(input, groundTruth = loadGroundTruth()) {
  const prev = input.previous_output
    ? JSON.parse(JSON.stringify(input.previous_output))
    : generateRuleCompliantDraft({ mode: 'generate', trend: {} }, groundTruth);

  const channel = input.channel;
  const instruction = (input.instruction || '').trim();
  const violations = detectInstructionViolations(instruction);

  const output = {
    ...prev,
    mode: 'revise',
    reviewer_notes: [
      ...(Array.isArray(prev.reviewer_notes) ? prev.reviewer_notes : []),
      ...violations
    ]
  };

  const wantsShorter = /짧게|간결|줄여|shorter|concise|brief/i.test(instruction);
  const wantsLayover = /환승|경유|공항|layover|transit|airport/i.test(instruction);
  const wantsB2B = /컨시어지|여행사|호텔|b2b|concierge|agency/i.test(instruction);

  if (channel === 'reels') {
    output.reels = {
      ...prev.reels,
      hook: wantsShorter
        ? { kr: '송도 120분 가야금 관광상품 판매예정', en: 'Songdo Gayageum Class Soon!' }
        : wantsLayover
          ? { kr: '인천공항 6시간+ 환승 신규 코스 예고!', en: 'New 6h+ ICN layover idea!' }
          : { kr: '곧 찾아올 12현 가야금 아리랑 클래스', en: 'Upcoming Arirang string class!' },
      caption: wantsLayover
        ? '6h+ Incheon layover? New Songdo gayageum class coming soon! Check your visa / K-ETA eligibility before leaving the airport. {{BOOKING_URL}}'
        : wantsShorter
          ? 'Upcoming 120-min gayageum & Hanbok class in Songdo (99,000 KRW, Coming Soon): {{BOOKING_URL}}'
          : 'New 120-min gayageum, Hanbok & tea tourism class in Songdo coming soon (99,000 KRW)! Info: {{BOOKING_URL}}'
    };
  } else if (channel === 'instagram_feed') {
    const cards = JSON.parse(JSON.stringify(prev.instagram_feed.cards));
    if (wantsShorter) {
      cards[0].body = {
        kr: '송도 센트럴파크 인근에서 곧 판매 예정인 120분 가야금·한복 관광상품이에요.',
        en: 'Upcoming 120-min gayageum & Hanbok class near Songdo Central Park.'
      };
    } else if (wantsLayover) {
      cards[1] = {
        title: { kr: '6시간+ 환승 신규 코스', en: 'For 6h+ Layovers' },
        body: {
          kr: '인천공항에서 약 25분! 공항 밖으로 나가기 전 비자·K-ETA 요건을 꼭 확인하세요.',
          en: '25m from ICN! Check your visa / K-ETA eligibility before leaving the airport.'
        }
      };
    }
    output.instagram_feed = {
      ...prev.instagram_feed,
      cards
    };
  } else if (channel === 'threads') {
    output.threads = {
      text: wantsShorter
        ? 'Ever wanted to try the 12-string #gayageum (가야금) in Hanbok? At SOMSSI in Songdo (25m from Incheon Airport), our upcoming 120-min tourism class (99,000 KRW, VAT included) is scheduled to open for sales soon! Pre-launch info at {{BOOKING_URL}} — what Korean song would you love to hear on traditional strings?'
        : wantsLayover
          ? 'Got a 6+ hour layover at Incheon Int\'l Airport? Just 25 mins away in Songdo, SOMSSI is preparing a new 120-min #gayageum (가야금), Hanbok & tea tourism class (99,000 KRW, Coming Soon). Check your visa / K-ETA eligibility before leaving the airport! Info: {{BOOKING_URL}} — how do you spend long layovers?'
          : prev.threads.text
    };
  } else if (channel === 'naver_blog') {
    const updatedSections = JSON.parse(JSON.stringify(prev.naver_blog.sections));
    if (wantsB2B && updatedSections.length > 0) {
      updatedSections[updatedSections.length - 1].h2 =
        '호텔 컨시어지·인바운드 여행사 B2B 사전 제휴 포인트 및 상품 판매 예정 안내';
    }
    output.naver_blog = {
      ...prev.naver_blog,
      title: wantsShorter
        ? '송도 가볼만한곳 솜씨 가야금 관광상품 판매예정'
        : wantsB2B
          ? '외국인 한국문화체험 송도 솜씨 가야금 상품 판매예정'
          : prev.naver_blog.title,
      sections: updatedSections
    };
  }

  output.reviewer_notes.push(
    `Revised channel "${channel}" with instruction: "${instruction || '(no instruction)'}". All other channels were preserved unchanged.`
  );

  return output;
}

/**
 * Generates Bilingual Blog companion (Full English blog post + Bilingual stacked view)
 * AND Image Studio metadata (Instagram 4-card visual templates + Blog section infographics & prompts).
 */
export function buildCompanionMediaExtras(output, input = {}, groundTruth = loadGroundTruth()) {
  const airportMin = groundTruth?.placeholders?.N || '25';
  const minLayover = groundTruth?.placeholders?.MIN_LAYOVER_HOURS || '6';
  const contentType = input.contentType || input?.trend?.contentType || 'somssi_class';
  const pillar = input.pillar || input?.trend?.pillar || 'somssi_class';
  const trendTitleClean = sanitizeTrendText(input?.trend?.title || '', 65) || 'Korean Cultural Spotlight';
  const trendSummaryClean = sanitizeTrendText(input?.trend?.summary || input?.trend?.title || '', 160);

  const enBlogSections =
    contentType === 'culture_magazine'
      ? [
          {
            h2: `1. Cultural Spotlight: ${sanitizeTrendText(trendTitleClean, 44)}`,
            body: `Today's cultural topic—**"${trendTitleClean}"** (${trendSummaryClean})—highlights why Incheon and Songdo are must-visit destinations in Korea. Beyond being Korea's main international gateway, Incheon is a vibrant city where 19th-century history, futuristic architecture, and serene Korean traditions coexist around **Songdo Central Park**, the floating **Tri-bowl** arts center, **Songdo Hanok Village**, and the historic **Gaehangjang Open Port** district.`
          },
          {
            h2: '2. Local Culinary Heritage & Traditional Korean Tea (Dagwa) Rituals',
            body: `A day in Incheon pairs lively street food—such as sweet-and-spicy crispy **dakgangjeong** at Sinpo International Market and historic Chinatown dishes—with calm afternoon tea rituals in Songdo, featuring seasonal Korean floral teas and handmade refreshments like **yakgwa** and **dasik**.`
          },
          {
            h2: '3. The Natural Resonance of Hanbok & the 12-String Gayageum',
            body: `Crafted from hollowed paulownia wood and 12 twisted silk strings resting on wild-goose-foot bridges (**anjok**), the traditional Korean **gayageum** is plucked with bare right fingertips while the left hand shapes warm vibrato (**nonghyeon**)—inviting listeners and beginners alike into quiet mindfulness.`
          },
          {
            h2: '4. Upcoming Tourism Program: SOMSSI One-Day Class in Songdo (Coming Soon)',
            body: `Located near Songdo Central Park (about ${airportMin} minutes from Incheon Int'l Airport by taxi or airport limousine), **SOMSSI** curates local cultural stories and is preparing to launch a new 120-minute Gayageum & Hanbok One-Day Class (**Coming Soon — scheduled to open for sales** at 99,000 KRW per person, VAT included; taught in KR/EN using our upcoming textbook 《줄을 다루는 솜씨》). Designed for independent travelers and transit passengers with layovers of ${minLayover}+ hours (check your visa / K-ETA eligibility before leaving the airport). See pre-launch details at {{BOOKING_URL}}.`
          }
        ]
      : [
          {
            h2: `1. Upcoming Korean Music Tourism Experience in Songdo (${sanitizeTrendText(trendTitleClean, 30)})`,
            body: `Inspired by **"${trendTitleClean}"** (${trendSummaryClean}), travelers visiting Korea and transit guests with a ${minLayover}+ hour layover at Incheon International Airport (check your visa / K-ETA eligibility before leaving the airport) are increasingly looking for calm, indoor cultural experiences. Located near Songdo Central Park—about ${airportMin} minutes from the airport by taxi or airport limousine—**SOMSSI Gayageum & Hanbok One-Day Class** is a new cultural tourism product **currently in preparation and scheduled to open for sales soon (Coming Soon)**.`
          },
          {
            h2: '2. Preview: Learn "Arirang" with Our Upcoming Textbook 《줄을 다루는 솜씨》',
            body: `No musical background or sheet-music reading will be required. Using SOMSSI's upcoming in-house textbook **《줄을 다루는 솜씨》**, instructors will guide participants in Korean and English through plucking the 12 silk strings with bare fingertips and pressing the movable wooden bridges (**anjok**) to play the main melody of **"Arirang"**.`
          },
          {
            h2: '3. Planned 120-Minute Session Flow: Hanbok, Tea & Gayageum',
            body: `- **Welcome Tea & Hanbok Fitting (25 min)**: Enjoy traditional Korean tea and refreshments while choosing your Hanbok.\n- **Gayageum Basics (30 min)**: Learn posture and basic plucking techniques.\n- **Step-by-Step "Arirang" Lesson (45 min)**: Connect each phrase of Arirang at a comfortable pace.\n- **Performance Recording & Photo Time (20 min)**: Capture photos and videos playing the gayageum in Hanbok.`
          },
          {
            h2: '4. Coming Soon Sales Info, Planned Pricing & B2B Preview',
            body: `- **Product**: SOMSSI Gayageum & Hanbok One-Day Class\n- **Status**: Coming Soon (Currently in preparation · Scheduled to open for sales)\n- **Location**: Songdo, Incheon — Near Songdo Central Park\n- **Duration**: 120 minutes (including Hanbok fitting)\n- **Planned Price**: 99,000 KRW per person, VAT included\n- **Included**: Gayageum use during class, Hanbok rental, traditional tea & refreshments, lesson\n\nHotel concierges and travel agencies can preview this upcoming fixed-schedule, all-inclusive tourism product for international guests. Check launch updates at {{BOOKING_URL}}.`
          }
        ];

  const igCardPrompts = (output.instagram_feed?.cards || []).map((card, i) => {
    const palettes = [
      { bg1: '#2e1a12', bg2: '#6b3826', accent: '#f6d59e', themeLabel: 'Warm Paulownia & Silk' },
      { bg1: '#1d322a', bg2: '#375a4c', accent: '#fde68a', themeLabel: 'Songdo Central Park Pine' },
      { bg1: '#422518', bg2: '#85462e', accent: '#fed7aa', themeLabel: 'Hanbok & Tea Ceramic' },
      { bg1: '#1f1b17', bg2: '#5c2e1f', accent: '#fcd34d', themeLabel: 'SOMSSI Signature Seal' }
    ];
    const photoGuides = [
      '추천 실사: 송도 스튜디오 자연광 아래 놓인 12현 가야금 안족(기러기발)과 명주실 클로즈업 컷 (또는 송도 센트럴파크 한옥마을 전경)',
      '추천 실사: 송도 센트럴파크 수로/트라이보울 풍경 또는 한복 소매 끝이 가야금 현 위에 얹힌 감성 컷',
      '추천 실사: 정갈한 전통 다과(약과·다식)와 따뜻한 찻잔, 그리고 준비 중인 교재 《줄을 다루는 솜씨》가 함께 보이는 테이블 컷',
      '추천 실사: 한복을 입고 가야금을 조율하는 티저 실루엣 또는 스튜디오 Coming Soon 안내 사인보드 컷'
    ];
    const aiPrompts = [
      'Editorial travel photography of a serene Korean studio in Songdo Incheon, warm natural sunlight on traditional wooden architecture and silk textures, minimalist Korean aesthetic, 4k, no text',
      'Scenic view of Songdo Central Park in Incheon with traditional Korean Hanok tiled roof in foreground and modern skyline reflection on water, soft golden hour light, editorial travel magazine style',
      'Top-down flatlay of a traditional Korean ceramic teacup with warm floral tea and handmade yakgwa sweets on a dark wooden tray, soft linen fabric, calm mindful atmosphere',
      'Warm Korean cultural studio interior with pastel Hanbok fabrics hanging neatly and soft paper lantern glow, welcoming boutique craft studio vibe'
    ];
    return {
      cardIndex: i + 1,
      title: card.title,
      body: card.body,
      palette: palettes[i % palettes.length],
      photoGuide: photoGuides[i] || photoGuides[0],
      aiPrompt: aiPrompts[i] || aiPrompts[0],
      altText: `${card.title.kr} - ${card.body.kr}`
    };
  });

  const blogImageGuides = (output.naver_blog?.sections || []).map((sec, i) => ({
    sectionIndex: i + 1,
    h2: sec.h2,
    bannerTitleKr:
      i === 0
        ? output.naver_blog.title
        : i === 1
          ? '인천 로컬 미식 & 출시 준비 중인 《줄을 다루는 솜씨》'
          : i === 2
            ? '120분 프로그램 구성 미리보기 · 한복 & 가야금 아리랑'
            : '솜씨(SOMSSI) 신규 관광상품 · 1인 99,000원 판매 예정',
    bannerSubtitleEn:
      enBlogSections[i]?.h2 || 'SOMSSI Songdo Gayageum & Korean Culture Guide (Coming Soon)',
    photoGuide:
      i === 0
        ? '대표 썸네일 / 섹션 1: 송도 센트럴파크 한옥마을 또는 스튜디오 전경 사진'
        : i === 1
          ? '섹션 2: 준비 중인 자체 교재 《줄을 다루는 솜씨》 또는 인천 로컬 미식·전통 다과 클로즈업'
          : i === 2
            ? '섹션 3: 출시 예정 120분 4단계 타임테이블 인포그래픽 카드 (우측 다운로드 버튼으로 즉시 생성 가능)'
            : '섹션 4: 상품 판매 예정(Coming Soon) · 포함내역·소요시간·위치 요약 인포그래픽 카드',
    aiPrompt:
      i === 0
        ? 'Wide editorial banner of Songdo Central Park and Hanok roofs in Incheon South Korea, clear sky, magazine cover quality'
        : 'Close-up of traditional Korean tea ceremony with ceramic cup, handmade yakgwa, and warm wooden table in a sunlit room',
    altText: `${output.naver_blog.keywords?.[i] || '송도 가볼만한곳'} - ${sec.h2}`
  }));

  return {
    contentType,
    pillar,
    blogBilingual: {
      enTitle:
        contentType === 'culture_magazine'
          ? `Incheon & Songdo Cultural Guide: ${sanitizeTrendText(trendTitleClean, 46)}`
          : `[Coming Soon] SOMSSI Songdo 120-Min Gayageum & Hanbok Tour · ${sanitizeTrendText(trendTitleClean, 28)}`,
      enSections: enBlogSections,
      bilingualSections: (output.naver_blog?.sections || []).map((krSec, idx) => ({
        h2_kr: krSec.h2,
        body_kr: krSec.body,
        h2_en: enBlogSections[idx]?.h2 || '',
        body_en: enBlogSections[idx]?.body || ''
      }))
    },
    imageStudio: {
      instagramCards: igCardPrompts,
      blogBanners: blogImageGuides
    }
  };
}

export async function runCopilot(input, options = {}) {
  const groundTruth = options.groundTruth || loadGroundTruth();
  const ragKb = options.ragKb || loadRagKnowledgeBase();
  const provider = options.provider || 'local-rule-engine';
  const promptBundle = buildSubscriptionPromptBundle(input, groundTruth, ragKb);

  let result;
  let engineUsed = provider;
  let cliWarning = null;

  if (['claude-cli', 'codex-cli', 'gemini-cli'].includes(provider)) {
    try {
      result = await callSubscriptionCli(provider, promptBundle.combinedPrompt);
      engineUsed = `subscription:${provider}`;
      if (input.mode === 'revise' && input.previous_output && input.channel) {
        for (const ch of ['reels', 'instagram_feed', 'threads', 'naver_blog']) {
          if (ch !== input.channel && input.previous_output[ch]) {
            result[ch] = JSON.parse(JSON.stringify(input.previous_output[ch]));
          }
        }
      }
    } catch (err) {
      cliWarning = err.message;
      result =
        input.mode === 'revise'
          ? reviseRuleCompliantDraft(input, groundTruth)
          : generateRuleCompliantDraft(input, groundTruth);
      result.reviewer_notes = [
        ...(result.reviewer_notes || []),
        `구독 CLI(${provider}) 폴백 안내 (${err.message}); 내장 룰 엔진으로 초안을 생성했습니다.`
      ];
      engineUsed = 'fallback:local-rule-engine';
    }
  } else {
    result =
      input.mode === 'revise'
        ? reviseRuleCompliantDraft(input, groundTruth)
        : generateRuleCompliantDraft(input, groundTruth);
  }

  const validation = validateMarketingOutput(result, groundTruth);
  const extras = buildCompanionMediaExtras(result, input, groundTruth);
  return {
    output: result,
    validation,
    engineUsed,
    cliWarning,
    promptBundle,
    extras
  };
}
