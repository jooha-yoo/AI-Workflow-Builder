import type { Workflow, WorkflowVersion, Prisma } from "@prisma/client";

export type WorkflowDTO = {
  id: string;
  name: string;
  systemPrompt: string;
  steps: string[];
  enabledTools: string[];
  createdAt: string;
  updatedAt: string;
};

export function toWorkflowDTO(w: Workflow): WorkflowDTO {
  return {
    id: w.id,
    name: w.name,
    systemPrompt: w.systemPrompt,
    steps: JSON.parse(w.steps) as string[],
    enabledTools: JSON.parse(w.enabledTools) as string[],
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export type WorkflowVersionDTO = {
  id: string;
  workflowId: string;
  versionNumber: number;
  name: string;
  systemPrompt: string;
  steps: string[];
  enabledTools: string[];
  createdAt: string;
};

export function toWorkflowVersionDTO(v: WorkflowVersion): WorkflowVersionDTO {
  return {
    id: v.id,
    workflowId: v.workflowId,
    versionNumber: v.versionNumber,
    name: v.name,
    systemPrompt: v.systemPrompt,
    steps: JSON.parse(v.steps) as string[],
    enabledTools: JSON.parse(v.enabledTools) as string[],
    createdAt: v.createdAt.toISOString(),
  };
}

// Snapshots the given workflow's current fields as the next version. Called
// from within the same transaction as every create/update/restore so the
// workflow row and its version history never drift apart.
export async function saveWorkflowVersion(tx: Prisma.TransactionClient, workflow: Workflow) {
  const count = await tx.workflowVersion.count({ where: { workflowId: workflow.id } });
  await tx.workflowVersion.create({
    data: {
      workflowId: workflow.id,
      versionNumber: count + 1,
      name: workflow.name,
      systemPrompt: workflow.systemPrompt,
      steps: workflow.steps,
      enabledTools: workflow.enabledTools,
    },
  });
}
