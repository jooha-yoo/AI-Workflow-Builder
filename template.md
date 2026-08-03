# Agent Instructions

You're working inside the **AI Workflow Builder** codebase — a Next.js app that lets users assemble AI workflows (a system prompt, a set of tools, and an ordered list of steps) and chat with them. This file follows the **WAT framework** (Workflows, Agents, Tools) mindset: probabilistic AI handles reasoning while deterministic code handles execution. That separation is what makes this system reliable — and it's not just how you should work on this repo, it's the actual design of the app itself.

## The WAT Architecture

**Layer 1: Workflows (The Instructions)**
- Not markdown SOPs — in this project, a "workflow" is a row in the `Workflow` table (`prisma/schema.prisma`): a system prompt, an ordered list of steps, and a set of enabled tools.
- Users define these through the builder UI (`components/WorkflowForm.tsx`); `lib/agent.ts`'s `buildSystemPrompt()` folds them into one prompt string at runtime.
- Every save is versioned (`WorkflowVersion`), so the instructions have their own history — nothing is silently overwritten.

**Layer 2: Agents (The Decision-Maker)**
- Two agents exist here — don't conflate them:
  - *You*, coordinating while working in this repo. Read the relevant file, run the right command, don't try to do everything by hand.
  - *Claude*, at runtime, inside the app itself — the tool-use loop in `lib/agent.ts` (`runAgentStream`) is the literal decision-maker a user's workflow drives when they chat.
- Example: if you need to understand what happens on a chat turn, don't guess — read `lib/agent.ts`, then trace the request through `app/api/chat/route.ts`.

**Layer 3: Tools (The Execution)**
- Not Python scripts — TypeScript functions in the `TOOLS` array in `lib/tools.ts`: calculator, web search, mock email sender, current time.
- Each tool is one object (`id`, `description`, a JSON-schema `input_schema`, and an `execute` function) — API calls, database writes, whatever the tool needs to do.
- Credentials and API keys are stored in `.env` (`ANTHROPIC_API_KEY`, `TAVILY_API_KEY`) — same principle as the original framework, just this project's file names.

**Why this matters:** When AI tries to handle every step directly, accuracy drops fast. If each step is 90% accurate, you're down to 59% success after just five steps. By offloading execution to deterministic code (the tool registry, the database layer), the runtime stays focused on orchestration and decision-making where it excels.

## How to Operate

**1. Look for existing tools first**
Before writing new logic, check `lib/tools.ts` for the app's runtime tools, or the relevant file in `lib/`/`components/` for anything else. Only add a new tool or component when nothing existing covers the job.

**2. Learn and adapt when things fail**
When you hit an error:
- Read the full error message and trace
- Fix it and retest — this project runs entirely locally (SQLite via Prisma), so there's no cost gate before rerunning beyond the Claude/Tavily calls you're already making
- Document real gotchas somewhere durable: `README.md`, or a code comment where the *why* isn't obvious from the code itself
- Example from this repo: the Turbopack dev server can 404 on a route that was just added — `rm -rf .next && npm run dev` fixes it. That's now written down in `README.md` so it doesn't cost anyone a debugging session twice.

**3. Keep the docs current**
There's no `workflows/` folder of SOPs to update here — the equivalent durable instructions are **`README.md`** (setup, architecture, design decisions) and this file. Update them when you learn something worth not re-learning. Don't rewrite either without being asked, unless explicitly told to.

## The Self-Improvement Loop

Every failure is a chance to make the system stronger:
1. Identify what broke
2. Fix the code
3. Verify the fix works
4. Update `README.md` (or this file) with the new approach
5. Move on with a more robust system

This loop is how the project improves over time.

## File Structure

**What goes where:**
- **The product**: the running app and its SQLite database (`prisma/dev.db`) — this is local state that matters, not a scratch file.
- **Regeneratable**: `.next/` (the build cache) and `node_modules/` — safe to delete, rebuilt on the next `npm run dev` or `npm install`.

**Directory layout:**
```
app/          # Next.js routes — pages (app/**/page.tsx) and API route handlers (app/api/**/route.ts)
components/   # React client components — WorkflowForm, ChatPanel, VersionHistory, SortableStep
lib/          # Runtime: agent.ts (tool-use loop), tools.ts (tool registry), workflow.ts (DTOs), prisma.ts (DB client)
prisma/       # schema.prisma + migrations/ + dev.db (the local SQLite file)
.env          # ANTHROPIC_API_KEY, TAVILY_API_KEY, DATABASE_URL — never commit this; .env.example is the template
README.md     # Setup instructions and architecture notes — the durable reference for this project
```

**Core principle:** Unlike a pipeline that ships deliverables out to cloud services, this project's product *is* local — the app and its database. Treat `prisma/dev.db` as real state, not something to regenerate carelessly.

## Bottom Line

You sit between what the user wants (a working, correctly-scoped feature) and what actually gets done (the code, the schema, the tests). Your job is to read the codebase, make smart decisions, call the right tools, recover from errors, and keep `README.md` honest as you go.

Stay pragmatic. Stay reliable. Keep learning.
