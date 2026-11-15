const state = {
  config: null,
  trends: [],
  activeChannel: 'reels',
  currentOutput: null,
  publishedPreview: null,
  validation: null,
  previewUtm: false
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
    .map(
      (f) =>
        `<li><strong>[${escapeHtml(f.source)}]</strong> ${escapeHtml(f.fact)}</li>`
    )
    .join('');
}

function renderChannels() {
  const data = getActiveData();
  if (!data) return;

  // 1. Reels
  const r = data.reels;
  document.getElementById('panel-reels').innerHTML = `
    <div class="channel-grid">
      <div class="channel-box">
        <h3>First 2s Hook (≤ 40 chars) <span class="char-badge">EN ${r.hook.en.length}/40 · KR ${r.hook.kr.length}/40</span></h3>
        <p><strong>EN:</strong> ${escapeHtml(r.hook.en)}</p>
        <p><strong>KR:</strong> ${escapeHtml(r.hook.kr)}</p>
      </div>
      <div class="channel-box">
        <h3>On-Screen Text (3–4 lines, ≤ 30 chars each) <span class="char-badge">${r.onscreen_text.length} lines</span></h3>
        <ol>
          ${r.onscreen_text
            .map((line) => `<li>${escapeHtml(line)} <small>(${line.length}/30)</small></li>`)
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
  `;

  // 2. Instagram Feed
  const ig = data.instagram_feed;
  const cardLabels = ['1. Cover (Hook)', '2. Context', '3. Experience (120m)', '4. CTA'];
  document.getElementById('panel-instagram_feed').innerHTML = `
    <div class="channel-grid">
      <div class="cards-carousel">
        ${ig.cards
          .map(
            (c, i) => `
          <div class="ig-card">
            <div class="ig-card-num">${cardLabels[i] || `Card ${i + 1}`}</div>
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
  `;

  // 3. Threads
  const th = data.threads;
  document.getElementById('panel-threads').innerHTML = `
    <div class="channel-grid">
      <div class="channel-box">
        <h3>Threads Conversational Post (≤ 450 chars, ends with ?) <span class="char-badge">${th.text.length} / 450 chars</span></h3>
        <p style="font-size: 1rem; white-space: pre-line">${escapeHtml(th.text)}</p>
      </div>
    </div>
  `;

  // 4. Naver Blog
  const nb = data.naver_blog;
  const totalBodyChars = nb.sections.reduce((acc, s) => acc + s.body.length, 0);
  document.getElementById('panel-naver_blog').innerHTML = `
    <div class="channel-grid">
      <div class="channel-box">
        <h3>Blog Title (≤ 40 chars) <span class="char-badge">${nb.title.length} / 40 chars</span></h3>
        <p style="font-size: 1.08rem; font-weight: 700">${escapeHtml(nb.title)}</p>
      </div>
      <div class="channel-box">
        <h3>Sections (${nb.sections.length} sections · Total Body: ${totalBodyChars} / 1,500–2,500 chars)</h3>
        ${nb.sections
          .map(
            (s) => `
          <div class="blog-section">
            <h4>H2: ${escapeHtml(s.h2)}</h4>
            <div style="white-space: pre-line; font-size: 0.9rem">${escapeHtml(s.body)}</div>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="channel-box">
        <h3>English Summary (for Foreign Guests &amp; Hotel Concierges)</h3>
        <p>${escapeHtml(nb.en_summary)}</p>
      </div>
      <div class="channel-box">
        <h3>Search Keywords (5–8) <span class="char-badge">${nb.keywords.length} keywords</span></h3>
        <div class="tag-cloud">${nb.keywords.map((k) => `<span class="tag">${escapeHtml(k)}</span>`).join('')}</div>
      </div>
    </div>
  `;

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
