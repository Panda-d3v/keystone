import TriageWorkspace from "@/variants/v4/workspace";
import { notFound } from "next/navigation";

export default async function Page() {
  return <TriageWorkspace screen="audit" />;
}
