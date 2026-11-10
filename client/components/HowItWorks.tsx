import type { PointerEvent } from 'react';
import { BRAND } from '../brand';

const FLOW = [
  { title: 'Read the dates', body: '“Last Tuesday” becomes Tue 3 Nov in your timezone. Plain code (chrono + Luxon), no model call.' },
  { title: 'Check memory', body: 'If you point back at an earlier chat, matching ones come out of MongoDB by date and topic. If there are none, the model is told so.' },
  { title: 'Search first', body: 'Questions about the world always start with a web search. That rule lives in code, so the model can’t skip it.' },
  { title: 'Fan out', body: 'Up to six queries run at once. Tavily first, Brave and Serper if it fails. Deep mode reads page text for exact numbers.' },
  { title: 'Answer', body: 'Streamed word by word, with numbered citations that open the page they came from.' },
];

const DECISIONS = [
  {
    title: 'Search-first, enforced in code',
    body: 'Ask “who is the president of Uganda?” and the first step is always a web search, never a guess from training data. The rule is a cheap check in code, not a prompt instruction, so it holds every time. Small talk and pure “what did I ask you?” questions skip it.',
  },
  {
    title: 'No extra router call',
    body: 'Lots of agents run a classifier before they answer. That is a full round trip on every message. Here the model writes the search queries in its first call and the answer in its second, and that’s it for most questions.',
  },
  {
    title: 'Dates are code, not guesses',
    body: 'Language models are oddly bad at working out which day “last Tuesday” was. So it’s resolved before the model runs, in your timezone, and the prompt also carries a small calendar of the last 14 days.',
  },
  {
    title: 'Memory is turns with a date on them',
    body: 'Every question and answer is one MongoDB document with a text index over the question, the answer and its topics. Ask about 3 November and it filters to that day, then ranks by topic. If the day is empty but the topic shows up elsewhere, it says so.',
  },
  {
    title: 'Answers leave receipts',
    body: 'After each answer, a small model writes down the facts it stated (prices, versions, dates) and the source of each. “Is that still right?” then re-checks those exact facts and shows then vs now.',
  },
  {
    title: 'Nothing slow sits in front of you',
    body: 'Memory lookup runs while the chat loads. Fact extraction and titles run in a background queue after the answer. Searches are cached for ten minutes, and the fixed part of the prompt never changes, so the provider caches it too.',
  },
];

const SKIPPED = [
  ['LangChain and similar frameworks', 'The agent loop is one file you can read in five minutes.'],
  ['A vector database', 'Date plus keyword search handles a few hundred chats fine. Embeddings come first once history gets long.'],
  ['OpenAI’s built-in web search', 'It ties everything to one vendor and hides the search step, which is the part worth controlling.'],
  ['A “research plan” step', 'Looks clever in a demo, adds seconds to every answer.'],
];

const STACK = [
  ['React', 'Vite, streaming UI over Server-Sent Events'],
  ['Express', 'Node API, one SSE endpoint per answer'],
  ['MongoDB', 'Mongoose, text index for recall'],
  ['Model', 'Any OpenAI-compatible API, gpt-5.4-mini by default'],
  ['Search', 'Tavily, Brave and Serper with automatic fallback'],
];

/** Cursor-tracked highlight on cards: the colour follows the pointer, like the background. */
function track(e: PointerEvent<HTMLElement>) {
  const card = (e.target as HTMLElement).closest<HTMLElement>('.card');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
}

export function HowItWorks() {
  return (
    <div className="how view" onPointerMove={track}>
      <header className="how__hero">
        <div className="mono-label mono-label--accent">/ How it works</div>
        <h1 className="display display--md">
          Every answer is <span className="hl">checked against the live web.</span>
        </h1>
        <p className="lead">
          {BRAND} is a MERN app: React, Express, Node and MongoDB. The stack is the boring part. What matters is what happens
          between you pressing Enter and the first word appearing, and what it keeps once it’s done.
        </p>
      </header>

      <section className="how__section">
        <div className="mono-label">/ 01 — The path of one question</div>
        <div className="flow">
          {FLOW.map((s, i) => (
            <div className="flow__step card" key={s.title}>
              <span className="mono-label mono-label--accent">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
        <div className="flow__after card">
          <span className="mono-label mono-label--accent">06 · after you have your answer</span>
          <h3>Remember</h3>
          <p>
            A cheap model pulls the checkable facts out of the answer and files them with their sources and the date. That’s what
            makes “has anything changed since?” a real comparison.
          </p>
        </div>
      </section>

      <section className="how__section">
        <div className="mono-label">/ 02 — Decisions, and why</div>
        <div className="grid2">
          {DECISIONS.map((d) => (
            <article className="card" key={d.title}>
              <h3>{d.title}</h3>
              <p>{d.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="how__section">
        <div className="mono-label">/ 03 — Left out on purpose</div>
        <div className="rows">
          {SKIPPED.map(([title, why]) => (
            <div className="row" key={title}>
              <span className="row__title">{title}</span>
              <span className="row__why">{why}</span>
              <span className="tag">Skipped</span>
            </div>
          ))}
        </div>
      </section>

      <section className="how__section">
        <div className="mono-label">/ 04 — Stack</div>
        <div className="rows">
          {STACK.map(([name, what]) => (
            <div className="row" key={name}>
              <span className="row__title">{name}</span>
              <span className="row__why">{what}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="how__foot">
        <span className="mono-label mono-label--dim">
          Built by{' '}
          <a href="https://moryasshan.vercel.app" target="_blank" rel="noreferrer">
            Shaan
          </a>
        </span>
      </footer>
    </div>
  );
}
