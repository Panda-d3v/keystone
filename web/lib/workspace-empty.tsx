import Link from "next/link";
export function WorkspaceEmpty() {
  return (
    <section>
      <h2>Start with a document</h2>
      <p>
        Upload the bulletin in Intake to calculate exposure and prepare the
        decision review.
      </p>
      <Link href="/1/inbox">Open document intake</Link>
    </section>
  );
}
