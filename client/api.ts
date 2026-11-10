import type { AgentEvent, HealthInfo, ThreadDetail, ThreadSummary } from '../shared/types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const api = {
  health: () => fetch('/api/health').then((r) => json<HealthInfo>(r)),
  threads: () => fetch('/api/threads').then((r) => json<ThreadSummary[]>(r)),
  thread: (id: string) => fetch(`/api/threads/${id}`).then((r) => json<ThreadDetail>(r)),
  deleteThread: (id: string) => fetch(`/api/threads/${id}`, { method: 'DELETE' }).then((r) => json<void>(r)),
};

/** POST + Server-Sent Events. EventSource can't POST, so we parse the stream ourselves. */
export async function streamChat(
  body: { message: string; threadId?: string },
  signal: AbortSignal,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, timezone }),
    signal,
  });
  if (!res.ok || !res.body) await json(res);

  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
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
