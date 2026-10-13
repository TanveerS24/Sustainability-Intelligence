/**
 * Ollama LLM Client for Local Text Generation.
 * Communicates with local Ollama daemon for Qwen3:14B inference,
 * supporting prompt structuring, temperature controls, streaming, and error resilience.
 */
import cfg from '../config.js';

export class OllamaClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || cfg.OLLAMA_BASE_URL;
    this.model = options.model || cfg.OLLAMA_LLM_MODEL;
    this.timeoutMs = options.timeoutMs || cfg.OLLAMA_TIMEOUT_MS || 180000;
  }

  /**
   * Ping Ollama daemon and verify model availability.
   */
  async ping() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name);
      const isAvailable = models.some(
        (m) => m === this.model || m.startsWith(`${this.model}:`) || m.includes(this.model)
      );
      return {
        ok: true,
        modelAvailable: isAvailable,
        configuredModel: this.model,
        availableModels: models,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Generate completion from a prompt using Qwen3:14B.
   */
  async generate(prompt, options = {}) {
    const {
      temperature = 0.2,
      maxTokens = 1200,
      systemPrompt = null,
    } = options;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const body = {
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens,
          top_p: 0.9,
        },
      };

      if (systemPrompt) {
        body.system = systemPrompt;
      }

      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Ollama generation error HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      const outputText = (data.response && data.response.trim().length > 0)
        ? data.response.trim()
        : (data.thinking || '').trim();

      return {
        text: outputText,
        thinking: data.thinking || null,
        totalDurationMs: data.total_duration ? Math.round(data.total_duration / 1e6) : null,
        evalCount: data.eval_count || 0,
        model: this.model,
      };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Ollama generation timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    }
  }

  /**
   * Stream response tokens from Qwen3:14B to a callback.
   */
  async generateStream(prompt, onChunk, options = {}) {
    const {
      temperature = 0.2,
      maxTokens = 800,
      systemPrompt = null,
    } = options;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const body = {
        model: this.model,
        prompt,
        stream: true,
        options: {
          temperature,
          num_predict: maxTokens,
          top_p: 0.9,
        },
      };

      if (systemPrompt) body.system = systemPrompt;

      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Ollama stream error HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep unfinished line

        for (const line of lines) {
          if (!line.trim()) continue;
          const json = JSON.parse(line);
          if (json.response) {
            fullText += json.response;
            onChunk(json.response, fullText);
          }
        }
      }

      return { text: fullText.trim(), model: this.model };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }
}
