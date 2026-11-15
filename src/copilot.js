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
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('응답에서 유효한 JSON 객체를 찾을 수 없습니다.');
  }
}

export function callSubscriptionCli(provider, combinedPrompt, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const bin = resolveSubscriptionCliBinary(provider);
    if (!bin) {
      return reject(new Error(`Unknown subscription CLI provider: ${provider}`));
    }

    let args = [];
    if (provider === 'claude-cli') {
      args = ['-p', '--output-format', 'text', '--tools', ''];
    } else if (provider === 'codex-cli') {
      args = ['exec', '-'];
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
      if (code !== 0 && !stdout.trim()) {
        return reject(
          new Error(`${provider} 종료 코드 ${code}: ${stderr.trim() || '구독 로그인 상태를 확인해주세요.'}`)
        );
      }
      try {
        const parsed = extractJsonFromSubscriptionOutput(stdout);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`${provider} JSON 파싱 실패: ${err.message}`));
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

/**
 * Generates a 100% rule-compliant 4-channel draft for the 5-day/week Cultural Magazine mode
 * (Incheon Tourism/Arts, Incheon Food/Tea, K-Pop/K-Drama, Korean Tradition).
 */
function generateCultureMagazineDraft(input, groundTruth, score, skip) {
  const p = groundTruth.placeholders || {};
  const airportMin = p.N || '25';
  const trend = input.trend || {};
  const pillar = input.pillar || trend.pillar || 'incheon_tourism';

  const pillarConfigs = {
    k_pop_drama: {
      angle: `Curating "${trend.title}" for global K-Pop & K-Drama fans: spotlighting how Songdo Central Park, Tri-bowl, and Hanok Village in Incheon blend futuristic screen locations with timeless Korean cultural artistry.`,
      reelsHook: {
        kr: 'K-드라마·뮤비 속 인천 송도 명소 투어',
        en: 'Inside K-Drama spots in Songdo, Incheon!'
      },
      reelsLines: [
        'Songdo Central Park water views',
        'Futuristic Tri-bowl arts space',
        'Hanok roofs & Korean strings',
        '25m from Incheon Int’l Airport'
      ],
      reelsCaption:
        'Explore K-Drama & K-Pop filming backdrops in Songdo, Incheon—plus Korean cultural arts at SOMSSI! Guide: {{BOOKING_URL}}',
      igCards: [
        {
          title: { kr: 'K-콘텐츠 속 인천 송도', en: 'K-Culture in Songdo' },
          body: {
            kr: '글로벌 K-드라마와 뮤직비디오 배경으로 사랑받는 인천 송도 센트럴파크 일대를 소개해요.',
            en: 'Discover why Songdo Central Park in Incheon stars in global K-Dramas and MVs.'
          }
        },
        {
          title: { kr: '트라이보울 & 수상택시', en: 'Tri-bowl & Canal' },
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
          title: { kr: '송도 로컬 문화 가이드', en: 'Songdo Culture Guide' },
          body: {
            kr: '인천공항에서 약 25분! 송도 문화 산책과 솜씨(SOMSSI) 소식은 {{BOOKING_URL}} 에서 확인하세요.',
            en: 'About 25 mins from Incheon Airport. Explore our cultural guide at {{BOOKING_URL}}'
          }
        }
      ],
      igCaption: `K-드라마와 K-팝 뮤직비디오에 자주 등장하는 미래 도시 같은 야경과 전통 한옥의 조화, 바로 인천 송도 센트럴파크 일대예요! 복합문화공간 트라이보울과 수상택시, 고즈넉한 송도 한옥마을 산책을 즐기고 센트럴파크 인근 솜씨(SOMSSI)에서 한국 전통 차와 12현 가야금 선율도 만나보세요.\n\nPlanning a K-Drama & K-Culture day trip in Incheon? Just ${airportMin} minutes from Incheon Int'l Airport, Songdo Central Park pairs futuristic architecture at Tri-bowl with traditional Korean roofs and serene tea & gayageum aesthetics at SOMSSI. More info: {{BOOKING_URL}}`,
      threadsText: `Have you ever spotted Songdo Central Park or the floating Tri-bowl arts space in a K-Drama? Located in Incheon (about ${airportMin} mins from Incheon Int'l Airport), Songdo blends modern architecture with tranquil Hanok rooftops and traditional #gayageum (가야금) culture at SOMSSI ({{BOOKING_URL}}). Which K-Drama filming location in Korea is on your travel list?`,
      blogTitle: '인천 송도 가볼만한곳 K-드라마 촬영지 센트럴파크·트라이보울 문화 산책',
      blogKeywords: ['송도 가볼만한곳', '인천 관광지', '트라이보울', '송도 센트럴파크', '인천 문화예술', '외국인 한국문화체험']
    },
    incheon_tourism: {
      angle: `Highlighting Incheon's diverse cultural tourism corridor—from Songdo Central Park, Hanok Village, and Tri-bowl to the historic late-19th-century Gaehangjang Open Port district.`,
      reelsHook: {
        kr: '과거와 미래가 만나는 인천 문화 산책 코스',
        en: 'Incheon’s Past & Future in One Day!'
      },
      reelsLines: [
        'Gaehangjang 19th-century port',
        'Songdo Central Park & Hanok',
        'Tri-bowl cultural arts space',
        'Calm tea & gayageum in Songdo'
      ],
      reelsCaption:
        'From historic Open Port galleries to Songdo Central Park & Korean arts! Incheon guide: {{BOOKING_URL}}',
      igCards: [
        {
          title: { kr: '인천 문화예술 산책 코스', en: 'Incheon Arts Walk' },
          body: {
            kr: '개항장의 근대 건축 갤러리부터 송도 센트럴파크까지 이어지는 인천 문화 여행 코스예요.',
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
          title: { kr: '송도에서 만나는 전통예술', en: 'Songdo Arts Guide' },
          body: {
            kr: '센트럴파크 인근 솜씨(SOMSSI)가 전하는 인천 문화·클래스 안내는 {{BOOKING_URL}} 를 참고하세요.',
            en: 'Curated by SOMSSI near Songdo Central Park. See details at {{BOOKING_URL}}'
          }
        }
      ],
      igCaption: `인천은 19세기 개항기의 역사를 간직한 개항장 문화지구·차이나타운부터 바닷물이 흐르는 송도 센트럴파크와 한옥마을, 복합문화공간 트라이보울까지 다채로운 매력을 지닌 문화예술 도시예요. 인천 여행 중 송도 센트럴파크 인근에서 한복과 전통 다과, 12현 가야금의 여운을 경험하고 싶다면 솜씨(SOMSSI)의 문화 가이드를 확인해 보세요.\n\nExploring Incheon beyond the airport? Pair a morning walk through the historic Gaehangjang Open Port district with an afternoon at Songdo Central Park, Hanok Village, and SOMSSI's cultural studio (about ${airportMin} mins from Incheon Int'l Airport). Guide: {{BOOKING_URL}}`,
      threadsText: `When people think of Incheon, they often only picture the airport—but have you explored Songdo Central Park's Hanok Village or the 19th-century galleries of Gaehangjang Open Port? Right near Songdo Central Park, we also share traditional Korean tea and #gayageum (가야금) culture at SOMSSI ({{BOOKING_URL}}). What is your favorite hidden neighborhood in Korea?`,
      blogTitle: '인천 관광지 추천 개항장 문화지구부터 송도 센트럴파크 한옥마을 코스',
      blogKeywords: ['인천 관광지', '송도 가볼만한곳', '개항장 문화지구', '송도 한옥마을', '인천 문화예술', '인천 이색체험']
    },
    incheon_food_tea: {
      angle: `Introducing Incheon's culinary & tea heritage: pairing vibrant local flavors like Sinpo International Market dakgangjeong and Chinatown delicacies with serene traditional Korean tea and handmade dagwa (yakgwa, dasik) in Songdo.`,
      reelsHook: {
        kr: '신포 닭강정부터 전통 다과까지 인천 미식 여행',
        en: 'Incheon Food & Korean Tea Rituals!'
      },
      reelsLines: [
        'Sinpo Market crispy dakgangjeong',
        'Incheon Chinatown local eats',
        'Songdo Korean tea & yakgwa',
        'Sweet calm with 12 silk strings'
      ],
      reelsCaption:
        'Taste Incheon’s street food & unwind with traditional Korean tea and dagwa in Songdo! {{BOOKING_URL}}',
      igCards: [
        {
          title: { kr: '인천 로컬 미식과 다과', en: 'Incheon Food & Tea' },
          body: {
            kr: '활기찬 전통시장 먹거리부터 고요한 한국의 다도·다과 문화까지 인천의 맛을 소개해요.',
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
          title: { kr: '송도에서 즐기는 다도와 소리', en: 'Tea & Music Studio' },
          body: {
            kr: '전통 차·다과와 가야금 선율이 함께하는 송도 솜씨(SOMSSI) 소식은 {{BOOKING_URL}} 에서 만나보세요.',
            en: 'Experience traditional tea, refreshments, and gayageum at SOMSSI: {{BOOKING_URL}}'
          }
        }
      ],
      igCaption: `인천 미식 여행의 매력은 활기찬 로컬 먹거리와 정갈한 전통 다과 문화를 하루에 모두 만날 수 있다는 점이에요! 신포국제시장의 바삭한 닭강정이나 차이나타운 별미를 맛본 뒤, 송도 센트럴파크 인근에서 은은한 한국 전통 차와 다과를 곁들이며 차분한 오후를 보내보세요.\n\nLooking for the ultimate Incheon food & tea itinerary? Start with Sinpo International Market's famous sweet-and-spicy dakgangjeong, then head to Songdo Central Park to enjoy traditional Korean tea, refreshments, and cultural serenity at SOMSSI. Details: {{BOOKING_URL}}`,
      threadsText: `Are you team savory street food or team quiet tea house when traveling in Korea? In Incheon, you can try crispy dakgangjeong at Sinpo Market and then relax near Songdo Central Park with traditional Korean tea, refreshments, and #gayageum (가야금) melodies at SOMSSI ({{BOOKING_URL}}). What is your favorite Korean snack or dessert?`,
      blogTitle: '인천 미식 여행 신포국제시장 먹거리와 송도 한국 전통 다과·차 문화',
      blogKeywords: ['인천 맛집', '신포국제시장', '송도 가볼만한곳', '한국 전통 다과', '인천 여행 코스', '외국인 한국문화체험']
    },
    korean_tradition: {
      angle: `Sharing the philosophy of Korean traditional aesthetics—how natural paulownia wood, 12 twisted silk strings, and the graceful curved lines of Hanbok invite mindfulness in modern life.`,
      reelsHook: {
        kr: '오동나무와 명주실 12줄이 만드는 한국의 여운',
        en: 'The Calm Beauty of 12 Silk Strings'
      },
      reelsLines: [
        'Paulownia wood & 12 silk strings',
        'Bare fingertips, no picks used',
        'Nonghyeon: gentle vibrato',
        'Hanbok lines & quiet mindfulness'
      ],
      reelsCaption:
        'Discover the natural harmony of Korean Hanbok & the 12-string gayageum in Songdo. {{BOOKING_URL}}',
      igCards: [
        {
          title: { kr: '한국 전통 미학의 여백', en: 'Korean Aesthetics' },
          body: {
            kr: '자연 소재를 그대로 살린 한복의 고운 선과 국악기의 깊은 울림이 주는 휴식을 소개해요.',
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
          title: { kr: '송도에서 만나는 전통문화', en: 'Songdo Heritage' },
          body: {
            kr: '송도 센트럴파크 인근 솜씨(SOMSSI)의 한국 전통문화 이야기는 {{BOOKING_URL}} 에서 확인하세요.',
            en: 'Explore Korean traditional culture with SOMSSI in Songdo at {{BOOKING_URL}}'
          }
        }
      ],
      igCaption: `빠르게 흘러가는 일상 속에서 한국 전통 문화가 지닌 가장 큰 매력은 '비움과 여운'이에요. 오동나무 울림통과 명주실 12줄, 기러기 발 모양의 안족으로 이루어진 가야금은 피크 없이 맨손끝으로 줄을 뜯고 왼손으로 '농현'을 더해 한 음 한 음에 깊은 숨결을 담아냅니다. 송도 센트럴파크 인근 솜씨(SOMSSI)에서 한국 전통의 소리와 한복의 아름다움을 전해드려요.\n\nWhy does traditional Korean music feel so grounding? Played with bare fingertips on 12 silk strings over paulownia wood, the gayageum celebrates the space between notes. Discover Korean traditional culture with SOMSSI in Songdo: {{BOOKING_URL}}`,
      threadsText: `Did you know the traditional Korean 12-string #gayageum (가야금) is played with bare fingertips rather than picks, resting silk strings on wooden bridges shaped like wild-goose feet (안족)? We love sharing these quiet Korean cultural stories from our studio in Songdo ({{BOOKING_URL}}). What traditional craft or art form fascinates you most?`,
      blogTitle: '한국 전통 문화 이야기 오동나무와 명주실 12현 가야금과 한복의 미학',
      blogKeywords: ['한국 전통 문화', '가야금', '한복 체험', '송도 가볼만한곳', '인천 문화예술', '외국인 한국문화체험']
    }
  };

  const cfg = pillarConfigs[pillar] || pillarConfigs.incheon_tourism;

  const naverSections = [
    {
      h2: '한국 전통 문화와 인천·송도 로컬 문화예술이 만나는 특별한 여정',
      body: `한국을 찾는 외국인 개별 여행객(FIT)과 국내 체류 외국인, 그리고 주말 나들이를 계획하는 분들에게 인천은 공항 그 이상의 깊은 문화적 매력을 지닌 도시예요. 최근 글로벌 K-팝과 K-드라마를 통해 한국의 전통 미학과 현대적인 도시 풍경이 동시에 주목받으면서, 드라마와 뮤직비디오 촬영지로 사랑받는 **송도 센트럴파크**와 물 위에 떠 있는 듯한 복합문화공간 **트라이보울**, 고즈넉한 기와지붕이 인상적인 **송도 한옥마을**, 그리고 19세기 말 개항기의 근대 건축물들이 갤러리와 박물관으로 보존된 **개항장 문화지구**가 대표적인 인천 관광지 코스로 손꼽히고 있어요. 바닷물이 흐르는 센트럴파크 수로를 따라 수상택시를 타거나 산책로를 걸으며 현대 건축과 전통 한옥의 조화를 감상하는 시간은 사계절 내내 특별한 영감을 주는 인천 문화예술 여행의 백미예요.`
    },
    {
      h2: '신포국제시장·차이나타운 로컬 미식부터 고요한 한국 전통 다과·차 문화까지',
      body: `여행에서 빼놓을 수 없는 즐거움은 단연 지역의 역사와 삶이 담긴 음식이에요. 인천에서는 백 년 넘는 역사를 지닌 **차이나타운**의 다채로운 중화 미식과 **신포국제시장**의 매콤달콤하고 바삭한 닭강정을 맛보며 활기찬 로컬 시장의 에너지를 오감으로 느낄 수 있어요. 활기찬 골목 미식 탐방을 마친 오후에는 송도 센트럴파크 인근의 조용한 실내 문화 공간으로 자리를 옮겨 따뜻한 한국 전통 차와 정갈한 계절 다과(약과·다식·정과 등)를 곁들이며 차분하게 휴식을 취하는 코스가 외국인 한국문화체험으로도 큰 호응을 얻고 있어요. 자극적이지 않고 은은하게 퍼지는 한국 전통 차의 향기와 손으로 빚은 다과의 달콤함은 여행의 피로를 부드럽게 풀어주며 한국적인 환대의 정서를 느끼게 해준답니다.`
    },
    {
      h2: '오동나무와 명주실 12줄이 전하는 한국 고유의 소리, 가야금과 한복 이야기',
      body: `한국의 전통 예술과 미학을 이야기할 때 빼놓을 수 없는 상징이 바로 자연스러운 곡선미를 지닌 전통 의복 **한복**과 12현 전통 현악기 **가야금**이에요. 가야금은 속을 비워낸 오동나무 울림통 위에 명주실 12줄과 기러기 발 모양의 나무 기둥인 안족(雁足)을 얹어 만드는데, 인위적인 피크를 쓰지 않고 오른손 끝으로 직접 줄을 뜯고 왼손으로 줄을 지그시 누르거나 흔드는 **농현(弄絃)** 기법을 통해 자연의 바람과 물결을 닮은 깊은 여운을 만들어내요. 최근 다양한 K-컬처 음악과 예술 무대에서도 이러한 국악 현악기의 독창적인 음색이 자주 조명되면서, 귀로만 듣던 한국의 소리를 직접 손끝으로 뜯어보고 한복의 단아한 실루엣을 경험하려는 국내외 여행객들의 발길이 꾸준히 이어지고 있어요.`
    },
    {
      h2: '송도 센트럴파크 인근에서 만나는 솜씨(SOMSSI) 문화 큐레이션 및 이용 안내',
      body: `저희 **솜씨(SOMSSI)**는 인천 송도 센트럴파크 인근(인천국제공항에서 택시 또는 공항리무진 약 ${airportMin}분 거리)에서 한국 전통 문화와 인천 지역의 아름다운 문화·예술·관광 소식을 정기적으로 전하고 있어요. 매주 정기적으로 운영되는 **솜씨(SOMSSI) 가야금·한복 원데이클래스**(총 120분 소요, 한복 착용·전통 다과 및 차·자체 교재 《줄을 다루는 솜씨》를 활용한 아리랑 주선율 레슨 포함, 1인 99,000 KRW 부가세 포함, 한국어·영어 동시 진행)를 통해 악보를 전혀 읽지 못하는 음악 입문자와 6시간 이상 여유가 있는 인천공항 환승객(공항 밖으로 나가기 전 비자·K-ETA 요건을 꼭 확인하세요)도 부담 없이 한국의 대표 민요 아리랑을 완주하실 수 있어요. 호텔 컨시어지 및 인바운드 여행사 담당자분들께서도 인천 송도·개항장 관광 코스와 연계해 외국인 VIP 투숙객에게 안심하고 추천하실 수 있으며, 자세한 문화 가이드와 클래스 예약 안내는 {{BOOKING_URL}} 에서 언제든 확인하실 수 있어요.`
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
      en_summary: `Discover Incheon's vibrant cultural landscape—from K-Drama filming spots at Songdo Central Park, Tri-bowl, and Songdo Hanok Village to the historic 19th-century Gaehangjang Open Port and Sinpo Market culinary scene. Near Songdo Central Park (about ${airportMin} minutes from Incheon Int'l Airport), SOMSSI also hosts a 120-minute gayageum, Hanbok, and traditional tea one-day class (99,000 KRW per person, VAT included; for 6+ hour layovers, check your visa / K-ETA eligibility before leaving the airport). Explore our cultural guide and booking details at {{BOOKING_URL}}.`,
      keywords: cfg.blogKeywords
    },
    facts_used: [
      { fact: 'Incheon cultural & tourism landmarks: Songdo Central Park, Hanok Village, Tri-bowl, Gaehangjang Open Port', source: 'rag' },
      { fact: 'Incheon culinary & traditional tea culture: Sinpo International Market, Chinatown, traditional Korean tea & dagwa', source: 'rag' },
      { fact: 'Gayageum 12-string paulownia & silk string heritage and nonghyeon technique', source: 'rag' },
      { fact: 'SOMSSI studio location near Songdo Central Park (25 mins from Incheon Airport) & 120-min class info (99,000 KRW)', source: 'ground_truth' }
    ],
    reviewer_notes: [
      `주간 편성 전략에 따라 문화·관광·예술 매거진 모드(${pillar})로 작성되었으며, 하단에 송도 솜씨(SOMSSI) 가이드를 자연스럽게 연결했습니다.`
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

  const isLayoverFocused =
    skip || /layover|transit|환승|경유|공항|airport/i.test(`${trend.title} ${trend.summary}`);

  const angle = skip
    ? `Today's trend has low relevance to traditional music (score ${score}/10), so we pivot to an evergreen theme: how travelers with a ${minLayover}+ hour Incheon Airport layover or a quiet day in Songdo can wear Hanbok, sip traditional tea, and learn to play "Arirang" on the 12-string gayageum in 120 minutes.`
    : `[주 2회 정기 클래스 알림] Connecting "${trend.title}" directly to SOMSSI's 120-minute gayageum & Hanbok class (《줄을 다루는 솜씨》) in Songdo, where visitors pluck the 12 silk strings themselves and learn "Arirang".`;

  const reelsCaption = isLayoverFocused
    ? `${minLayover}h+ Incheon layover? 25m to Songdo for gayageum & Hanbok! Check your visa / K-ETA eligibility before leaving the airport. {{BOOKING_URL}}`
    : `Hear Korean strings in Songdo! Wear Hanbok & learn "Arirang" on the 12-string gayageum in 120 mins. Book via {{BOOKING_URL}}`;

  const igCaption = isLayoverFocused
    ? `긴 인천공항 환승 시간(${minLayover}시간 이상)이나 송도 여행 중 특별한 한국 문화를 경험하고 싶다면, 송도 센트럴파크 인근 솜씨(SOMSSI)에서 120분 동안 한복을 입고 전통 다과와 차를 즐기며 12현 가야금으로 '아리랑' 주선율을 직접 연주해 보세요. 공항 밖으로 나가기 전 비자·K-ETA 요건을 꼭 확인하세요.\n\nHave a ${minLayover}+ hour layover at Incheon Int'l Airport or exploring Songdo? Just ${airportMin} minutes away by taxi or airport limousine, join SOMSSI for a 120-minute session (including Hanbok fitting, traditional tea & refreshments, and lesson) for 99,000 KRW per person (VAT included). Check your visa / K-ETA eligibility before leaving the airport. Book: {{BOOKING_URL}}`
    : `최근 한국 전통 현악기 사운드에 매력을 느끼셨나요? 인천 송도 센트럴파크 인근 솜씨(SOMSSI) 가야금·한복 원데이클래스에서 120분 동안 한복 착용과 전통 다과·차를 즐기며 자체 교재 《줄을 다루는 솜씨》로 '아리랑' 주선율을 배워보세요. 악보를 읽지 못하는 입문자도 편안하게 참여할 수 있어요.\n\nCurious about the resonant sound of the 12-string gayageum? In Songdo, Incheon (about ${airportMin} minutes from Incheon Int'l Airport), spend 120 minutes in Hanbok with traditional tea and learn to play "Arirang" for 99,000 KRW per person, VAT included. Reserve at {{BOOKING_URL}}`;

  const naverSections = [
    {
      h2: skip
        ? '인천 송도 가볼만한곳, 날씨와 계절에 구애받지 않는 실내 한국문화체험'
        : '글로벌 여행객이 주목하는 한국 전통 현악기의 울림과 로컬 체험 트렌드',
      body: skip
        ? `인천 송도를 찾는 외국인 개별 여행객(FIT)이나 인천국제공항에서 ${minLayover}시간 이상 긴 환승 시간을 보내는 여행객들에게 가장 큰 고민은 이동 부담이 적으면서도 한국적인 정취를 깊이 있게 느낄 수 있는 코스를 찾는 일이에요. 공항 밖으로 나가기 전 비자·K-ETA 요건을 꼭 확인하세요. 송도 센트럴파크 인근에 자리한 **솜씨(SOMSSI) 가야금·한복 원데이클래스**는 인천국제공항에서 택시 또는 공항리무진으로 약 ${airportMin}분 거리에 위치해 접근성이 뛰어나고, 쾌적한 실내 공간에서 진행되어 비 오는 날이나 무더위, 추위에도 안정적인 일정을 소화할 수 있어요. 단순한 관람이나 사진 촬영에 그치지 않고 직접 한국의 소리와 의복, 다과를 오감으로 경험할 수 있는 인천 이색체험 프로그램이에요.`
        : `최근 K-컬처와 한국 여행 트렌드에서 눈여겨볼 흐름은 단순한 랜드마크 방문을 넘어 한국의 전통 사운드와 공예, 로컬 문화를 직접 손으로 경험하려는 외국인 여행객들의 관심이에요. 특히 우아한 현악 선율에 매력을 느낀 해외 여행객과 국내 체류 외국인들은 한국 고유 12현 현악기인 가야금을 직접 보고 연주해 볼 수 있는 가야금 원데이클래스를 적극적으로 찾고 있어요. 인천 송도 센트럴파크 인근에서 운영되는 **솜씨(SOMSSI) 가야금·한복 원데이클래스**는 인천국제공항에서 택시 또는 공항리무진으로 약 ${airportMin}분이면 닿을 수 있어 송도 가볼만한곳을 찾는 여행객은 물론 ${minLayover}시간 이상 여유가 있는 환승객에게도 알맞은 외국인 한국문화체험이에요. 공항 밖으로 나가기 전 비자·K-ETA 요건을 꼭 확인하세요.`
    },
    {
      h2: '악보를 몰라도 괜찮아요, 자체 교재 《줄을 다루는 솜씨》로 배우는 아리랑',
      body: `현악기를 처음 접하는 분들도 걱정할 필요가 없어요. 솜씨(SOMSSI) 클래스는 음악적 배경지식이 전혀 없는 입문자를 위해 자체 제작한 교재 **《줄을 다루는 솜씨》**를 바탕으로 수업을 진행해요. 복잡한 오선보 대신 직관적인 가이드에 따라 오동나무 울림통 위 명주실 12줄을 오른손 끝으로 뜯고, 기러기 발 모양의 안족 위에서 왼손으로 줄을 누르며 여운을 만드는 기본 주법을 차근차근 익힐 수 있어요. 한국어와 영어(KR / EN)로 친절하게 안내가 이루어지기 때문에 외국인 참가자도 부담 없이 따라오며 한국의 대표 민요인 **아리랑**의 주선율을 직접 연주하는 성취감을 느낄 수 있답니다.`
    },
    {
      h2: '120분 동안 여유롭게 즐기는 한복·전통 다과·가야금 원데이클래스 흐름',
      body: `전체 프로그램은 한복 착용을 포함해 총 **120분** 동안 체계적이고 여유로운 흐름으로 구성되어 있어요.\n- **웰컴 티타임 및 한복 착용**: 수업 공간에 도착하면 전통 차와 다과를 즐기며 단아한 한복을 골라 입어요.\n- **가야금 구조 이해와 기초 주법 연습**: 자체 교재 《줄을 다루는 솜씨》를 활용해 12현 가야금의 구조와 손가락 자세를 배워요.\n- **아리랑 주선율 단계별 레슨**: 강사의 한·영 안내에 맞춰 한 소절씩 아리랑 멜로디를 연결해 연주해요.\n- **연주 기록 및 포토타임**: 한복을 입고 가야금을 연주하는 모습을 사진과 영상으로 남기며 특별한 추억을 완성해요.`
    },
    {
      h2: '이용 안내 및 호텔 컨시어지·여행사 B2B 추천 포인트와 예약 방법',
      body: `솜씨(SOMSSI) 가야금·한복 원데이클래스의 투명한 이용 조건과 포함 내역을 안내해 드려요.\n- **상품명**: 솜씨(SOMSSI) 가야금·한복 원데이클래스 (SOMSSI Gayageum & Hanbok One-Day Class)\n- **위치**: 인천 송도 — 송도 센트럴파크 인근 (인천국제공항에서 택시 또는 공항리무진 약 ${airportMin}분)\n- **소요 시간**: 120분 (한복 착용 포함)\n- **이용 요금**: 1인 99,000 KRW (부가세 포함)\n- **포함 내역**: 수업 중 가야금 대여, 한복 대여, 전통 차 및 다과, 가야금 레슨\n- **진행 언어**: 한국어 / 영어 (KR / EN)\n\n호텔 컨시어지 및 인바운드 여행사 담당자분들께서는 120분 정시 운영과 추가 비용 없는 올인클루시브 정찰가(1인 99,000원, 부가세 포함), 그리고 한·영 진행 시스템을 갖추고 있어 외국인 VIP 투숙객이나 소규모 FIT 고객에게 안심하고 추천하실 수 있어요. 수업 일정 확인 및 예약은 {{BOOKING_URL}} 에서 바로 진행하실 수 있어요.`
    }
  ];

  const reviewerNotes = [];
  if (skip) {
    reviewerNotes.push(
      `Input trend "${trend.title}" scored ${score}/10 (< 5), so skip=true was set and evergreen Songdo/layover content was generated per Section 5.`
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
        kr: '송도에서 120분 만에 가야금 아리랑 연주하기',
        en: 'Play Korean gayageum in 120 mins!'
      },
      onscreen_text: [
        '25 mins from Incheon Airport',
        'Wear Hanbok & sip Korean tea',
        'Learn Arirang on 12 strings',
        '99,000 KRW all-inclusive'
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
            kr: '12줄 명주실의 깊은 울림',
            en: '12 Silk Strings'
          },
          body: {
            kr: '인천 송도 센트럴파크 인근에서 직접 손끝으로 뜯어보는 한국 전통 가야금 원데이클래스예요.',
            en: 'Pluck the traditional 12-string gayageum yourself near Songdo Central Park.'
          }
        },
        {
          title: {
            kr: isLayoverFocused ? '긴 환승·송도 여행 코스' : 'K-사운드 직접 배워보기',
            en: isLayoverFocused ? `${minLayover}h+ Layover Idea` : 'Try Korean Music'
          },
          body: {
            kr: isLayoverFocused
              ? `인천공항에서 약 ${airportMin}분! ${minLayover}시간 이상 환승객과 여행객을 위한 실내 체험이에요.`
              : '듣기만 하던 한국 전통 현악기 사운드를 송도 실내 공간에서 직접 배워볼 수 있어요.',
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
            kr: '한복 착용과 전통 다과·차, 자체 교재 《줄을 다루는 솜씨》로 배우는 아리랑 레슨까지 포함돼요.',
            en: 'Includes Hanbok fitting, traditional tea & refreshments, and playing "Arirang".'
          }
        },
        {
          title: {
            kr: '1인 99,000원 예약 안내',
            en: '99,000 KRW / Person'
          },
          body: {
            kr: '부가세 포함 정찰가, 한·영 진행! 지금 프로필의 {{BOOKING_URL}} 에서 예약하세요.',
            en: 'VAT included, taught in KR/EN. Book your session now at {{BOOKING_URL}}'
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
      text: `Have you ever plucked a 12-string #gayageum (가야금) while wearing Hanbok? At SOMSSI near Songdo Central Park (about ${airportMin} mins from Incheon Int'l Airport), complete beginners sip traditional tea and learn to play the main melody of "Arirang" in 120 minutes using our textbook 《줄을 다루는 솜씨》 (99,000 KRW, VAT included). Details at {{BOOKING_URL}} ✨ What Korean traditional instrument or craft have you always wanted to try?`
    },
    naver_blog: {
      title: '송도 가볼만한곳 솜씨 가야금·한복 120분 원데이클래스 안내',
      sections: naverSections,
      en_summary: `SOMSSI offers a 120-minute gayageum and Hanbok one-day class near Songdo Central Park in Incheon, about ${airportMin} minutes from Incheon International Airport by taxi or airport limousine. Priced at 99,000 KRW per person (VAT included), the session includes gayageum use, Hanbok rental, traditional tea and refreshments, and a beginner-friendly lesson in Korean and English where guests learn to play "Arirang". It is suitable for independent travelers and transit passengers with layovers of ${minLayover} hours or more (check your visa / K-ETA eligibility before leaving the airport), and booking is available at {{BOOKING_URL}}.`,
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
      { fact: "Curriculum basis: SOMSSI's own textbook 《줄을 다루는 솜씨》", source: 'ground_truth' },
      { fact: 'Location: Songdo, Incheon — Near Songdo Central Park (about 25 minutes from Incheon Int\'l Airport by taxi or airport limousine)', source: 'ground_truth' },
      { fact: 'Duration: 120 minutes (including Hanbok fitting)', source: 'ground_truth' },
      { fact: 'Price: 99,000 KRW per person, VAT included', source: 'ground_truth' },
      { fact: 'Included: Gayageum use during class, Hanbok rental, traditional tea & refreshments, lesson', source: 'ground_truth' },
      { fact: 'Outcome: Beginners with no musical background learn to play the main melody of "Arirang"', source: 'ground_truth' },
      { fact: 'Languages of instruction: KR / EN', source: 'ground_truth' },
      { fact: 'Layover eligibility: 6 hours or more + visa / K-ETA eligibility notice', source: 'ground_truth' },
      { fact: '120-minute 4-stage session flow & B2B concierge recommendation points', source: 'rag' }
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
        ? { kr: '송도 120분 가야금·한복 체험', en: '120-min Gayageum in Songdo!' }
        : wantsLayover
          ? { kr: '인천공항 6시간+ 환승할 때 뭐하지?', en: '6h+ Incheon layover idea!' }
          : { kr: '손끝으로 뜯는 12현 가야금 아리랑', en: 'Pluck Arirang on 12 silk strings!' },
      caption: wantsLayover
        ? '6h+ Incheon layover? 25m to Songdo for gayageum & Hanbok! Check your visa / K-ETA eligibility before leaving the airport. {{BOOKING_URL}}'
        : wantsShorter
          ? '120-min gayageum & Hanbok class in Songdo (99,000 KRW). Book: {{BOOKING_URL}}'
          : 'Try a 120-min gayageum, Hanbok & tea session in Songdo for 99,000 KRW! Book via {{BOOKING_URL}}'
    };
  } else if (channel === 'instagram_feed') {
    const cards = JSON.parse(JSON.stringify(prev.instagram_feed.cards));
    if (wantsShorter) {
      cards[0].body = {
        kr: '송도 센트럴파크 인근에서 즐기는 120분 가야금·한복 원데이클래스예요.',
        en: '120-min gayageum & Hanbok class near Songdo Central Park.'
      };
    } else if (wantsLayover) {
      cards[1] = {
        title: { kr: '6시간 이상 환승 추천', en: 'For 6h+ Layovers' },
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
        ? 'Ever tried the 12-string #gayageum (가야금) in Hanbok? At SOMSSI in Songdo (25m from Incheon Airport), beginners sip Korean tea and learn to play "Arirang" in 120 mins for 99,000 KRW (VAT included). Check out {{BOOKING_URL}} — what Korean song would you love to hear on traditional strings?'
        : wantsLayover
          ? 'Got a 6+ hour layover at Incheon Int\'l Airport? Just 25 mins away in Songdo, you can wear Hanbok, sip traditional tea, and learn "Arirang" on the 12-string #gayageum (가야금) in 120 mins (99,000 KRW). Check your visa / K-ETA eligibility before leaving the airport! Info: {{BOOKING_URL}} — how do you spend long layovers?'
          : prev.threads.text
    };
  } else if (channel === 'naver_blog') {
    const updatedSections = JSON.parse(JSON.stringify(prev.naver_blog.sections));
    if (wantsB2B && updatedSections.length > 0) {
      updatedSections[updatedSections.length - 1].h2 =
        '호텔 컨시어지·인바운드 여행사 B2B 추천 이유 및 이용·예약 안내';
    }
    output.naver_blog = {
      ...prev.naver_blog,
      title: wantsShorter
        ? '송도 가볼만한곳 솜씨 가야금 원데이클래스'
        : wantsB2B
          ? '외국인 한국문화체험 송도 솜씨 가야금 원데이클래스'
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

  const enBlogSections =
    contentType === 'culture_magazine'
      ? [
          {
            h2: '1. Where Korean Tradition Meets Modern Incheon & Songdo Arts',
            body: `Beyond being Korea's main international gateway, Incheon is a vibrant city where 19th-century history, futuristic architecture, and serene Korean traditions coexist. Global fans of K-Pop and K-Drama frequently visit **Songdo Central Park**, the floating **Tri-bowl** cultural arts center, tranquil **Songdo Hanok Village**, and the historic **Gaehangjang Open Port** district.`
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
            h2: '4. Cultural Guide & SOMSSI One-Day Class in Songdo',
            body: `Located near Songdo Central Park (about ${airportMin} minutes from Incheon Int'l Airport by taxi or airport limousine), **SOMSSI** curates local cultural stories and hosts a 120-minute Gayageum & Hanbok One-Day Class (99,000 KRW per person, VAT included; taught in KR/EN using our textbook 《줄을 다루는 솜씨》). Suitable for independent travelers and transit passengers with layovers of ${minLayover}+ hours (check your visa / K-ETA eligibility before leaving the airport). Learn more at {{BOOKING_URL}}.`
          }
        ]
      : [
          {
            h2: '1. Hands-On Korean Traditional Music in Songdo, Incheon',
            body: `Travelers visiting Korea and transit guests with a ${minLayover}+ hour layover at Incheon International Airport (check your visa / K-ETA eligibility before leaving the airport) are increasingly looking for calm, indoor cultural experiences. Located near Songdo Central Park—about ${airportMin} minutes from the airport by taxi or airport limousine—**SOMSSI Gayageum & Hanbok One-Day Class** lets guests experience Korean strings, attire, and tea in one place.`
          },
          {
            h2: '2. Learn "Arirang" with Our Beginner Textbook 《줄을 다루는 솜씨》',
            body: `No musical background or sheet-music reading is required. Using SOMSSI's in-house textbook **《줄을 다루는 솜씨》**, instructors guide participants in Korean and English through plucking the 12 silk strings with bare fingertips and pressing the movable wooden bridges (**anjok**) to play the main melody of **"Arirang"**.`
          },
          {
            h2: '3. The 120-Minute Session Flow: Hanbok, Tea & Gayageum',
            body: `- **Welcome Tea & Hanbok Fitting (25 min)**: Enjoy traditional Korean tea and refreshments while choosing your Hanbok.\n- **Gayageum Basics (30 min)**: Learn posture and basic plucking techniques.\n- **Step-by-Step "Arirang" Lesson (45 min)**: Connect each phrase of Arirang at a comfortable pace.\n- **Performance Recording & Photo Time (20 min)**: Capture photos and videos playing the gayageum in Hanbok.`
          },
          {
            h2: '4. All-Inclusive Pricing, B2B Concierge Info & Booking',
            body: `- **Product**: SOMSSI Gayageum & Hanbok One-Day Class\n- **Location**: Songdo, Incheon — Near Songdo Central Park\n- **Duration**: 120 minutes (including Hanbok fitting)\n- **Price**: 99,000 KRW per person, VAT included\n- **Included**: Gayageum use during class, Hanbok rental, traditional tea & refreshments, lesson\n\nHotel concierges and travel agencies can confidently recommend this fixed-schedule, all-inclusive session to international guests. Reserve directly at {{BOOKING_URL}}.`
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
      '추천 실사: 정갈한 전통 다과(약과·다식)와 따뜻한 찻잔, 그리고 교재 《줄을 다루는 솜씨》가 함께 보이는 테이블 컷',
      '추천 실사: 한복을 입고 가야금을 연주하는 측면 실루엣 또는 스튜디오 안내 사인보드 컷'
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
          ? '인천 로컬 미식 & 전통 다과·교재 이야기'
          : i === 2
            ? '120분 프로그램 흐름 · 한복 & 가야금 아리랑'
            : '솜씨(SOMSSI) 이용 안내 · 1인 99,000원 정찰제',
    bannerSubtitleEn:
      enBlogSections[i]?.h2 || 'SOMSSI Songdo Gayageum & Korean Culture Guide',
    photoGuide:
      i === 0
        ? '대표 썸네일 / 섹션 1: 송도 센트럴파크 한옥마을 또는 스튜디오 전경 사진'
        : i === 1
          ? '섹션 2: 자체 교재 《줄을 다루는 솜씨》 또는 인천 로컬 미식·전통 다과 클로즈업'
          : i === 2
            ? '섹션 3: 120분 4단계 타임테이블 인포그래픽 카드 (우측 다운로드 버튼으로 즉시 생성 가능)'
            : '섹션 4: 포함내역·소요시간·위치 요약 인포그래픽 카드',
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
          ? 'Incheon & Songdo Cultural Travel Guide: K-Drama Spots, Local Food & Gayageum'
          : 'SOMSSI Songdo 120-Minute Gayageum & Hanbok One-Day Class Guide (Incheon)',
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
    promptBundle,
    extras
  };
}
