# Keystone three-minute demo

**Audience** Procurement and trade compliance leaders
**Scenario** MeridianFlow, a fictional industrial manufacturer. The example covers the illustrative Section 232 duty layer.

## Prepare the demo

- On the isolated demo database, run `docker compose exec api python -m scripts.reset_demo`. Start the web app with `NEXT_PUBLIC_USE_FIXTURES=false` and the API with `REPLAY=1`.
- Extract these two files from the demo pack so the picker can reach them quickly: `01_bulletin_email_HTA-2026-118.eml` and `03_scan_mill_cert_Sheffield_MF-8413-005.jpg`.
- Open Console Intake in one tab and the pitch deck in another. Keep the deck’s screenshots ready if the local stack is interrupted.

## 0:00–0:25 · Keystone

MeridianFlow awarded its pump casings when the duty rate was 25 percent. The team documented why the award made sense. A tariff bulletin arrives later, after purchase orders are already open. The buyer has to find the affected orders, check whether the original supplier still makes sense, and decide what evidence to collect before committing to a change. Keystone brings those questions into the same workflow.

## 0:25–1:05 · Tariff exposure on open orders

*Open Console Intake and upload the bulletin email. Choose **Run impact**. Open **Show math** for PO-4504.*

This illustrative bulletin changes the rate from 25 to 50 percent for the affected headings, effective December first. Keystone links back to the original bulletin and applies the rate change to the open order lines it covers. The rules find **33 parts and 33 order lines**, with **$470,687** in added duty and **$617,061** at current annual build rates. For this order, you can open the calculation and see the customs value and both rates.

## 1:05–1:55 · The supplier switch depends on proof

*Show **Decisions**. Return to **Intake**, upload the Sheffield scan, then open **Evidence** and inspect the melt-and-pour source.*

The casing award is one decision the bulletin puts back in review. Sheffield’s annual cost is **$49,690 lower** if the supplier can support the preferred rate. Without the required proof, switching would cost **$178,884 more** each year. Here’s the issue in the original scan. The melt-and-pour location is unreadable, and the origin declaration is missing. The buyer can see the exact source and the two different cost outcomes before making the call.

*If the app asks for quote confirmation, enter supplier **S007** and part **MF-8413-005**. The unreadable evidence stays flagged.*

## 1:55–2:35 · Supplier request and approvals

*Open **Brief** from the design picker and scroll to the supplier request. Show heats **SF-24117** and **SF-24121**. Add “Please include the quote number in your reply.” Choose **Approve request** to submit the draft for approval, then verify the audit chain under **Audit trail**.*

Keystone drafts a request for a legible mill certificate covering these two heats and for the missing origin declaration. The buyer can edit the draft before submitting it. Keystone records draft decision **D-2026-044** for review by Sourcing and Trade Compliance. The audit log ties the submission back to the bulletin and the evidence review.

## 2:35–3:00 · Where the approach could apply next

*Return to the annual cost section of the executive **Brief**, then switch to the closing slide.*

The approver can see the change in cost, what Sheffield still needs to prove, and what the buyer submitted. The same approach could help with aerospace supplier requalification and EU battery passport evidence, where an existing decision also depends on proof that may need to be checked again.
