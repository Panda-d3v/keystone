import LineageWorkspace from "@/variants/v3/workspace";
import { notFound } from "next/navigation";

export default async function Page() {
  return <LineageWorkspace screen="audit" />;
}
