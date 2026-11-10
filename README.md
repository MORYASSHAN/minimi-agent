# Scout

A chat agent that answers from the live web. It searches before it answers, cites its sources, and remembers your past chats by date, so you can ask things like "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"

Built with MongoDB, Express, React and Node, in TypeScript. How it works and why: [DESIGN.md](DESIGN.md). Made by [Shaan](https://moryasshan.vercel.app).

## Before you start

You need:

- **Node.js 22.13 or newer.** Check with `node -v`. If it's older, install the current LTS from [nodejs.org](https://nodejs.org). npm comes with it.
- **Git**, to clone the repo.
- **An OpenAI API key** on an account with billing credit.
- *Optional:* a **Tavily API key** (free) for faster, cheaper search.
- *Optional:* a **MongoDB Atlas** connection string. Without one, a local MongoDB is downloaded and started for you.

## Setup

### 1. Clone and install

```bash
git clone https://github.com/MORYASSHAN/minimi-agent.git
cd minimi-agent
npm install
```

This takes a minute. Newer npm versions may warn that some packages have install scripts. That's expected and safe to ignore.

### 2. Get an OpenAI API key

1. Sign in at [platform.openai.com](https://platform.openai.com).
2. Open **Settings → Billing** and add credit. A few dollars is plenty. Keys on an account with no credit are rejected.
3. Open [API keys](https://platform.openai.com/api-keys), click **Create new secret key**, and copy it. It starts with `sk-` and is only shown once.

### 3. Get a Tavily key (recommended)

1. Sign up at [app.tavily.com](https://app.tavily.com). The free plan gives 1,000 searches a month and needs no card.
2. Copy the API key from the dashboard. It starts with `tvly-`.

Without a Tavily key, Scout uses OpenAI's built-in web search. It works, but it's slower and each search costs more.

### 4. Create your `.env` file

Copy the example file.

macOS / Linux:

```bash
cp .env.example .env
```

Windows (PowerShell):

```powershell
Copy-Item .env.example .env
```

Open `.env` in any editor and fill in the keys from steps 2 and 3:

```
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
```

Leave everything else as it is for now. `.env` is in `.gitignore`. Never commit it or paste your key anywhere public.

### 5. Database (optional)

Skip this step to use the local database. The first `npm run dev` downloads MongoDB once (about a minute) and keeps its data in `.data/`.

To use MongoDB Atlas instead:

1. Create a free **M0** cluster at [cloud.mongodb.com](https://cloud.mongodb.com).
2. Under **Database Access**, add a user with a password. Under **Network Access**, add your IP address.
3. Click **Connect → Drivers** and copy the connection string. Put in your password and add a database name before the `?`, for example:
   `mongodb+srv://scout:YOUR_PASSWORD@cluster0.abcde.mongodb.net/scout?retryWrites=true&w=majority`
4. Paste it into `.env` as `MONGODB_URI=...`.

### 6. Run it

```bash
npm run dev
```

Wait until the terminal shows both of these:

```
[api] INFO  API ready on http://localhost:8787
[web]   ➜  Local:   http://localhost:5173/
```

Then open **http://localhost:5173**. Keep the terminal open while you use the app; press **Ctrl+C** to stop it.

### 7. Check it works

Ask: *Who is the president of Uganda?*

You should see "Searching for …" under your question, then an answer with small numbered citations and a list of sources below it.

## Configuration

Everything is set in `.env`. Restart `npm run dev` after changing it.

| Variable | Default | What it does |
| --- | --- | --- |
| `OPENAI_API_KEY` | (required) | Key for the model provider |
| `CHAT_MODEL` | `gpt-5.4-mini` | Model that writes answers |
| `FAST_MODEL` | `gpt-5.4-nano` | Cheaper model for background memory work |
| `OPENAI_BASE_URL` | OpenAI | Point at another OpenAI-compatible provider (see below) |
| `TAVILY_API_KEY`, `BRAVE_API_KEY`, `SERPER_API_KEY` | empty | Search providers, used in the order of `SEARCH_PROVIDERS` |
| `MONGODB_URI` | local MongoDB | Your own database |
| `MAX_INPUT_WORDS` | `300` | Longest question accepted |
| `MAX_ANSWER_TOKENS` | `1200` | Longest answer |
| `DAILY_MESSAGE_LIMIT` | `100` | Messages per person per 24 hours |
| `MAX_SEARCH_QUERIES` | `4` | Searches per step (1 to 6) |
| `PORT` | `8787` | API port |

### Using a free model instead of OpenAI

Any provider with an OpenAI-compatible API works. For example, with [Groq](https://console.groq.com) (free tier):

```
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=gsk_...
CHAT_MODEL=llama-3.3-70b-versatile
FAST_MODEL=llama-3.1-8b-instant
TAVILY_API_KEY=tvly-...
```

OpenAI's built-in search is only available with an OpenAI key, so other providers need a Tavily (or Brave/Serper) key.

## Trying date-based memory

Questions like "What did I ask you on 3 November?" need chats from earlier days. To try this without waiting:

1. Set `AGENT_NOW=2026-11-03T14:00:00+05:30` in `.env` (any past date and your timezone offset), restart, and ask a few questions.
2. Remove `AGENT_NOW`, restart, and ask "What did I ask you on 3 November? Is your answer still correct today?"

## Troubleshooting

| You see | What to do |
| --- | --- |
| "Can't reach the server" in the app | The API isn't running. Check the terminal for an error and run `npm run dev` again. |
| `Port 5173 is already in use` | Another copy is still running. Stop it with Ctrl+C in its terminal, then start again. |
| "The model provider rejected the API key" | The key is wrong or was deleted. Fix `OPENAI_API_KEY` in `.env` and restart. |
| "…has no credits left" | Add credit under Billing in the OpenAI dashboard. |
| "Could not start the embedded MongoDB" | Set `MONGODB_URI` to an Atlas cluster (step 5) and restart. |
| A setup screen instead of the chat box | A required key is missing from `.env`. The screen says which one. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Database, API (reloads on change) and web app |
| `npm test` | Tests, no keys or network needed |
| `npm run typecheck` | TypeScript check for the whole project |
| `npm start` | Build the web app and serve everything on http://localhost:8787 |

## Project layout

```
server/
  agent/    the chat loop, search policy, prompts, web_search tool, citations
  memory/   date parsing, recall of past chats, background fact extraction
  search/   Tavily, Brave, Serper and OpenAI search, with fallback and caching
  llm/      model client
  db/       MongoDB models and storage
  http/     Express routes, streaming, limits
client/     React app
shared/     types used by both server and client
test/       tests, with fake model, search and storage
```
