import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toWorkflowDTO } from "@/lib/workflow";
import WorkflowForm from "@/components/WorkflowForm";

export default async function EditWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow) notFound();

  return <WorkflowForm workflow={toWorkflowDTO(workflow)} />;
}
