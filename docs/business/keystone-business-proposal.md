# Keystone Business Proposal

**MVP development and commercialisation proposal for Kearney PERLab**

**Submitted to:** Kearney PERLab  
**Submitted by:** Oscar Cavalieros, CEO and CFO, and Pratham Saxena, CTO  
**Date:** 15 November 2026

Keystone requests **$30,000 to complete an eight-week development and client-validation programme** with PERLab. The programme will turn the existing UI prototype into a functional MVP connecting trade changes, purchasing commitments, supplier alternatives and supporting evidence. The commercial objective is a recurring software service, with PERLab licensing or acquisition of the product and intellectual property as strategic alternatives.

## Executive overview

A sourcing decision can remain active long after the facts that justified it have changed. A new tariff, a change in manufacturing origin or an expired qualification can alter the economics of a supplier award while orders remain open. Procurement must decide whether to retain the supplier, renegotiate, reallocate production or switch. Trade compliance must establish the relevant treatment and evidence. Finance must verify the comparison.

Keystone brings that review into a shared decision record. It connects the changed fact to affected products, orders and award assumptions; compares feasible responses; identifies evidence gaps; and prepares a recommendation for approval. Its value is carrying a trade or supplier change through to a documented business decision.

The hackathon deliverable is a user-interface (UI) prototype illustrating the intended sourcing, evidence and approval workflow with sample data. It demonstrates the product concept and user experience, rather than a functioning customer service. Backend processing, AI document interpretation, verified calculations and customer-data integration are deliverables of the proposed minimum viable product (MVP) programme.

PERLab is the proposed development and commercialisation partner. Its public Tariff Simulator offering already covers duties, sourcing shifts and landed-cost scenarios. Keystone would contribute a persistent record connecting those scenarios to current commitments, previous decisions, supplier evidence and follow-up. A joint product review will establish where this adds value to PERLab's existing capabilities. [S3]

The first deployment will target a U.S. industrial importer. The product addresses physical-goods sourcing across industries; a focused launch scope concentrates development and evidence requirements without restricting the long-term market.

The programme will conclude with an evaluated MVP, a trial-readiness assessment, measured development costs and a commercial decision: start a customer trial, extend development, pursue licensing or acquisition discussions, or end the programme.

## 1 The Team

Keystone is founded by Oscar Cavalieros and Pratham Saxena, who combine business ownership with direct responsibility for delivery.

| Founder | Role | Responsibilities | Founder IP ownership |
| --- | --- | --- | ---: |
| Oscar Cavalieros | CEO and CFO | Strategy, PERLab relationship, customer discovery, pricing, financing and financial management | 50% |
| Pratham Saxena | CTO | Architecture, engineering, data integration, testing and technical delivery | 50% |

Both founders will participate in client workflow design and implementation. Development will pair their product work with PERLab or client expertise in procurement and trade compliance. The client will appoint a business sponsor and trade reviewer; PERLab will appoint a product counterpart for integration assessment.

The founders' combined ownership provides a basis for licensing or an IP transaction. Any agreement will define existing code, new development, third-party dependencies, customer records and subsequent work.

## 2 Company and Product

### Business model and value proposition

**Keystone helps companies revisit sourcing decisions when trade or supplier conditions change, connecting affected commitments, alternative costs and evidence in one reviewable record.**

Keystone is developing a business-to-business software-as-a-service (B2B SaaS) business for companies sourcing physical goods internationally. Procurement, trade compliance and finance use a shared workflow while retaining responsibility for their parts of the decision.

### The problem

Supplier awards depend on assumptions about price, duties, origin, capacity, quality and qualification. Those assumptions can change before an order enters the country or an award is reviewed again.

The information needed to respond often sits in different places: orders in an ERP, product structures in a bill of materials, prices in quotes, award rationale in sourcing files and evidence in correspondence or certificates. Teams must reconnect those records, assess alternatives and obtain approval under time pressure.

Three failures matter commercially. A team can miss commitments affected by the change, select an alternative without accounting for qualification or transition costs, or rely on a benefit that depends on missing evidence. Keystone supports the preparation and coordination needed to avoid those failures.

Faster analysis creates value when it reduces material work, enables a timely response or improves decision quality. These outcomes will be measured through client cases.

### 2.1 The Innovation

Keystone maintains the reasoning behind a sourcing decision as operational information. It records the supplier choice, supporting assumptions and source documents. A relevant change can then identify the decision requiring attention.

Evidence is part of the economic comparison. When an alternative requires proof or qualification that has not been established, its benefit remains conditional. The reviewer can distinguish a feasible recommendation from an opportunity requiring further work.

AI supports extraction, matching and drafting. Explicit rules calculate financial impacts and evaluate defined evidence requirements. Reviewers can inspect inputs, formulas and cited source material before approving action.

The intended differentiation is a complete, repeatable review across procurement and trade records. Its commercial strength will be assessed against the workflow clients can already assemble with existing systems and advisers.

### 2.2 MVP and development stage

Keystone is at the UI-prototype stage. The hackathon work establishes the screen designs, intended user journey and illustrative decision outputs. It does not establish working end-to-end processing, production integrations or validated analytical performance.

| Product area | Current UI prototype | MVP development required |
| --- | --- | --- |
| Procurement records | Sample parts, suppliers, products and orders shown in screens | Backend data model, storage, import validation and record matching |
| Document processing | Document upload and source-review experience illustrated | Upload service, extraction, citations and error handling for agreed document types |
| Impact analysis | Illustrative exposure figures and explanations displayed | Versioned rules, deterministic calculations and independent verification |
| Sourcing review | Incumbent and alternative comparison screens | Feasible-option logic, cost inputs and reproducible comparisons |
| Evidence | Evidence statuses and follow-up workflow illustrated | Stored evidence, reviewed requirements, matching and exception handling |
| Decision workflow | Role views, approval concept and decision brief | Authentication, permissions, persistence, review records and reliable export |

The funded programme will build a functional MVP for one category and an agreed rule scope. Existing code can be assessed for reuse, but delivery acceptance will depend on demonstrated processing of authorised records. Broad regulatory coverage, general ERP connectivity, enterprise certification and autonomous execution are later development stages.

## 3 Product–Market Fit

### Evidence of the problem

In a March 2025 Thomson Reuters survey of 285 trade professionals at companies with at least $200 million revenue, 72% reported using or considering sourcing-pattern changes to address U.S. tariffs. The result combines action and intention across a multinational sample. [S1]

Altana and AAEI surveyed 230 enterprise trade professionals in July–August 2026; 76% reported being unable to produce complete product information within 24 hours. Respondents worked at importers with at least $1 billion revenue and 10,000 annual U.S. customs entries. Procurement leaders were excluded, and the study was vendor-sponsored. These findings establish relevant enterprise friction rather than purchase intent for Keystone. [S2]

Company filings document implemented sourcing responses. GoPro reported moving most U.S.-bound camera production from China to Mexico in 2019. That establishes an actual response, without measuring the internal work or the value of new software. [S7]

### Customer needs

| Participant | Required outcome | Adoption consideration |
| --- | --- | --- |
| Procurement | A feasible retain, renegotiate, reallocate or switch decision | Effort saved and ability to act |
| Trade compliance | Defensible treatment and evidence | Source quality, exceptions and accountability |
| Finance | Comparable costs and reproducible calculations | Benefit attribution and total cost |
| COO, CFO or supply-chain leader | An authorised commercial decision | Budget, measurable value and operational risk |
| IT and procurement operations | Controlled access to reliable records | Integration, security and support |

The initial economic buyer is expected to be a head of procurement or supply chain, with CFO or COO approval where required. Trade compliance is a necessary reviewer and may also sponsor the purchase.

### Ideal customer profile and beachhead market

The beachhead market is U.S. industrial importers. The ideal customer profile (ICP) is a manufacturer with accessible purchasing records, a procurement owner, trade expertise and more than one realistic sourcing response. Manufacturers with approximately 100–499 employees provide a practical prospecting segment, although workflow complexity matters more than headcount.

Priority accounts will have recurring tariff, origin, supplier-price or qualification changes; material commitments affected; and authority to respond. Companies unable to alter awards may still need exposure reporting but gain less from faster supplier reassessment.

### Demand and purchase validation

Keystone is pre-revenue and has not yet completed external customer interviews. Customer discovery and commercial validation are funded programme deliverables. Product–market fit will be assessed through paid trials, conversion to subscriptions, repeated use and renewal.

The programme will seek 10–15 interviews across procurement, trade and budget owners in at least three industries. Interviews will examine completed events, including cases where no sourcing change was made. Three organisations will be asked to contribute historical records; one will be selected for the pilot.

The central question is whether this is a recurring operational need or a one-time disruption project. Interviews will reconstruct twelve-month event histories, hours of work, systems, handoffs and decision owners. They will also examine evidence maintenance and supplier changes between tariff announcements.

The commercial gate is a priced decision. Following programme evaluation, clients will assess a defined annual subscription through their real budgeting process. Payment establishes initial demand; independent buyers and subsequent renewal provide stronger evidence of repeatability.

## 4 The Competition

Established systems already provide important parts of the workflow. Keystone competes with software and the internal processes connecting it.

| Alternative | Established strength | Keystone's commercial test |
| --- | --- | --- |
| SAP GTS with ERP/procurement | Purchasing-document integration and duty calculation [S4] | Reduce work connecting impacts to award assumptions and evidence |
| ONESOURCE | Trade analysis and landed-cost scenarios [S5] | Add useful decision context beyond calculations |
| Altana | Product passports and supplier evidence requests [S6] | Demonstrate value in connecting evidence to awards and commitments |
| Precoro | Purchasing, supplier management and approvals [S12] | Demonstrate specific value beyond general procurement automation |
| Tarifflo | Classification, origin checks and customs automation [S11] | Demonstrate value beyond trade-data and customs-processing tools |
| PERLab Tariff Simulator | Duty, sourcing and total-cost scenarios [S3] | Support persistent client review where complementary |
| ERP/procurement plus BI | Transactions, sourcing events and approvals | Improve the cross-system review enough to justify another service |
| Brokers and consultants | Expertise and recommendations | Reduce repeated preparation while retaining judgement |
| Spreadsheets and email | Familiarity, flexibility and low incremental cost | Deliver sufficient repeatability and traceability to warrant change |

Public descriptions do not establish every feature of a configured system. Evaluation will use the same client case, record preparation effort and assess the complete review.

### PERLab fit

PERLab describes its accelerators as embedded in client projects and works across industries. This supports a potential route for Keystone as a reusable client-workflow component. [S9]

PERLab expertise and simulation would establish economically relevant scenarios. Keystone would connect these to current commitments, prior assumptions, supplier proof, review responsibilities and follow-up.

Velocity AI also describes sourcing plans, documentation and feasibility analysis. Capability alignment is therefore essential: Keystone must demonstrate a specific contribution rather than assume an unoccupied product area. [S10]

The first-week review will address data interfaces, existing award/evidence workflows, deployment, support ownership and licensing. Initial integration can exchange agreed files; APIs should follow a documented need and stable interface.

## 5 The Solution

### How it works

1. **Receive a change.** Preserve its source, content and effective date.
2. **Identify affected commitments.** Connect facts to products, parts, orders and awards; flag ambiguous matches.
3. **Reassess the decision.** Show changed assumptions and contractual or operational constraints.
4. **Compare feasible responses.** Evaluate retaining, renegotiating, reallocating, changing facility or switching.
5. **Resolve evidence gaps.** Assign missing proof, follow-up and review responsibilities.
6. **Prepare approval.** Present economics and conditions, then preserve the decision and outcome.

The same supplier may operate several facilities. Supplier, production site, shipping route and substantiated origin must remain distinct.

### Economics and evidence

Comparisons will state their horizon and relevant purchase, duty, freight, currency, volume, qualification, tooling, transition and contractual inputs. Each input will have a source or identified business assumption.

Open-order exposure, annual exposure and switching benefit will remain separate. A modeled opportunity becomes an implemented decision when approved and acted upon, and a realised saving when subsequent records substantiate it.

Unreadable and missing facts remain open for review. Extraction confidence guides attention but cannot establish that a legal or technical requirement has been met.

### Delivery and data protection

The first deployment will use approved read-only exports and a dedicated client workspace. Authentication, permissions, protected storage, backups and retention/deletion controls form part of pilot preparation.

Customer documents will support the contracted service. Selling client data is outside the business model; cross-client reuse or model training requires explicit authorisation. The client or appointed expert will approve applicable trade treatment. Third-party content requires appropriate rights. Supplier and transaction changes remain subject to human approval.

### 5.1 Why This Is Defensible

Defensibility will develop through implementation quality and accumulated workflow knowledge. Reusable system mappings, reviewed category rules and tested evidence handling can lower onboarding costs and improve reliability.

Decision history creates continuing utility when each review requires less reconstruction. The advantage depends on repeated useful operation. The prototype does not establish exclusive technology or prevent incumbents offering similar features.

Contracts will distinguish customer records, proprietary software and reusable development assets. Retention should follow utility, with customers able to export their decision records.

### MVP development roadmap

| Period | Delivery | Acceptance |
| --- | --- | --- |
| Weeks 1–2 | PERLab alignment, data model, backend foundation, access design and scope | Agreed records, rule scope, reviewers and baseline |
| Weeks 3–4 | Imports, deterministic impact calculations and sourcing comparisons | Verified calculations for one historical event |
| Weeks 5–6 | Extraction for agreed document types, evidence review and persisted decisions | Reviewed extraction, matches and evidence handling |
| Weeks 7–8 | End-to-end integration, access controls, export and held-out evaluation | Functional MVP and a documented trial-readiness decision |

The eight-week target is a functional MVP, subject to timely records and domain review. Paid customer trials begin after a readiness review confirms that the agreed workflow operates end to end, data access is controlled and calculations are independently reproducible. The one- or two-month trial is a separate service period following development; it is not assumed complete within the eight-week build. The initial programme is a bounded build and evaluation, rather than a promise of enterprise production readiness.

## 6 The Market

### Opportunity

The common cross-industry problem is maintaining sourcing decisions as their supporting facts change. Manufacturing, brands, retail and distribution share that need, with different evidence and qualification requirements.

The final Census 2023–2024 profile identifies 240,535 U.S. importing enterprises, including 41,824 manufacturers and 87,749 wholesalers. Manufacturing includes 4,451 firms with 100–249 employees and 1,977 with 250–499, a 6,428-enterprise launch-segment starting population. These historical counts are not qualified buyers or independent purchasing units. [S8]

### Total addressable serviceable and obtainable markets

Total addressable market (TAM) covers the cross-industry opportunity; a defensible revenue total has not yet been established. Serviceable available market (SAM) narrows this to accounts Keystone can support, while serviceable obtainable market (SOM) reflects the customers the sales and delivery team can realistically win. The initial serviceable-market model uses the manufacturing population and explicit qualification assumptions.

| Launch scenario | Joint workflow/data/budget fit | Indicative accounts | Annual price | Annual opportunity |
| --- | ---: | ---: | ---: | ---: |
| Conservative | 10% | 643 | $24,000 | $15.4m |
| Planning | 25% | 1,607 | $24,000 | $38.6m |
| Expansion | 40% | 2,571 | $24,000 | $61.7m |

These planning cases hold the medium-company subscription constant and vary qualification rates; they are not observed SAM. Enterprise accounts are excluded from these revenue totals. A named-account list will replace assumed fit rates. Parent companies and buying entities will be deduplicated.

The five-year SOM scenario is 79 active subscription customers, based on acquisition and retention assumptions in Section 7. Acquisition by Kearney would change distribution and operations.

### 6.1 Go-to-market strategy

PERLab is the first strategic route: funded sponsorship, domain participation and access to an industrial client. The first step is to secure a PERLab sponsor and an industrial company willing to participate in a paid trial.

The second route is founder-led sales to U.S. industrial importers. The go-to-market funnel is a qualified discovery meeting, a paid one- or two-month trial, an annual subscription and expansion to additional categories or sites. The trial is the initial customer-acquisition offer; the subscription establishes recurring revenue. Import-heavy brands provide a second segment for comparison.

Initial channels are PERLab introductions, founder networks and practitioner referrals. Broader marketing follows attributable results. Retention depends on repeated reviews, reusable evidence, decision history and extension to categories/sites.

Quarterly client reviews will assess benefit, usage and support effort. For clients needing isolated tariff projects, fixed-scope services offer a more appropriate model than an annual subscription.

## 7 Business Finance and Support

### Business model

Annual software subscriptions are the primary recurring revenue stream. Paid trials provide a separate service revenue stream and a low-commitment route into the product. Standard onboarding is included in each trial; bespoke integration is separately scoped. Expert advice, substantial integrations and restricted content will be scoped explicitly.

PERLab offers development sponsorship, licensing and client deployment routes. Product/IP acquisition is a strategic alternative; acquisition proceeds are excluded from forecasts.

### 7.1 Revenue Model

#### Proposed commercial terms

| Offer | Payer | Price | Scope |
| --- | --- | ---: | --- |
| MVP development programme | Kearney PERLab | $30,000 for eight weeks | Shared product development, reliability, evaluation framework and integration assessment |
| One-month trial | Industrial company | $5,000 fixed | Product access, standard data onboarding, configuration, training and evaluation of an agreed component/category scope |
| Two-month trial | Industrial company | $10,000 fixed | Extended evaluation with more time to integrate customer data and component records and assess the workflow |
| Medium-company subscription | Industrial company | $24,000 per year | Continued use within an agreed component portfolio, processing allowance and support scope |
| Large-company subscription | Industrial company | $48,000–$96,000 per year | Larger component portfolios, higher processing volumes and agreed additional integrations and support |

Both trials are paid, time-limited evaluations with **no obligation to purchase a subscription and no automatic conversion or renewal**. The company can stop at the end of the trial. Payment, confidentiality and authorised data-use obligations apply during the evaluation. The trial agreement defines its start date, input records, component scope, support and evaluation objectives.

The two-month trial is an alternative to the one-month trial, not an additional mandatory purchase. A one-month customer extending to two consecutive months pays a further $5,000, for a total of $10,000. Substantial custom connectors or new regulatory coverage require separate agreement; the longer trial provides more integration time without promising unlimited development.

Following either trial, the customer can explicitly purchase an annual subscription. Subscription billing starts after the trial. Standard onboarding is already included, so conversion carries no second setup fee. Trial fees cover the evaluation service and remain separate from the annual subscription.

A medium-size company pays **$29,000 for a one-month trial followed by twelve subscription months**, or **$34,000 for a two-month trial followed by twelve subscription months**. These cover thirteen and fourteen months respectively, not twelve months of recognised revenue. The large-company subscription replaces the $24,000 tier; it is not added to it.

PERLab pays for shared product development. The industrial company pays for its own trial and ongoing service. Agreements separate these scopes and avoid invoicing the same deliverable to both parties. PERLab sponsorship is not contingent on an assumed customer purchase.

#### Usage-based packaging and scalability

Company size guides segmentation, while actual deployment requirements determine the annual tier. A larger portfolio means more component and supplier relationships, documents, AI extraction and matching, scenario calculations, storage and review activity. Additional integrations and support also increase delivery effort.

The $24,000 tier serves medium-size companies with a bounded portfolio and standard operating requirements. The $48,000–$96,000 range serves larger deployments, priced according to portfolio scale, processing volume, integrations and support. A medium-size company with unusually high usage may require the larger package; a large company starting with one bounded division can be priced for that scope.

Each quote will specify unique component records, document/page or equivalent AI-processing allowance, review volume, connected entities/sites, refresh frequency and support. There will be no unlimited AI-processing promise. Usage thresholds and overage prices will be set from trial measurements and disclosed before annual commitment; additional charges require the customer's agreement.

Higher usage supports a higher price, but model costs alone do not establish value. The commercial case also depends on work saved, reliable evidence and better sourcing decisions. Batching and reuse of existing extractions should improve unit economics as deployment scales.

#### Pricing rationale

Tarifflo advertises $150 and $500 monthly plans; Precoro publishes procurement plans starting at $499 and $999 monthly, billed annually. These adjacent products differ in scope and are not direct price equivalents. They establish that lookups or a general approval interface alone do not justify Keystone's proposed premium. [S11, S12]

At $2,000 monthly equivalent, Keystone must reduce significant work or support independently verified commercial improvement.

For illustration, 12 reviews annually at 80 hours each and an assumed loaded staff cost of $75/hour represent $72,000 of labour. Reducing effort by 40% creates $28,800 value: approximately the subscription, but not a strong return after trial costs. The standard subscription therefore requires greater recurring burden or measurable additional benefit.

With 24 such reviews, labour value rises to $57,600. A separately verified $40,000 annual purchasing benefit brings total value to $97,600, approximately 3.4 times the $29,000 one-month trial and annual subscription fees, or 2.9 times the $34,000 two-month trial and annual subscription fees. These are illustrative buyer economics, not measured results.

Accounts with only a few small reviews may be better suited to a lower-priced package or a fixed-scope service. Pricing against the entire import bill or unverified modeled savings would overstate value.

#### PERLab options

The recommended initial agreement is the **$30,000 development programme**. It funds deliverables and evaluation rights without automatically transferring ownership or granting exclusivity.

After evaluation, PERLab and Keystone can agree continued use through a software licence, client subscriptions or an embedded deployment arrangement. Scope, support responsibilities, client access and commercial terms will be negotiated from the programme results. No partner licence fee is included in the current funding request.

PERLab could instead acquire the product/IP and engage the founders for implementation. Consideration, compensation, earn-outs, exclusivity and retained rights would be negotiated after diligence. No acquisition valuation is assumed.

### 7.2 Use of Funds

Keystone requests **$30,000 for eight weeks**.

| Allocation | USD | Basis |
| --- | ---: | --- |
| Founder development compensation | 20,000 | Two founders × two months × $5,000 monthly project allowance |
| Hosting/database/storage/backups | 600 | $300 monthly allowance |
| Model usage and development tools | 1,400 | $700 monthly allowance, with usage limits |
| Procurement/trade expert review | 2,500 | Bounded participation, supported by PERLab/client expertise |
| Contracts and targeted security review | 2,000 | Initial agreements and scoped review |
| Discovery and client expenses | 500 | Remote-first sessions and incidentals |
| Contingency | 3,000 | Rework and unforeseen costs |
| **Total** | **30,000** | **Eight-week programme** |

The $30,000 budget covers reusable product development and programme preparation. Client-specific deployment is covered by the industrial customer fee and costed separately. Compensation is a founder project allowance, not a fully loaded employee/contractor benchmark. PERLab or client domain support is required. Certification, unrestricted content licensing and major ERP integration are excluded.

A **$20,000 cash version** is possible with $12,000 founder allowances, $2,000 hosting/model/tools, $2,000 review/contracting, $1,000 client work and $3,000 contingency, provided PERLab supplies domain and deployment support. The $30,000 programme is preferred for adequate review and correction capacity.

The hackathon's $10,000 prize is excluded from committed financing. If awarded and available for development, it can offset funding or extend evaluation.

#### Infrastructure and delivery costs

Managed application hosting, a database, protected documents and external model APIs suit the architecture. Hosting is service-based and inference usage-based; the budget is a planning allowance, not a supplier quote. [S13, S14]

Client mapping, review and support are more likely to determine early costs than server capacity. Initial steady-state allowances are $300–$800 monthly shared hosting/tools and $100–$500 per client in direct support/processing, excluding extensive expert work and content licences. The pilot will measure these costs; shared expenses must not be counted twice.

### 7.3 Five-year financial outlook and unit economics

The customer-revenue forecast combines trial services and annual subscriptions. PERLab sponsorship, partner licensing and acquisition proceeds are excluded from revenue. The model records every delivered trial, including trials that do not convert; standard onboarding is included in trial revenue and is not counted again. The customer assumptions table labels counts, percentages and financial amounts separately. All P&L amounts are in thousands of U.S. dollars (USD thousands). Years begin at commercial launch.

| Commercial assumption | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| One-month trials at $5,000 (companies) | 4 | 9 | 16 | 25 | 33 |
| Two-month trials at $10,000 (companies) | 2 | 5 | 8 | 13 | 17 |
| Total trial customers (companies) | 6 | 14 | 24 | 38 | 50 |
| New subscription customers (companies) | 3 | 8 | 15 | 25 | 35 |
| Trial-to-subscription conversion (%) | 50% | 57% | 63% | 66% | 70% |
| Opening subscription customers (companies) | 0 | 3 | 11 | 25 | 48 |
| Lost subscription customers (companies) | 0 | 0 | 1 | 2 | 4 |
| Closing subscription customers (companies) | 3 | 11 | 25 | 48 | 79 |
| Blended annual contract value (USD thousands/customer/year) | 24 | 24 | 27 | 30 | 33 |
| Exit annual recurring revenue (USD thousands/year) | 72 | 264 | 675 | 1,440 | 2,607 |

Annual contract value (ACV) starts at the $24,000 medium-company tier. The later averages reflect a mixed portfolio: a 12.5%, 25% and 37.5% share at the $48,000 enterprise entry price produces blended ACVs of $27,000, $30,000 and $33,000. These are portfolio-weight assumptions rather than automatic price increases. The forecast does not rely on selling the $96,000 package.

| P&L item (USD thousands) | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Subscription revenue | 36.0 | 168.0 | 486.0 | 1,095.0 | 2,095.5 |
| Paid trial revenue | 40.0 | 95.0 | 160.0 | 255.0 | 335.0 |
| **Total revenue** | **76.0** | **263.0** | **646.0** | **1,350.0** | **2,430.5** |
| Cost of revenue | 33.0 | 99.0 | 217.5 | 426.8 | 724.9 |
| **Gross profit** | **43.0** | **164.0** | **428.5** | **923.3** | **1,705.6** |
| Operating expenses | 60.0 | 180.0 | 330.0 | 550.0 | 900.0 |
| **Total expenditure** | **93.0** | **279.0** | **547.5** | **976.8** | **1,624.9** |
| **Operating profit or loss** | **(17.0)** | **(16.0)** | **98.5** | **373.3** | **805.6** |

Trial revenue equals $5,000 multiplied by one-month trials plus $10,000 multiplied by two-month trials. Revenue is recognised over the evaluation service period; the table assumes those services are delivered within the year shown. Cross-year services and prepaid subscriptions require deferral in the detailed accounts. Customers who stop after a trial generate no subscription revenue.

Subscription revenue uses the average of opening and closing subscribers multiplied by blended ACV, approximating evenly distributed subscription starts after trials and customer losses. Exit annual recurring revenue (ARR) equals closing subscribers multiplied by ACV. Trial fees are excluded from ARR. The monthly operating plan will track trial start, service delivery, conversion, subscription start and cash receipt separately.

Cost of revenue assumes 60% of trial fees for client-specific onboarding, integration, review and support, and 25% of subscription revenue for ongoing processing, allocated hosting, content and direct support. This gives 40% trial gross margin and 75% subscription gross margin. Direct delivery hours will not also be charged to central R&D.

Operating expenses cover product/R&D, sales and administration: $35k/$10k/$15k in Year 1; $110k/$40k/$30k in Year 2; $190k/$90k/$50k in Year 3; $300k/$170k/$80k in Year 4; and $480k/$300k/$120k in Year 5. The $30,000 development programme is contained in the first-year central budget, not added again. Early budgets assume limited founder draws; market-rate salaries or larger integrations require additional financing.

#### Funding bridge and sensitivity

Operating break-even occurs in Year 3 under this planning scenario. Combined Year 1 and Year 2 losses are $33,000 before working capital. A received $30,000 PERLab contribution would cover most of that cumulative shortfall, leaving at least $3,000 plus a cash reserve to fund. It does not guarantee runway: sales delays, collection timing and client delivery costs can increase the requirement. Sponsor receipts must be classified according to the eventual agreement; the table is not a statutory accounting treatment of that funding.

If Year 1 delivers only three one-month trials and one subscription customer, revenue is $27,000, cost of revenue $12,000 and operating loss $45,000 at unchanged central costs. That requires $15,000 beyond the $30,000 sponsor contribution, before working capital. Spending must therefore follow trial bookings and product milestones.

Holding Year 3 ACV at $24,000 lowers operating profit to $58,000. Raising subscription delivery cost to 40% instead lowers Year 3 operating profit to $25,600. Those sensitivities show why both pricing and processing/support efficiency matter.

#### Customer acquisition and retention metrics

At a planning 20% qualified-opportunity-to-trial rate, the forecast requires 30 qualified opportunities in Year 1, 120 in Year 3 and 250 in Year 5. Trial conversion is a separate metric. Track customer acquisition cost (CAC), trial contribution, time to conversion, churn, gross margin and net revenue retention as cohorts mature.

With $90,000 Year 3 sales expenditure and 15 new subscribers, fully allocated CAC is $6,000. At $27,000 ACV and 75% subscription gross margin, subscription gross profit is approximately $1,688 monthly, implying a 3.6-month CAC payback after subscription starts, before trial lead time. This is an operating-model target, not an observed result. Lifetime value will not be inferred before retention evidence exists.

The outlook reports operating results before tax and financing. Final net profit and cash runway depend on legal structure, tax, billing, collections and financing terms. Figures are rounded independently.

### 7.4 Support Requested

PERLab is asked to approve the jointly scoped eight-week programme and funding route, with:

- $30,000, proposed as $12,000 at kickoff, $9,000 at the accepted midpoint and $9,000 at delivery.
- A product counterpart to assess overlap and integration.
- Procurement/trade expertise and access to one authorised client case.
- A final review covering client expansion, licensing or acquisition discussions.

Existing IP remains with its owners unless separately agreed. The programme agreement will define evaluation rights and new work before development. Funding a scoped experiment can precede full demand validation; scaling or acquisition should use the evidence produced.

## Appendix A Investor Questions and Responses

### Why would PERLab support Keystone?

It offers a way to connect sourcing scenarios to decisions active inside a client organisation. A reusable workflow could support implementation and follow-up across engagements. The programme tests that contribution against PERLab's current capability.

### What further research proves recurring demand?

Completed client reviews and twelve-month event histories are needed to measure frequency and burden. Broad market research provides context but cannot establish that a buyer needs an annual subscription. Evidence maintenance and non-tariff supplier changes must also be examined.

### How will willingness to pay be established?

Present the $5,000 one-month or $10,000 two-month trial to the industrial budget owner, followed by the applicable annual subscription for continued use. The paid trial establishes initial willingness to pay for evaluation; subscription conversion and renewal establish stronger recurring-demand evidence. PERLab development sponsorship is a separate commercial signal.

### What can be delivered in two months?

A functional MVP for one category, agreed rules and authorised records, including connected analysis, evidence review, authenticated access and an evaluated decision package. A readiness review precedes the paid trial. Broad regulatory coverage and enterprise deployment require further development.

### What if award reasoning is unavailable?

The client can approve a reconstructed baseline. That effort must be explicit and costed. If reconstruction dominates every event, the offer requires an implementation service or narrower scope.

### What supports acquisition?

Fit with PERLab architecture and client delivery, useful repeatable performance, transferable asset rights and a practical handover. The founders seek strategic discussions without assuming a committed transaction.

### Principal risks

| Risk | Response |
| --- | --- |
| Episodic demand | Test origin/supplier/qualification work and offer projects where appropriate |
| Bespoke integration | Bound and price implementation; measure reusable mappings |
| Incorrect matches or evidence acceptance | Independent labels, explicit review and human sign-off |
| Incumbent/PERLab overlap | Compare the same case before integration investment |
| Delivery cost erodes margins | Cap scope and price specialist work separately |
| Slow data access | Agree dependencies and revisit scope at milestones |

### Pilot measures and decision gates

The client, PERLab and founders will establish the baseline before processing. Trade expertise will determine expected treatment, procurement feasible options and finance the approved cost comparison.

Use one event for feasibility and additional events for evaluation, including a held-out case. Freeze inputs at the historical decision date to avoid hindsight.

Measure analyst hours, elapsed time to sign-off, affected-line recall/precision, inadequate evidence incorrectly accepted, calculation reproducibility and review corrections. The proposed commercial target is at least 30% less analyst effort without material quality regression. On the bounded test, target all expert-labeled affected lines found, no inadequate evidence accepted and reproducible material calculations within agreed rounding.

Report denominators with results. Small-case success is not universal reliability. Prospective use must establish sustained benefit. Expand when the client accepts the workflow, commits budget and delivery costs fit the price. Seek a second independent buyer before treating adoption as repeatable.

## Appendix B Engagement Log

| Date | Stakeholder | Team Member | Engagement Type | Key Insight |
| --- | --- | --- | --- | --- |
| 14 November 2026 | Keystone product team | Oscar Cavalieros and Pratham Saxena | Hackathon development and product discussion | Designed the UI prototype and intended impact, decision and evidence workflow |
| 14–15 November 2026 | Public market/product sources | Keystone team | Market and competitor research | Relevant friction and substantial incumbent overlap |
| 15 November 2026 | Keystone business planning | Oscar Cavalieros | Founder statement | Defined roles, equal IP ownership, PERLab audience and subscription model |

External interviews and the programme pilot are the next engagement stage. Each will record participant role, segment, interviewer, completed event, artifacts, measured burden and purchasing decision.

## Appendix C Sources

Sources support attributed claims. Prices were checked on 15 November 2026 and can change. Public descriptions do not establish every feature of a customer deployment.

- **S1** [Thomson Reuters Institute 2025 Tariffs Report](https://www.thomsonreuters.com/en-us/posts/wp-content/uploads/sites/20/2025/04/2025-Tariff-Survey.pdf), April 2025, Figure 3 PDF p. 7 and methodology p. 11.
- **S2** [Altana and AAEI enterprise trade report](https://altana.ai/trade-readiness-report), 2026, product-record findings and methodology.
- **S3** [PERLab Tariff Simulator](https://www.kearney.com/web/product-excellence-and-renewal-lab/what-we-do/tariff-simulator).
- **S4** [SAP GTS Customs Duty Calculation](https://help.sap.com/docs/SAP_GLOBAL_TRADE_SERVICES/bdb1d2fb216941a69f6300006343e977/4b412a489fd17394e10000000a42189b.html).
- **S5** [ONESOURCE Global Trade Analysis](https://www.thomsonreuters.com.hk/en/products-services/global-trade-management/onesource-global-trade-analysis.html).
- **S6** [Altana Product Passport](https://docs.altana.ai/customs-and-border-authorities/passport-manager/product-passport-data/article.html) and [supplier request responses](https://docs.altana.ai/network-collaboration/respond-to-requests/article.html).
- **S7** [GoPro 2019 third-quarter filing](https://www.sec.gov/Archives/edgar/data/1500435/000150043519000059/gpro2019-09x3010xq.htm), production relocation discussion.
- **S8** [Census importer/exporter profile 2023–2024](https://www.census.gov/foreign-trade/Press-Release/edb/edbrel2024.pdf), final release 5 May 2026, Table 1d PDF p. 15.
- **S9** [PERLab approach and accelerators](https://www.kearney.com/web/product-excellence-and-renewal-lab/what-we-do).
- **S10** [PERLab Velocity AI](https://www.kearney.com/web/product-excellence-and-renewal-lab/what-we-do/velocity-ai).
- **S11** [Tarifflo pricing](https://www.tarifflo.com/pricing).
- **S12** [Precoro pricing](https://precoro.com/pricing).
- **S13** [Render pricing](https://render.com/pricing).
- **S14** [Anthropic API pricing](https://platform.claude.com/docs/en/about-claude/pricing).

- **S15** [MIT Sloan disciplined entrepreneurship](https://mitsloan.mit.edu/ideas-made-to-matter/disciplined-entrepreneurship-6-questions-startup-success) and [Y Combinator business models and pricing](https://www.ycombinator.com/library/Gh-yc-guide-to-business-models), entrepreneurship framework references.
