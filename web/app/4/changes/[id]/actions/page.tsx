import TriageWorkspace from "@/variants/v4/workspace";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if ((await params).id !== "CE-0007") notFound();
  return <TriageWorkspace screen="actions" />;
}
