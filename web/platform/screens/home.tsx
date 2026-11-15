"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { WorkspaceData } from "@/lib/contracts";
import { actionTitle, money } from "@/lib/format";
import type { Role } from "../roles";
import { changeHeadline, decisionStory, openChecks } from "../story";
import { EmptyWorkspace, PageHead } from "../shell";

interface Step { href: string; title: string; detail: string }

export function Home({ data, role }: { data: WorkspaceData | null; role: Role }) {
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);
  const first = role.person.split(" ")[0];
  if (!data) return <><PageHead eyebrow={role.label} title={`${greeting}, ${first}`} /><EmptyWorkspace /></>;

  const change = data.changes[0];
  const decision = data.decisions[0];
  const story = decision ? decisionStory(decision, change, data.evidence) : null;
  const checks = openChecks(data);
  const action = [...data.actions].sort((a, b) => a.rank - b.rank)[0];
  const broken = data.decisions.filter(d => d.status === "broken").length;

  const steps: Record<Role["id"], Step[]> = {
    sourcing: [
      story && { href: "/decisions", title: `Review the ${story.title.toLowerCase()}`,
        detail: story.increase ? `It now costs ${money(story.increase)} more a year.` : story.broke },
      action && { href: "/actions", title: actionTitle(action), detail: `${money(action.usd_at_stake)} a year at stake.` },
      { href: "/exposure", title: "See which orders cost more", detail: `${data.exposure.open_po_lines} open order lines enter after the change.` },
    ].filter(Boolean) as Step[],
    compliance: [
      { href: "/evidence", title: `Check ${story?.alternative ?? "the supplier"}'s certificate`,
        detail: checks.requirements ? `${checks.requirements} requirement${checks.requirements === 1 ? "" : "s"} not yet proven.` : "Every requirement is proven." },
      { href: "/intake", title: "Review received documents", detail: checks.documents ? `${checks.documents} document${checks.documents === 1 ? "" : "s"} need a person.` : "Everything received was read." },
      { href: "/exposure", title: "Confirm the duty bill", detail: "Old and new duty for every affected order line." },
    ],
    analyst: [
      { href: "/lineage", title: `Trace the ${money(data.exposure.added_duty_usd)}`, detail: "From the bulletin to rates, orders and products." },
      { href: "/exposure", title: "Check the math on each order", detail: "Every line shows its inputs and formula." },
      { href: "/audit", title: "Verify the audit chain", detail: `${data.audit.length} signed events.` },
    ],
    approver: [],
  };

  return <div className="d-grid gap-4">
    <PageHead eyebrow={role.label} title={`${greeting}, ${first}`}>{role.focus}</PageHead>

    {change && <section className="ks-hero" aria-label="What changed">
      <div className="eyebrow">New tariff bulletin {change.citations[0]?.doc_id ?? ""}</div>
      <h2>{changeHeadline(change)}</h2>
      <p className="mb-0">
        {data.exposure.affected_parts} parts and {data.exposure.open_po_lines} open order lines are affected
        {broken ? `, and ${broken} supplier decision no longer holds` : ""}.
      </p>
    </section>}

    <section className="ks-kpis" aria-label="Headline numbers">
      {[
        { label: "Added duty, open orders", value: money(data.exposure.added_duty_usd), accent: true },
        { label: "Added duty per year", value: money(data.exposure.annualized_added_duty_usd) },
        { label: "Order lines affected", value: String(data.exposure.open_po_lines) },
        { label: "Decisions to revisit", value: String(broken) },
      ].map(kpi => <div className="ks-kpi" key={kpi.label}>
        <div className="label">{kpi.label}</div>
        <div className={`value ${kpi.accent ? "accent" : ""}`}>{kpi.value}</div>
      </div>)}
    </section>

    <section className="card" aria-labelledby="next-steps">
      <div className="card-header" id="next-steps">Your next steps</div>
      <div>
        {steps[role.id].map((step, index) => <Link key={step.href} href={step.href} className="ks-step">
          <span className="ks-step-num">0{index + 1}</span>
          <span className="flex-grow-1"><span className="d-block fw-medium">{step.title}</span>
            <span className="text-soft small">{step.detail}</span></span>
          <ArrowRight aria-hidden="true" className="lucide text-soft" />
        </Link>)}
      </div>
    </section>
  </div>;
}
