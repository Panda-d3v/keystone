from dataclasses import dataclass

import networkx as nx
from psycopg import Connection


@dataclass(frozen=True)
class WhereUsed:
    product_ids: tuple[str, ...]
    purchase_order_ids: tuple[str, ...]


def load_graph(connection: Connection) -> nx.DiGraph:
    graph = nx.DiGraph()
    for source_type, source_id, target_type, target_id, kind in connection.execute(
        "SELECT source_type, source_id, target_type, target_id, kind FROM procurement_edges"
    ):
        graph.add_edge((source_type, source_id), (target_type, target_id), kind=kind)
    return graph


def where_used(graph: nx.DiGraph, part_no: str) -> WhereUsed:
    part = ("part", part_no)
    if part not in graph:
        return WhereUsed((), ())
    targets = tuple(graph.predecessors(part))
    return WhereUsed(
        tuple(sorted(identifier for kind, identifier in targets if kind == "product")),
        tuple(sorted(identifier for kind, identifier in targets if kind == "purchase_order")),
    )
