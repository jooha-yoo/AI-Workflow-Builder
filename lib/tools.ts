import { evaluate } from "mathjs";
import { prisma } from "./prisma";

export type ToolDefinition = {
  id: string;
  label: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  execute: (input: Record<string, unknown>, ctx: { workflowId: string }) => Promise<unknown>;
};

export const TOOLS: ToolDefinition[] = [
  {
    id: "calculator",
    label: "Calculator",
    description:
      "Evaluate a mathematical expression and return the numeric result.",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "A math expression, e.g. '(4 + 5) * 12 / 3' or 'sqrt(144)'",
        },
      },
      required: ["expression"],
    },
    execute: async (input) => {
      const expression = String(input.expression ?? "");
      try {
        const result = evaluate(expression);
        return { expression, result: String(result) };
      } catch (err) {
        return { expression, error: `Could not evaluate expression: ${(err as Error).message}` };
      }
    },
  },
  {
    id: "web_search",
    label: "Web Search",
    description:
      "Search the web for up-to-date information on a topic and return a short list of results with titles, snippets, and URLs.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
    execute: async (input) => {
      const query = String(input.query ?? "");
      const apiKey = process.env.TAVILY_API_KEY;

      if (!apiKey) {
        return {
          query,
          mock: true,
          note: "No TAVILY_API_KEY configured — returning a mock result so the app can run fully locally.",
          results: [
            {
              title: `Mock result for "${query}"`,
              snippet:
                "This is a placeholder search result. Set TAVILY_API_KEY in .env to enable real web search via Tavily.",
              url: "https://example.com/mock-result",
            },
          ],
        };
      }

      try {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: 5,
          }),
        });
        if (!res.ok) {
          return { query, error: `Search API returned ${res.status}` };
        }
        const data = await res.json();
        type TavilyResult = { title: string; content: string; url: string };
        const results = (data.results ?? []).map((r: TavilyResult) => ({
          title: r.title,
          snippet: r.content,
          url: r.url,
        }));
        return { query, results };
      } catch (err) {
        return { query, error: `Search failed: ${(err as Error).message}` };
      }
    },
  },
  {
    id: "send_email",
    label: "Mock Email Sender",
    description:
      "Send an emailng (it logs the email and stores it).",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body text" },
      },
      required: ["to", "subject", "body"],
    },
    execute: async (input, ctx) => {
      const to = String(input.to ?? "");
      const subject = String(input.subject ?? "");
      const body = String(input.body ?? "");

      console.log(`[MOCK EMAIL] to=${to} subject="${subject}"\n${body}`);

      const log = await prisma.emailLog.create({
        data: { workflowId: ctx.workflowId, to, subject, body },
      });

      return { status: "logged", id: log.id, to, subject };
    },
  },
  {
    id: "get_current_time",
    label: "Current Date & Time",
    description: "Get the current date and time.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      const now = new Date();
      return { iso: now.toISOString() };
    },
  },
];

export function getToolsByIds(ids: string[]): ToolDefinition[] {
  const set = new Set(ids);
  return TOOLS.filter((t) => set.has(t.id));
}
