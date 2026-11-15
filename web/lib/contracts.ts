// Browser representations of contracts/models.py. Keep optional additions compatible with older responses.
export interface Citation {
  doc_id: string;
  page: number;
  bbox: number[];
  quote?: string | null;
}
export interface ChangeEvent {
  id: string;
  measure: string;
  hts_scope: string[];
  countries: string[];
  old_rate: number;
  new_rate: number;
  basis: string;
  effective_date: string;
  citations: Citation[];
  field_citations?: Record<string, Citation[]>;
}
export interface ExposureLine {
  po_id: string;
  line_no: number;
  part_no: string;
  supplier_id: string;
  est_entry_date: string;
  customs_value_usd: number;
  added_duty_usd: number;
  math?: string | null;
  old_duty_usd?: number | null;
  new_duty_usd?: number | null;
}
export interface Exposure {
  change_id: string;
  affected_parts: number;
  open_po_lines: number;
  added_duty_usd: number;
  annualized_added_duty_usd: number;
  lines: ExposureLine[];
}
export interface DecisionCheck {
  decision_id: string;
  change_id: string;
  status: string;
  reason: string;
  incumbent_annual_usd: number;
  alternative_with_proof_annual_usd: number;
  alternative_without_proof_annual_usd: number;
  incumbent_before_annual_usd?: number | null;
  incumbent_delta_annual_usd?: number | null;
  alternative_with_proof_delta_usd?: number | null;
  alternative_without_proof_delta_usd?: number | null;
}
export interface EvidenceItem {
  supplier_id: string;
  part_no: string;
  batch_id: string | null;
  doc_id: string;
  kind: string;
  fields: Record<string, string | number | boolean | null>;
  confidence: number;
  bbox_refs: Citation[];
  field_citations?: Record<string, Citation[]>;
}
export interface EvidenceRequirement {
  id: string;
  label: string;
  status: string;
  reason?: string | null;
  citations?: Citation[];
}
export interface EvidenceStatus {
  supplier_id: string;
  part_no: string;
  status: string;
  missing_requirements: string[];
  items: EvidenceItem[];
  requirements?: EvidenceRequirement[];
}
export interface Action {
  id: string;
  rank: number;
  type: string;
  part_ids: string[];
  usd_at_stake: number;
  draft_email: string;
  title?: string | null;
  why?: string | null;
}
export interface IntakeDocument {
  doc_id: string;
  filename: string;
  media_type: string;
  kind: "bulletin" | "supplier_document" | "unknown";
  summary: string;
  review: string[];
  received_at: string;
}
export interface AuditEvent {
  id: string;
  occurred_at: string;
  actor: string;
  type: string;
  entity_id: string;
  previous_hash: string | null;
  hash: string;
}
export interface SendActionResponse {
  audit_event: AuditEvent;
  decision_id: string;
  state: string;
  pending_approvals: { id: string; name: string }[];
}
export interface WorkspaceData {
  changes: ChangeEvent[];
  exposure: Exposure;
  decisions: DecisionCheck[];
  evidence: EvidenceStatus;
  actions: Action[];
  audit: AuditEvent[];
  documents?: IntakeDocument[];
}

export interface LineageNode {
  id: string;
  kind: "bulletin" | "change" | "rate" | "assumption" | "decision" | "part" | "purchase_order" | "product";
  label: string;
  added_duty_usd?: number | null;
}
export interface LineageEdge {
  source: string;
  target: string;
  kind: string;
}
export interface ExposureLineage {
  change_id: string;
  added_duty_usd: number;
  affected_parts: number;
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export interface DeclineActionResponse {
  action_id: string;
  state: "declined";
  audit_event: AuditEvent;
}
