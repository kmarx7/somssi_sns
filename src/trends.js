export const WEEKLY_PILLARS = [
  {
    dayIndex: 1,
    dayKr: '월요일 (Mon)',
    pillar: 'k_pop_drama',
    contentType: 'culture_magazine',
    badge: '문화·예술 뉴스 (주 5회)',
    title: 'K-Pop · K-Drama 최신 문화·예술 뉴스 & 촬영지',
    rssQuery: 'K-pop K-drama Korean traditional culture filming location Incheon'
  },
  {
    dayIndex: 2,
    dayKr: '화요일 (Tue)',
    pillar: 'somssi_class',
    contentType: 'somssi_class',
    badge: '정기 홍보 1/2 (주 2회)',
    title: '《줄을 다루는 솜씨》 송도 120분 가야금·한복 원데이클래스',
    rssQuery: 'Korean traditional music gayageum class Hanbok experience'
  },
  {
    dayIndex: 3,
    dayKr: '수요일 (Wed)',
    pillar: 'incheon_tourism',
    contentType: 'culture_magazine',
    badge: '인천 관광·예술 (주 5회)',
    title: '인천·송도 관광지 & 문화예술 공간 (센트럴파크·한옥마을·개항장)',
    rssQuery: 'Incheon Songdo Central Park Chinatown travel tourism Korea'
  },
  {
    dayIndex: 4,
    dayKr: '목요일 (Thu)',
    pillar: 'incheon_food_tea',
    contentType: 'culture_magazine',
    badge: '인천 미식·전통 다과 (주 5회)',
    title: '인천 로컬 음식 & 한국 전통 다과·차(茶) 문화',
    rssQuery: 'Korean traditional tea dessert yakgwa Incheon food market'
  },
  {
    dayIndex: 5,
    dayKr: '금요일 (Fri)',
    pillar: 'somssi_class',
    contentType: 'somssi_class',
    badge: '정기 홍보 2/2 (주 2회)',
    title: '《줄을 다루는 솜씨》 인천공항 환승 & 주말 송도 가야금 클래스',
    rssQuery: 'Incheon Airport layover tour cultural experience Songdo'
  },
  {
    dayIndex: 6,
    dayKr: '토요일 (Sat)',
    pillar: 'korean_tradition',
    contentType: 'culture_magazine',
    badge: '한국 전통문화 교양 (주 5회)',
    title: '한국 전통 문화·한복·국악과 사계절 풍속 이야기',
    rssQuery: 'Korean traditional culture Hanbok craft heritage gugak'
  },
  {
    dayIndex: 0,
    dayKr: '일요일 (Sun)',
    pillar: 'weekly_curation',
    contentType: 'culture_magazine',
    badge: '위클리 큐레이션 (주 5회)',
    title: '이번 주 인천 & K-컬처 주말 나들이·여행 코스 큐레이션',
    rssQuery: 'Korea weekend travel Incheon Songdo exhibition culture'
  }
];

export const PRESET_TRENDS = [
  {
    id: 'trend-somssi-tue-class',
    pillar: 'somssi_class',
    contentType: 'somssi_class',
    title: "K-pop's recent gugak fusion sound draws global listeners to traditional Korean strings",
    summary:
      'Global music fans are increasingly curious about traditional Korean instruments after hearing gugak string melodies woven into recent K-pop releases, searching for hands-on ways to hear and pluck the gayageum in Korea.',
    source: 'Korea Culture & Tourism Trend Brief (화요일 정기 클래스)',
    language: 'en'
  },
  {
    id: 'trend-somssi-fri-layover',
    pillar: 'somssi_class',
    contentType: 'somssi_class',
    title: '인천공항 장시간 환승객 사이에서 공항 인근 반나절 로컬 한국문화 체험 수요 증가',
    summary:
      '인천국제공항을 경유하는 외국인 환승 여행객들이 단순 쇼핑 대신 공항에서 30분 이내로 이동 가능한 송도 일대에서 한복과 전통차, 전통악기를 한 번에 경험하는 실내 프로그램에 관심을 보이고 있다.',
    source: 'Incheon Inbound Travel Digest (금요일 정기 클래스)',
    language: 'ko'
  },
  {
    id: 'trend-mon-kdrama-incheon',
    pillar: 'k_pop_drama',
    contentType: 'culture_magazine',
    title: 'Global K-Drama & K-Pop fans add Songdo Central Park and Tri-bowl nightscapes to Korea itineraries',
    summary:
      'International fans visiting Korea are exploring Songdo Central Park, the futuristic Tri-bowl arts space, and Songdo Hanok Village in Incheon after spotting their striking blend of modern architecture and traditional Korean roofs in hit K-Dramas and music videos.',
    source: 'K-Culture Screen & Travel Weekly (월요일 K-Pop·K-Drama)',
    language: 'en'
  },
  {
    id: 'trend-wed-incheon-tourism',
    pillar: 'incheon_tourism',
    contentType: 'culture_magazine',
    title: '인천 송도 센트럴파크 한옥마을부터 개항장 문화지구까지, 과거와 미래를 잇는 인천 예술 산책 코스 주목',
    summary:
      '바닷물이 흐르는 송도 센트럴파크 수상택시와 복합문화공간 트라이보울, 그리고 19세기 근대 건축물이 갤러리와 카페로 재탄생한 인천 개항장 문화지구가 외국인 여행객과 주말 나들이객에게 인천 대표 문화예술 관광 코스로 인기를 끌고 있다.',
    source: 'Incheon Culture & Tourism Magazine (수요일 인천 관광지)',
    language: 'ko'
  },
  {
    id: 'trend-thu-incheon-food-tea',
    pillar: 'incheon_food_tea',
    contentType: 'culture_magazine',
    title: 'From Sinpo Market Dakgangjeong to Royal Yakgwa & Tea: Incheon culinary & K-dessert heritage',
    summary:
      'Food travelers in Incheon are pairing lively street food visits at Sinpo International Market and Incheon Chinatown with calm afternoon Korean tea ceremonies featuring handmade yakgwa, dasik, and seasonal floral teas in Songdo.',
    source: 'Korea Gastronomy & Local Eats (목요일 인천 음식·전통 다과)',
    language: 'en'
  },
  {
    id: 'trend-sat-korean-tradition',
    pillar: 'korean_tradition',
    contentType: 'culture_magazine',
    title: '자연의 소리를 닮은 명주실과 오동나무, 그리고 한복의 곡선이 지닌 한국 전통 미학 재조명',
    summary:
      '빠르게 소비되는 디지털 일상 속에서 자연 소재인 오동나무와 명주실이 만들어내는 국악기의 깊은 여운(농현)과 한국 전통 의복 한복의 여유로운 선을 통해 마음의 휴식을 찾는 문화 트렌드가 확산되고 있다.',
    source: 'Korean Heritage & Aesthetics Journal (토요일 한국 전통문화)',
    language: 'ko'
  },
  {
    id: 'trend-low-fit-semiconductor',
    pillar: 'somssi_class',
    contentType: 'somssi_class',
    title: '반도체 및 선박 수출 호조로 3분기 무역수지 흑자 폭 확대',
    summary:
      '글로벌 IT 수요 회복에 힘입어 메모리 반도체와 고부가 선박 수출이 증가하면서 분기 무역수지가 개선되었다.',
    source: 'Economic Daily Report (적합도 미달 Skip 테스트용)',
    language: 'ko'
  }
];

function stripHtmlEntities(str = '') {
  return String(str)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetches live K-Culture / Incheon Travel / K-Pop / Food RSS items from Google News RSS.
 * Automatically uses Korean Google News edition when Korean characters are in the query,
 * and places live RSS items at the top of the returned list.
 */
export async function fetchLiveTrends(
  query = '인천 송도 여행 한국 전통문화',
  pillar = 'incheon_tourism',
  contentType = 'culture_magazine'
) {
  const isKoreanQuery = /[가-힣]/.test(query);
  const localeParams = isKoreanQuery
    ? 'hl=ko&gl=KR&ceid=KR:ko'
    : 'hl=en-US&gl=US&ceid=US:en';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${localeParams}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return PRESET_TRENDS;
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);
    if (items.length === 0) return PRESET_TRENDS;

    const live = items.map((match, idx) => {
      const block = match[1];
      const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || `Live Trend #${idx + 1}`;
      const rawDesc = (block.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
      const rawSource = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || 'Google News RSS';
      const rawPubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';

      const cleanTitle = stripHtmlEntities(rawTitle);
      const cleanDesc = stripHtmlEntities(rawDesc);
      const cleanSource = stripHtmlEntities(rawSource);
      const dateShort = rawPubDate ? new Date(rawPubDate).toISOString().slice(0, 10) : '';

      return {
        id: `live-${Date.now()}-${idx + 1}`,
        isLiveRss: true,
        pillar,
        contentType,
        title: cleanTitle,
        summary:
          cleanDesc && cleanDesc !== cleanTitle
            ? cleanDesc
            : `[실시간 RSS 수집 뉴스] ${cleanTitle} (${cleanSource})`,
        source: `${cleanSource}${dateShort ? ` · ${dateShort}` : ''} (RSS)`,
        language: /[가-힣]/.test(cleanTitle) ? 'ko' : 'en'
      };
    });
    return [...live, ...PRESET_TRENDS];
  } catch {
    return PRESET_TRENDS;
  }
}
