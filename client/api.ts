import type { AgentEvent, HealthInfo, ThreadDetail, ThreadSummary } from '../shared/types';

export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the server couldn't be reached at all. */
    readonly status: number,
  ) {
    super(message);
  }
}

export const OFFLINE_MESSAGE = "Can't reach the Scout server. Make sure `npm run dev` is running, then try again.";

/** fetch() that turns "the server isn't there" into a readable error instead of "Failed to fetch". */
async function request(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new ApiError(OFFLINE_MESSAGE, 0);
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    // The dev proxy answers 5xx with no JSON when the API process is down.
    const fallback = res.status >= 500 ? OFFLINE_MESSAGE : `Request failed (${res.status})`;
    throw new ApiError(body.error ?? fallback, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const api = {
  health: () => request('/api/health').then((r) => json<HealthInfo>(r)),
  threads: () => request('/api/threads').then((r) => json<ThreadSummary[]>(r)),
  thread: (id: string) => request(`/api/threads/${id}`).then((r) => json<ThreadDetail>(r)),
  deleteThread: (id: string) => request(`/api/threads/${id}`, { method: 'DELETE' }).then((r) => json<void>(r)),
};

/** POST + Server-Sent Events. EventSource can't POST, so we parse the stream ourselves. */
export async function streamChat(
  body: { message: string; threadId?: string },
  signal: AbortSignal,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  const res = await request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, timezone }),
    signal,
  });
  if (!res.ok || !res.body) await json(res);

  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    let chunk: ReadableStreamReadResult<string>;
    try {
      chunk = await reader.read();
    } catch (err) {
      if (signal.aborted) throw err;
      throw new ApiError('Lost the connection to the server mid-answer. Try again.', 0);
    }
    if (chunk.done) break;
    buffer += chunk.value;
    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) onEvent(JSON.parse(data) as AgentEvent);
    }
  }
}
