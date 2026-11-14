CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id text PRIMARY KEY, name text NOT NULL,
    country_iso2 text NOT NULL, city text NOT NULL
);
CREATE TABLE IF NOT EXISTS parts (
    part_no text PRIMARY KEY, description text NOT NULL, hs6 text NOT NULL,
    hts10 text NOT NULL, material text NOT NULL, metal_pct_by_weight numeric NOT NULL,
    uom text NOT NULL, hts10_status text NOT NULL DEFAULT 'unverified'
        CHECK (hts10_status IN ('verified', 'unresolved', 'unverified'))
);
CREATE TABLE IF NOT EXISTS products (
    sku text PRIMARY KEY, name text NOT NULL, list_price_usd numeric NOT NULL,
    annual_units integer NOT NULL
);
CREATE TABLE IF NOT EXISTS supplier_parts (
    supplier_id text REFERENCES suppliers, part_no text REFERENCES parts,
    unit_price_usd numeric NOT NULL, incoterm text NOT NULL,
    lead_time_days integer NOT NULL, is_primary boolean NOT NULL,
    PRIMARY KEY (supplier_id, part_no)
);
CREATE TABLE IF NOT EXISTS bom_lines (
    sku text REFERENCES products, part_no text REFERENCES parts,
    qty_per integer NOT NULL, PRIMARY KEY (sku, part_no)
);
CREATE TABLE IF NOT EXISTS purchase_orders (
    po_no text, line integer, supplier_id text NOT NULL REFERENCES suppliers,
    part_no text NOT NULL REFERENCES parts, qty integer NOT NULL,
    unit_price_usd numeric NOT NULL, customs_value_usd numeric NOT NULL,
    ship_date date NOT NULL, est_entry_date date NOT NULL, status text NOT NULL,
    PRIMARY KEY (po_no, line)
);
CREATE TABLE IF NOT EXISTS tariff_rates_baseline (
    hs6 text, measure text, rate numeric NOT NULL, basis text NOT NULL,
    effective_from date, PRIMARY KEY (hs6, measure, effective_from)
);
CREATE TABLE IF NOT EXISTS decisions (
    decision_id text PRIMARY KEY, type text NOT NULL, subject text NOT NULL,
    chosen_option text NOT NULL, rationale text NOT NULL, decided_at date NOT NULL,
    owner text NOT NULL
);
CREATE TABLE IF NOT EXISTS assumptions (
    assumption_id text PRIMARY KEY, decision_id text NOT NULL REFERENCES decisions,
    key text NOT NULL, assumed_value text NOT NULL, source_doc_id text NOT NULL
);
CREATE INDEX IF NOT EXISTS bom_lines_part_idx ON bom_lines (part_no);
CREATE INDEX IF NOT EXISTS purchase_orders_part_idx ON purchase_orders (part_no);
CREATE OR REPLACE VIEW procurement_edges AS
    SELECT 'product' AS source_type, sku AS source_id,
           'part' AS target_type, part_no AS target_id, 'uses' AS kind FROM bom_lines
    UNION ALL
    SELECT 'purchase_order', po_no, 'part', part_no, 'orders' FROM purchase_orders
    UNION ALL
    SELECT 'part', part_no, 'supplier', supplier_id, 'sourced_from' FROM supplier_parts
    UNION ALL
    SELECT 'decision', decision_id, 'assumption', assumption_id, 'rests_on' FROM assumptions
    UNION ALL
    SELECT 'decision', decision_id, 'part', part_no, 'about'
    FROM decisions
    JOIN parts ON part_no = ANY (string_to_array(subject, ';'))
    UNION ALL
    SELECT 'decision', decision_id, 'supplier', supplier_id, 'about'
    FROM decisions
    JOIN suppliers ON supplier_id = chosen_option;
