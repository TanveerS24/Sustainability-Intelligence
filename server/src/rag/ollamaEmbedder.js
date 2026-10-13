/**
 * Ollama Embedding Client.
 * Connects to local Ollama runtime to produce vector embeddings
 * using dedicated embedding models (e.g., nomic-embed-text:latest).
 */
import cfg from '../config.js';

export class OllamaEmbedder {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || cfg.OLLAMA_BASE_URL;
    this.model = options.model || cfg.OLLAMA_EMBED_MODEL;
    this.timeoutMs = options.timeoutMs || cfg.OLLAMA_TIMEOUT_MS;
    this.expectedDim = options.expectedDim || 768;
    this.maxRetries = options.maxRetries || 3;
  }

  /**
   * Embed a single text string.
   */
  async embedText(text) {
    const cleaned = (text || '').trim();
    if (!cleaned) {
      throw new Error('Cannot embed empty text');
    }

    let attempt = 0;
    while (attempt < this.maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            prompt: cleaned,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          throw new Error(`Ollama embedding error HTTP ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        if (!data.embedding || !Array.isArray(data.embedding)) {
          throw new Error('Malformed embedding response from Ollama: missing embedding array');
        }

        if (this.expectedDim && data.embedding.length !== this.expectedDim) {
          console.warn(
            `[OllamaEmbedder] Received dimension ${data.embedding.length}, expected ${this.expectedDim}`
          );
        }

        return data.embedding;
      } catch (err) {
        clearTimeout(timer);
        const isAbort = err.name === 'AbortError';
        if (attempt >= this.maxRetries) {
          throw new Error(
            `Failed to embed text after ${attempt} attempts: ${isAbort ? 'Timeout' : err.message}`
          );
        }
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise((res) => setTimeout(res, backoffMs));
      }
    }
  }

  /**
   * Embed an array of texts in batches with progress callback.
   */
  async embedBatch(texts, onProgress = null, concurrency = 4) {
    const results = new Array(texts.length);
    let completed = 0;

    for (let i = 0; i < texts.length; i += concurrency) {
      const slice = texts.slice(i, i + concurrency);
      const promises = slice.map((text, idx) => {
        const globalIdx = i + idx;
        return this.embedText(text)
          .then((emb) => {
            results[globalIdx] = emb;
            completed++;
            if (onProgress) onProgress(completed, texts.length);
          })
          .catch((err) => {
            console.error(`[OllamaEmbedder] Error embedding item ${globalIdx}: ${err.message}`);
            results[globalIdx] = null;
          });
      });

      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Check if Ollama is accessible and embedding model is pulled.
   */
  async ping() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name);
      const hasModel = models.some(
        (m) => m === this.model || m.startsWith(`${this.model}:`) || m.includes(this.model)
      );
      return {
        ok: true,
        modelAvailable: hasModel,
        configuredModel: this.model,
        availableModels: models,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}
