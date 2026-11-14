"""Connect the bulletin to the PostgreSQL rates, decisions and affected PO lines."""

from collections import defaultdict
from decimal import Decimal

from psycopg import Connection

from contracts.models import ChangeEvent, Exposure, ExposureLineage, LineageEdge, LineageNode


def build_lineage(
    connection: Connection, change: ChangeEvent, version: int, exposure: Exposure,
) -> ExposureLineage:
    nodes: dict[str, LineageNode] = {}
    edges: set[tuple[str, str, str]] = set()

    def node(kind, identifier, label=None, duty=None):
        key = f"{kind}:{identifier}"
        nodes[key] = LineageNode(id=key, kind=kind, label=label or identifier, added_duty_usd=duty)
        return key

    change_node = node("change", change.id, change.measure, exposure.added_duty_usd)
    for doc_id in sorted({citation.doc_id for citation in change.citations}):
        edges.add((node("bulletin", doc_id), change_node, "cites"))

    rates = {}
    rate_values = {}
    for hs6, country, rate in connection.execute(
        "SELECT hs6, country, rate FROM tariff_rate_entries WHERE version = %s", (version,),
    ):
        rate_key = node("rate", f"{hs6}:{country or 'all'}", f"{hs6} · {country or 'All origins'} · {rate:.0%}")
        rates[(hs6, country)] = rate_key
        rate_values[rate_key] = rate
        edges.add((change_node, rate_key, "changes"))

    total_by_part: dict[str, float] = defaultdict(float)
    for line in exposure.lines:
        total_by_part[line.part_no] += line.added_duty_usd

    part_nodes = {
        part: node("part", part, duty=round(total, 2)) for part, total in total_by_part.items()
    }
    hs_by_part = dict(connection.execute(
        "SELECT part_no, hs6 FROM parts WHERE part_no = ANY(%s)", (list(part_nodes),),
    ).fetchall())
    suppliers = dict(connection.execute("SELECT supplier_id, country_iso2 FROM suppliers").fetchall())
    for line in exposure.lines:
        part_node = part_nodes[line.part_no]
        hs6 = hs_by_part[line.part_no]
        rate_node = rates.get((hs6, suppliers[line.supplier_id])) or rates.get((hs6, ""))
        if rate_node:
            edges.add((rate_node, part_node, "affects"))
        po = node("purchase_order", f"{line.po_id}:{line.line_no}", f"{line.po_id} · {line.line_no}",
                  line.added_duty_usd)
        edges.add((part_node, po, "appears_on"))

    for sku, part in connection.execute(
        "SELECT source_id, target_id FROM procurement_edges "
        "WHERE kind = 'uses' AND target_id = ANY(%s)", (list(part_nodes),),
    ):
        edges.add((part_nodes[part], node("product", sku), "used_in"))

    affected_decisions = defaultdict(list)
    for decision, part in connection.execute(
        "SELECT source_id, target_id FROM procurement_edges "
        "WHERE source_type = 'decision' AND target_type = 'part' AND target_id = ANY(%s)",
        (list(part_nodes),),
    ):
        affected_decisions[decision].append(part)

    for assumption, decision, key, value in connection.execute(
        "SELECT assumption_id, decision_id, key, assumed_value FROM assumptions "
        "WHERE decision_id = ANY(%s)", (list(affected_decisions),),
    ):
        category, _, scope = key.partition(":")
        hs6, _, country = scope.partition(":")
        rate_node = rates.get((hs6, country)) or rates.get((hs6, ""))
        if category != "s232_rate" or rate_node is None:
            continue
        assumption_node = node("assumption", assumption, f"{hs6} / {country} assumed {value}")
        decision_node = node("decision", decision)
        relation = "invalidates" if rate_values[rate_node] != Decimal(value) else "supports"
        edges.add((rate_node, assumption_node, relation))
        edges.add((assumption_node, decision_node, "supports"))
        for part in affected_decisions[decision]:
            edges.add((decision_node, part_nodes[part], "covers"))

    return ExposureLineage(
        change_id=change.id, added_duty_usd=exposure.added_duty_usd,
        affected_parts=exposure.affected_parts,
        nodes=[nodes[key] for key in sorted(nodes)],
        edges=[LineageEdge(source=source, target=target, kind=kind)
               for source, target, kind in sorted(edges)],
    )
