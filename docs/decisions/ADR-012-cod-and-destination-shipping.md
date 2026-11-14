# ADR-012 — Seller-collected COD and destination shipping

- Date: 2026-10-18.
- Status: approved business-model choices from the project owner.
- Authority: the owner answered the implementation questions with “Cash on delivery collected
  by the seller or their courier” and “One seller-configured charge per order and destination”.

## Decision

For the first commercial release, customers pay cash on delivery to the seller or the seller's
delivery provider. Atlas DZ does not collect or hold these customer funds. Do not introduce a
platform cash ledger, wallet, payout or settlement engine for this arrangement.

Each seller configures one shipping charge for its order at the selected destination. Multiple
items from the same seller do not each incur a separate shipping charge. In a multi-seller order,
each seller contributes its own applicable destination charge; checkout displays all seller
charges and the complete total before confirmation. Unsupported destinations must be rejected,
not assigned a guessed rate.

Checkout must snapshot the delivery destination, seller's applicable rate/configuration version,
COD arrangement and approved policy. Later configuration changes cannot alter an existing order.
Payment collection and order fulfillment remain separate states; a shipment or delivery report
does not prove that COD money was collected. Any collection/refund evidence must attribute the
seller or their provider, not imply platform custody.

## Remaining decisions and controls

This approval does not supply seller rates, coverage, authoritative location data, acceptance or
return deadlines, collection evidence requirements, legal/tax/privacy opinions, provider contracts,
real credentials, real customer data or deployment authorization. Those remain explicit gates.
Online payments remain disabled. COM-01C replaces new synthetic maximum-offer-fee quotes with
persisted destination-based seller configuration; historical orders retain their original snapshots.
Its fictional destinations are not validated delivery addresses. Commercial checkout remains disabled.

Implement and verify the approved model without enabling commercial orders prematurely.
