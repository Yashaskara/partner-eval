import { describe, it, expect, vi } from 'vitest';
import { createSseParser, runAnalysis } from './analysisStream.js';

const encoder = new TextEncoder();
const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
const DONE = { type: 'done', runId: 9, composite: 7, summary: 'S', assessments: [] };
const SAVED = { runId: 9, composite: 7, summary: 'S', assessments: [] };
const TIMEOUTS = { connectMs: 200, stallMs: 30, pollIntervalMs: 1, pollAfterStartMs: 20, pollBeforeStartMs: 5 };

function streamResponse(chunks, { thenError = false, stayOpen = false } = {}) {
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        if (thenError) controller.error(new Error('connection lost'));
        else if (!stayOpen) controller.close();
      },
    }),
  };
}

function setup(fetchImpl, { getRun = vi.fn().mockRejectedValue(new Error('Run not found')) } = {}) {
  const run = vi.fn().mockResolvedValue(SAVED);
  const options = {
    fetchImpl, client: { analysis: { run, getRun } }, timeouts: TIMEOUTS,
    sleep: () => Promise.resolve(),
    onSummary: vi.fn(), onAssessment: vi.fn(), onStatus: vi.fn(),
  };
  return { run, getRun, options };
}

describe('createSseParser', () => {
  it('handles events split across chunks and ignores keep-alives', () => {
    const events = [];
    const feed = createSseParser(e => events.push(e));
    feed(': keep-alive\n\ndata: {"ty');
    feed('pe":"started"}\n');
    feed('\ndata: {"type":"done"}\n\n');
    expect(events).toEqual([{ type: 'started' }, { type: 'done' }]);
  });

  it('skips malformed events', () => {
    const events = [];
    createSseParser(e => events.push(e))('data: {oops\n\ndata: {"type":"done"}\n\n');
    expect(events).toEqual([{ type: 'done' }]);
  });
});

describe('runAnalysis', () => {
  it('returns the streamed result without a fallback', async () => {
    const assessment = { domain: 'career', tag: 'green', score: 8, reasoning: 'x' };
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([
      sse({ type: 'started' }),
      sse({ type: 'summary', text: 'Hel' }) + sse({ type: 'summary', text: 'lo' }),
      sse({ type: 'assessment', assessment }),
      sse(DONE),
    ]));
    const { run, options } = setup(fetchImpl);

    await expect(runAnalysis(1, options)).resolves.toEqual(DONE);

    expect(options.onSummary.mock.calls).toEqual([['Hel'], ['lo']]);
    expect(options.onAssessment).toHaveBeenCalledWith(assessment);
    expect(run).not.toHaveBeenCalled();
  });

  it('falls back immediately when the stream is refused', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const { run, getRun, options } = setup(fetchImpl);

    await expect(runAnalysis(1, options)).resolves.toEqual(SAVED);

    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body).requestId;
    expect(run).toHaveBeenCalledWith(1, sent);
    expect(getRun).not.toHaveBeenCalled();
  });

  it('falls back when the browser cannot read a streamed body', async () => {
    const { run, options } = setup(vi.fn().mockResolvedValue({ ok: true, body: null }));
    await runAnalysis(1, options);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('uses the saved run when the connection drops, without a second LLM call', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      streamResponse([sse({ type: 'started' }), sse({ type: 'summary', text: 'Hi' })], { thenError: true }),
    );
    const getRun = vi.fn()
      .mockRejectedValueOnce(new Error('Run not found'))
      .mockResolvedValue(SAVED);
    const { run, options } = setup(fetchImpl, { getRun });

    await expect(runAnalysis(1, options)).resolves.toEqual(SAVED);

    expect(run).not.toHaveBeenCalled();
    expect(options.onStatus).toHaveBeenCalledWith('reconnecting');
  });

  it('treats a stream that ends without a result as dropped', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([sse({ type: 'started' })]));
    const { run, getRun, options } = setup(fetchImpl, { getRun: vi.fn().mockResolvedValue(SAVED) });

    await expect(runAnalysis(1, options)).resolves.toEqual(SAVED);

    expect(getRun).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('falls back with the same id when the run never appears', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamResponse([sse({ type: 'started' })], { thenError: true }));
    const { run, options } = setup(fetchImpl);

    await expect(runAnalysis(1, options)).resolves.toEqual(SAVED);

    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body).requestId;
    expect(run).toHaveBeenCalledWith(1, sent);
    expect(options.onStatus).toHaveBeenCalledWith('fallback');
  });

  it('checks for a saved run after a network failure before starting', async () => {
    const { run, getRun, options } = setup(vi.fn().mockRejectedValue(new TypeError('offline')));
    await runAnalysis(1, options);
    expect(getRun).toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('treats a silent stream as dropped', async () => {
    const fetchImpl = vi.fn((url, init) => new Promise((resolve) => {
      const body = new ReadableStream({
        start(controller) {
          init.signal.addEventListener('abort', () => controller.error(new Error('aborted')));
        },
      });
      resolve({ ok: true, body });
    }));
    const { run, options } = setup(fetchImpl);

    await expect(runAnalysis(1, options)).resolves.toEqual(SAVED);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('falls back when the server fails before any paid text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      streamResponse([sse({ type: 'started' }), sse({ type: 'error', retryable: true })]),
    );
    const { run, getRun, options } = setup(fetchImpl);

    await expect(runAnalysis(1, options)).resolves.toEqual(SAVED);

    expect(run).toHaveBeenCalledTimes(1);
    expect(getRun).not.toHaveBeenCalled();
  });

  it('does not pay twice when the server fails after paid text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      streamResponse([sse({ type: 'started' }), sse({ type: 'error', retryable: false })]),
    );
    const { run, options } = setup(fetchImpl);

    await expect(runAnalysis(1, options)).rejects.toThrow();

    expect(run).not.toHaveBeenCalled();
  });

  it('reports a failed fallback to the caller', async () => {
    const { run, options } = setup(vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    run.mockRejectedValue(new Error('Daily token limit exceeded'));

    await expect(runAnalysis(1, options)).rejects.toThrow('Daily token limit exceeded');
  });

  it('stops without a fallback when the caller aborts', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      controller.abort();
    }));
    const { run, getRun, options } = setup(fetchImpl);

    await expect(runAnalysis(1, { ...options, signal: controller.signal })).resolves.toBeNull();

    expect(run).not.toHaveBeenCalled();
    expect(getRun).not.toHaveBeenCalled();
  });

  it('survives a rendering callback that throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(
      streamResponse([sse({ type: 'summary', text: 'Hi' }), sse(DONE)]),
    );
    const { options } = setup(fetchImpl);
    options.onSummary.mockImplementation(() => { throw new Error('render bug'); });

    await expect(runAnalysis(1, options)).resolves.toEqual(DONE);

    consoleError.mockRestore();
  });
});
