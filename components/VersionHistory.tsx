"use client";

import { useEffect, useState } from "react";
import type { WorkflowDTO, WorkflowVersionDTO } from "@/lib/workflow";

export default function VersionHistory({
  workflowId,
  refreshToken,
  onRestored,
}: {
  workflowId: string;
  refreshToken: number;
  onRestored: (workflow: WorkflowDTO) => void;
}) {
  const [versions, setVersions] = useState<WorkflowVersionDTO[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/workflows/${workflowId}/versions`)
      .then((res) => res.json())
      .then(setVersions)
      .catch(() => setError("Failed to load version history"));
  }, [workflowId, refreshToken]);

  async function handleRestore(version: WorkflowVersionDTO) {
    if (
      !confirm(
        `Restore to version ${version.versionNumber}? This immediately overwrites the saved workflow and the form fields above with that version's content.`
      )
    ) {
      return;
    }
    setRestoringId(version.id);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/versions/${version.id}/restore`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to restore version");
      onRestored(body.workflow as WorkflowDTO);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="rounded-md border border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium hover:bg-neutral-50"
      >
        <span>
          Version History {versions ? `(${versions.length})` : ""}
        </span>
        <span className="text-neutral-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-neutral-200 px-3 py-2 space-y-2">
          {error && <p className="text-red-600 text-xs">{error}</p>}
          {!versions ? (
            <p className="text-xs text-neutral-500">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="text-xs text-neutral-500">No history yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {versions.map((v, i) => (
                <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    {/* API returns versions ordered desc by versionNumber, so index 0 is current */}
                    <span className="font-medium">v{v.versionNumber}</span>
                    {i === 0 && (
                      <span className="ml-2 text-xs text-emerald-600 font-medium">current</span>
                    )}
                    <span className="block text-xs text-neutral-500">
                      {new Date(v.createdAt).toLocaleString()} — {v.name}
                    </span>
                  </div>
                  {i !== 0 && (
                    <button
                      type="button"
                      onClick={() => handleRestore(v)}
                      disabled={restoringId === v.id}
                      className="text-xs rounded-md border border-neutral-300 px-2 py-1 font-medium hover:bg-neutral-100 disabled:opacity-50"
                    >
                      {restoringId === v.id ? "Restoring…" : "Restore"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
