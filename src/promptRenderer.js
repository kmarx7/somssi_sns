import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const PATHS = {
  root: ROOT_DIR,
  template: path.join(ROOT_DIR, 'somssi_system_prompt.template.md'),
  renderedPrompt: path.join(ROOT_DIR, 'somssi_system_prompt.md'),
  schema: path.join(ROOT_DIR, 'somssi_output_schema.json'),
  groundTruth: path.join(ROOT_DIR, 'config', 'ground_truth.json'),
  ragKnowledgeBase: path.join(ROOT_DIR, 'config', 'rag_knowledge_base.json')
};

export function loadGroundTruth() {
  return JSON.parse(fs.readFileSync(PATHS.groundTruth, 'utf8'));
}

export function saveGroundTruth(data) {
  fs.writeFileSync(PATHS.groundTruth, JSON.stringify(data, null, 2) + '\n', 'utf8');
  syncRenderedSystemPrompt(data);
}

export function loadRagKnowledgeBase() {
  return JSON.parse(fs.readFileSync(PATHS.ragKnowledgeBase, 'utf8'));
}

export function saveRagKnowledgeBase(data) {
  fs.writeFileSync(PATHS.ragKnowledgeBase, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function loadOutputSchema() {
  return JSON.parse(fs.readFileSync(PATHS.schema, 'utf8'));
}

/**
 * Renders the system prompt template by replacing Section 2 placeholders
 * while intentionally keeping {{BOOKING_URL}} as a literal placeholder.
 */
export function renderSystemPromptMarkdown(groundTruth = loadGroundTruth()) {
  const template = fs.readFileSync(PATHS.template, 'utf8');
  const p = groundTruth.placeholders || {};

  let rendered = template
    .replace('{{PRODUCT_NAME_EN}}', p.PRODUCT_NAME_EN || 'SOMSSI Gayageum & Hanbok One-Day Class')
    .replace('{{PRODUCT_NAME_KR}}', p.PRODUCT_NAME_KR || '솜씨(SOMSSI) 가야금·한복 원데이클래스')
    .replace('{{VENUE_NAME_OR_AREA}}', p.VENUE_NAME_OR_AREA || 'Near Songdo Central Park (송도 센트럴파크 인근)')
    .replace('{{N}}', String(p.N || '25'))
    .replace('{{TRANSPORT}}', p.TRANSPORT || 'taxi or airport limousine')
    .replace(
      '{{HANBOK_FITTING_INCLUDED: "including" / "plus"}}',
      p.HANBOK_FITTING_INCLUDED || 'including'
    )
    .replace('{{INCLUDED/EXCLUDED}}', p['INCLUDED/EXCLUDED'] || 'included')
    .replace('{{KR / EN / ...}}', p['KR / EN / ...'] || 'KR / EN (Korean and English)')
    .replace('{{MIN_LAYOVER_HOURS}}', String(p.MIN_LAYOVER_HOURS || '6'));

  return rendered;
}

/**
 * Builds the full system prompt including [RAG_KnowledgeBase] entries for LLM calls.
 */
export function buildFullSystemPrompt(
  groundTruth = loadGroundTruth(),
  ragKb = loadRagKnowledgeBase()
) {
  const basePrompt = renderSystemPromptMarkdown(groundTruth);
  const ragEntries = (ragKb.entries || [])
    .map(
      (entry) =>
        `- [${entry.id}] (${entry.category}) ${entry.title}\n  - EN: ${entry.fact_en}\n  - KR: ${entry.fact_kr}`
    )
    .join('\n');

  return `${basePrompt}\n\n## [RAG_KnowledgeBase]\n\n${ragEntries}\n`;
}

/**
 * Syncs the rendered markdown back to somssi_system_prompt.md
 */
export function syncRenderedSystemPrompt(groundTruth = loadGroundTruth()) {
  const rendered = renderSystemPromptMarkdown(groundTruth);
  fs.writeFileSync(PATHS.renderedPrompt, rendered, 'utf8');
  return rendered;
}

/**
 * Replaces literal {{BOOKING_URL}} with channel-specific UTM URLs for Make.com / publishing export.
 */
export function resolveBookingUrlsForPublish(outputJson, groundTruth = loadGroundTruth()) {
  const utmLinks = groundTruth?.publishing?.utm_links || {};
  const fallbackUrl = groundTruth?.publishing?.base_booking_url || 'https://somssi.kr/book';
  const clone = JSON.parse(JSON.stringify(outputJson));

  const replaceInChannel = (obj, url) => {
    if (!obj || typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj).replaceAll('{{BOOKING_URL}}', url));
  };

  if (clone.reels) {
    clone.reels = replaceInChannel(clone.reels, utmLinks.reels || fallbackUrl);
  }
  if (clone.instagram_feed) {
    clone.instagram_feed = replaceInChannel(
      clone.instagram_feed,
      utmLinks.instagram_feed || fallbackUrl
    );
  }
  if (clone.threads) {
    clone.threads = replaceInChannel(clone.threads, utmLinks.threads || fallbackUrl);
  }
  if (clone.naver_blog) {
    clone.naver_blog = replaceInChannel(clone.naver_blog, utmLinks.naver_blog || fallbackUrl);
  }

  return clone;
}
