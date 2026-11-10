# Design

Scout is a chat agent with one tool, web search. It is a MERN app in TypeScript: React (Vite), Express 5, Node and MongoDB through Mongoose. The model is any OpenAI-compatible API, `gpt-5.4-mini` by default.

## How it works

A message goes through five steps. Only steps 3 and 5 call the model.

1. Read the dates. chrono and Luxon turn "last Tuesday" or "3 November" into a day range in the user's timezone. This is plain code and takes about a millisecond.
2. Check memory, in parallel with loading the chat. If the message refers to an earlier chat ("I asked you", "your answer", "since Monday"), MongoDB returns that day's turns, ranked by a text index over the question, the answer and its topics. An empty result is put in the prompt too: nothing on Tue 3 Nov, memory starts on this date, don't guess.
3. Search first. The model gets the conversation, the memory block, a 14-day calendar and one `web_search` tool. For questions about the world the first call uses `tool_choice: "required"`, so "Who is the president of Uganda?" is always checked live. Small talk, work on the user's own text and questions about a past chat are left to the model (`server/agent/searchPolicy.ts`).
4. Fan out. One tool call carries up to four queries, run in parallel, each with an optional `since` date, domain filter and `deep` mode for exact numbers. Providers are tried in order: Tavily, Brave, Serper, then OpenAI's hosted search, which needs no extra key. Results are de-duplicated and cached for ten minutes.
5. Answer. The reply streams over SSE with numbered citations. Most questions take two model calls.

After the answer, off the critical path, a cheaper model writes a summary, topics, entities and a list of claims (subject, attribute, value, source) for the turn. Those claims are what make "is your answer still correct?" work: the agent re-checks those exact facts and reports what changed.

## Why it is built this way

Speed comes from removing round trips rather than from a bigger model. There is no router or planner call, memory lookup is a database query, and enrichment runs after the user has the answer. The fixed half of the system prompt never changes, so the provider can cache it.

The search-first rule lives in code because a prompt can only ask the model to search. A few regular expressions decide, and `tool_choice` enforces it.

Dates are resolved in code because models often get "last Tuesday" wrong, and the test questions depend on it. The calendar in the prompt is a second safeguard.

The worst failure for this kind of question is an invented memory, so absence is stated explicitly. If the topic exists on a different day, the agent says the user may have the date wrong.

A turn is the unit of memory: one MongoDB document holds the question, answer, sources, searches and claims, scoped by user id. Citation numbers belong to the thread, so [4] points to the same page in the first answer and the fifth.

The agent depends on three interfaces, `ChatModel`, `SearchProvider` and `ConversationStore`. Tests run whole turns with a scripted model, a fake search provider and an in-memory store, and moving to a free model is a two-line `.env` change.

Cost is capped in `.env`: question length in words, answer length in tokens, messages per user per day and search queries per step.

## Considered and rejected

- An agent framework such as LangChain. The loop is one file of about 250 lines (`server/agent/agent.ts`), and a framework would hide the parts that matter here.
- OpenAI's hosted search as the main engine. It hides the queries and dates and ties the agent to one vendor, so it is only the last fallback.
- A router or planner call before answering. It adds a round trip to every message, including "thanks".
- Vector search for memory. A date filter plus a text index on extracted topics handles these questions without a second datastore.
- Replaying raw search results in the history. It is expensive and mostly noise; old turns are replayed as answers plus the sources they cited.

## With another week

1. An eval set: 50 dated conversations with follow-up questions, scored for date resolution, honesty about missing memory and citation accuracy, run in CI.
2. Speculative search: search the raw question while the model writes its own queries, to save a round trip on simple lookups.
3. Hybrid recall with Atlas Vector Search, and summaries for long threads.
4. Claims in their own collection keyed by entity, with scheduled re-checks ("tell me if this changes").
5. Production work: real auth, a Redis-backed job queue, rate limits and cache, and tracing for each step.
