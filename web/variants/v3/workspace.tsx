"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Layers, RefreshCw, X, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { useWorkspace } from "@/lib/use-workspace";
import { WorkspaceEmpty } from "@/lib/workspace-empty";
import { useLineage } from "@/lib/use-lineage";
import { routeFor, screens, type Screen } from "@/lib/routes";
import type {
  Action,
  ExposureLineage,
  LineageNode,
  WorkspaceData,
} from "@/lib/contracts";
import { actionTitle, atStake, money, percent, date, words } from "@/lib/format";
import { referenceUrl } from "@/lib/reference";
import {
  submitAction,
  useSubmissions,
  type Submission,
} from "@/lib/submissions";
import { verifyAudit } from "@/lib/audit";
import { displayGraph, type SourceGroup } from "./graph";
import "@xyflow/react/dist/style.css";
import "./lineage.css";

type TraceNode = Node<
  { group: SourceGroup; selected: boolean; select: () => void },
  "source"
>;
const labels: Record<LineageNode["kind"], string> = {
  bulletin: "Bulletin",
  change: "Change",
  rate: "Tariff rates",
  assumption: "Assumption",
  decision: "Decision",
  part: "Parts",
  purchase_order: "PO lines",
  product: "Products",
};
const positions = {
  bulletin: { x: 0, y: 100 },
  change: { x: 190, y: 100 },
  rate: { x: 380, y: 100 },
  assumption: { x: 570, y: 0 },
  decision: { x: 570, y: 205 },
  part: { x: 760, y: 100 },
  purchase_order: { x: 950, y: 0 },
  product: { x: 950, y: 220 },
};
function GroupButton({ group, selected, select }: TraceNode["data"]) {
  return (
    <button
      className={`lineage-node ${group.kind} ${selected ? "selected" : ""}`}
      onClick={select}
    >
      <span>{labels[group.kind]}</span>
      <strong>
        {group.rows.length === 1
          ? group.rows[0].label.replaceAll(" · ", ", ")
          : `${group.rows.length} records`}
      </strong>
      <small>Inspect source rows</small>
    </button>
  );
}
function SourceNode({ data }: NodeProps<TraceNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      {data.group.kind === "decision" && (
        <Handle id="top" type="target" position={Position.Top} />
      )}
      <GroupButton {...data} />
      <Handle type="source" position={Position.Right} />
      {data.group.kind === "assumption" && (
        <Handle id="bottom" type="source" position={Position.Bottom} />
      )}
    </>
  );
}
const nodeTypes = { source: SourceNode };

export default function LineageWorkspace({ screen }: { screen: Screen }) {
  const { data, error, loading, reload, useFixtures } = useWorkspace();
  const lineage = useLineage(data?.changes[0]?.id || "CE-0007", data);
  return (
    <div className="lineage-app">
      <header className="lineage-top">
        <Link href="/" className="brand">
          <Layers aria-hidden="true" />
          Keystone
        </Link>
        <span>Lineage</span>
        <div className="row">
          <span className="status">
            {useFixtures ? "Fixture data" : "Live API"}
          </span>
          <button onClick={reload}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </button>
          <Link href="/versions">Compare versions</Link>
        </div>
      </header>
      <main>
        <nav className="lineage-tabs" aria-label="Lineage sections">
          {screens.map((item) => (
            <Link
              key={item.id}
              href={routeFor(3, item.id)}
              aria-current={screen === item.id ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {!data && !loading && !error ? (
          <WorkspaceEmpty />
        ) : error || lineage.error ? (
          <section role="alert">
            {error || lineage.error}
            <button onClick={reload}>Retry</button>
          </section>
        ) : !data || !lineage.data ? (
          <p role="status">Loading lineage…</p>
        ) : (
          <LineageContent screen={screen} data={data} graph={lineage.data} />
        )}
        <footer>
          Illustrative MeridianFlow scenario. Section 232 layer only.
        </footer>
      </main>
    </div>
  );
}
export function LineageContent({
  screen,
  data,
  graph,
  showPanel = true,
  part: controlledPart,
  fixed = false,
}: {
  screen: Screen;
  data: WorkspaceData;
  graph: ExposureLineage;
  /** The unified platform shows only the graph and its drawer. */
  showPanel?: boolean;
  /** Part filter owned by the caller ("part:ID" or ""); hides the built-in picker. */
  part?: string;
  /** Fit the graph once and turn off zoom and panning. */
  fixed?: boolean;
}) {
  const [ownPart, setPart] = useState("");
  const part = controlledPart ?? ownPart;
  const [selected, setSelected] = useState("");
  const [mobile, setMobile] = useState(false);
  const [flow, setFlow] = useState<ReactFlowInstance<TraceNode>>();
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const view = useMemo(() => displayGraph(graph, part), [graph, part]);
  const nodes: TraceNode[] = view.groups.map((group) => ({
    id: group.kind,
    type: "source",
    position: positions[group.kind],
    data: {
      group,
      selected: selected === group.kind || selected === "total",
      select: () => setSelected(group.kind),
    },
  }));
  const edges = view.edges.map((edge, index) => ({
    id: `edge-${index}`,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.source === "assumption" ? "bottom" : undefined,
    targetHandle: edge.source === "assumption" ? "top" : undefined,
    type: "smoothstep",
    ariaLabel: `${labels[edge.source as LineageNode["kind"]]} ${words(edge.kind)} ${labels[edge.target as LineageNode["kind"]]}`,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: selected ? "#2b5fd9" : "#8290a2",
    },
    style: {
      stroke: selected ? "#2b5fd9" : "#8290a2",
      strokeWidth: selected ? 2 : 1.5,
    },
  }));
  const group = view.groups.find((group) => group.kind === selected);
  const partRows = graph.nodes.filter((node) => node.kind === "part");
  const shownLines = part
    ? data.exposure.lines.filter((line) => `part:${line.part_no}` === part)
    : data.exposure.lines;
  return (
    <>
      <div className="lineage-heading">
        <div>
          <p className="code">{graph.change_id}</p>
          <h1>Trace the exposure</h1>
          <p>Follow the notice through its affected records.</p>
        </div>
        <button className="lineage-total" onClick={() => setSelected("total")}>
          <span>Added duty on open orders</span>
          <strong>{money(graph.added_duty_usd)}</strong>
          <span>
            {money(data.exposure.annualized_added_duty_usd)} annualized
          </span>
        </button>
      </div>
      {controlledPart === undefined && <div className="lineage-toolbar">
        <label>
          Trace a part
          <select
            value={part}
            onChange={(event) => {
              setPart(event.target.value);
              setSelected("");
            }}
          >
            {[
              <option key="all" value="">
                All affected parts
              </option>,
              ...partRows.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              )),
            ]}
          </select>
        </label>
        <p>Grouped by record type. Select a node to inspect its source rows.</p>
        {!mobile && !fixed && (
          <div className="row">
            <button aria-label="Zoom in" onClick={() => flow?.zoomIn()}>
              <ZoomIn />
            </button>
            <button aria-label="Zoom out" onClick={() => flow?.zoomOut()}>
              <ZoomOut />
            </button>
            <button
              aria-label="Fit graph"
              onClick={() => flow?.fitView({ padding: 0.15 })}
            >
              <Maximize />
            </button>
          </div>
        )}
      </div>}
      <div className={`lineage-canvas ${fixed ? "fixed" : ""}`} aria-label="Exposure lineage graph">
        {mobile ? (
          <ol className="lineage-mobile-path">
            {view.groups.map((group) => (
              <li key={group.kind}>
                <GroupButton
                  group={group}
                  selected={selected === group.kind || selected === "total"}
                  select={() => setSelected(group.kind)}
                />
              </li>
            ))}
          </ol>
        ) : (
          <ReactFlow<TraceNode>
            key={part}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={setFlow}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1.05 }}
            minZoom={0.2}
            maxZoom={2.5}
            zoomOnScroll={!fixed}
            zoomOnPinch={!fixed}
            zoomOnDoubleClick={!fixed}
            panOnDrag={!fixed}
            preventScrolling={!fixed}
            nodesDraggable={false}
            nodesConnectable={false}
            attributionPosition="bottom-left"
          />
        )}
      </div>
      {selected && (
        <section className="lineage-drawer" aria-label="Source rows">
          <div className="row spread">
            <h2>
              {selected === "total"
                ? "Duty calculation source rows"
                : labels[selected as LineageNode["kind"]]}
            </h2>
            <button
              aria-label="Close source rows"
              onClick={() => setSelected("")}
            >
              <X />
            </button>
          </div>
          {group && (
            <ul className="lineage-source-list">
              {group.rows.map((node) => (
                <li key={node.id}>
                  <span className="code">{node.id}</span>
                  <span>{node.label.replaceAll(" · ", ", ")}</span>
                  {node.added_duty_usd != null && (
                    <strong>{money(node.added_duty_usd, 2)}</strong>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(selected === "total" ||
            selected === "part" ||
            selected === "purchase_order") && <DutyRows lines={shownLines} />}
          <details>
            <summary>Published relationships</summary>
            <ul>
              {graph.edges
                .filter(
                  (edge) =>
                    view.groups.some((group) =>
                      group.rows.some((node) => node.id === edge.source),
                    ) &&
                    view.groups.some((group) =>
                      group.rows.some((node) => node.id === edge.target),
                    ),
                )
                .map((edge, index) => (
                  <li key={index}>
                    <span className="code">{edge.source}</span> →{" "}
                    {words(edge.kind)} →{" "}
                    <span className="code">{edge.target}</span>
                  </li>
                ))}
            </ul>
          </details>
        </section>
      )}
      {showPanel && <LineagePanel screen={screen} data={data} />}
    </>
  );
}
function DutyRows({ lines }: { lines: WorkspaceData["exposure"]["lines"] }) {
  return (
    <div className="lineage-table">
      <table>
        <thead>
          <tr>
            <th>PO / part</th>
            <th>Entry date</th>
            <th className="money">Added duty</th>
            <th>Rule calculation</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={`${line.po_id}:${line.line_no}`}>
              <td className="code">
                {line.po_id}/{line.line_no}
                <br />
                {line.part_no}
              </td>
              <td>{date(line.est_entry_date)}</td>
              <td className="money">{money(line.added_duty_usd, 2)}</td>
              <td>{line.math || "Calculation detail unavailable."}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function LineagePanel({
  screen,
  data,
}: {
  screen: Screen;
  data: WorkspaceData;
}) {
  const [verification, setVerification] = useState("");
  const submissions = useSubmissions(data.audit);
  const change = data.changes[0];
  return (
    <section className="lineage-panel stack">
      <h2>{screens.find((item) => item.id === screen)?.label}</h2>
      {screen === "inbox" && (
        <>
          <h3>{change.measure}</h3>
          <p>
            {percent(change.old_rate)} → {percent(change.new_rate)}, effective{" "}
            {date(change.effective_date)}. {words(change.basis)}.
          </p>
          {change.citations.map((citation, index) => (
            <blockquote key={index}>
              {citation.quote}
              <br />
              <a href={referenceUrl(citation)} target="_blank" rel="noreferrer">
                {citation.doc_id}, page {citation.page}
              </a>
            </blockquote>
          ))}
        </>
      )}
      {screen === "exposure" && (
        <>
          <p>
            {data.exposure.affected_parts} affected parts across{" "}
            {data.exposure.open_po_lines} open PO lines.
          </p>
          <DutyRows lines={data.exposure.lines} />
        </>
      )}
      {screen === "decisions" &&
        data.decisions.map((decision) => (
          <article key={decision.decision_id}>
            <h3 className="code">{decision.decision_id}</h3>
            <span className="status warn">{words(decision.status)}</span>
            <p>{decision.reason}</p>
            <dl className="lineage-costs">
              <div>
                <dt>Incumbent</dt>
                <dd>{money(decision.incumbent_annual_usd)}</dd>
              </div>
              <div>
                <dt>Alternative with proof</dt>
                <dd>{money(decision.alternative_with_proof_annual_usd)}</dd>
              </div>
              <div>
                <dt>Alternative without proof</dt>
                <dd>{money(decision.alternative_without_proof_annual_usd)}</dd>
              </div>
            </dl>
          </article>
        ))}
      {screen === "evidence" && (
        <div className="lineage-table">
          <table>
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Status</th>
                <th>Finding / source</th>
              </tr>
            </thead>
            <tbody>
              {data.evidence.requirements?.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>{words(row.status)}</td>
                  <td>
                    {row.reason}
                    {row.citations?.map((citation, index) => (
                      <p key={index}>
                        <a
                          href={referenceUrl(citation)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {citation.doc_id}, page {citation.page}
                        </a>
                      </p>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {screen === "actions" && (
        <>
          {data.actions.map((action) => (
            <LineageRequest
              key={action.id}
              action={action}
              saved={submissions.find((item) => item.actionId === action.id)}
            />
          ))}
          {!data.actions.length && <p>No requests need review.</p>}
        </>
      )}
      {screen === "audit" && (
        <>
          <button
            onClick={async () => {
              const result = await verifyAudit(data.audit);
              setVerification(
                `${result.valid ? "Chain verified" : "Verification failed"}. ${result.reason}`,
              );
            }}
          >
            Verify audit chain
          </button>
          {verification && <p role="status">{verification}</p>}
          <div className="lineage-table">
            <table>
              <thead>
                <tr>
                  <th>Time (UTC)</th>
                  <th>Event</th>
                  <th>Entity</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((event) => (
                  <tr key={event.id}>
                    <td>{event.occurred_at}</td>
                    <td>{words(event.type)}</td>
                    <td className="code">{event.entity_id}</td>
                    <td className="code">{event.hash.slice(0, 12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
function LineageRequest({
  action,
  saved,
}: {
  action: Action;
  saved?: Submission;
}) {
  const [draft, setDraft] = useState(saved?.draftEmail ?? action.draft_email);
  const [result, setResult] = useState(saved?.response);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  async function submit() {
    if (guard.current || result) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      setResult(await submitAction(action.id, draft));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Submission failed.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  const accepted = result || saved?.response;
  return (
    <article className="stack">
      <h3>{actionTitle(action)}</h3>
      <p>{atStake(action.usd_at_stake)}</p>
      {action.why && <p>{action.why}</p>}
      <label className="stack">
        Supplier request
        <textarea
          disabled={busy || !!accepted}
          value={accepted ? (saved?.draftEmail ?? draft) : draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {accepted ? (
        <div role="status">
          <h3>
            Draft decision <span className="code">{accepted.decision_id}</span>
          </h3>
          <p>{words(accepted.state)}</p>
          <ul>
            {accepted.pending_approvals.map((approver) => (
              <li key={approver.id}>{approver.name}</li>
            ))}
          </ul>
        </div>
      ) : (
        <button
          className="primary"
          disabled={busy || !draft.trim()}
          onClick={submit}
        >
          {busy ? "Submitting…" : "Submit request"}
        </button>
      )}
    </article>
  );
}
