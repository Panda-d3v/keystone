"""Deterministic Section 232 exposure for a versioned tariff change."""

from collections.abc import Set
from datetime import date
from decimal import Decimal

from psycopg import Connection

from contracts.models import ChangeEvent, Exposure, ExposureLine

from .rates import read_rate

UK_TIERS = {
    Decimal("0.50"): Decimal("0.25"),
    Decimal("0.25"): Decimal("0.15"),
}


def compute_exposure(
    connection: Connection,
    change: ChangeEvent,
    version: int,
    verified_uk_pairs: Set[tuple[str, str]] = frozenset(),
) -> Exposure:
    entry = connection.execute(
        "SELECT change_event FROM tariff_rate_versions WHERE version = %s", (version,)
    ).fetchone()
    if entry != (change.model_dump(mode="json"),):
        raise ValueError(f"Version {version} does not belong to change {change.id}")

    def effective_rates(
        hs6: str, country: str, on_date: date, supplier_id: str, part_no: str
    ) -> tuple[Decimal, Decimal]:
        if country == "US":
            return Decimal(0), Decimal(0)
        previous = read_rate(connection, version - 1, hs6, country, on_date)
        current = read_rate(connection, version, hs6, country, on_date)
        if previous is None or current is None:
            raise ValueError(f"Missing Section 232 rate history for {hs6} / {country}")
        if country == "GB" and (supplier_id, part_no) in verified_uk_pairs:
            previous = UK_TIERS.get(previous, previous)
            current = UK_TIERS.get(current, current)
        return previous, current

    scope = list(change.hts_scope)
    countries = list(change.countries)
    filters = (scope, countries, countries)
    lines = []
    total = Decimal(0)
    for po, line_no, part, supplier, entry_date, value, hs6, country in connection.execute(
        """
        SELECT po_no, line, po.part_no, po.supplier_id, est_entry_date,
               customs_value_usd, hs6, country_iso2
        FROM purchase_orders po JOIN parts p USING (part_no) JOIN suppliers s USING (supplier_id)
        WHERE status IN ('open', 'in_transit') AND est_entry_date >= %s
          AND hs6 = ANY(%s) AND (cardinality(%s::text[]) = 0 OR country_iso2 = ANY(%s))
        ORDER BY po_no, line
        """,
        (change.effective_date, *filters),
    ):
        previous, current = effective_rates(hs6, country, entry_date, supplier, part)
        duty = value * (current - previous)
        if not duty:
            continue
        total += duty
        lines.append(ExposureLine(
            po_id=po, line_no=line_no, part_no=part, supplier_id=supplier,
            est_entry_date=entry_date, customs_value_usd=float(value),
            added_duty_usd=float(round(duty, 2)),
            math=f"${value:,.2f} × ({current:.2%} − {previous:.2%}) = ${duty:,.2f}",
        ))

    annual = Decimal(0)
    for part, supplier, value, hs6, country in connection.execute(
        """
        SELECT b.part_no, sp.supplier_id, qty_per * annual_units * unit_price_usd,
               hs6, country_iso2
        FROM bom_lines b JOIN products USING (sku) JOIN parts USING (part_no)
        JOIN supplier_parts sp USING (part_no) JOIN suppliers USING (supplier_id)
        WHERE is_primary AND hs6 = ANY(%s)
          AND (cardinality(%s::text[]) = 0 OR country_iso2 = ANY(%s))
        """,
        filters,
    ):
        previous, current = effective_rates(hs6, country, change.effective_date, supplier, part)
        annual += value * (current - previous)

    return Exposure(
        change_id=change.id, affected_parts=len({line.part_no for line in lines}),
        open_po_lines=len(lines), added_duty_usd=round(total),
        annualized_added_duty_usd=round(annual), lines=lines,
    )
