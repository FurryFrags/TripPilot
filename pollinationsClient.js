const { createHash } = require('crypto');

const PLACEHOLDER_MD5 = '2090a5dc21c32952cbf8496339752bd1';

class Throttler {
  static chain = Promise.resolve();
  static lastTs = 0;

  static async schedule(minIntervalMs, fn) {
    let run;
    const gate = new Promise((resolve) => (run = resolve));
    const prev = this.chain;
    this.chain = prev.finally(() => gate);
    await prev;
    const wait = Math.max(0, minIntervalMs - (Date.now() - this.lastTs));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    this.lastTs = Date.now();
    try {
      return await fn();
    } finally {
      run();
    }
  }
}

class PollinationsClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseURL] Override generation base URL. By default, legacy bases are used without API key.
   * @param {string} [options.apiKey] API key. When provided, text/image/chat generation routes to https://gen.pollinations.ai.
   * @param {number} [options.minIntervalMs=16000] Global minimum gap between any two requests from this process.
   * @param {number} [options.timeoutMs=30000] Per-request timeout in milliseconds.
   * @param {number} [options.maxRetries=3] Max retries for transient failures with exponential backoff.
   */
  constructor({ baseURL, apiKey, minIntervalMs = 16000, timeoutMs = 30000, maxRetries = 3 } = {}) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.minIntervalMs = minIntervalMs;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.legacyTextBase = 'https://text.pollinations.ai';
    this.legacyImageBase = 'https://image.pollinations.ai';
    this.unifiedBase = 'https://gen.pollinations.ai';
  }

  _buildURL(base, path = '', params) {
    const url = new URL(path, base.endsWith('/') ? base : `${base}/`);
    for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    if (this.apiKey) url.searchParams.set('key', this.apiKey);
    return url;
  }

  _headers(extra) {
    return this.apiKey ? { ...extra, Authorization: `Bearer ${this.apiKey}` } : extra || {};
  }

  async fetchWithTimeout(url, options = {}, timeoutMs = this.timeoutMs) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: ctl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async _request(url, options = {}, { parse = 'json', skipRetry = false } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await Throttler.schedule(this.minIntervalMs, () => this.fetchWithTimeout(url, options));
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          if (!skipRetry && (res.status >= 500 || res.status === 429) && attempt < this.maxRetries) {
            await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
            continue;
          }
          throw new Error(`HTTP ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 500)}` : ''}`);
        }
        if (parse === 'response') return res;
        if (parse === 'text') return res.text();
        if (parse === 'arrayBuffer') return Buffer.from(await res.arrayBuffer());
        return res.json();
      } catch (err) {
        lastErr = err;
        if (!skipRetry && attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        throw err;
      }
    }
    throw lastErr;
  }

  _textBase() { return this.baseURL || (this.apiKey ? this.unifiedBase : this.legacyTextBase); }
  _imageBase() { return this.baseURL || (this.apiKey ? this.unifiedBase : this.legacyImageBase); }

  /**
   * OpenAI-compatible chat completions request.
   * @param {Object} payload OpenAI-like payload. If payload.stream=true, raw Response is returned for SSE/chunk consumption.
   * @returns {Promise<Object|Response>} Parsed JSON for non-stream requests, or raw Response when streaming.
   * @throws {Error} On timeout, HTTP errors, and retry exhaustion.
   */
  async chatCompletions(payload) {
    const stream = payload?.stream === true;
    const url = this._buildURL(this._textBase(), 'openai');
    return this._request(url, {
      method: 'POST',
      headers: this._headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(payload || {}),
    }, { parse: stream ? 'response' : 'json' });
  }

  /**
   * GET text generation.
   * @param {string} prompt Prompt text.
   * @param {Object} [params] Query params (e.g. model, seed, system, json, temperature, top_p, max_tokens, presence_penalty).
   * @returns {Promise<string|Object>} Text by default, parsed JSON when params.json=true.
   * @throws {Error} On timeout, HTTP errors, and retry exhaustion.
   */
  async textGET(prompt, params = {}) {
    const asJson = params.json === true || params.json === 'true' || params.response_format === 'json';
    const url = this._buildURL(this._textBase(), encodeURIComponent(prompt), params);
    return this._request(url, { headers: this._headers() }, { parse: asJson ? 'json' : 'text' });
  }

  /**
   * Build an image generation URL.
   * @param {string} prompt Prompt text.
   * @param {Object} [params] Image query params (e.g. model, seed, width, height, enhance, nologo, private, safe).
   * @returns {string} Fully qualified URL.
   */
  imageURL(prompt, params = {}) {
    return this._buildURL(this._imageBase(), encodeURIComponent(prompt), params).toString();
  }

  /**
   * GET image bytes.
   * Detects known placeholder/rate-limit image via MD5 and throws a clear error.
   * Current observation: placeholder image is often ~1.3MB, while typical valid images are often <300KB.
   * @param {string} prompt Prompt text.
   * @param {Object} [params] Image query params.
   * @returns {Promise<Buffer>} Raw image bytes.
   * @throws {Error} On timeout, HTTP errors, retry exhaustion, or placeholder/rate-limit detection.
   */
  async imageGET(prompt, params = {}) {
    const url = this.imageURL(prompt, params);
    const bytes = await this._request(url, { headers: this._headers() }, { parse: 'arrayBuffer' });
    if (createHash('md5').update(bytes).digest('hex') === PLACEHOLDER_MD5) {
      throw new Error('Pollinations returned known placeholder image (likely rate-limited or capacity-limited). Please wait and retry.');
    }
    return bytes;
  }

  async _listModelsFor(base) {
    const candidates = this.apiKey ? [this.unifiedBase, base] : [base];
    let lastErr;
    for (const b of candidates) {
      try {
        const url = this._buildURL(b, 'models');
        return await this._request(url, { headers: this._headers() }, { parse: 'json', skipRetry: true });
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  /**
   * List available text/chat models from /models.
   * Uses legacy text endpoint by default; in unified mode, it first tries gen and falls back gracefully.
   * @returns {Promise<any>} Parsed JSON model list.
   */
  async listTextModels() { return this._listModelsFor(this.legacyTextBase); }

  /**
   * List available image models from /models.
   * Uses legacy image endpoint by default; in unified mode, it first tries gen and falls back gracefully.
   * @returns {Promise<any>} Parsed JSON model list.
   */
  async listImageModels() { return this._listModelsFor(this.legacyImageBase); }
}

module.exports = { PollinationsClient, Throttler, PLACEHOLDER_MD5 };
