import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toWorkflowVersionDTO } from "@/lib/workflow";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const versions = await prisma.workflowVersion.findMany({
    where: { workflowId: id },
    orderBy: { versionNumber: "desc" },
  });
  return NextResponse.json(versions.map(toWorkflowVersionDTO));
}
