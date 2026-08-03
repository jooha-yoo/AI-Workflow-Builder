import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toWorkflowDTO, saveWorkflowVersion } from "@/lib/workflow";
import { TOOLS } from "@/lib/tools";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(toWorkflowDTO(workflow));
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  const steps = Array.isArray(body.steps) ? body.steps.filter((s: unknown) => typeof s === "string" && s.trim()) : [];
  const validToolIds = new Set(TOOLS.map((t) => t.id));
  const enabledTools = Array.isArray(body.enabledTools)
    ? body.enabledTools.filter((tid: unknown) => typeof tid === "string" && validToolIds.has(tid))
    : [];

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!systemPrompt) {
    return NextResponse.json({ error: "System prompt is required" }, { status: 400 });
  }

  try {
    const workflow = await prisma.$transaction(async (tx) => {
      const updated = await tx.workflow.update({
        where: { id },
        data: {
          name,
          systemPrompt,
          steps: JSON.stringify(steps),
          enabledTools: JSON.stringify(enabledTools),
        },
      });
      await saveWorkflowVersion(tx, updated);
      return updated;
    });
    return NextResponse.json(toWorkflowDTO(workflow));
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.workflow.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
