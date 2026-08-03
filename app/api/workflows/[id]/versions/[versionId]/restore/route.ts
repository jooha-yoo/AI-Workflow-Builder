import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toWorkflowDTO, saveWorkflowVersion } from "@/lib/workflow";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { id, versionId } = await params;

  const version = await prisma.workflowVersion.findUnique({ where: { id: versionId } });
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
      await saveWorkflowVersion(tx, updated);
      return updated;
    });
    return NextResponse.json({ workflow: toWorkflowDTO(workflow) });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
