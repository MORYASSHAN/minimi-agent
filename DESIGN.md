# Design

Scout is a chat agent with one tool, web search, built on MERN (MongoDB, Express, React, Node) in TypeScript. The model is any OpenAI-compatible API; the default is `gpt-5.4-mini`.

## How it works

Every message goes through the same five steps. Only steps 3 and 5 call a model. Nothing is pre-filled: the user types, the agent searches, the model answers.

1. **Read the dates.** `chrono` and Luxon turn "last Tuesday" or "3 November" into a day range in the user's timezone. This is plain code and takes about a millisecond.
2. **Check memory** (in parallel with loading the chat). If the message points back at an earlier chat ("I asked you", "your answer", "since Monday"), MongoDB is queried for turns in that range, ranked by topic words with a text index. The result goes into the prompt, and so does an empty result: "nothing found on Tue 3 Nov, memory starts on X, don't guess".
3. **Search first.** The main model sees the conversation, the memory block, a 14-day calendar and a single `web_search` tool. For any question about the world, the first call runs with `tool_choice: "required"`, so "Who is the president of Uganda?" is always searched, never answered from training data. Small talk and pure "what did I ask you?" questions are left to the model (`server/agent/searchPolicy.ts`).
4. **Search.** One tool call carries up to six queries, run in parallel. Optional `since` date, domain filter and `deep` mode, which reads page text for exact numbers. Tavily leads; Brave and Serper take over if it fails. Results are de-duplicated and cached for 10 minutes.
5. **Answer.** The answer streams over SSE with numbered citations. Most questions take two model calls; the loop stops offering the tool after three rounds.

Once the answer is done, a background job sends it to a cheaper model, which pulls out a summary, topics, entities and a list of **claims** (subject, attribute, value, source URL). That claim ledger is what makes "is your answer still correct?" work: the agent re-checks those exact facts and reports then vs now, instead of answering from scratch.

## Why it's built this way

- **Search-first lives in code, not the prompt.** A prompt can only ask the model to search; `tool_choice: "required"` makes it happen. The check that decides it is a few regexes, so it adds no latency.
- **Speed comes from cutting round trips, not from a faster model.** No router call, no planner call. Quick searches use Tavily's low-latency tier, with 8s timeouts and fallback. Memory lookup is a database query rather than an LLM call. Enrichment and titles run after the answer has streamed. The fixed half of the system prompt sits first and never changes, so the provider can cache it.
- **Dates are resolved in code.** Models get "last Tuesday" wrong often enough to matter, and the challenge's own examples hinge on it. The model still sees a small calendar, as a second safeguard.
- **Absence is stated, not implied.** The worst failure for this dataset is a made-up memory. If a recall finds nothing, the prompt says so explicitly, and if the topic exists on a different day, the agent says the user may have the date wrong.
- **A turn is the unit of memory.** One MongoDB document holds the question, answer, sources, searches and enrichment. Every query is scoped by user id, with indexes on `{userId, createdAt}` and a weighted text index.
- **Citation numbers belong to the thread.** A page that was [4] stays [4] for the whole conversation, so older answers still read correctly and the model can re-cite without searching again.
- **Ports and adapters.** The agent depends on `ChatModel`, `SearchProvider` and `ConversationStore` interfaces. That's why the tests can run a whole turn with a scripted model, a fake search provider and an in-memory store, and why switching to a free model is a two-line `.env` change.

## Considered and rejected

- **LangChain / an agent framework.** The whole loop is one 250-line file, `server/agent/agent.ts`, comments included. A framework would hide exactly the parts the challenge is judging.
- **OpenAI's hosted web search.** Good quality, but it locks the agent to one vendor and hides the queries, dates and sources I want to control and show.
- **A router or planner model call.** It adds a full round trip to every message, including "thanks".
- **Vector search for memory.** Date filter plus a text index on LLM-extracted topics covers "last Tuesday I asked about Postgres hosting" without a second datastore. It's first on the list once histories get long.
- **Replaying raw search results in history.** It's expensive and mostly noise. Old turns are replayed as answers plus the sources they cited.

## With another week

1. **Evals.** Build a set of 50 dated conversations plus follow-up questions, scored by an LLM judge for date resolution, honesty about missing memory and citation accuracy, run in CI on every prompt change.
2. **Speculative search.** Start a search on the raw question while the model writes its own queries, and keep whichever helps. It would save most of a round trip on simple lookups.
3. **Hybrid recall.** Add embeddings (Atlas Vector Search) alongside the text index, then summarise long threads so very old context isn't simply dropped.
4. **Claim timelines.** Move claims into their own collection keyed by entity, so "has HubSpot's price changed?" works across conversations, and allow scheduled re-checks ("tell me if this changes").
5. **Production hardening.** Real auth, BullMQ/Redis for jobs, the rate limit and search cache in Redis, OpenTelemetry traces per stage, and cost limits per user.
6. **Smarter pages.** Use Readability for extraction, add per-domain freshness hints, and use a reranker on top of the search results.
