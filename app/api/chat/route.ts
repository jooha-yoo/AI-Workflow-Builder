import { NextRequest, NextResponse } from "next/server";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { prisma } from "@/lib/prisma";
import { runAgentStream, type ChatStreamEvent } from "@/lib/agent";

// Streams newline-delimited JSON (NDJSON) instead of classic SSE framing —
// each line is one ChatStreamEvent. Simpler to produce and parse than
// text/event-stream for a same-origin POST-and-read-the-body flow, and needs
// no extra parsing library on either end.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const workflowId = typeof body.workflowId === "string" ? body.workflowId : "";
  const messages = Array.isArray(body.messages) ? (body.messages as MessageParam[]) : [];

  if (!workflowId) {
    return NextResponse.json({ error: "workflowId is required" }, { status: 400 });
  }

  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const gen = runAgentStream({
          workflowId,
          systemPrompt: workflow.systemPrompt,
          steps: JSON.parse(workflow.steps) as string[],
          enabledToolIds: JSON.parse(workflow.enabledTools) as string[],
          messages,
        });

        let next = await gen.next();
        while (!next.done) {
          send(next.value);
          next = await gen.next();
        }
        send({ type: "done", messages: next.value });
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  });
}
