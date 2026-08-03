"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { WorkflowDTO } from "@/lib/workflow";

export default function HomePage() {
  const [workflows, setWorkflows] = useState<WorkflowDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<{ data: WorkflowDTO[] } | { error: string }> {
    try {
      const res = await fetch("/api/workflows");
      if (!res.ok) throw new Error("Failed to load workflows");
      return { data: (await res.json()) as WorkflowDTO[] };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  useEffect(() => {
    let ignore = false;
    load().then((result) => {
      if (ignore) return;
      if ("data" in result) setWorkflows(result.data);
      else setError(result.error);
    });
    return () => {
      ignore = true;
    };
  }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete workflow "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    if (res.ok) {
      setWorkflows((prev) => prev?.filter((w) => w.id !== id) ?? null);
    }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!workflows) return <p className="text-neutral-500">Loading workflows…</p>;

  if (workflows.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-neutral-600 mb-4">No workflows yet.</p>
        <Link
          href="/workflows/new"
          className="inline-block rounded-md bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-700"
        >
          Create your first workflow
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Workflows</h1>
        <Link
          href="/workflows/new"
          className="rounded-md bg-neutral-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-700"
        >
          + New Workflow
        </Link>
      </div>
      <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
        {workflows.map((w) => (
          <li key={w.id} className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{w.name}</p>
              <p className="text-sm text-neutral-500 truncate">{w.systemPrompt}</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {w.enabledTools.length} tool{w.enabledTools.length === 1 ? "" : "s"} enabled
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <Link
                href={`/chat/${w.id}`}
                className="rounded-md bg-neutral-900 text-white px-3 py-1.5 text-sm font-medium hover:bg-neutral-700"
              >
                Chat
              </Link>
              <Link
                href={`/workflows/${w.id}/edit`}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100"
              >
                Edit
              </Link>
              <button
                onClick={() => handleDelete(w.id, w.name)}
                className="rounded-md border border-red-200 text-red-600 px-3 py-1.5 text-sm font-medium hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
