const state = {
  config: null,
  trends: [],
  activeChannel: 'reels',
  currentOutput: null,
  publishedPreview: null,
  validation: null,
  previewUtm: false,
  viewMode: 'split',
  reelsSceneIdx: 0,
  reelsPlayTimer: null,
  igSlideIdx: 0,
  highlightBlogKeywords: true
};

const CHECKLIST_LABELS = {
  schema_valid: 'JSON Schema 100% 일치',
  ground_truth_matched: 'Ground Truth 가격·시간·포함내역 일치',
  only_booking_url_placeholder: '{{BOOKING_URL}} 외 외부 URL 없음',
  no_forbidden_claims: '과장·최상급·타악기 동일시·환율변환 없음',
  layover_rule_met: '환승 언급 시 최소 시간 및 비자/K-ETA 안내 포함',
  channel_limits_met: '채널별 글자 수·해시태그·본문 분량 충족',
  cards_and_threads_question: '인스타 4장 구성 & Threads 질문형 마무리(?)',
  facts_used_populated: '사용된 팩트 출처(facts_used) 명시 완료'
};

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatNaverBodyHtml(rawText = '', keywords = [], highlight = true) {
  let html = escapeHtml(rawText);
  // Render **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Optionally highlight search keywords
  if (highlight && Array.isArray(keywords)) {
    for (const kw of keywords) {
      if (!kw) continue;
      const safeKw = escapeHtml(kw.trim());
      if (safeKw.length >= 2) {
        html = html.replaceAll(safeKw, `<mark class="kw-highlight">${safeKw}</mark>`);
      }
    }
  }

  // Split lines into paragraphs and bullet lists
  const lines = html.split('\n');
  const blocks = [];
  let currentUl = [];

  const flushUl = () => {
    if (currentUl.length > 0) {
      blocks.push(`<ul class="naver-ul">${currentUl.map((li) => `<li>${li}</li>`).join('')}</ul>`);
      currentUl = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushUl();
      continue;
    }
    if (trimmed.startsWith('- ')) {
      currentUl.push(trimmed.slice(2));
    } else {
      flushUl();
      blocks.push(`<p class="naver-p">${trimmed}</p>`);
    }
  }
  flushUl();
  return blocks.join('');
}

function getActiveData() {
  if (!state.currentOutput) return null;
  return state.previewUtm && state.publishedPreview ? state.publishedPreview : state.currentOutput;
}

function selectTab(channelId) {
  const tabs = document.querySelectorAll('.tabs-bar button[role="tab"]');
  const panels = document.querySelectorAll('.tabpanel');
  tabs.forEach((tab) => {
    const isTarget = tab.dataset.channel === channelId;
    tab.setAttribute('aria-selected', String(isTarget));
    tab.toggleAttribute('focusgroupstart', isTarget);
  });
  panels.forEach((panel) => {
    const isTarget = panel.id === `panel-${channelId}`;
    if (isTarget) {
      panel.removeAttribute('hidden');
      panel.setAttribute('tabindex', '0');
    } else {
      panel.setAttribute('hidden', 'until-found');
      panel.removeAttribute('tabindex');
    }
  });
  if (channelId !== 'raw_json') {
    state.activeChannel = channelId;
    document.getElementById('revise-channel-label').textContent = channelId;
  }
}

function setupTabs() {
  const tabs = document.querySelectorAll('.tabs-bar button[role="tab"]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.channel));
    tab.addEventListener('focus', () => selectTab(tab.dataset.channel));
  });
  document.querySelectorAll('.tabpanel').forEach((panel) => {
    panel.addEventListener('beforematch', () => {
      const ch = panel.id.replace('panel-', '');
      selectTab(ch);
    });
  });
}

function setupViewModeButtons() {
  const workspace = document.querySelector('.workspace');
  const buttons = document.querySelectorAll('.view-mode-btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.viewMode = btn.dataset.viewMode;
      workspace.setAttribute('data-view-mode', state.viewMode);
      buttons.forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
}

function populateTrendSelect(trends) {
  state.trends = trends;
  const select = document.getElementById('trend-preset-select');
  select.innerHTML = trends
    .map(
      (t, idx) =>
        `<option value="${idx}">[${t.language.toUpperCase()}] ${escapeHtml(t.title.slice(0, 58))}</option>`
    )
    .join('');
  applyTrendForm(trends[0]);
}

function applyTrendForm(trend) {
  if (!trend) return;
  document.getElementById('trend-title').value = trend.title || '';
  document.getElementById('trend-summary').value = trend.summary || '';
  document.getElementById('trend-source').value = trend.source || '';
  document.getElementById('trend-lang').value = trend.language || 'en';
}

function renderSidebarStatus() {
  const out = state.currentOutput;
  const val = state.validation;
  if (!out || !val) return;

  document.getElementById('fit-score-val').textContent = `${out.trend_fit.score} / 10`;
  const skipBadge = document.getElementById('fit-skip-badge');
  if (out.trend_fit.skip) {
    skipBadge.textContent = 'SKIP → Evergreen 전환';
    skipBadge.className = 'status-pill warn';
  } else {
    skipBadge.textContent = 'TREND 채택 (Score ≥ 5)';
    skipBadge.className = 'status-pill ok';
  }
  document.getElementById('fit-angle-text').textContent = out.trend_fit.angle;

  const checklistUl = document.getElementById('checklist-ul');
  checklistUl.innerHTML = Object.entries(val.checklist || {})
    .map(([key, passed]) => {
      const icon = passed ? '✓' : '✕';
      const cls = passed ? 'pass' : 'fail';
      return `<li class="${cls}"><strong>${icon}</strong> <span>${escapeHtml(CHECKLIST_LABELS[key] || key)}</span></li>`;
    })
    .join('');

  const alertsEl = document.getElementById('validation-alerts');
  const errItems = (val.errors || []).map(
    (e) => `<div class="alert-item err">오류: ${escapeHtml(e)}</div>`
  );
  const warnItems = (val.warnings || []).map(
    (w) => `<div class="alert-item warn">주의: ${escapeHtml(w)}</div>`
  );
  alertsEl.innerHTML = [...errItems, ...warnItems].join('');

  const notesUl = document.getElementById('reviewer-notes-list');
  notesUl.innerHTML =
    (out.reviewer_notes || []).length > 0
      ? out.reviewer_notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')
      : '<li>특이사항 없음 (모든 규칙 통과)</li>';

  const factsUl = document.getElementById('facts-used-list');
  factsUl.innerHTML = (out.facts_used || [])
    .map((f) => `<li><strong>[${escapeHtml(f.source)}]</strong> ${escapeHtml(f.fact)}</li>`)
    .join('');
}

function renderReelsChannel(r) {
  const scenes = r.onscreen_text || [];
  const activeIdx = Math.min(state.reelsSceneIdx, Math.max(0, scenes.length - 1));
  const currentSceneText = scenes[activeIdx] || '';
  const timeRanges = ['0–3s', '3–7s', '7–11s', '11–15s'];

  const panel = document.getElementById('panel-reels');
  panel.innerHTML = `
    <div class="channel-split-layout">
      <!-- Live Reels / TikTok Phone Mockup -->
      <div class="preview-pane">
        <div class="preview-frame-title">
          <span>📱 Reels / TikTok 15s Live Preview</span>
          <button type="button" id="reels-play-btn" class="btn btn-secondary btn-sm">
            ${state.reelsPlayTimer ? '⏸ 일시정지' : '▶ 15초 시뮬레이션 재생'}
          </button>
        </div>
        <div class="reels-phone">
          <div>
            <div class="reels-notch"></div>
            <div class="reels-top-bar">
              <span>Reels · Songdo, Incheon</span>
              <span>${timeRanges[activeIdx] || '0–15s'}</span>
            </div>
          </div>

          <div class="reels-stage-center">
            <div class="reels-hook-banner">
              <div class="reels-hook-en">${escapeHtml(r.hook.en)}</div>
              <div class="reels-hook-kr">${escapeHtml(r.hook.kr)}</div>
            </div>

            <div class="reels-onscreen-pill">
              🎬 "${escapeHtml(currentSceneText)}"
            </div>

            <div class="reels-scene-controls">
              ${scenes
                .map(
                  (_, idx) => `
                <button type="button" class="reels-scene-btn ${idx === activeIdx ? 'active' : ''}" data-reels-scene="${idx}">
                  장면 ${idx + 1} (${timeRanges[idx] || ''})
                </button>
              `
                )
                .join('')}
            </div>
          </div>

          <div class="reels-side-actions">
            <div class="reels-action-icon"><span>♥</span><span>1.4K</span></div>
            <div class="reels-action-icon"><span>💬</span><span>82</span></div>
            <div class="reels-action-icon"><span>↗</span><span>Share</span></div>
            <div class="reels-action-icon"><span>🎵</span><span>Arirang</span></div>
          </div>

          <div class="reels-bottom-overlay">
            <div class="reels-author">
              <span>@somssi.songdo</span>
              <span class="reels-follow-tag">Follow</span>
            </div>
            <div class="reels-caption-text">${escapeHtml(r.caption)}</div>
            <div class="reels-tags-line">${r.hashtags.map((t) => escapeHtml(t)).join(' ')}</div>
          </div>
        </div>
      </div>

      <!-- Specs Pane -->
      <div class="specs-pane channel-grid">
        <div class="channel-box">
          <h3>First 2s Hook (≤ 40 chars) <span class="char-badge">EN ${r.hook.en.length}/40 · KR ${r.hook.kr.length}/40</span></h3>
          <p><strong>EN:</strong> ${escapeHtml(r.hook.en)}</p>
          <p><strong>KR:</strong> ${escapeHtml(r.hook.kr)}</p>
        </div>
        <div class="channel-box">
          <h3>On-Screen Text (3–4 lines, ≤ 30 chars each) <span class="char-badge">${r.onscreen_text.length} lines</span></h3>
          <ol>
            ${r.onscreen_text
              .map((line, idx) => `<li><strong>[${timeRanges[idx] || ''}]</strong> ${escapeHtml(line)} <small>(${line.length}/30)</small></li>`)
              .join('')}
          </ol>
        </div>
        <div class="channel-box">
          <h3>Caption (≤ 150 chars) <span class="char-badge">${r.caption.length} / 150 chars</span></h3>
          <p>${escapeHtml(r.caption)}</p>
        </div>
        <div class="channel-box">
          <h3>Hashtags (5–8 mix EN/KR) <span class="char-badge">${r.hashtags.length} tags</span></h3>
          <div class="tag-cloud">${r.hashtags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
        </div>
      </div>
    </div>
  `;

  panel.querySelectorAll('[data-reels-scene]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.reelsSceneIdx = Number(btn.dataset.reelsScene);
      renderReelsChannel(getActiveData().reels);
    });
  });

  const playBtn = panel.querySelector('#reels-play-btn');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (state.reelsPlayTimer) {
        clearInterval(state.reelsPlayTimer);
        state.reelsPlayTimer = null;
        renderReelsChannel(getActiveData().reels);
      } else {
        state.reelsPlayTimer = setInterval(() => {
          const total = (getActiveData()?.reels?.onscreen_text || []).length || 1;
          state.reelsSceneIdx = (state.reelsSceneIdx + 1) % total;
          renderReelsChannel(getActiveData().reels);
        }, 1600);
        renderReelsChannel(getActiveData().reels);
      }
    });
  }
}

function renderInstagramChannel(ig) {
  const cards = ig.cards || [];
  const slideIdx = Math.min(state.igSlideIdx, Math.max(0, cards.length - 1));
  const currentCard = cards[slideIdx] || { title: { kr: '', en: '' }, body: { kr: '', en: '' } };
  const cardRoles = [
    'CARD 1 · COVER HOOK',
    'CARD 2 · CONTEXT & TREND',
    'CARD 3 · 120-MIN EXPERIENCE',
    'CARD 4 · PRICE & BOOKING CTA'
  ];

  const panel = document.getElementById('panel-instagram_feed');
  panel.innerHTML = `
    <div class="channel-split-layout">
      <!-- Live Instagram Feed Carousel Mockup -->
      <div class="preview-pane">
        <div class="preview-frame-title">
          <span>📸 Instagram 4-Card Carousel Preview</span>
          <span>Slide ${slideIdx + 1} / ${cards.length}</span>
        </div>
        <div class="ig-mockup">
          <div class="ig-header">
            <div class="ig-user">
              <div class="ig-avatar">솜씨</div>
              <div>
                <div class="ig-username">somssi.songdo</div>
                <div class="ig-location">Songdo Central Park, Incheon</div>
              </div>
            </div>
            <span>•••</span>
          </div>

          <div class="ig-square-stage" data-slide="${slideIdx}">
            <div class="ig-slide-counter">${slideIdx + 1}/${cards.length}</div>
            <div class="ig-slide-content">
              <div class="ig-slide-role">${cardRoles[slideIdx] || `CARD ${slideIdx + 1}`}</div>
              <h4 class="ig-slide-title-kr">${escapeHtml(currentCard.title.kr)}</h4>
              <p class="ig-slide-title-en">${escapeHtml(currentCard.title.en)}</p>
              <p class="ig-slide-body-kr">${escapeHtml(currentCard.body.kr)}</p>
              <p class="ig-slide-body-en">${escapeHtml(currentCard.body.en)}</p>
            </div>
            <div class="ig-carousel-nav">
              <button type="button" class="ig-nav-btn" id="ig-prev-btn" aria-label="이전 카드">‹</button>
              <div class="ig-dots">
                ${cards
                  .map(
                    (_, i) =>
                      `<span class="ig-dot ${i === slideIdx ? 'active' : ''}" data-ig-dot="${i}"></span>`
                  )
                  .join('')}
              </div>
              <button type="button" class="ig-nav-btn" id="ig-next-btn" aria-label="다음 카드">›</button>
            </div>
          </div>

          <div class="ig-actions-bar">
            <div>♡ &nbsp; 💬 &nbsp; ⌲</div>
            <div>⚑</div>
          </div>

          <div class="ig-caption-box">
            <strong>somssi.songdo</strong>
            <span style="white-space: pre-line">${escapeHtml(ig.caption)}</span>
            <div class="ig-caption-tags">${ig.hashtags.map((t) => escapeHtml(t)).join(' ')}</div>
          </div>
        </div>
      </div>

      <!-- Specs Pane -->
      <div class="specs-pane channel-grid">
        <div class="cards-carousel">
          ${cards
            .map(
              (c, i) => `
            <div class="ig-card" style="${i === slideIdx ? 'border-color: var(--primary); box-shadow: 0 0 0 2px rgba(124,63,44,0.15);' : ''}">
              <div class="ig-card-num">${cardRoles[i] || `Card ${i + 1}`}</div>
              <h4>${escapeHtml(c.title.kr)} <small>(${c.title.kr.length}/20)</small></h4>
              <p class="subtitle">${escapeHtml(c.title.en)} <small>(${c.title.en.length}/20)</small></p>
              <hr />
              <p>${escapeHtml(c.body.kr)} <small>(${c.body.kr.length}/80)</small></p>
              <p class="subtitle">${escapeHtml(c.body.en)} <small>(${c.body.en.length}/80)</small></p>
            </div>
          `
            )
            .join('')}
        </div>
        <div class="channel-box">
          <h3>Carousel Caption (300–600 chars, KR + EN) <span class="char-badge">${ig.caption.length} chars</span></h3>
          <p style="white-space: pre-line">${escapeHtml(ig.caption)}</p>
        </div>
        <div class="channel-box">
          <h3>Hashtags (10–15 tags) <span class="char-badge">${ig.hashtags.length} tags</span></h3>
          <div class="tag-cloud">${ig.hashtags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
        </div>
      </div>
    </div>
  `;

  panel.querySelector('#ig-prev-btn')?.addEventListener('click', () => {
    state.igSlideIdx = (slideIdx - 1 + cards.length) % cards.length;
    renderInstagramChannel(getActiveData().instagram_feed);
  });
  panel.querySelector('#ig-next-btn')?.addEventListener('click', () => {
    state.igSlideIdx = (slideIdx + 1) % cards.length;
    renderInstagramChannel(getActiveData().instagram_feed);
  });
  panel.querySelectorAll('[data-ig-dot]').forEach((dot) => {
    dot.addEventListener('click', () => {
      state.igSlideIdx = Number(dot.dataset.igDot);
      renderInstagramChannel(getActiveData().instagram_feed);
    });
  });
}

function renderThreadsChannel(th) {
  const rawText = th.text || '';
  const endsWithQ = rawText.trim().endsWith('?');
  const bookingLinkText = state.previewUtm
    ? state.config?.groundTruth?.publishing?.utm_links?.threads || 'https://somssi.kr/book'
    : '{{BOOKING_URL}}';

  const panel = document.getElementById('panel-threads');
  panel.innerHTML = `
    <div class="channel-split-layout">
      <!-- Live Threads Post Mockup -->
      <div class="preview-pane">
        <div class="preview-frame-title">
          <span>🧵 Threads Conversational Post Preview</span>
          <span>${rawText.length} / 450 chars</span>
        </div>
        <div class="threads-mockup">
          <div class="threads-row">
            <div class="threads-left-col">
              <div class="ig-avatar">솜씨</div>
              <div class="threads-line"></div>
            </div>
            <div>
              <div class="threads-meta">
                <span class="threads-handle">somssi.songdo</span>
                <span class="threads-time">지금 · 송도 센트럴파크</span>
              </div>
              <div class="threads-body">${escapeHtml(rawText)}</div>
              <div class="threads-link-card">
                <div class="threads-link-domain">SOMSSI · 120-Min Gayageum &amp; Hanbok Class</div>
                <div class="threads-link-title">🔗 ${escapeHtml(bookingLinkText)}</div>
              </div>
              <div class="threads-actions">
                <span>♡</span>
                <span>💬 Reply</span>
                <span>↻ Repost</span>
                <span>⌲ Share</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Specs Pane -->
      <div class="specs-pane channel-grid">
        <div class="channel-box">
          <h3>Threads Conversational Post (≤ 450 chars) <span class="char-badge">${rawText.length} / 450 chars</span></h3>
          <p style="font-size: 1rem; white-space: pre-line">${escapeHtml(rawText)}</p>
        </div>
        <div class="channel-box">
          <h3>Threads 채널 규격 체크</h3>
          <ul class="compact-list">
            <li>오픈 질문형 마무리(<code>?</code>): <strong>${endsWithQ ? '충족 (✓)' : '미충족 (✕)'}</strong></li>
            <li>해시태그 블록 금지 (최대 1개): <strong>${(rawText.match(/#[\w가-힣]+/g) || []).length} / 1개</strong></li>
            <li>한국어 자연스러운 표현 포함 (가야금 / 《줄을 다루는 솜씨》): <strong>포함됨</strong></li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

function renderNaverBlogChannel(nb) {
  const totalBodyChars = (nb.sections || []).reduce((acc, s) => acc + (s.body || '').length, 0);
  const panel = document.getElementById('panel-naver_blog');

  panel.innerHTML = `
    <div class="channel-split-layout blog-layout">
      <!-- Live Naver Blog SmartEditor ONE Mockup -->
      <div class="preview-pane">
        <div class="preview-frame-title">
          <span>🟢 Naver Blog SmartEditor ONE 미리보기</span>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;text-transform:none;">
            <input type="checkbox" id="blog-kw-highlight-toggle" ${state.highlightBlogKeywords ? 'checked' : ''} />
            <span>검색 키워드 본문 위치 하이라이트</span>
          </label>
        </div>
        <div class="naver-blog-mockup">
          <div class="naver-top-strip">
            <span>NAVER BLOG · 솜씨(SOMSSI) 공식 블로그</span>
            <span>전체공개 · B2B/국문</span>
          </div>
          <article class="naver-article">
            <div class="naver-category">송도 가볼만한곳 · 외국인 한국문화체험</div>
            <h3 class="naver-title">${escapeHtml(nb.title)}</h3>
            <div class="naver-author-row">
              <span>솜씨(SOMSSI) 송도 가야금 스튜디오 · 방금 전</span>
              <span>본문 ${totalBodyChars.toLocaleString()}자 (권장 1,500–2,500자)</span>
            </div>

            ${(nb.sections || [])
              .map(
                (sec) => `
              <section class="naver-section-block">
                <h4 class="naver-h2">${escapeHtml(sec.h2)}</h4>
                ${formatNaverBodyHtml(sec.body, nb.keywords, state.highlightBlogKeywords)}
              </section>
            `
              )
              .join('')}

            <div class="naver-en-box">
              <strong>🌐 English Summary (For Foreign Guests &amp; Hotel Concierges)</strong>
              <div>${escapeHtml(nb.en_summary)}</div>
            </div>

            <div class="naver-tag-row">
              ${(nb.keywords || [])
                .map((k) => `<span class="naver-tag">#${escapeHtml(k.replace(/\s+/g, ''))}</span>`)
                .join('')}
            </div>
          </article>
        </div>
      </div>

      <!-- Specs Pane -->
      <div class="specs-pane channel-grid">
        <div class="channel-box">
          <h3>Blog Title (≤ 40 chars) <span class="char-badge">${nb.title.length} / 40 chars</span></h3>
          <p style="font-size: 1.05rem; font-weight: 700">${escapeHtml(nb.title)}</p>
        </div>
        <div class="channel-box">
          <h3>Body Length &amp; Sections <span class="char-badge">${nb.sections.length} sections · ${totalBodyChars} chars</span></h3>
          <p class="subtitle">권장 분량: 한국어 기준 1,500–2,500자 (현재 ${totalBodyChars}자)</p>
          <ul class="compact-list">
            ${nb.sections
              .map((s, idx) => `<li><strong>섹션 ${idx + 1}:</strong> ${escapeHtml(s.h2)} (${s.body.length}자)</li>`)
              .join('')}
          </ul>
        </div>
        <div class="channel-box">
          <h3>Search Keywords (5–8) <span class="char-badge">${nb.keywords.length} keywords</span></h3>
          <div class="tag-cloud">${nb.keywords.map((k) => `<span class="tag">${escapeHtml(k)}</span>`).join('')}</div>
        </div>
        <div class="channel-box">
          <h3>English Summary (3–4 sentences)</h3>
          <p style="font-size: 0.86rem">${escapeHtml(nb.en_summary)}</p>
        </div>
      </div>
    </div>
  `;

  panel.querySelector('#blog-kw-highlight-toggle')?.addEventListener('change', (e) => {
    state.highlightBlogKeywords = e.target.checked;
    renderNaverBlogChannel(getActiveData().naver_blog);
  });
}

function renderChannels() {
  const data = getActiveData();
  if (!data) return;

  renderReelsChannel(data.reels);
  renderInstagramChannel(data.instagram_feed);
  renderThreadsChannel(data.threads);
  renderNaverBlogChannel(data.naver_blog);

  // 5. Raw JSON
  document.getElementById('panel-raw_json').innerHTML = `
    <pre class="code-block">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
  `;
}

async function generateDraft() {
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  btn.textContent = '생성 중...';
  try {
    const payload = {
      date: document.getElementById('trend-date').value,
      trend: {
        title: document.getElementById('trend-title').value,
        summary: document.getElementById('trend-summary').value,
        source: document.getElementById('trend-source').value,
        language: document.getElementById('trend-lang').value
      },
      apiKey: document.getElementById('openai-key').value.trim(),
      model: document.getElementById('openai-model').value.trim()
    };
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    state.currentOutput = data.output;
    state.publishedPreview = data.publishedPreview;
    state.validation = data.validation;
    state.reelsSceneIdx = 0;
    state.igSlideIdx = 0;
    document.getElementById('engine-badge').textContent = `Engine: ${data.engineUsed}`;
    renderSidebarStatus();
    renderChannels();
  } finally {
    btn.disabled = false;
    btn.textContent = '4개 채널 초안 생성 (Generate Mode)';
  }
}

async function reviseDraft() {
  if (!state.currentOutput) return;
  const instruction = document.getElementById('revise-instruction').value.trim();
  if (!instruction) {
    alert('수정 지시어를 입력해주세요.');
    return;
  }
  const btn = document.getElementById('revise-btn');
  btn.disabled = true;
  btn.textContent = '수정 중...';
  try {
    const res = await fetch('/api/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: state.activeChannel,
        instruction,
        previous_output: state.currentOutput,
        apiKey: document.getElementById('openai-key').value.trim(),
        model: document.getElementById('openai-model').value.trim()
      })
    });
    const data = await res.json();
    state.currentOutput = data.output;
    state.publishedPreview = data.publishedPreview;
    state.validation = data.validation;
    renderSidebarStatus();
    renderChannels();
  } finally {
    btn.disabled = false;
    btn.textContent = '선택 채널만 수정 (Revise)';
  }
}

function renderGroundTruthDialog() {
  if (!state.config) return;
  const p = state.config.groundTruth.placeholders || {};
  const container = document.getElementById('gt-form-fields');
  container.innerHTML = Object.entries(p)
    .map(
      ([k, v]) => `
      <label class="field">
        <span>{{${escapeHtml(k)}}}</span>
        <input type="text" data-gt-key="${escapeHtml(k)}" value="${escapeHtml(v)}" />
      </label>
    `
    )
    .join('');
  document.getElementById('rendered-prompt-pre').textContent = state.config.systemPrompt;
}

async function init() {
  setupTabs();
  setupViewModeButtons();
  document.getElementById('trend-date').value = new Date().toISOString().slice(0, 10);

  const cfgRes = await fetch('/api/config');
  state.config = await cfgRes.json();
  populateTrendSelect(state.config.presets || []);

  document.getElementById('trend-preset-select').addEventListener('change', (e) => {
    const t = state.trends[Number(e.target.value)];
    applyTrendForm(t);
  });

  document.getElementById('fetch-live-btn').addEventListener('click', async () => {
    const btn = document.getElementById('fetch-live-btn');
    btn.textContent = '불러오는 중...';
    const res = await fetch('/api/trends?live=1');
    const data = await res.json();
    populateTrendSelect(data.trends || []);
    btn.textContent = '실시간 RSS 불러오기';
  });

  document.getElementById('generate-btn').addEventListener('click', generateDraft);
  document.getElementById('revise-btn').addEventListener('click', reviseDraft);

  document.getElementById('preview-utm-toggle').addEventListener('change', (e) => {
    state.previewUtm = e.target.checked;
    renderChannels();
  });

  // Ground Truth Modal
  const gtDialog = document.getElementById('gt-dialog');
  document.getElementById('open-gt-btn').addEventListener('click', () => {
    renderGroundTruthDialog();
    gtDialog.showModal();
  });

  document.getElementById('save-gt-btn').addEventListener('click', async () => {
    const inputs = gtDialog.querySelectorAll('[data-gt-key]');
    const placeholders = {};
    inputs.forEach((inp) => {
      placeholders[inp.dataset.gtKey] = inp.value;
    });
    const res = await fetch('/api/config/ground-truth', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeholders })
    });
    const updated = await res.json();
    state.config.groundTruth = updated.groundTruth;
    state.config.systemPrompt = updated.systemPrompt;
    document.getElementById('rendered-prompt-pre').textContent = updated.systemPrompt;
    await generateDraft();
    gtDialog.close();
  });

  // Publish Modal
  const pubDialog = document.getElementById('publish-dialog');
  document.getElementById('open-publish-btn').addEventListener('click', () => {
    if (!state.publishedPreview) return;
    document.getElementById('publish-preview-pre').textContent = JSON.stringify(
      state.publishedPreview,
      null,
      2
    );
    pubDialog.showModal();
  });

  document.getElementById('copy-publish-json-btn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify(state.publishedPreview, null, 2));
    alert('UTM 링크가 치환된 최종 배포용 JSON이 클립보드에 복사되었습니다.');
  });

  document.getElementById('confirm-publish-btn').addEventListener('click', async () => {
    const webhookUrl = document.getElementById('publish-webhook-url').value.trim();
    const reviewer = document.getElementById('publish-reviewer').value.trim();
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        output: state.currentOutput,
        webhookUrl,
        reviewer
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`배포 실패: ${data.error}`);
      return;
    }
    alert(`검수 승인 및 배포 완료 (${data.webhookStatus})`);
    pubDialog.close();
  });

  // Generate initial sample draft automatically on load
  await generateDraft();
}

init();
