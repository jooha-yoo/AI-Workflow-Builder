import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { getToolsByIds } from "./tools";

const MODEL = "claude-sonnet-5";
// Safety cap on how many times one user turn can bounce between Claude and
// tool execution before we give up and return an explanatory message instead
// of looping forever.
const MAX_TOOL_ITERATIONS = 8;

export type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; output: unknown };

// The NDJSON wire protocol POST /api/chat streams to the browser: every
// AgentStreamEvent as it happens, followed by exactly one terminal "done" (with
// the full canonical message history) or "error" event that ends the stream.
export type ChatStreamEvent =
  | AgentStreamEvent
  | { type: "done"; messages: MessageParam[] }
  | { type: "error"; message: string };

function buildSystemPrompt(systemPrompt: string, steps: string[]): string {
  if (steps.length === 0) return systemPrompt;
  const stepsBlock = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `${systemPrompt}\n\nFollow this sequence of steps / decision logic when handling requests:\n${stepsBlock}`;
}

type RunAgentArgs = {
  workflowId: string;
  systemPrompt: string;
  steps: string[];
  enabledToolIds: string[];
  messages: MessageParam[];
};

/**
 * Runs the tool-use loop against Claude, yielding an event per token chunk /
 * tool call / tool result as they happen, and returning (via the generator's
 * return value) the full canonical message history once the turn is done —
 * the same shape `runAgent` returns, so callers that don't care about live
 * progress can just drain this generator instead of duplicating the loop.
 */
export async function* runAgentStream({
  workflowId,
  systemPrompt,
  steps,
  enabledToolIds,
  messages,
}: RunAgentArgs): AsyncGenerator<AgentStreamEvent, MessageParam[], undefined> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your .env file and restart the dev server."
    );
  }

  const client = new Anthropic({ apiKey });
  const tools = getToolsByIds(enabledToolIds);
  const anthropicTools = tools.map((t) => ({
    name: t.id,
    description: t.description,
    input_schema: t.input_schema,
  }));

  const fullSystemPrompt = buildSystemPrompt(systemPrompt, steps);
  const conversation: MessageParam[] = [...messages];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1536,
      system: fullSystemPrompt,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      messages: conversation,
    });

    // Only forward text deltas — extended-thinking deltas also flow through
    // this loop, and we don't want to stream Claude's raw reasoning to the UI.
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text_delta", text: event.delta.text };
      }
    }

    const response = await stream.finalMessage();
    conversation.push({ role: "assistant", content: response.content });

    const toolUseBlocks = response.content.filter(
      (b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use"
    );

    for (const block of toolUseBlocks) {
      yield { type: "tool_call", id: block.id, name: block.name, input: block.input };
    }

    if (response.stop_reason !== "tool_use") {
      return conversation;
    }

    const toolResults: ContentBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const tool = tools.find((t) => t.id === block.name);
      let output: unknown;
      if (!tool) {
        output = { error: `Unknown or disabled tool: ${block.name}` };
      } else {
        try {
          output = await tool.execute(block.input as Record<string, unknown>, { workflowId });
        } catch (err) {
          output = { error: (err as Error).message };
        }
      }
      yield { type: "tool_result", id: block.id, output };
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(output),
      });
    }

    conversation.push({ role: "user", content: toolResults });
  }

  conversation.push({
    role: "assistant",
    content: [
      {
        type: "text",
        text: "Reached the maximum number of tool-use steps for this turn without a final answer.",
      },
    ],
  });
  return conversation;
}

export async function runAgent(args: RunAgentArgs): Promise<{ messages: MessageParam[] }> {
  const gen = runAgentStream(args);
  let next = await gen.next();
  while (!next.done) {
    next = await gen.next();
  }
  return { messages: next.value };
}
