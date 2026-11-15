# Keystone

Decision integrity for industrial procurement. Illustrative MeridianFlow scenario; Section 232 layer only, not a duty determination.

## Start the stack

Requirements: Docker with Compose v2. Run `make up` from a clean clone, then open http://localhost:3000. The API is at http://localhost:8000/docs and Postgres at localhost:5432. `make test` runs Python tests and the web typecheck, tests, and production build inside the containers. `make down` stops the stack while retaining the database volume.

Copy `.env.example` to `.env` only to override local defaults. No API key is needed for the scaffold or fixture UI. Live document extraction requires `ANTHROPIC_API_KEY`; recorded agent outputs support `REPLAY=1`. Never commit credentials.

## Run the live procurement demo

Use a fresh demo database. Start the stack with fixture mode off and configure the API for live extraction (`REPLAY=0` with an Anthropic key) or replay (`REPLAY=1` with populated cache).

```sh
NEXT_PUBLIC_USE_FIXTURES=false make up
docker compose exec api python -m scripts.seed_demo
```

Open the Console’s **Intake** screen. Upload the tariff bulletin email from the demo pack, then choose **Run impact**. Upload the Sheffield certificate from Intake to review missing proof under **Evidence**. If the scan cannot be linked automatically, confirm the supplier and part from the quote. Unreadable fields will still be flagged for review. Open **Actions** to edit and submit the drafted request for approval. **Audit log** shows the recorded steps.

To exercise these steps through the API on a separately seeded demo database, run `docker compose exec api python -m scripts.e2e --confirm-sheffield`. The runner submits a draft decision. To repeat the demo, restore the initial dataset on your isolated demo database with `docker compose exec api python -m scripts.reset_demo`. This clears uploaded documents, draft requests, decisions and audit history created during the demo. The replay cache is preserved. Operators can also opt in to `POST /admin/reset` by setting `KEYSTONE_DEMO_RESET_TOKEN` and sending it in the `X-Demo-Reset-Token` header.

## Local development

Use Python 3.12+ and Node 22. Run `python3.12 -m venv .venv`, `.venv/bin/pip install -e '.[dev]'`, then `npm ci --prefix web`. Start Postgres with `docker compose up -d --wait db`, the API with `.venv/bin/uvicorn infra.app:app --reload`, and the web app with `npm run dev --prefix web`. Run `.venv/bin/pytest` and `npm run check --prefix web` before a PR.

## Workstreams

- `contracts/`: shared Pydantic models, OpenAPI, and endpoint fixtures (T00 owner).
- `api/`: loaders, graph, deterministic rules, agents, routes, and audit (backend/agent owners).
- `infra/`: ASGI bootstrap, Dockerfiles, and scaffold smoke tests.
- `web/`: Next.js 15 app. Shared data access belongs in `web/lib/`; independent visual directions live under `web/variants/v1` through `v5`.
- `docs/reference/`: original team task/design PDFs and demo archive.
- `pitch/`: pitch and demo materials.

T15 should export an `APIRouter` named `router` from `api.routes`; the bootstrap registers it automatically. A missing routes package is allowed during scaffold development; broken route imports fail visibly. `/health` is liveness; `/ready` checks the Postgres connection. Configure browser requests with `NEXT_PUBLIC_API_BASE_URL` and API CORS with `WEB_ORIGINS`.

## Business proposal

The Keystone business proposal is in [`docs/business/`](docs/business/). It covers the product, target customers, market, go-to-market strategy, pricing, development roadmap and financial outlook.

- [Word document](docs/business/keystone-business-proposal.docx)
- [PDF](docs/business/keystone-business-proposal.pdf)
- [Markdown source](docs/business/keystone-business-proposal.md)

## Shared documents

See [task breakdown](docs/reference/keystone-task-breakdown.pdf), [technical design](docs/reference/keystone-technical-design.pdf), and [demo pack](docs/reference/keystone-demo-pack.zip). Original files are preserved without modification.

Work on a dedicated branch, keep contract changes coordinated in #ai-builders, and open PRs with validation output. Task completion updates include PR and GitHub check status. Human reviewers merge at the agreed merge windows.

## The demo platform

http://localhost:3000 is one Keystone platform, running the Larkspur Mobile scenario: a US phone maker (final assembly in Fort Worth, Texas) facing a Section 232 semiconductor duty increase from 10% to 25% on January 1, 2027. Pick who you are in **Viewing as** at the top right; each role gets its own steps in the step bar, and no page is shared between roles.

| Role | Steps |
|---|---|
| Sourcing manager (Maya Chen), `/sourcing` | Overview, **Parts** (one part at a time: duty per unit, quotes, open orders), Supplier decisions, Cost impact, Supplier requests |
| Trade compliance (Priya Raman), `/compliance` | Overview, Documents (broker advisory and supplier certificates), Evidence (US wafer-fab proof), Duty bill (by HTS heading, per part) |
| Analyst (Sam Okafor), `/analyst` | Overview (checks), **Lineage** graph, Calculations (per-line math), Audit log |
| Approver (Elena Park), `/approver` | **Decision brief** (approve or decline, download as PDF), Decision history |

The scenario data and its source documents are generated by `scripts/phone_scenario.py` into `web/platform/scenario/phones.json` and `web/public/scenario/`. Every figure is computed there with the same formulas as `api/rules`. Submissions, approvals and declines are recorded in the browser and appended to the hash-linked audit log; **Reset demo decisions** in the role menu clears them.

`/` opens the role you used last. The five earlier design explorations are archived at http://localhost:3000/versions.

