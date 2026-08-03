"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { WorkflowDTO } from "@/lib/workflow";
import SortableStep from "./SortableStep";
import VersionHistory from "./VersionHistory";

type ToolMeta = { id: string; label: string; description: string };
// `id` here is a client-only identity for React keys and drag-and-drop —
// steps are persisted as plain strings, the id never leaves this component.
type Step = { id: string; text: string };

export default function WorkflowForm({ workflow }: { workflow?: WorkflowDTO }) {
  const router = useRouter();
  const isEdit = Boolean(workflow);

  const [tools, setTools] = useState<ToolMeta[] | null>(null);
  const [name, setName] = useState(workflow?.name ?? "");
  const [systemPrompt, setSystemPrompt] = useState(workflow?.systemPrompt ?? "");
  const [steps, setSteps] = useState<Step[]>(
    (workflow?.steps ?? []).map((text) => ({ id: crypto.randomUUID(), text }))
  );
  const [enabledTools, setEnabledTools] = useState<Set<string>>(
    new Set(workflow?.enabledTools ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after a restore to re-trigger VersionHistory's fetch effect (it's
  // keyed on this value) so the newly-created restore version shows up.
  const [versionRefreshToken, setVersionRefreshToken] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetch("/api/tools")
      .then((res) => res.json())
      .then(setTools)
      .catch(() => setError("Failed to load tools"));
  }, []);

  function toggleTool(id: string) {
    setEnabledTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateStep(id: string, text: string) {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));
  }

  function removeStep(id: string) {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }

  function addStep() {
    setSteps((prev) => [...prev, { id: crypto.randomUUID(), text: "" }]);
  }

  function handleRestored(restored: WorkflowDTO) {
    setName(restored.name);
    setSystemPrompt(restored.systemPrompt);
    setSteps(restored.steps.map((text) => ({ id: crypto.randomUUID(), text })));
    setEnabledTools(new Set(restored.enabledTools));
    setVersionRefreshToken((k) => k + 1);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !systemPrompt.trim()) {
      setError("Name and system prompt are required.");
      return;
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      steps: steps.map((s) => s.text.trim()).filter(Boolean),
      enabledTools: Array.from(enabledTools),
    };

    try {
      const res = await fetch(isEdit ? `/api/workflows/${workflow!.id}` : "/api/workflows", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save workflow");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <h1 className="text-lg font-semibold">{isEdit ? "Edit Workflow" : "New Workflow"}</h1>

      {isEdit && (
        <VersionHistory
          workflowId={workflow!.id}
          refreshToken={versionRefreshToken}
          onRestored={handleRestored}
        />
      )}

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Customer Support Assistant"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="systemPrompt">
          System Prompt
        </label>
        <textarea
          id="systemPrompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={5}
          placeholder="Describe who this assistant is and how it should behave..."
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Steps / Decision Logic <span className="text-neutral-400 font-normal">(optional)</span>
        </label>
        <p className="text-xs text-neutral-500 mb-2">
          An ordered list of instructions the assistant should follow. E.g. &ldquo;If the user asks
          about pricing, search the web first&rdquo;. These are appended to the system prompt as a
          numbered sequence — drag to reorder.
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <SortableStep
                  key={step.id}
                  id={step.id}
                  index={i}
                  value={step.text}
                  onChange={(value) => updateStep(step.id, value)}
                  onRemove={() => removeStep(step.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button
          type="button"
          onClick={addStep}
          className="mt-2 text-sm text-neutral-600 hover:text-neutral-900 underline"
        >
          + Add step
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Tools</label>
        {!tools ? (
          <p className="text-sm text-neutral-500">Loading tools…</p>
        ) : (
          <div className="space-y-2">
            {tools.map((tool) => (
              <label
                key={tool.id}
                className="flex items-start gap-3 rounded-md border border-neutral-200 px-3 py-2 cursor-pointer hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  checked={enabledTools.has(tool.id)}
                  onChange={() => toggleTool(tool.id)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">{tool.label}</span>
                  <span className="block text-xs text-neutral-500">{tool.description}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Workflow"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
