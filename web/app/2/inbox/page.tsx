import EntryWorkspace from "@/variants/v2/workspace";
import { notFound } from "next/navigation";

export default async function Page() {
  return <EntryWorkspace screen="inbox"/>;
}
