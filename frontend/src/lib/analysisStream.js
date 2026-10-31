import { api as defaultApi } from '../api.js';

const DEFAULT_TIMEOUTS = {
  connectMs: 60000, // long enough to outlast a cold start
  stallMs: 30000, // the server sends a keep-alive every 10s
  pollIntervalMs: 2000,
  pollAfterStartMs: 90000,
  pollBeforeStartMs: 8000,
};

export function createSseParser(onEvent) {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())
        .join('\n');
      if (!data) continue;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      onEvent(event);
    }
  };
}

async function attemptStream({ partnerId, requestId, onSummary, onAssessment, signal, fetchImpl, timeouts }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);

  let timer;
  const armTimeout = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(abort, ms);
  };

  let started = false;
  let outcome = null;
  const feed = createSseParser((event) => {
    if (event.type === 'started') started = true;
    else if (event.type === 'summary') onSummary(event.text);
    else if (event.type === 'assessment') onAssessment(event.assessment);
    else if (event.type === 'done') outcome = { status: 'done', result: event };
    else if (event.type === 'error') outcome = { status: 'failed', retryable: event.retryable };
  });

  try {
    armTimeout(timeouts.connectMs);
    const res = await fetchImpl(`/api/analysis/${partnerId}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ requestId }),
      signal: controller.signal,
    });
    // The fallback request reports auth, limit, and not-found errors through the normal path.
    if (!res.ok || !res.body) return { status: 'unavailable' };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (!outcome) {
      armTimeout(timeouts.stallMs);
      const { value, done } = await reader.read();
      if (done) break;
      feed(decoder.decode(value, { stream: true }));
    }
    return outcome || { status: 'interrupted', started };
  } catch {
    return outcome || { status: 'interrupted', started };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    abort();
  }
}

async function waitForSavedRun({ partnerId, requestId, windowMs, signal, client, timeouts, sleep }) {
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline && !signal?.aborted) {
    try {
      return await client.analysis.getRun(partnerId, requestId);
    } catch {
      await sleep(timeouts.pollIntervalMs);
    }
  }
  return null;
}

function safely(callback) {
  return (...args) => {
    try {
      callback?.(...args);
    } catch (e) {
      console.error(e);
    }
  };
}

// Resolves with the saved run, or null if the caller aborted. The caller's abort only stops the page
// listening: the server still finishes and saves. Rejects only when no fallback can help.
export async function runAnalysis(partnerId, {
  onSummary, onAssessment, onStatus, signal,
  fetchImpl = (...args) => fetch(...args),
  client = defaultApi,
  timeouts = DEFAULT_TIMEOUTS,
  sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const requestId = crypto.randomUUID();
  const status = safely(onStatus);

  const attempt = await attemptStream({
    partnerId, requestId, signal, fetchImpl, timeouts,
    onSummary: safely(onSummary),
    onAssessment: safely(onAssessment),
  });

  if (attempt.status === 'done') return attempt.result;
  if (signal?.aborted) return null;

  if (attempt.status === 'failed' && !attempt.retryable) {
    throw new Error('The model response could not be saved');
  }

  if (attempt.status === 'interrupted') {
    status('reconnecting');
    const saved = await waitForSavedRun({
      partnerId, requestId, signal, client, timeouts, sleep,
      windowMs: attempt.started ? timeouts.pollAfterStartMs : timeouts.pollBeforeStartMs,
    });
    if (saved) return saved;
    if (signal?.aborted) return null;
  }

  status('fallback');
  return client.analysis.run(partnerId, requestId);
}
