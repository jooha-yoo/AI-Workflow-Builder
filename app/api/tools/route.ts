import { NextResponse } from "next/server";
import { TOOLS } from "@/lib/tools";

export async function GET() {
  const metadata = TOOLS.map(({ id, label, description }) => ({ id, label, description }));
  return NextResponse.json(metadata);
}
