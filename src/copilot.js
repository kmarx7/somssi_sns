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
  'hanbok',
  'tea',
  'arirang',
  'incheon',
  'songdo',
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
  '환승',
  '경유',
  '아리랑',
  '다과',
  '원데이클래스',
  '외국인',
  '문화',
  '체험'
];

/**
 * Resolves the executable path for a subscription CLI tool if installed on the system.
 */
export function resolveSubscriptionCliBinary(provider) {
  const candidates = CLI_PATHS[provider] || [];
  for (const candidate of candidates) {
    if (candidate.startsWith('/') && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[candidates.length - 1] || null;
}

/**
 * Returns status of available subscription providers on the host system.
 */
export function getSubscriptionProvidersStatus() {
  return [
    {
      id: 'claude-cli',
      name: 'Claude Pro/Max 구독 (Claude CLI)',
      installed: fs.existsSync('/Users/kapital/.local/bin/claude'),
      mode: 'cli-subscription'
    },
    {
      id: 'codex-cli',
      name: 'ChatGPT Plus/Pro 구독 (Codex CLI)',
      installed: fs.existsSync('/opt/homebrew/bin/codex'),
      mode: 'cli-subscription'
    },
    {
      id: 'gemini-cli',
      name: 'Gemini Advanced 구독 (Gemini CLI)',
      installed: fs.existsSync('/Users/kapital/.hermes/node/bin/gemini'),
      mode: 'cli-subscription'
    },
    {
      id: 'web-subscription',
      name: '웹 브라우저 구독 연동 (ChatGPT / Claude / Gemini 웹 복사·붙여넣기)',
      installed: true,
      mode: 'web-subscription'
    },
    {
      id: 'local-rule-engine',
      name: '내장 솜씨 룰 엔진 (즉시 생성 · 오프라인)',
      installed: true,
      mode: 'local'
    }
  ];
}

/**
 * Builds a complete, ready-to-paste prompt bundle for Web Subscription users
 * (ChatGPT Plus, Claude Pro Projects, Gemini Gems) or CLI subscription execution.
 */
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
    'Return ONLY a single valid JSON object conforming strictly to this schema (no markdown code fences around the response if possible, no extra commentary):',
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

/**
 * Extracts a JSON object from raw CLI or pasted web LLM output (even if wrapped in ```json ... ```).
 */
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

/**
 * Executes a local subscription-authenticated CLI (`claude`, `codex`, `gemini`) without any paid API key.
 */
export function callSubscriptionCli(provider, combinedPrompt, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const bin = resolveSubscriptionCliBinary(provider);
    if (!bin) {
      return reject(new Error(`Unknown subscription CLI provider: ${provider}`));
    }

    let args = [];
    if (provider === 'claude-cli') {
      args = ['-p', combinedPrompt, '--output-format', 'text'];
    } else if (provider === 'codex-cli') {
      args = ['exec', combinedPrompt];
    } else if (provider === 'gemini-cli') {
      args = ['-p', combinedPrompt];
    } else {
      return reject(new Error(`Unsupported CLI provider: ${provider}`));
    }

    const child = spawn(bin, args, {
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

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

/**
 * Scores how naturally a trend connects to the SOMSSI 120-min gayageum class (0–10).
 */
export function scoreTrendFit(trend = {}) {
  const text = `${trend.title || ''} ${trend.summary || ''}`.toLowerCase();
  let hits = 0;
  for (const kw of CULTURE_KEYWORDS) {
    if (text.includes(kw)) hits += 1;
  }
  if (/gayageum|gugak|가야금|국악|환승|layover|hanbok|한복/.test(text)) {
    hits += 3;
  }
  return Math.min(10, Math.max(1, hits * 2));
}

/**
 * Generates a deterministic, 100% rule-compliant 4-channel draft when running
 * in local rule engine mode or as a fallback.
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

  const score = scoreTrendFit(trend);
  const skip = score < 5;
  const isLayoverFocused =
    skip || /layover|transit|환승|경유|공항|airport/i.test(`${trend.title} ${trend.summary}`);

  const angle = skip
    ? `Today's trend has low relevance to traditional music (score ${score}/10), so we pivot to an evergreen theme: how travelers with a ${minLayover}+ hour Incheon Airport layover or a quiet day in Songdo can wear Hanbok, sip traditional tea, and learn to play "Arirang" on the 12-string gayageum in 120 minutes.`
    : `Connecting "${trend.title}" directly to SOMSSI's 120-minute gayageum & Hanbok class in Songdo, where visitors don't just listen to Korean string music—they pluck the 12 silk strings themselves and learn "Arirang".`;

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

/**
 * Checks whether a revise instruction violates Section 2 (Ground Truth) or Section 3 (NEVER rules).
 */
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

/**
 * Rewrites ONLY the target channel in Revise mode while keeping all other channels identical.
 */
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
 * Main entrypoint for SOMSSI Global Marketing Copilot using Subscription Models (no API key).
 */
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
      // Enforce Revise mode immutability on non-target channels
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
      engineUsed = `fallback:local-rule-engine`;
    }
  } else {
    result =
      input.mode === 'revise'
        ? reviseRuleCompliantDraft(input, groundTruth)
        : generateRuleCompliantDraft(input, groundTruth);
  }

  const validation = validateMarketingOutput(result, groundTruth);
  return {
    output: result,
    validation,
    engineUsed,
    promptBundle
  };
}
