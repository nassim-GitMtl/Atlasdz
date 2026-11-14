# Atlas DZ — local seller publication, checkout and order tests

Primary lifecycle journey verified 2026-10-18; destination-rate integration checks passed 2026-10-20.
Positive destination-rate browser verification is pending; see the readiness ledger.
2026-10-23: offer edits, support conversations and wilaya/commune shipping added; 60 focused checks
and both web builds pass. Product submissions/review added 2026-11-01; migration 000017 applied
and all checksums verified. Sign out/in after restart to load the new local product permissions.
This is a synthetic, loopback-only test of persisted offer submission,
moderation, discovery, carts, checkout, isolated seller processing and customer receipt. It is **not** production
login, real MFA, payment or physical fulfillment. The old prototype on port 4173 is separate.

## Prepare

From the repository root, use the existing synthetic `.env.local` (do not overwrite it):

```bash
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:migrate
pnpm db:verify
pnpm db:seed:synthetic
pnpm catalog:seed:synthetic
pnpm verify
pnpm test:integration
pnpm test:security
pnpm smoke
```

For a new checkout only, copy `.env.example` to `.env.local` and configure its LOCAL
synthetic values first. The API requires `NODE_ENV=local` and a loopback database.
The seeds preserve existing stock and refuse conflicting fixture identities.

## Run in three terminals

```bash
# Terminal 1: explicit synthetic account API, 127.0.0.1:3003
ATLAS_LOCAL_ACCOUNTS=true ATLAS_LOCAL_CHECKOUT=true pnpm --filter @atlas/api start:local-catalog

# Terminal 2: production-built customer app, 127.0.0.1:3001
APP_ENV=local ATLAS_LOCAL_ACCOUNTS=true ATLAS_LOCAL_CHECKOUT=true CATALOG_API_BASE_URL=http://127.0.0.1:3003 pnpm --filter @atlas/customer-web start

# Terminal 3: production-built Seller Center, 127.0.0.1:3002
APP_ENV=local ATLAS_LOCAL_ACCOUNTS=true SELLER_API_BASE_URL=http://127.0.0.1:3003 pnpm --filter @atlas/seller-center start
```

If one of these ports is already running, reuse that service or stop its own terminal
before restarting; do not kill unrelated processes. Builds require restarting the web
processes and reloading browser tabs. No public deployment is authorized by these commands.

## Try the journey

### Create a new product first

1. Sign in as the local seller and open **Proposer un produit** (`/products`). Select a category
   and enter French/Arabic names and descriptions. Submit; the proposal remains private.
2. Sign out, sign in as local administrator, and open **Modération des produits**
   (`/moderation/products`). Review both languages, then approve or reject with a seller-visible
   reason. Product review and offer approval are separate permissions/actions.
3. Sign back in as seller. Approved proposals have **Ajouter une offre**, which preselects the
   new product even before it has a public offer. Set price/stock/handling and submit the offer.
4. Approve that offer through the existing moderation page. Only then is the product eligible
   for public discovery. Configure actual seller destination rates separately before local checkout.

Photos are not uploaded in this slice: a neutral placeholder is clearly disclosed. Product
revisions/multiple variants and paginated history remain future work. At most 100 proposals are
shown and 100 pending proposals per seller are allowed. These steps are for user testing; agent
browser access to Seller Center remains blocked until explicitly approved. Automated repository/API
checks passed, but this new browser journey is not yet verified. No real product/order was created
in the persistent local database by these checks.

### Add an offer for an existing approved product

1. Open [Seller Center](http://localhost:3002/), choose the local test login, then seller.
   The seller is the synthetic Maison Plus account. Sessions expire after 30 minutes.
2. Open **Ajouter une offre**. Choose an existing product not already listed by this seller,
   enter price, quantity and preparation days, then submit for review. The legacy indicative
   shipping field is ignored at checkout; configure destination rates separately below.
   French comma decimal input is supported, e.g. `4250,50` DZD becomes exactly `425050` centimes.
3. The seller list shows the pending offer. The customer product page must not show it yet.
   Seller access to **Modération** must be denied.
4. Sign out, choose local administrator, review the offer and approve it.
5. Refresh the [customer catalog](http://localhost:3001/). The product's offer comparison
   now includes the new seller, exact price, stock and handling. Shipping is calculated at quote.
6. Switch French/Arabic and inspect narrow layouts. Arabic uses actual document RTL.

The browser verification already created and approved a Maison Plus offer for **Écouteurs
sans fil**, with price 4,250.50 DZD, initial quantity 7, preparation 2 days, and legacy delivery
450 DZD. Its current stock is 6 after the synthetic shipment; do not restore consumed stock.
Do not reset the database just to repeat the test. Choose another product not already
offered by Maison Plus; duplicate seller/product submissions return a conflict.

## Try the saved customer cart

1. Open [the cart](http://localhost:3001/cart?lang=fr), then the local customer test login.
2. Open a product, select a seller offer and choose **Ajouter au panier**.
3. Return to the cart, update quantity, reload and confirm the saved quantity remains.
   The same product from different sellers stays on separate lines.
4. Try more than the available stock: the API rejects it without changing the saved cart.
5. Open the cart in two tabs. Save an edit in one, then save a stale edit in the other:
   it must show a conflict and ask for a reload, not overwrite the first edit.
6. Remove a line, switch to Arabic and test a narrow display. Customer logout revokes its
   current persisted session family; a later local login retrieves the same saved cart.

Seller and customer logout now revoke the server-side current family before clearing the cookie.
If the API cannot confirm revocation, the page displays a retry alert instead of a successful
logout. Customer French logout and Arabic 320px outage/retry were verified on 2026-10-21; Seller
Center browser verification is still paused. Other devices' sessions are not revoked by logout.

The cart has technical bounds of 50 distinct offers and 99 units per line. It displays current
catalog prices and stock, flags unpublished/out-of-stock offers, and excludes unavailable lines
and shipping from the available subtotal. It is **not a quote** and does not reserve stock.
The previous two-seller test cart was cleared by checkout. Its order history remains saved.
The 2026-10-20 coverage-denial check subsequently left one air fryer in the cart without reservation.

## Try in-app notifications

After signing in, open **Notifications** in the [customer app](http://localhost:3001/notifications?lang=fr)
or [Seller Center](http://localhost:3002/notifications?lang=fr). Existing order history appears
automatically; no email/SMS service or worker is required. Each account sees only its permitted
orders. Open an order, mark a notification read, then reload: read state persists for that user
without changing the order or another user's unread count. Refresh to see subsequent order updates.
French/Arabic, older-page links and empty/error states are implemented. Focused automated checks
passed on 2026-10-22; browser verification remains pending, including the port 3002 approval block.

## Try checkout → seller inbox → rejection/cancellation

1. Sign in as the local seller and open **Livraison et paiement à réception**. Enable fictional
   destination A, enter a test charge such as `500,00` DZD, select the seller or seller's courier
   as collector, confirm and save. This is an example test value, not an approved commercial rate.
   Startup imports the reference register and separate fictional destinations, never seller rates.
2. Sign in with the local customer account. Add Maison Plus items only for this manual test;
   multiple products/quantities from that seller should share the one configured shipping charge.
   Select fictional destination A in the cart. Enter fictitious recipient, phone, street and city
   (for example `TEST Recipient`, `+00000000000`, `10 TEST Street`, `TEST City`), then choose
   **Vérifier la commande test**. Check the saved contact details, item subtotal, destination,
   shipping and collector before **Confirmer la commande test**. To correct contact details,
   return to the cart and create a new quote; a quote's saved details cannot be overwritten.
   Changed prices/stock/cart/rates require a fresh quote. Unsupported destinations are rejected.
3. The confirmation has one customer reference and independent seller references/statuses.
   The cart is cleared. **Mes commandes** retains the order across reloads and local logins.
4. In Seller Center, log in as the test seller and open **Commandes**. Maison Plus sees only its
   own items and subtotal; other sellers' items must not appear. Open the seller-order detail
   to see the contact details saved at checkout. Older test orders explicitly have no contact.
5. Select a rejection reason, check the confirmation and choose **Refuser cette commande test**. Refresh the
   customer detail: Maison Plus is rejected. Its unshipped reserved stock is restored.
6. Create a separate fresh order to test customer cancellation while awaiting the seller.
   Its reservation is released too.
   Cancel/reject controls disappear once that seller order is closed.
7. Reopen the original quote URL and repeat confirmation: it returns the same order, not a new
   one. Do not make a new quote if testing a retry of the original confirmation.
8. Switch French/Arabic on customer and seller orders and inspect a 320px layout.

The checkout switch is a separate opt-in. Without it, checkout is unavailable. Quote validity is
ten minutes; awaiting-seller orders expire after one hour and release stock through the local API's
five-second expiry loop. Restarting that API catches up overdue orders. These are test parameters,
not approved marketplace deadlines. New quotes use the persisted destination charge once per
seller, not the legacy offer fee. Disable a destination or change its rate after quoting to verify
that placement fails without reserving stock. Placed orders retain the original snapshots.
There is **no payment or actual shipment** in this fixture. Delivery-contact capture is implemented
with format checks only; use fictitious details exclusively. Neither a phone nor a real address is
verified, and city text does not establish coverage. Historical placed orders remain readable and
retryable; older unplaced quotes missing contact require a new quote. Targeted checks passed on
2026-10-23; this does not claim completed browser or commercial address verification.

Multi-seller checkout requires every seller to have enabled the selected destination. The local
Seller Center account represents Maison Plus only; other sellers' rates must not be edited through
that account. Disposable integration tests configure separate sellers and verify independent fees,
isolation and failures. The older multi-seller browser evidence below used the historical quote
fixture. It is not evidence that the new positive shipping UI journey has passed.

Agent browser access to port 3002 is paused pending explicit approval after an approval-system
block. Automated repository checks and the customer's unsupported-coverage browser check passed;
the instructions above describe the remaining positive browser checks, not completed evidence.

## Configure wilayas and communes

1. Open [Seller delivery](http://localhost:3002/delivery?lang=fr), select a wilaya and **Afficher**.
   The reference list has 69 wilayas and 1541 communes; no seller price or coverage is prefilled.
2. Enable the wilaya, set the per-order DZD price and COD collector, confirm and save. That rate
   covers all its communes unless an explicit exception exists. Use only locally chosen test rates.
3. Expand **Configurer** for a commune. Uncheck **Utiliser le tarif de la wilaya** to set a different
   price, or leave coverage disabled to exclude that commune. Check inheritance again to restore
   the wilaya default. Saving a wilaya price never overwrites commune exceptions.
4. Customer cart now has linked wilaya/commune selectors. Every seller in the cart must cover the
   chosen commune. A commune with no active own/default rate blocks checkout. One seller's charge
   is applied once, regardless of the number of its items.
5. Existing placed orders retain their prices; changed quote rates require a fresh quote.
   The register does not imply a courier serves a destination or validate contact/address details.
   **Destinations fictives (tests)** remains available for the older test journey above.

## Edit offers and request help

- Seller **Offres** → edit an owned pending/approved offer. Change price, available (unreserved)
  stock and handling. Stale versions conflict; editing never changes moderation or sold snapshots.
- Customer order → **Aide et retours** for a seller order. Open a request with fictitious text.
  The seller replies in its own support inbox. The customer can close, reopen or escalate it.
- The local administrator accesses escalations through the support page's staff link. Resolution
  closes the conversation only: no stock, shipment, payment or refund is automatically changed.
- Message history is immutable and scoped; use only synthetic non-personal data. These instructions
  are manual test steps, not claims that seller-side browser verification has passed.

The saved browser-test order is `c24d0003-33c5-4e6d-8520-e64e0a7686ff`; Maison Plus is rejected,
TechWay is cancelled, and both stock reservations are released. Do not erase it to repeat testing.

## Boundaries and troubleshooting

### Seller processing and customer receipt

Create a fresh test order; do not reuse a closed one. In the seller detail, check the simulation
confirmation and choose **Accepter la commande test**, then **Commencer la préparation test**.
For dispatch, enter only fictitious carrier/tracking values such as `TEST Carrier` / `TEST-002`.
Each stage requires a new confirmation. The customer detail shows the attributed timeline.

After **Déclarer la livraison test**, the customer still sees delivery awaiting confirmation.
Only the customer can check the receipt confirmation and choose **Confirmer la réception test**.
Alternatively, a shipped order can record a failed delivery; consumed stock is not automatically
restored. Post-acceptance cancellation/returns and actual delivery providers are not implemented.

Saved primary-journey order: `655e7502-4f82-4b06-8d4a-fe4e05d0f0e0` (Maison Plus confirmed,
TechWay independently cancelled). The seller shipment consumed one synthetic earbuds unit.
The approved commercial COD model does not enable actual payment collection in this fixture.

- PostgreSQL stores offers, moderation, audit and outbox records. Browser storage is not
  the authority. Cart/quote creation does not reserve stock; confirming a test order does.
- The local identity harness issues random opaque credentials, persists only hashes,
  exercises authoritative sessions/RBAC and labels its MFA evidence as synthetic.
  It is mounted only by `local-main.ts`; normal `main.ts` still rejects credentials by default.
- Local login requires explicit API and web opt-ins, exact LOCAL/TEST environments, loopback
  ports, and matching-origin forms. Missing opt-ins intentionally make test accounts unavailable.
- Test credentials stay in an HttpOnly, SameSite=Strict cookie, never in JavaScript/localStorage.
  The cookie is non-Secure only for the explicitly loopback HTTP test. Production auth is absent.
- Login issuance is limited to 10 attempts per minute for this local fixture API. If exhausted,
  wait for the minute window; do not weaken the limiter.
- A service/unavailable state is an actual API failure, not a fallback to fake data. Check local
  service terminals and foundation/catalog seed completion; never print credentials in diagnostics.
- Seller onboarding, full product authoring, real delivery coverage, production COD,
  external notifications and physical return/refund evidence remain incomplete. Offer editing,
  reference delivery pricing and support conversations are implemented. Seller processing and rejection reasons
  are implemented; see the ledger for the exact automated and manual evidence boundaries.

All three release readiness conclusions remain **NO**. See
[PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) for the current evidence and remaining gates.
The executable [security regression baseline](SECURITY-REGRESSION.md) is not a production
security sign-off; automated browser and accessibility suites are still required.
