import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toWorkflowDTO, saveWorkflowVersion } from "@/lib/workflow";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;

  const version = await prisma.workflowVersion.findUnique({ where: { id: versionId } });
  // The workflowId check matters: without it, a valid versionId belonging to
  // a *different* workflow would restore into this one.
  if (!version || version.workflowId !== id) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  try {
    const workflow = await prisma.$transaction(async (tx) => {
      const updated = await tx.workflow.update({
        where: { id },
        data: {
          name: version.name,
          systemPrompt: version.systemPrompt,
          steps: version.steps,
          enabledTools: version.enabledTools,
        },
      });
      // Snapshotting here means restoring v1 over v4 produces v5, not a
      // rewritten v1 — the history stays append-only and nothing is lost.
      await saveWorkflowVersion(tx, updated);
      return updated;
    });
    return NextResponse.json({ workflow: toWorkflowDTO(workflow) });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
