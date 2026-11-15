"""Check seeded supplier awards against the current versioned tariff assumptions."""

from collections import defaultdict
from decimal import Decimal

from psycopg import Connection

from contracts.models import ChangeEvent, DecisionCheck

from .exposure import UK_TIERS
from .rates import read_rate


def check_decision(
    connection: Connection, decision_id: str, change: ChangeEvent, version: int
) -> DecisionCheck:
    return evaluate_decision(connection, decision_id, change, version)[0]


def evaluate_decision(
    connection: Connection, decision_id: str, change: ChangeEvent, version: int
) -> tuple[DecisionCheck, str]:
    decision = connection.execute(
        "SELECT subject, chosen_option FROM decisions WHERE decision_id = %s AND type = 'supplier_award'",
        (decision_id,),
    ).fetchone()
    if decision is None:
        raise LookupError(f"Supplier award {decision_id} was not found")
    subject, chosen_supplier = decision
    parts = set(subject.split(";"))
    broken = []
    for key, assumed in connection.execute(
        "SELECT key, assumed_value FROM assumptions WHERE decision_id = %s ORDER BY assumption_id",
        (decision_id,),
    ):
        category, _, scope = key.partition(":")
        hs6, _, country = scope.partition(":")
        if category != "s232_rate" or hs6 not in change.hts_scope:
            continue
        if change.countries and country not in change.countries:
            continue
        rate = read_rate(connection, version, hs6, country, change.effective_date)
        if rate is not None and rate != Decimal(assumed):
            broken.append(f"{hs6}/{country} changed from {Decimal(assumed):.0%} to {rate:.0%}")

    covered = defaultdict(set)
    full_cost = defaultdict(Decimal)
    cost_with_proof = defaultdict(Decimal)
    incumbent_before = Decimal(0)
    for supplier, part, hs6, country, value in connection.execute(
        """
        WITH volume AS (
            SELECT part_no, sum(qty_per * annual_units) AS annual_qty
            FROM bom_lines JOIN products USING (sku)
            WHERE part_no = ANY(%s)
            GROUP BY part_no
        )
        SELECT sp.supplier_id, sp.part_no, p.hs6, country_iso2,
               COALESCE(annual_qty, 0) * unit_price_usd
        FROM supplier_parts sp JOIN parts p USING (part_no)
        JOIN suppliers USING (supplier_id) LEFT JOIN volume USING (part_no)
        WHERE sp.part_no = ANY(%s)
        """,
        (sorted(parts), sorted(parts)),
    ):
        rate = read_rate(connection, version, hs6, country, change.effective_date)
        if country == "US":
            rate = Decimal(0)
        if rate is None:
            raise ValueError(f"Missing rate for award part {part} in {country}")
        preferred = UK_TIERS.get(rate, rate) if country == "GB" else rate
        if supplier == chosen_supplier:
            previous = (
                Decimal(0) if country == "US"
                else read_rate(connection, version - 1, hs6, country, change.effective_date)
            )
            if previous is None:
                raise ValueError(f"Missing prior rate for award part {part} in {country}")
            incumbent_before += round(value * (1 + previous))
        covered[supplier].add(part)
        full_cost[supplier] += round(value * (1 + rate))
        cost_with_proof[supplier] += round(value * (1 + preferred))

    alternatives = sorted(
        supplier for supplier, offered in covered.items()
        if supplier != chosen_supplier and offered == parts
    )
    if covered[chosen_supplier] != parts or not alternatives:
        raise ValueError(f"Supplier award {decision_id} has incomplete quotes")
    best = min(alternatives, key=cost_with_proof.__getitem__)
    return DecisionCheck(
        decision_id=decision_id, change_id=change.id, status="broken" if broken else "valid",
        reason="; ".join(broken) if broken else "The award's tariff assumptions still match.",
        incumbent_annual_usd=full_cost[chosen_supplier],
        alternative_with_proof_annual_usd=cost_with_proof[best],
        alternative_without_proof_annual_usd=full_cost[best],
        incumbent_before_annual_usd=incumbent_before,
        alternative_with_proof_delta_usd=cost_with_proof[best] - full_cost[chosen_supplier],
        alternative_without_proof_delta_usd=full_cost[best] - full_cost[chosen_supplier],
    ), best
