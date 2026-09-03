import { describe, expect, it, vi } from 'vitest';
import { ResolvingLocalRuntime } from '../../src/models/runtime/resolving.js';

describe('ResolvingLocalRuntime', () => {
  it('fail-closes generate in air-gap when Ollama is down', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    const runtime = new ResolvingLocalRuntime('ollama', true, {
      ollamaBaseUrl: 'http://127.0.0.1:9',
      fetchImpl,
      modelMap: { 'local-general-v1': 'llama3.2' },
    });

    await expect(
      runtime.generate({
        model: 'local-general-v1',
        messages: [{ role: 'user', content: 'hi' }],
        request_id: 'req_test',
      }),
    ).rejects.toThrow(/AIRGAP_LOCAL_RUNTIME_UNAVAILABLE|LOCAL_RUNTIME_UNAVAILABLE/);

    const status = await runtime.status();
    expect(status.available).toBe(false);
    expect(status.airgap).toBe(true);
  });

  it('uses stub when mode is stub', async () => {
    const runtime = new ResolvingLocalRuntime('stub', false);
    const result = await runtime.generate({
      model: 'local-general-v1',
      messages: [{ role: 'user', content: 'hello' }],
      request_id: 'req_stub',
    });
    expect(result.content.length).toBeGreaterThan(0);
    expect((await runtime.status()).active_runtime).toBe('stub-local');
  });
});
