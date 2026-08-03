import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toWorkflowDTO } from "@/lib/workflow";
import ChatPanel from "@/components/ChatPanel";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (!workflow) notFound();

  return <ChatPanel workflow={toWorkflowDTO(workflow)} />;
}
