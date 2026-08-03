"use client";

import { useEffect, useRef, useState } from "react";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { ChatStreamEvent } from "@/lib/agent";
import type { WorkflowDTO } from "@/lib/workflow";

type DisplayItem =
  | { type: "user"; text: string }
  | { type: "text"; text: string }
  | { type: "tool"; id: string; name: string; input: unknown; output?: unknown };

// Claude's API represents a tool's result as a *user*-role message, not part
// of the assistant's turn. Rendered literally that would show up as a stray
// user bubble, so we match each tool_result back to its tool_use by id and
// fold the output into the same card instead of creating a new item.
function buildDisplayItems(messages: MessageParam[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  const toolIndexById = new Map<string, number>();

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      items.push({ type: msg.role === "user" ? "user" : "text", text: msg.content });
      continue;
    }
    for (const block of msg.content) {
      if (block.type === "text") {
        items.push({ type: msg.role === "user" ? "user" : "text", text: block.text });
      } else if (block.type === "tool_use") {
        toolIndexById.set(block.id, items.length);
        items.push({ type: "tool", id: block.id, name: block.name, input: block.input });
      } else if (block.type === "tool_result") {
        const idx = toolIndexById.get(block.tool_use_id);
        const existing = idx !== undefined ? items[idx] : undefined;
        if (existing && existing.type === "tool") {
          let output: unknown = block.content;
          if (typeof block.content === "string") {
            try {
              output = JSON.parse(block.content);
            } catch {
              output = block.content;
            }
          }
          existing.output = output;
        }
      }
    }
  }
  return items;
}

function renderItem(item: DisplayItem, key: string | number) {
  if (item.type === "user") {
    return (
      <div key={key} className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-neutral-900 text-white px-3 py-2 text-sm whitespace-pre-wrap">
          {item.text}
        </div>
      </div>
    );
  }
  if (item.type === "text") {
    return (
      <div key={key} className="flex justify-start">
        <div className="max-w-[80%] rounded-lg bg-neutral-100 px-3 py-2 text-sm whitespace-pre-wrap">
          {item.text}
        </div>
      </div>
    );
  }
  return (
    <div key={key} className="flex justify-start">
      <div className="max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
        <p className="font-mono font-semibold text-amber-800 mb-1">🔧 {item.name}</p>
        <pre className="whitespace-pre-wrap text-amber-900/80">
          input: {JSON.stringify(item.input, null, 2)}
        </pre>
        {item.output !== undefined ? (
          <pre className="whitespace-pre-wrap text-amber-900/80 mt-1 border-t border-amber-200 pt-1">
            result: {JSON.stringify(item.output, null, 2)}
          </pre>
        ) : (
          <p className="text-amber-700/70 mt-1 border-t border-amber-200 pt-1">running…</p>
        )}
      </div>
    </div>
  );
}

export default function ChatPanel({ workflow }: { workflow: WorkflowDTO }) {
  // messages is the canonical history (only ever replaced wholesale by a
  // "done" event); liveItems is a scratch buffer for the turn currently
  // streaming in, cleared once "done" arrives and messages takes over.
  const [messages, setMessages] = useState<MessageParam[]>([]);
  const [liveItems, setLiveItems] = useState<DisplayItem[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveItems, streaming]);

  function handleStreamEvent(event: ChatStreamEvent) {
    if (event.type === "text_delta") {
      // Appends to the last item if it's text, else starts a new one. This
      // relies on Claude streaming one content block fully before the next
      // starts, so consecutive text deltas always belong to the same block.
      setLiveItems((prev) => {
        const last = prev[prev.length - 1];
        if (last?.type === "text") {
          return [...prev.slice(0, -1), { type: "text", text: last.text + event.text }];
        }
        return [...prev, { type: "text", text: event.text }];
      });
    } else if (event.type === "tool_call") {
      setLiveItems((prev) => [
        ...prev,
        { type: "tool", id: event.id, name: event.name, input: event.input },
      ]);
    } else if (event.type === "tool_result") {
      setLiveItems((prev) =>
        prev.map((item) =>
          item.type === "tool" && item.id === event.id ? { ...item, output: event.output } : item
        )
      );
    } else if (event.type === "done") {
      setMessages(event.messages);
      setLiveItems([]);
    } else if (event.type === "error") {
      setError(event.message);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    const nextMessages: MessageParam[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setStreaming(true);
    setError(null);
    setLiveItems([]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: workflow.id, messages: nextMessages }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Chat request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // The last "line" may be a partial chunk cut off mid-JSON — hold it
        // back and prepend it to the next read instead of parsing it early.
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) handleStreamEvent(JSON.parse(line) as ChatStreamEvent);
        }
      }
      if (buffer.trim()) handleStreamEvent(JSON.parse(buffer) as ChatStreamEvent);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStreaming(false);
    }
  }

  const items = buildDisplayItems(messages);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-3">
        <h1 className="text-lg font-semibold">{workflow.name}</h1>
        <p className="text-xs text-neutral-500">
          Tools: {workflow.enabledTools.length > 0 ? workflow.enabledTools.join(", ") : "none"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto rounded-md border border-neutral-200 bg-white p-4 space-y-3">
        {items.length === 0 && liveItems.length === 0 && (
          <p className="text-sm text-neutral-400 text-center mt-8">
            Start the conversation below.
          </p>
        )}
        {items.map((item, i) => renderItem(item, i))}
        {liveItems.map((item, i) => renderItem(item, `live-${i}`))}
        {streaming && liveItems.length === 0 && (
          <p className="text-xs text-neutral-400">Thinking…</p>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

      <form onSubmit={handleSend} className="mt-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          disabled={streaming}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-md bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
