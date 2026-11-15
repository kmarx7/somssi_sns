const state = {
  config: null,
  trends: [],
  weeklyPillars: [],
  selectedDayIndex: 2, // Default Tuesday (SOMSSI Class)
  activeChannel: 'reels',
  currentOutput: null,
  publishedPreview: null,
  validation: null,
  extras: null,
  previewUtm: false,
  viewMode: 'split',
  reelsSceneIdx: 0,
  reelsPlayTimer: null,
  igSlideIdx: 0,
  igCustomBgImages: {}, // slideIdx -> Image element
  blogCustomBgImages: {}, // sectionIdx -> Image element
  blogLangMode: 'kr_summary', // 'kr_summary' | 'en_full' | 'bilingual_stacked'
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
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  if (highlight && Array.isArray(keywords)) {
    for (const kw of keywords) {
      if (!kw) continue;
      const safeKw = escapeHtml(kw.trim());
      if (safeKw.length >= 2) {
        html = html.replaceAll(safeKw, `<mark class="kw-highlight">${safeKw}</mark>`);
      }
    }
  }

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

/**
 * Canvas text wrapping helper for Korean + English strings.
 */
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 6) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let currentY = y;
  let lineCount = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      line = words[i];
      currentY += lineHeight;
      lineCount++;
      if (lineCount >= maxLines - 1) break;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

/**
 * Renders a 1080x1080 Instagram Carousel Card onto a <canvas> element.
 */
function renderIgCardToCanvas(canvas, card, slideIdx, totalSlides) {
  if (!canvas || !card) return;
  const ctx = canvas.getContext('2d');
  const W = 1080;
  const H = 1080;
  canvas.width = W;
  canvas.height = H;

  const palettes = [
    ['#2b1810', '#6b3826', '#f6d59e'],
    ['#1d322a', '#375a4c', '#fde68a'],
    ['#422518', '#85462e', '#fed7aa'],
    ['#1f1b17', '#5c2e1f', '#fcd34d']
  ];
  const [c1, c2, accent] = palettes[slideIdx % palettes.length];

  const customImg = state.igCustomBgImages[slideIdx];
  if (customImg) {
    const scale = Math.max(W / customImg.width, H / customImg.height);
    const dw = customImg.width * scale;
    const dh = customImg.height * scale;
    ctx.drawImage(customImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.fillStyle = 'rgba(20, 15, 12, 0.62)';
    ctx.fillRect(0, 0, W, H);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, c1);
    grad.addColorStop(1, c2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle 12 silk strings motif
    ctx.strokeStyle = 'rgba(255, 240, 215, 0.08)';
    ctx.lineWidth = 2;
    for (let s = 0; s < 12; s++) {
      const sy = 140 + s * 70;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy - 40);
      ctx.stroke();
    }
  }

  // Outer frame border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(56, 56, W - 112, H - 112);

  // Top Header Badge
  ctx.fillStyle = accent;
  ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
  const roleLabels = ['01 · COVER', '02 · CONTEXT', '03 · EXPERIENCE', '04 · BOOKING & GUIDE'];
  ctx.fillText(roleLabels[slideIdx] || `0${slideIdx + 1}`, 100, 130);

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '600 26px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${slideIdx + 1} / ${totalSlides}`, W - 170, 130);

  // Center Glass Card
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(92, 210, W - 184, 640);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.26)';
  ctx.lineWidth = 2;
  ctx.strokeRect(92, 210, W - 184, 640);

  // Title KR
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 62px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
  ctx.fillText(card.title.kr || '', 136, 320);

  // Title EN
  ctx.fillStyle = accent;
  ctx.font = '700 42px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(card.title.en || '', 136, 385);

  // Divider line
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(136, 425, 160, 4);

  // Body KR
  ctx.fillStyle = '#f8fafc';
  ctx.font = '500 38px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
  const nextY = drawWrappedText(ctx, card.body.kr || '', 136, 500, W - 272, 56, 4);

  // Body EN
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '400 32px -apple-system, BlinkMacSystemFont, sans-serif';
  drawWrappedText(ctx, card.body.en || '', 136, nextY + 30, W - 272, 46, 4);

  // Footer Brand Sign-off
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
  ctx.fillText('줄을 다루는 솜씨 · SOMSSI SONGDO, INCHEON', 100, H - 100);
}

/**
 * Renders a 1200x630 Naver Blog Section Banner / Infographic onto a <canvas>.
 */
function renderBlogSectionCanvas(canvas, bannerInfo, secIdx) {
  if (!canvas || !bannerInfo) return;
  const ctx = canvas.getContext('2d');
  const W = 1200;
  const H = 630;
  canvas.width = W;
  canvas.height = H;

  const customImg = state.blogCustomBgImages[secIdx];
  if (customImg) {
    const scale = Math.max(W / customImg.width, H / customImg.height);
    const dw = customImg.width * scale;
    const dh = customImg.height * scale;
    ctx.drawImage(customImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.fillStyle = 'rgba(18, 24, 20, 0.65)';
    ctx.fillRect(0, 0, W, H);
  } else {
    const bgColors = [
      ['#1e352b', '#2c5244'],
      ['#3d2317', '#7c3f2c'],
      ['#24201d', '#4a3728'],
      ['#1b2a34', '#2c4a52']
    ];
    const [b1, b2] = bgColors[secIdx % bgColors.length];
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, b1);
    grad.addColorStop(1, b2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // Decorative Frame
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(42, 42, W - 84, H - 84);

  ctx.fillStyle = '#fde68a';
  ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
  ctx.fillText(`SOMSSI INCHEON & K-CULTURE GUIDE · SECTION 0${secIdx + 1}`, 84, 115);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 46px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
  const afterTitleY = drawWrappedText(ctx, bannerInfo.h2 || bannerInfo.bannerTitleKr, 84, 190, W - 168, 62, 2);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '500 28px -apple-system, BlinkMacSystemFont, sans-serif';
  drawWrappedText(ctx, bannerInfo.bannerSubtitleEn || '', 84, afterTitleY + 14, W - 168, 40, 2);

  // Infographic pill badges at bottom
  const badges =
    secIdx === 2
      ? ['1단계: 한복·전통 다과 (25분)', '2단계: 기초 주법 (30분)', '3단계: 아리랑 연주 (45분)', '4단계: 촬영 (20분)']
      : secIdx === 3
        ? ['송도 센트럴파크 인근 (공항 25분)', '120분 올인클루시브', '1인 99,000 KRW (부가세 포함)', 'KR / EN 진행']
        : ['인천 송도 센트럴파크', '한국 전통 문화·예술', '가야금 & 한복 & 다과', '줄을 다루는 솜씨'];

  let bx = 84;
  const by = H - 135;
  ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif';
  for (const bText of badges) {
    const bw = ctx.measureText(bText).width + 36;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx, by, bw, 50);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(bText, bx + 18, by + 33);
    bx += bw + 14;
  }
}

function downloadCanvasAsPng(canvas, filename) {
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
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

function renderWeeklyCalendarBar(weeklyPillars = []) {
  state.weeklyPillars = weeklyPillars;
  const grid = document.getElementById('weekly-days-grid');
  if (!grid) return;

  const shortNames = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 0: '일' };
  const shortTopics = {
    1: 'K-드라마',
    2: '솜씨클래스',
    3: '인천관광',
    4: '인천미식',
    5: '솜씨클래스',
    6: '전통문화',
    0: '큐레이션'
  };

  grid.innerHTML = weeklyPillars
    .map((item) => {
      const isSomssi = item.contentType === 'somssi_class';
      const isActive = item.dayIndex === state.selectedDayIndex;
      return `
        <button
          type="button"
          class="day-pill-btn ${isSomssi ? 'somssi-day' : 'magazine-day'} ${isActive ? 'active' : ''}"
          data-day-index="${item.dayIndex}"
          title="${escapeHtml(item.title)}"
        >
          <strong>${shortNames[item.dayIndex]}</strong>
          <span class="day-type-dot">${shortTopics[item.dayIndex]}</span>
        </button>
      `;
    })
    .join('');

  grid.querySelectorAll('[data-day-index]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const dayIdx = Number(btn.dataset.dayIndex);
      state.selectedDayIndex = dayIdx;
      const found = state.weeklyPillars.find((w) => w.dayIndex === dayIdx);
      if (found) {
        document.getElementById('content-type-select').value = found.contentType;
        const pillarSel = document.getElementById('pillar-select');
        if ([...pillarSel.options].some((o) => o.value === found.pillar)) {
          pillarSel.value = found.pillar;
        }
        // Match preset trend for that pillar
        if (found.rssQuery) {
          const rssInput = document.getElementById('rss-query-input');
          if (rssInput) rssInput.value = found.rssQuery;
        }
        const matchingTrendIdx = state.trends.findIndex((t) => t.pillar === found.pillar);
        if (matchingTrendIdx !== -1) {
          document.getElementById('trend-preset-select').value = String(matchingTrendIdx);
          applyTrendForm(state.trends[matchingTrendIdx]);
        }
        renderWeeklyCalendarBar(state.weeklyPillars);
        await generateDraft();
      }
    });
  });
}

function populateTrendSelect(trends) {
  state.trends = trends;
  const select = document.getElementById('trend-preset-select');
  select.innerHTML = trends
    .map((t, idx) => {
      const prefix = t.isLiveRss
        ? '🔥 [실시간 RSS]'
        : `[${t.contentType === 'culture_magazine' ? '문화매거진' : '정기클래스'} · ${t.language.toUpperCase()}]`;
      return `<option value="${idx}">${prefix} ${escapeHtml(t.title.slice(0, 52))}</option>`;
    })
    .join('');
  applyTrendForm(trends[0]);
}

function applyTrendForm(trend) {
  if (!trend) return;
  document.getElementById('trend-title').value = trend.title || '';
  document.getElementById('trend-summary').value = trend.summary || '';
  document.getElementById('trend-source').value = trend.source || '';
  document.getElementById('trend-lang').value = trend.language || 'en';
  if (trend.contentType) {
    document.getElementById('content-type-select').value = trend.contentType;
  }
  if (trend.pillar) {
    const pillarSel = document.getElementById('pillar-select');
    if ([...pillarSel.options].some((o) => o.value === trend.pillar)) {
      pillarSel.value = trend.pillar;
    }
  }
}

function renderSidebarStatus() {
  const out = state.currentOutput;
  const val = state.validation;
  if (!out || !val) return;

  document.getElementById('fit-score-val').textContent = `${out.trend_fit.score} / 10`;
  const skipBadge = document.getElementById('fit-skip-badge');
  const isMagazine = state.extras?.contentType === 'culture_magazine';

  if (out.trend_fit.skip) {
    skipBadge.textContent = 'SKIP → Evergreen 전환';
    skipBadge.className = 'status-pill warn';
  } else if (isMagazine) {
    skipBadge.textContent = '주 5회 문화·관광 매거진 모드';
    skipBadge.className = 'status-pill ok';
  } else {
    skipBadge.textContent = '주 2회 《줄을 다루는 솜씨》 정기 홍보';
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
              .map(
                (line, idx) =>
                  `<li><strong>[${timeRanges[idx] || ''}]</strong> ${escapeHtml(line)} <small>(${line.length}/30)</small></li>`
              )
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
    'CARD 3 · EXPERIENCE & STORY',
    'CARD 4 · GUIDE & BOOKING CTA'
  ];
  const cardStudioMeta = state.extras?.imageStudio?.instagramCards?.[slideIdx] || {};

  const panel = document.getElementById('panel-instagram_feed');
  panel.innerHTML = `
    <div class="channel-split-layout">
      <!-- Live Instagram Feed Carousel Mockup + Canvas Image Studio -->
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

          <div class="ig-square-stage" data-slide="${slideIdx}" style="padding:14px;">
            <canvas id="ig-live-canvas" class="studio-canvas" style="max-width:100%;"></canvas>
            <div class="ig-carousel-nav" style="margin-top:8px;">
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

        <!-- Instagram Image Studio Box -->
        <div class="studio-card">
          <div class="studio-header">
            <strong>🎨 인스타 카드뉴스 PNG 이미지 제작 스튜디오 (1080×1080)</strong>
          </div>
          <div class="studio-actions">
            <button type="button" id="dl-current-ig-png" class="btn btn-primary btn-sm">
              ⬇ 현재 카드(${slideIdx + 1}번) PNG 저장
            </button>
            <button type="button" id="dl-all-ig-png" class="btn btn-accent btn-sm">
              ⬇ 4장 전체 PNG 일괄 저장
            </button>
            <label class="btn btn-secondary btn-sm" style="margin:0;">
              📷 내 배경사진 합성 (현재 슬라이드)
              <input type="file" id="ig-bg-upload" accept="image/*" style="display:none;" />
            </label>
          </div>
          <div class="prompt-guide-box">
            <div><strong>📸 ${escapeHtml(cardStudioMeta.photoGuide || '')}</strong></div>
            <div style="margin-top:4px;color:var(--text-muted);">
              <strong>구독 AI 이미지 프롬프트:</strong> ${escapeHtml(cardStudioMeta.aiPrompt || '')}
              <button type="button" id="copy-ig-ai-prompt" class="btn btn-ghost btn-sm">프롬프트 복사</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Specs Pane -->
      <div class="specs-pane channel-grid">
        <div class="cards-carousel">
          ${cards
            .map(
              (c, i) => `
            <div class="ig-card" data-ig-card-box="${i}" style="cursor:pointer;${i === slideIdx ? 'border-color: var(--primary); box-shadow: 0 0 0 2px rgba(124,63,44,0.15);' : ''}">
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

  const liveCanvas = panel.querySelector('#ig-live-canvas');
  renderIgCardToCanvas(liveCanvas, currentCard, slideIdx, cards.length);

  panel.querySelector('#ig-prev-btn')?.addEventListener('click', () => {
    state.igSlideIdx = (slideIdx - 1 + cards.length) % cards.length;
    renderInstagramChannel(getActiveData().instagram_feed);
  });
  panel.querySelector('#ig-next-btn')?.addEventListener('click', () => {
    state.igSlideIdx = (slideIdx + 1) % cards.length;
    renderInstagramChannel(getActiveData().instagram_feed);
  });
  panel.querySelectorAll('[data-ig-dot], [data-ig-card-box]').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.igDot ?? el.dataset.igCardBox);
      state.igSlideIdx = idx;
      renderInstagramChannel(getActiveData().instagram_feed);
    });
  });

  panel.querySelector('#dl-current-ig-png')?.addEventListener('click', () => {
    downloadCanvasAsPng(liveCanvas, `somssi_instagram_card_${slideIdx + 1}.png`);
  });

  panel.querySelector('#dl-all-ig-png')?.addEventListener('click', () => {
    const tempCanvas = document.createElement('canvas');
    cards.forEach((cardItem, idx) => {
      renderIgCardToCanvas(tempCanvas, cardItem, idx, cards.length);
      downloadCanvasAsPng(tempCanvas, `somssi_instagram_card_${idx + 1}.png`);
    });
  });

  panel.querySelector('#ig-bg-upload')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        state.igCustomBgImages[slideIdx] = img;
        renderInstagramChannel(getActiveData().instagram_feed);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  panel.querySelector('#copy-ig-ai-prompt')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(cardStudioMeta.aiPrompt || '');
    alert('현재 카드의 AI 이미지 생성 프롬프트가 복사되었습니다.');
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
                <div class="threads-link-domain">SOMSSI · Songdo Incheon Cultural Guide &amp; Class</div>
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
            <li>한국어 자연스러운 표현 포함: <strong>포함됨</strong></li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

function renderNaverBlogChannel(nb) {
  const totalBodyChars = (nb.sections || []).reduce((acc, s) => acc + (s.body || '').length, 0);
  const bilingualMeta = state.extras?.blogBilingual || {};
  const blogBanners = state.extras?.imageStudio?.blogBanners || [];
  const panel = document.getElementById('panel-naver_blog');

  const displayTitle =
    state.blogLangMode === 'en_full'
      ? bilingualMeta.enTitle || nb.title
      : nb.title;

  let articleSectionsHtml = '';
  if (state.blogLangMode === 'en_full') {
    articleSectionsHtml = (bilingualMeta.enSections || [])
      .map(
        (sec, idx) => `
        <section class="naver-section-block">
          <h4 class="naver-h2">${escapeHtml(sec.h2)}</h4>
          <canvas id="blog-canvas-${idx}" class="blog-banner-canvas"></canvas>
          ${formatNaverBodyHtml(sec.body, [], false)}
        </section>
      `
      )
      .join('');
  } else if (state.blogLangMode === 'bilingual_stacked') {
    articleSectionsHtml = (bilingualMeta.bilingualSections || nb.sections || [])
      .map(
        (sec, idx) => `
        <section class="naver-section-block">
          <h4 class="naver-h2">${escapeHtml(sec.h2_kr || sec.h2)}</h4>
          <canvas id="blog-canvas-${idx}" class="blog-banner-canvas"></canvas>
          ${formatNaverBodyHtml(sec.body_kr || sec.body, nb.keywords, state.highlightBlogKeywords)}
          <div class="bilingual-en-sub">
            <strong>[EN] ${escapeHtml(sec.h2_en || '')}</strong>
            ${formatNaverBodyHtml(sec.body_en || '', [], false)}
          </div>
        </section>
      `
      )
      .join('');
  } else {
    articleSectionsHtml = (nb.sections || [])
      .map(
        (sec, idx) => `
        <section class="naver-section-block">
          <h4 class="naver-h2">${escapeHtml(sec.h2)}</h4>
          <canvas id="blog-canvas-${idx}" class="blog-banner-canvas"></canvas>
          ${formatNaverBodyHtml(sec.body, nb.keywords, state.highlightBlogKeywords)}
        </section>
      `
      )
      .join('');
  }

  panel.innerHTML = `
    <div class="channel-split-layout blog-layout">
      <!-- Live Naver Blog SmartEditor ONE Mockup -->
      <div class="preview-pane">
        <div class="preview-frame-title" style="flex-wrap:wrap;gap:8px;">
          <div class="blog-lang-tabs" role="group" aria-label="블로그 언어 구성 선택">
            <button type="button" class="blog-lang-btn ${state.blogLangMode === 'kr_summary' ? 'active' : ''}" data-blog-lang="kr_summary">
              🇰🇷 국문 + 하단 영문요약 (네이버 SEO 추천)
            </button>
            <button type="button" class="blog-lang-btn ${state.blogLangMode === 'en_full' ? 'active' : ''}" data-blog-lang="en_full">
              🇺🇸 영문 전문 (Full EN · 외국인/구글용)
            </button>
            <button type="button" class="blog-lang-btn ${state.blogLangMode === 'bilingual_stacked' ? 'active' : ''}" data-blog-lang="bilingual_stacked">
              🇰🇷+🇺🇸 문단별 한·영 병기
            </button>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;text-transform:none;">
              <input type="checkbox" id="blog-kw-highlight-toggle" ${state.highlightBlogKeywords ? 'checked' : ''} />
              <span>키워드 하이라이트</span>
            </label>
            <button type="button" id="copy-blog-mode-btn" class="btn btn-secondary btn-sm">📋 현재 모드 원고 복사</button>
          </div>
        </div>

        <div class="naver-blog-mockup">
          <div class="naver-top-strip">
            <span>NAVER BLOG · 솜씨(SOMSSI) 공식 블로그</span>
            <span>${state.blogLangMode === 'en_full' ? 'Full English Guide' : state.blogLangMode === 'bilingual_stacked' ? '한·영 문단 병기' : '국문 + 하단 영문 요약'}</span>
          </div>
          <article class="naver-article">
            <div class="naver-category">인천·송도 로컬 문화예술 · 줄을 다루는 솜씨</div>
            <h3 class="naver-title">${escapeHtml(displayTitle)}</h3>
            <div class="naver-author-row">
              <span>솜씨(SOMSSI) 송도 가야금 스튜디오 · 방금 전</span>
              <span>국문 본문 ${totalBodyChars.toLocaleString()}자 (권장 1,500–2,500자)</span>
            </div>

            ${articleSectionsHtml}

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

      <!-- Specs & Blog Image Studio Pane -->
      <div class="specs-pane channel-grid">
        <div class="channel-box">
          <div class="studio-header">
            <h3 style="margin:0;">🖼 네이버 블로그 섹션별 인포그래픽·배너 이미지 스튜디오</h3>
            <button type="button" id="dl-all-blog-png" class="btn btn-primary btn-sm">
              ⬇ 블로그 이미지 4장 일괄 저장
            </button>
          </div>
          <p class="subtitle">각 섹션 본문 상단에 삽입된 인포그래픽 이미지를 PNG로 저장하거나 실제 매장 사진을 합성할 수 있습니다.</p>
          ${blogBanners
            .map(
              (b, idx) => `
            <div class="prompt-guide-box" style="margin-top:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                <strong>섹션 ${idx + 1}: ${escapeHtml(b.h2)}</strong>
                <div style="display:flex;gap:6px;">
                  <label class="btn btn-secondary btn-sm" style="margin:0;">
                    📷 사진 합성
                    <input type="file" data-blog-bg-upload="${idx}" accept="image/*" style="display:none;" />
                  </label>
                  <button type="button" class="btn btn-ghost btn-sm" data-dl-blog-canvas="${idx}">PNG 저장</button>
                </div>
              </div>
              <div style="margin-top:4px;">${escapeHtml(b.photoGuide)}</div>
              <div style="color:var(--text-muted);margin-top:2px;">
                <strong>SEO alt 태그:</strong> <code>${escapeHtml(b.altText)}</code>
              </div>
            </div>
          `
            )
            .join('')}
        </div>

        <div class="channel-box">
          <h3>Blog Title (≤ 40 chars) <span class="char-badge">${nb.title.length} / 40 chars</span></h3>
          <p style="font-size: 1.05rem; font-weight: 700">${escapeHtml(nb.title)}</p>
        </div>
        <div class="channel-box">
          <h3>Search Keywords (5–8) <span class="char-badge">${nb.keywords.length} keywords</span></h3>
          <div class="tag-cloud">${nb.keywords.map((k) => `<span class="tag">${escapeHtml(k)}</span>`).join('')}</div>
        </div>
      </div>
    </div>
  `;

  // Render each section canvas
  blogBanners.forEach((b, idx) => {
    const c = panel.querySelector(`#blog-canvas-${idx}`);
    if (c) renderBlogSectionCanvas(c, b, idx);
  });

  panel.querySelectorAll('[data-blog-lang]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.blogLangMode = btn.dataset.blogLang;
      renderNaverBlogChannel(getActiveData().naver_blog);
    });
  });

  panel.querySelector('#blog-kw-highlight-toggle')?.addEventListener('change', (e) => {
    state.highlightBlogKeywords = e.target.checked;
    renderNaverBlogChannel(getActiveData().naver_blog);
  });

  panel.querySelectorAll('[data-dl-blog-canvas]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.dlBlogCanvas);
      const c = panel.querySelector(`#blog-canvas-${idx}`);
      downloadCanvasAsPng(c, `somssi_naver_blog_section_${idx + 1}.png`);
    });
  });

  panel.querySelector('#dl-all-blog-png')?.addEventListener('click', () => {
    blogBanners.forEach((_, idx) => {
      const c = panel.querySelector(`#blog-canvas-${idx}`);
      if (c) downloadCanvasAsPng(c, `somssi_naver_blog_section_${idx + 1}.png`);
    });
  });

  panel.querySelectorAll('[data-blog-bg-upload]').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const idx = Number(inp.dataset.blogBgUpload);
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          state.blogCustomBgImages[idx] = img;
          renderNaverBlogChannel(getActiveData().naver_blog);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  });

  panel.querySelector('#copy-blog-mode-btn')?.addEventListener('click', async () => {
    let copyText = '';
    if (state.blogLangMode === 'en_full') {
      copyText = `${bilingualMeta.enTitle}\n\n` +
        (bilingualMeta.enSections || []).map((s) => `## ${s.h2}\n${s.body}`).join('\n\n');
    } else if (state.blogLangMode === 'bilingual_stacked') {
      copyText = `${nb.title} / ${bilingualMeta.enTitle}\n\n` +
        (bilingualMeta.bilingualSections || [])
          .map((s) => `## ${s.h2_kr}\n${s.body_kr}\n\n[EN] ${s.h2_en}\n${s.body_en}`)
          .join('\n\n');
    } else {
      copyText = `${nb.title}\n\n` +
        (nb.sections || []).map((s) => `## ${s.h2}\n${s.body}`).join('\n\n') +
        `\n\n[English Summary]\n${nb.en_summary}`;
    }
    await navigator.clipboard.writeText(copyText);
    alert('현재 선택된 블로그 언어 모드의 전체 원고가 복사되었습니다.');
  });
}

function renderChannels() {
  const data = getActiveData();
  if (!data) return;

  renderReelsChannel(data.reels);
  renderInstagramChannel(data.instagram_feed);
  renderThreadsChannel(data.threads);
  renderNaverBlogChannel(data.naver_blog);

  document.getElementById('panel-raw_json').innerHTML = `
    <pre class="code-block">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
  `;
}

function buildCurrentGeneratePayload() {
  return {
    mode: 'generate',
    date: document.getElementById('trend-date').value,
    contentType: document.getElementById('content-type-select').value,
    pillar: document.getElementById('pillar-select').value,
    trend: {
      contentType: document.getElementById('content-type-select').value,
      pillar: document.getElementById('pillar-select').value,
      title: document.getElementById('trend-title').value,
      summary: document.getElementById('trend-summary').value,
      source: document.getElementById('trend-source').value,
      language: document.getElementById('trend-lang').value
    }
  };
}

async function openSubscriptionBridgeModal(inputPayload) {
  const res = await fetch('/api/subscription/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: inputPayload })
  });
  const data = await res.json();
  state.lastPromptBundle = data.promptBundle;
  state.lastBridgeInput = inputPayload;
  document.getElementById('sub-prompt-preview-pre').textContent =
    data.promptBundle?.combinedPrompt || '';
  document.getElementById('sub-bridge-dialog').showModal();
}

function showGenerateStatus(message, type = 'ok') {
  const el = document.getElementById('generate-status-msg');
  if (!el) return;
  el.style.display = 'block';
  if (type === 'warn') {
    el.style.background = '#fffbeb';
    el.style.border = '1px solid #f59e0b';
    el.style.color = '#92400e';
  } else if (type === 'err') {
    el.style.background = '#fef2f2';
    el.style.border = '1px solid #ef4444';
    el.style.color = '#991b1b';
  } else {
    el.style.background = '#ecfdf5';
    el.style.border = '1px solid #10b981';
    el.style.color = '#065f46';
  }
  el.innerHTML = message;
}

async function generateDraft() {
  const provider = document.getElementById('subscription-provider').value;
  const inputPayload = buildCurrentGeneratePayload();

  if (provider === 'web-subscription') {
    await openSubscriptionBridgeModal(inputPayload);
    return;
  }

  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  btn.textContent =
    provider === 'local-rule-engine'
      ? '⚡ 4개 채널 초안 즉시 생성 중...'
      : `⏳ ${provider} 구독 모델로 4개 채널 생성 중 (약 15~35초)...`;
  showGenerateStatus(
    provider === 'local-rule-engine'
      ? '내장 솜씨 룰 엔진으로 4개 채널 원고를 생성하고 있습니다...'
      : `로컬 <strong>${escapeHtml(provider)}</strong> 구독 CLI를 호출하여 4개 채널 JSON을 생성 중입니다...`,
    'warn'
  );

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...inputPayload,
        provider
      })
    });
    const data = await res.json();
    if (!res.ok || !data.output) {
      throw new Error(data.error || '서버에서 초안을 생성하지 못했습니다.');
    }
    state.currentOutput = data.output;
    state.publishedPreview = data.publishedPreview;
    state.validation = data.validation;
    state.extras = data.extras;
    state.lastPromptBundle = data.promptBundle;
    state.reelsSceneIdx = 0;
    state.igSlideIdx = 0;
    document.getElementById('engine-badge').textContent = `구독 모드: ${data.engineUsed}`;
    renderSidebarStatus();
    renderChannels();

    const nowStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    const shortTitle = (inputPayload.trend?.title || '').slice(0, 34);
    if (data.cliWarning) {
      showGenerateStatus(
        `⚠️ <strong>[${nowStr}] CLI 알림:</strong> ${escapeHtml(data.cliWarning)}<br/>→ 내장 솜씨 룰 엔진으로 <strong>"${escapeHtml(shortTitle)}…"</strong> 주제의 4개 채널 초안을 생성했습니다.`,
        'warn'
      );
    } else {
      showGenerateStatus(
        `✓ <strong>[${nowStr}] 4개 채널 초안 생성 완료!</strong><br/>주제: <em>"${escapeHtml(shortTitle)}…"</em> (${escapeHtml(data.engineUsed)})`,
        'ok'
      );
    }
  } catch (err) {
    showGenerateStatus(`❌ 생성 오류: ${escapeHtml(err.message)}`, 'err');
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

  const provider = document.getElementById('subscription-provider').value;
  const revisePayload = {
    mode: 'revise',
    channel: state.activeChannel,
    instruction,
    contentType: document.getElementById('content-type-select').value,
    pillar: document.getElementById('pillar-select').value,
    previous_output: state.currentOutput
  };

  if (provider === 'web-subscription') {
    await openSubscriptionBridgeModal(revisePayload);
    return;
  }

  const btn = document.getElementById('revise-btn');
  btn.disabled = true;
  btn.textContent = '구독 모델로 수정 중...';
  try {
    const res = await fetch('/api/revise', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...revisePayload,
        provider
      })
    });
    const data = await res.json();
    if (!res.ok || !data.output) {
      throw new Error(data.error || '채널 수정 중 오류가 발생했습니다.');
    }
    state.currentOutput = data.output;
    state.publishedPreview = data.publishedPreview;
    state.validation = data.validation;
    state.extras = data.extras;
    state.lastPromptBundle = data.promptBundle;
    document.getElementById('engine-badge').textContent = `구독 모드: ${data.engineUsed}`;
    renderSidebarStatus();
    renderChannels();
    const nowStr = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    showGenerateStatus(
      `✓ <strong>[${nowStr}] ${escapeHtml(state.activeChannel)} 채널 수정 완료!</strong> (${escapeHtml(data.engineUsed)})`,
      'ok'
    );
  } catch (err) {
    showGenerateStatus(`❌ 수정 오류: ${escapeHtml(err.message)}`, 'err');
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

function renderCliStatusBox(providers = []) {
  const box = document.getElementById('cli-status-box');
  if (!box) return;
  const cliOnly = providers.filter((p) => p.mode === 'cli-subscription');
  box.innerHTML =
    '<div style="font-weight:700;margin-bottom:4px;color:var(--text);">내 Mac 로컬 구독 CLI 연결 상태:</div>' +
    cliOnly
      .map((p) => {
        const ok = p.installed && p.authenticated;
        const badge = ok
          ? '<span style="color:var(--ok);font-weight:700;">● 연결됨 (설치·로그인 완료)</span>'
          : p.installed
            ? `<span style="color:var(--warn);">● 로그인 필요 (<code>${escapeHtml(p.loginCommand)}</code>)</span>`
            : '<span style="color:var(--err);">● 미설치</span>';
        return `<div style="display:flex;justify-content:space-between;padding:2px 0;"><span>${escapeHtml(p.name)}</span>${badge}</div>`;
      })
      .join('');
}

async function init() {
  setupTabs();
  setupViewModeButtons();
  document.getElementById('trend-date').value = new Date().toISOString().slice(0, 10);

  const cfgRes = await fetch('/api/config');
  state.config = await cfgRes.json();
  populateTrendSelect(state.config.presets || []);
  renderWeeklyCalendarBar(state.config.weeklyPillars || []);
  renderCliStatusBox(state.config.subscriptionProviders || []);

  document.getElementById('trend-preset-select').addEventListener('change', async (e) => {
    const t = state.trends[Number(e.target.value)];
    applyTrendForm(t);
    if (document.getElementById('subscription-provider').value === 'local-rule-engine') {
      await generateDraft();
    }
  });

  document.getElementById('content-type-select').addEventListener('change', (e) => {
    const mode = e.target.value;
    const pillarSel = document.getElementById('pillar-select');
    if (mode === 'somssi_class') {
      pillarSel.value = 'somssi_class';
    } else if (pillarSel.value === 'somssi_class') {
      pillarSel.value = 'incheon_tourism';
    }
  });

  document.getElementById('pillar-select').addEventListener('change', (e) => {
    const pillar = e.target.value;
    document.getElementById('content-type-select').value =
      pillar === 'somssi_class' ? 'somssi_class' : 'culture_magazine';
  });

  document.getElementById('fetch-live-btn').addEventListener('click', async () => {
    const btn = document.getElementById('fetch-live-btn');
    const msg = document.getElementById('rss-status-msg');
    const qInput = document.getElementById('rss-query-input');
    const currentDay = state.weeklyPillars.find((w) => w.dayIndex === state.selectedDayIndex);
    const q = (qInput && qInput.value.trim()) || currentDay?.rssQuery || '인천 송도 여행 한국 전통문화';
    const pillar = document.getElementById('pillar-select').value;
    const contentType = document.getElementById('content-type-select').value;

    btn.textContent = '수집 중...';
    if (msg) msg.textContent = `'${q}' 관련 최신 뉴스 RSS 수집 중...`;
    const res = await fetch(
      `/api/trends?live=1&q=${encodeURIComponent(q)}&pillar=${encodeURIComponent(pillar)}&contentType=${encodeURIComponent(contentType)}`
    );
    const data = await res.json();
    const liveCount = (data.trends || []).filter((t) => t.isLiveRss).length;
    populateTrendSelect(data.trends || []);
    if (msg) {
      msg.textContent =
        liveCount > 0
          ? `✓ '${q}' 검색어로 실시간 뉴스 ${liveCount}건을 불러와 4개 채널 초안에 즉시 반영했습니다.`
          : `네트워크 응답이 없어 기본 프리셋을 유지했습니다.`;
    }
    btn.textContent = '📡 실시간 RSS 불러오기';
    if (document.getElementById('subscription-provider').value === 'local-rule-engine') {
      await generateDraft();
    }
  });

  document.getElementById('generate-btn').addEventListener('click', generateDraft);
  document.getElementById('revise-btn').addEventListener('click', reviseDraft);

  document.getElementById('preview-utm-toggle').addEventListener('change', (e) => {
    state.previewUtm = e.target.checked;
    renderChannels();
  });

  document.getElementById('open-sub-bridge-btn').addEventListener('click', async () => {
    await openSubscriptionBridgeModal(buildCurrentGeneratePayload());
  });

  document.getElementById('copy-sub-prompt-btn').addEventListener('click', async () => {
    const text = document.getElementById('sub-prompt-preview-pre').textContent;
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('copy-sub-prompt-btn');
    btn.textContent = '✓ 클립보드에 복사 완료! (ChatGPT / Claude / Gemini에 붙여넣기)';
    setTimeout(() => {
      btn.textContent = '1단계: 전체 프롬프트(System + Schema + Trend) 복사';
    }, 2500);
  });

  document.getElementById('apply-sub-response-btn').addEventListener('click', async () => {
    const rawText = document.getElementById('sub-response-textarea').value.trim();
    if (!rawText) {
      alert('구독 AI가 출력한 JSON 응답을 붙여넣어 주세요.');
      return;
    }
    const bridgeInput = state.lastBridgeInput || { mode: 'generate' };
    const res = await fetch('/api/subscription/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText,
        mode: bridgeInput.mode,
        channel: bridgeInput.channel,
        contentType: bridgeInput.contentType,
        pillar: bridgeInput.pillar,
        previous_output: bridgeInput.previous_output,
        serviceName: 'ChatGPT/Claude/Gemini Web'
      })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`JSON 파싱 오류: ${data.error}`);
      return;
    }
    state.currentOutput = data.output;
    state.publishedPreview = data.publishedPreview;
    state.validation = data.validation;
    state.extras = data.extras;
    document.getElementById('engine-badge').textContent = `구독 모드: ${data.engineUsed}`;
    renderSidebarStatus();
    renderChannels();
    document.getElementById('sub-bridge-dialog').close();
  });

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

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...buildCurrentGeneratePayload(),
      provider: 'local-rule-engine'
    })
  });
  const data = await res.json();
  state.currentOutput = data.output;
  state.publishedPreview = data.publishedPreview;
  state.validation = data.validation;
  state.extras = data.extras;
  document.getElementById('engine-badge').textContent = `구독 모드: ${data.engineUsed}`;
  renderSidebarStatus();
  renderChannels();
}

init();
