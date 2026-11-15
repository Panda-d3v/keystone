"use client";
import React, { useRef, useState } from "react";
import Link from "next/link";
import { Download, Layers, Printer, RefreshCw } from "lucide-react";
import { useWorkspace } from "@/lib/use-workspace";
import { WorkspaceEmpty } from "@/lib/workspace-empty";
import type {
  Action,
  DeclineActionResponse,
  SendActionResponse,
  WorkspaceData,
} from "@/lib/contracts";
import { actionTitle, atStake, date, money, percent, words } from "@/lib/format";
import { referenceUrl } from "@/lib/reference";
import {
  declineAction,
  submitAction,
  useDeclines,
  useSubmissions,
  type Submission,
} from "@/lib/submissions";
import { verifyAudit } from "@/lib/audit";
import { waterfallBars } from "./waterfall";
import "./brief.css";

export default function BriefWorkspace() {
  const { data, error, loading, reload, useFixtures } = useWorkspace();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  async function exportPdf() {
    if (!data || exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const { downloadBrief } = await import("./pdf");
      await downloadBrief(data);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "The PDF could not be generated.",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="brief-app">
      <header className="brief-toolbar">
        <Link className="brand" href="/">
          <Layers aria-hidden="true" />
          Keystone
        </Link>
        <span>{useFixtures ? "Fixture data" : "Live API"}</span>
        <div className="row">
          <button onClick={reload}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </button>
          <button disabled={!data || exporting} onClick={exportPdf}>
            <Download aria-hidden="true" />
            {exporting ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            Print
          </button>
          <Link href="/">Compare versions</Link>
        </div>
      </header>
      {exportError && (
        <p className="brief-export-error" role="alert">
          {exportError}
        </p>
      )}
      <main className="brief-paper">
        {!data && !loading && !error ? (
          <WorkspaceEmpty />
        ) : error ? (
          <div role="alert">
            <p>{error}</p>
            <button onClick={reload}>Retry</button>
          </div>
        ) : !data ? (
          <p role="status">Loading decision brief…</p>
        ) : (
          <BriefContent data={data} reload={reload} />
        )}
      </main>
    </div>
  );
}
function BriefContent({
  data,
  reload,
}: {
  data: WorkspaceData;
  reload: () => void;
}) {
  const change = data.changes[0];
  const submissions = useSubmissions(data.audit);
  const declines = useDeclines(data.audit);
  const [verification, setVerification] = useState("");
  return (
    <>
      <div className="brief-masthead">
        <p>MeridianFlow procurement</p>
        <p className="code">{change.id}</p>
      </div>
      <h1>The casing award needs another review</h1>
      <p className="brief-deck">
        The tariff assumption behind the award has changed. The alternative’s
        advantage depends on evidence that still needs to be supplied.
      </p>
      <section>
        <h2>What changed</h2>
        <p>
          {change.measure} changes the applicable rate from{" "}
          <strong>{percent(change.old_rate)}</strong> to{" "}
          <strong>{percent(change.new_rate)}</strong>, effective{" "}
          <strong>{date(change.effective_date)}</strong>. The assessment basis
          is {words(change.basis)}.
        </p>
        <p>
          The change reaches{" "}
          <strong>{data.exposure.affected_parts} parts</strong> across{" "}
          <strong>{data.exposure.open_po_lines} open order lines</strong>. Rules
          calculate <strong>{money(data.exposure.added_duty_usd)}</strong> in
          added duty on those orders and{" "}
          <strong>{money(data.exposure.annualized_added_duty_usd)}</strong> at
          current annual build rates.
        </p>
        {change.citations[0] && (
          <a
            className="brief-source"
            href={referenceUrl(change.citations[0])}
            target="_blank"
            rel="noreferrer"
          >
            Read the bulletin, page {change.citations[0].page}
          </a>
        )}
      </section>
      {data.decisions.map((decision) => {
        const bars = waterfallBars(decision);
        return (
          <section key={decision.decision_id}>
            <h2>The award’s annual cost</h2>
            <p>
              The incumbent’s modeled annual landed cost rises to{" "}
              <strong>{money(decision.incumbent_annual_usd)}</strong>.{" "}
              <span className="code">{decision.decision_id}</span> is{" "}
              {words(decision.status)}.
            </p>
            {bars ? (
              <figure
                className="brief-waterfall"
                aria-label={`Annual incumbent cost from ${money(bars[0].value!)} to ${money(bars[2].value!)}`}
              >
                <div className="brief-chart">
                  {bars.map((bar, index) => (
                    <div
                      className={`brief-column column-${index}`}
                      key={bar.label}
                    >
                      <div className="brief-plot">
                        <strong
                          style={{
                            bottom: `${(bar.bottom + bar.height) * 76 + 3}%`,
                          }}
                        >
                          {bar.value == null
                            ? "Awaiting rule detail"
                            : money(bar.value)}
                        </strong>
                        <div
                          className="brief-bar"
                          style={{
                            bottom: `${bar.bottom * 76}%`,
                            height: `${bar.height * 76}%`,
                          }}
                        />
                      </div>
                      <span>{bar.label}</span>
                    </div>
                  ))}
                </div>
                <figcaption>
                  Annual landed cost for the casing award. The middle bar shows
                  the duty increase.
                </figcaption>
              </figure>
            ) : (
              <p>The prior annual cost is unavailable.</p>
            )}
            <p>{decision.reason}</p>
            <table className="brief-options">
              <thead>
                <tr>
                  <th>Alternative</th>
                  <th>Annual landed cost</th>
                  <th>Against the incumbent</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>With the required proof</td>
                  <td>{money(decision.alternative_with_proof_annual_usd)}</td>
                  <td className="brief-delta">
                    {decision.alternative_with_proof_delta_usd == null
                      ? "Unavailable"
                      : money(decision.alternative_with_proof_delta_usd)}
                  </td>
                </tr>
                <tr>
                  <td>Without the required proof</td>
                  <td>
                    {money(decision.alternative_without_proof_annual_usd)}
                  </td>
                  <td>
                    {decision.alternative_without_proof_delta_usd == null
                      ? "Unavailable"
                      : signedMoney(
                          decision.alternative_without_proof_delta_usd,
                        )}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}
      <section>
        <h2>What the supplier still needs to prove</h2>
        <p>
          Review the evidence for{" "}
          <span className="code">{data.evidence.part_no}</span> from supplier{" "}
          <span className="code">{data.evidence.supplier_id}</span> before
          relying on the preferred treatment.
        </p>
        <ul className="brief-evidence">
          {data.evidence.requirements?.map((requirement) => (
            <li key={requirement.id}>
              <div>
                <strong>{requirement.label}</strong>
                <span
                  className={`brief-finding ${requirement.status === "checked" ? "checked" : ""}`}
                >
                  {words(requirement.status)}
                </span>
              </div>
              {requirement.reason && <p>{requirement.reason}</p>}
              {requirement.citations?.map((citation, index) => (
                <a
                  className="brief-source"
                  key={index}
                  href={referenceUrl(citation)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {citation.doc_id}, page {citation.page}
                </a>
              ))}
            </li>
          ))}
        </ul>
      </section>
      <section className="brief-response">
        <h2>Decision on the supplier request</h2>
        <p>
          Approving the request submits the edited draft for the returned
          approvers’ review.
        </p>
        {data.actions.map((action) => (
          <BriefRequest
            key={action.id}
            action={action}
            saved={submissions.find((item) => item.actionId === action.id)}
            reload={reload}
          />
        ))}
        {submissions
          .filter(
            (item) =>
              !data.actions.some((action) => action.id === item.actionId),
          )
          .map((item) => (
            <ApprovalResult key={item.actionId} result={item.response} />
          ))}
        {declines.map((item) => (
          <p key={item.action_id} role="status">
            Request <span className="code">{item.action_id}</span> declined.
            Audit event <span className="code">{item.audit_event.id}</span>.
          </p>
        ))}
        {!data.actions.length && !submissions.length && !declines.length && (
          <p>No supplier request is awaiting review.</p>
        )}
      </section>
      <section className="brief-audit">
        <details>
          <summary>Audit trail</summary>
          <button
            onClick={async () => {
              try {
                const result = await verifyAudit(data.audit);
                setVerification(
                  `${result.valid ? "Chain verified" : "Verification failed"}. ${result.reason}`,
                );
              } catch {
                setVerification("Verification could not run in this browser.");
              }
            }}
          >
            Verify audit chain
          </button>
          {verification && <p role="status">{verification}</p>}
          <ol>
            {data.audit.map((event) => (
              <li key={event.id}>
                {words(event.type)} —{" "}
                <span className="code">{event.entity_id}</span>
                <small>{event.occurred_at}</small>
              </li>
            ))}
          </ol>
        </details>
      </section>
      <footer>
        Illustrative MeridianFlow scenario. Section 232 layer only.
      </footer>
    </>
  );
}
function signedMoney(value: number) {
  return value > 0 ? `+${money(value)}` : money(value);
}
function ApprovalResult({ result }: { result: SendActionResponse }) {
  return (
    <div className="brief-outcome" role="status">
      <h3>
        Draft decision <span className="code">{result.decision_id}</span>
      </h3>
      <p>{words(result.state)}</p>
      <h3>Pending approvals</h3>
      <ul>
        {result.pending_approvals.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </div>
  );
}
function BriefRequest({
  action,
  saved,
  reload,
}: {
  action: Action;
  saved?: Submission;
  reload: () => void;
}) {
  const [draft, setDraft] = useState(saved?.draftEmail ?? action.draft_email);
  const [approved, setApproved] = useState<SendActionResponse>();
  const [declined, setDeclined] = useState<DeclineActionResponse>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const result = approved || saved?.response;
  async function respond(approve: boolean) {
    if (guard.current || result || declined) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      if (approve) setApproved(await submitAction(action.id, draft));
      else setDeclined(await declineAction(action.id));
      reload();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The response could not be recorded.",
      );
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <article className="brief-request">
      <h3>{actionTitle(action)}</h3>
      <p>{action.why || atStake(action.usd_at_stake)}</p>
      <label>
        Supplier request
        <textarea
          disabled={busy || !!result || !!declined}
          value={result ? (saved?.draftEmail ?? draft) : draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {result ? (
        <ApprovalResult result={result} />
      ) : declined ? (
        <p role="status">
          Request declined. Audit event{" "}
          <span className="code">{declined.audit_event.id}</span>.
        </p>
      ) : (
        <div className="brief-controls">
          <button
            className="primary"
            disabled={busy || !draft.trim()}
            onClick={() => respond(true)}
          >
            Approve request
          </button>
          <button disabled={busy} onClick={() => respond(false)}>
            Decline request
          </button>
          {busy && <span role="status">Recording response…</span>}
        </div>
      )}
    </article>
  );
}
