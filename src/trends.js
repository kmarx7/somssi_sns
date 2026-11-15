export const PRESET_TRENDS = [
  {
    id: 'trend-kpop-gugak',
    title: "K-pop's recent gugak fusion sound draws global listeners to traditional Korean strings",
    summary:
      'Global music fans are increasingly curious about traditional Korean instruments after hearing gugak string melodies woven into recent K-pop releases, searching for hands-on ways to hear and pluck the gayageum in Korea.',
    source: 'Korea Culture & Tourism Trend Brief',
    language: 'en'
  },
  {
    id: 'trend-incheon-layover',
    title: '인천공항 장시간 환승객 사이에서 공항 인근 반나절 로컬 한국문화 체험 수요 증가',
    summary:
      '인천국제공항을 경유하는 외국인 환승 여행객들이 단순 쇼핑 대신 공항에서 30분 이내로 이동 가능한 송도 일대에서 한복과 전통차, 전통악기를 한 번에 경험하는 실내 프로그램에 관심을 보이고 있다.',
    source: 'Incheon Inbound Travel Digest',
    language: 'ko'
  },
  {
    id: 'trend-slow-travel-hanbok',
    title: 'Foreign travelers shift from palace photo-walks to quiet indoor Hanbok & tea rituals',
    summary:
      'Independent travelers and expats in Korea are looking beyond crowded outdoor palace rentals toward calm, intimate studio sessions where they can wear Hanbok, sip traditional tea, and learn a cultural craft.',
    source: 'Seoul & Incheon Expat Weekly',
    language: 'en'
  },
  {
    id: 'trend-low-fit-semiconductor',
    title: '반도체 및 선박 수출 호조로 3분기 무역수지 흑자 폭 확대',
    summary:
      '글로벌 IT 수요 회복에 힘입어 메모리 반도체와 고부가 선박 수출이 증가하면서 분기 무역수지가 개선되었다.',
    source: 'Economic Daily Report',
    language: 'ko'
  }
];

/**
 * Fetches live K-Culture / Korea Travel RSS items from Google News RSS as optional live trends,
 * falling back gracefully to PRESET_TRENDS if offline.
 */
export async function fetchLiveTrends(query = 'Korea traditional culture travel Incheon') {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return PRESET_TRENDS;
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
    if (items.length === 0) return PRESET_TRENDS;

    const live = items.map((match, idx) => {
      const block = match[1];
      const rawTitle = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/) || [])[1] ||
        (block.match(/<title>(.*?)<\/title>/) || [])[1] ||
        `Korea Culture Trend #${idx + 1}`;
      const cleanTitle = rawTitle.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const sourceMatch = (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || 'Google News RSS';
      return {
        id: `live-${ idx + 1 }`,
        title: cleanTitle,
        summary: `Recent travel & culture coverage: ${cleanTitle}`,
        source: sourceMatch,
        language: /[가-힣]/.test(cleanTitle) ? 'ko' : 'en'
      };
    });
    return [...PRESET_TRENDS, ...live];
  } catch {
    return PRESET_TRENDS;
  }
}
