import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toWorkflowDTO, saveWorkflowVersion } from "@/lib/workflow";
import { TOOLS } from "@/lib/tools";

export async function GET() {
  const workflows = await prisma.workflow.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json(workflows.map(toWorkflowDTO));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  const steps = Array.isArray(body.steps) ? body.steps.filter((s: unknown) => typeof s === "string" && s.trim()) : [];
  // Drop any tool id the client sends that isn't in our registry.
  const validToolIds = new Set(TOOLS.map((t) => t.id));
  const enabledTools = Array.isArray(body.enabledTools)
    ? body.enabledTools.filter((id: unknown) => typeof id === "string" && validToolIds.has(id))
    : [];

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!systemPrompt) {
    return NextResponse.json({ error: "System prompt is required" }, { status: 400 });
  }

  const workflow = await prisma.$transaction(async (tx) => {
    const wf = await tx.workflow.create({
      data: {
        name,
        systemPrompt,
        steps: JSON.stringify(steps),
        enabledTools: JSON.stringify(enabledTools),
      },
    });
    await saveWorkflowVersion(tx, wf);
    return wf;
  });

  return NextResponse.json(toWorkflowDTO(workflow), { status: 201 });
}
