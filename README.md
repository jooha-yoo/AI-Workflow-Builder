# AI Workflow Builder

A mini web app for building configurable AI workflows — a system prompt plus a
set of tools plus a sequence of steps/decision logic — and chatting with them.
Workflows are saved to a local SQLite database so they can be edited and
reused.

## Meets the brief

| Requirement | How |
| --- | --- |
| Any frontend framework | React, via Next.js App Router — pages in [`app/`](app), components in [`components/`](components) |
| Any backend framework | Next.js Route Handlers — API routes in [`app/api/`](app/api), see below |
| Store workflows in a database | SQLite via Prisma — [`prisma/schema.prisma`](prisma/schema.prisma), local file `prisma/dev.db` |
| Any LLM provider | Anthropic Claude, Messages API with tool use — [`lib/agent.ts`](lib/agent.ts) |
| Runs locally, clear setup | No external services required to boot — see [Setup](#setup) below |

## Stack

- **Frontend + Backend:** Next.js (App Router, TypeScript) — UI pages and API
  routes live in the same app, one process, one `npm run dev`.
- **Database:** SQLite via Prisma (file `prisma/dev.db`).
- **LLM:** Anthropic Claude (Messages API with tool use + streaming).

## How it works

Each **workflow** is a database row with:

- `name` — a label
- `systemPrompt` — free-text instructions for the assistant
- `steps` — an ordered list of instructions ("decision logic"), rendered as a
  numbered list and appended to the system prompt
- `enabledTools` — which tools from the registry the assistant is allowed to
  call

When you chat with a workflow, the backend (`app/api/chat/route.ts` →
`lib/agent.ts`) runs a standard **tool-use loop** against the Claude API: send
the conversation, and if Claude responds with a `tool_use` block, execute the
corresponding tool in `lib/tools.ts`, feed the result back, and repeat until
Claude returns a final text answer (capped at 8 tool round-trips per turn to
avoid runaway loops). Every step of that loop — each chunk of text, each tool
call, each tool result — is streamed to the browser as it happens (newline-
delimited JSON over a plain response stream), so the chat UI shows tool calls
and intermediate steps live, not just the final answer.

Every save (create, edit, or restore) also snapshots the workflow's fields
into a `WorkflowVersion` row, so past versions can be reviewed and restored
from the edit page without losing anything.

### Backend routes (`app/api/`)

| Route | Method(s) | Does |
| --- | --- | --- |
| `/api/workflows` | GET, POST | List / create workflows |
| `/api/workflows/[id]` | GET, PUT, DELETE | Read, update, or delete one workflow |
| `/api/workflows/[id]/versions` | GET | List a workflow's saved versions |
| `/api/workflows/[id]/versions/[versionId]/restore` | POST | Restore a past version |
| `/api/chat` | POST | Run the agent loop, streamed |
| `/api/tools` | GET | List available tools for the builder UI |

### Tools

Defined in `lib/tools.ts`:

- **Calculator** — evaluates a math expression (via `mathjs`).
- **Web Search** — calls the [Tavily](https://tavily.com/) search API if
  `TAVILY_API_KEY` is set; otherwise returns a clearly-labeled mock result so
  the app still runs fully offline.
- **Mock Email Sender** — doesn't send anything. Logs the email to the
  console and writes it to an `EmailLog` table.
- **Current Date & Time** — returns the current UTC timestamp.

Adding a new tool means adding one entry to the `TOOLS` array (id,
description, JSON-schema input, and an `execute` function) — nothing else
needs to change to make it available in the workflow builder or the agent
loop.

## Setup

**Requirements:** Node.js 20+

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env file and add your Anthropic API key:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env`:

   ```
   ANTHROPIC_API_KEY=sk-ant-...   # required — https://console.anthropic.com/
   TAVILY_API_KEY=                # optional — enables real web search
   ```

3. Create the local SQLite database:

   ```bash
   npx prisma migrate deploy
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000). Create a workflow,
   then click **Chat** to talk to it.

**If a route 404s right after adding/pulling new files:** this is a Turbopack
dev-server cache quirk, not an app bug — stop the server and run
`rm -rf .next && npm run dev`. `npm run build && npm start` is unaffected.

## Notes / design decisions

- **Steps vs. a full visual flow builder:** the assignment allows either "a
  sequence of steps, or a simple decision flow." Rather than building a
  node-based flowchart editor, the ordered `steps` list is folded into the
  system prompt and Claude's own tool-use loop acts as the decision engine
  (it decides which tool to call, in what order, based on your steps and the
  conversation) — simpler to build and edit, while still giving you explicit
  control over the assistant's procedure.
- **Chat history is not persisted** across page reloads — it lives in React
  state for the duration of a session. Workflows themselves (the
  configuration) are the thing that's saved and reused, per the requirements.
