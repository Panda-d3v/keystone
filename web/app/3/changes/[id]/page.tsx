import LineageWorkspace from "@/variants/v3/workspace";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if ((await params).id !== "CE-0007") notFound();
  return <LineageWorkspace screen="exposure"/>;
}
