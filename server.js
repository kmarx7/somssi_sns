import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFullSystemPrompt,
  loadGroundTruth,
  loadOutputSchema,
  loadRagKnowledgeBase,
  resolveBookingUrlsForPublish,
  saveGroundTruth
} from './src/promptRenderer.js';
import { fetchLiveTrends, PRESET_TRENDS } from './src/trends.js';
import { runCopilot } from './src/copilot.js';
import { validateMarketingOutput } from './src/validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3400);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (req.method === 'GET' && url.pathname === '/api/config') {
      const groundTruth = loadGroundTruth();
      const ragKb = loadRagKnowledgeBase();
      const outputSchema = loadOutputSchema();
      const systemPrompt = buildFullSystemPrompt(groundTruth, ragKb);
      return sendJson(res, 200, {
        groundTruth,
        ragKb,
        outputSchema,
        systemPrompt,
        presets: PRESET_TRENDS
      });
    }

    if (req.method === 'PUT' && url.pathname === '/api/config/ground-truth') {
      const body = await readRequestBody(req);
      const current = loadGroundTruth();
      const updated = {
        ...current,
        placeholders: {
          ...current.placeholders,
          ...(body.placeholders || {})
        },
        publishing: {
          ...current.publishing,
          ...(body.publishing || {})
        }
      };
      saveGroundTruth(updated);
      const systemPrompt = buildFullSystemPrompt(updated, loadRagKnowledgeBase());
      return sendJson(res, 200, { ok: true, groundTruth: updated, systemPrompt });
    }

    if (req.method === 'GET' && url.pathname === '/api/trends') {
      const live = url.searchParams.get('live') === '1';
      const query = url.searchParams.get('q') || 'Korea traditional culture travel Incheon';
      const trends = live ? await fetchLiveTrends(query) : PRESET_TRENDS;
      return sendJson(res, 200, { trends });
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      const body = await readRequestBody(req);
      const payload = {
        mode: 'generate',
        date: body.date || new Date().toISOString().slice(0, 10),
        trend: body.trend || PRESET_TRENDS[0]
      };
      const { output, validation, engineUsed } = await runCopilot(payload, {
        apiKey: body.apiKey,
        model: body.model
      });
      const publishedPreview = resolveBookingUrlsForPublish(output);
      return sendJson(res, 200, {
        input: payload,
        output,
        validation,
        publishedPreview,
        engineUsed
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/revise') {
      const body = await readRequestBody(req);
      const payload = {
        mode: 'revise',
        channel: body.channel || 'reels',
        instruction: body.instruction || '',
        previous_output: body.previous_output
      };
      const { output, validation, engineUsed } = await runCopilot(payload, {
        apiKey: body.apiKey,
        model: body.model
      });
      const publishedPreview = resolveBookingUrlsForPublish(output);
      return sendJson(res, 200, {
        input: payload,
        output,
        validation,
        publishedPreview,
        engineUsed
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/validate') {
      const body = await readRequestBody(req);
      const validation = validateMarketingOutput(body.output);
      const publishedPreview = body.output ? resolveBookingUrlsForPublish(body.output) : null;
      return sendJson(res, 200, { validation, publishedPreview });
    }

    if (req.method === 'POST' && url.pathname === '/api/publish') {
      const body = await readRequestBody(req);
      const validation = validateMarketingOutput(body.output);
      if (!validation.valid) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Draft has validation errors and cannot be published until resolved.',
          validation
        });
      }
      const publishedPayload = resolveBookingUrlsForPublish(body.output);
      let webhookStatus = 'local-export-only';

      if (body.webhookUrl && /^https?:\/\//i.test(body.webhookUrl)) {
        const whRes = await fetch(body.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approved_at: new Date().toISOString(),
            reviewer: body.reviewer || 'SOMSSI Marketing Reviewer',
            channels: publishedPayload
          })
        });
        webhookStatus = `sent (${whRes.status})`;
      }

      return sendJson(res, 200, {
        ok: true,
        webhookStatus,
        publishedPayload
      });
    }

    // Serve static files from public/
    const safePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.join(PUBLIC_DIR, path.normalize(safePath));
    if (!filePath.startsWith(PUBLIC_DIR)) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    sendJson(res, 404, { error: 'Not Found' });
  } catch (err) {
    sendJson(res, 500, { error: err.message || 'Internal Server Error' });
  }
});

if (process.argv[1] === __filename) {
  server.listen(PORT, () => {
    console.log(`SOMSSI Global Marketing Copilot running at http://localhost:${PORT}`);
  });
}
