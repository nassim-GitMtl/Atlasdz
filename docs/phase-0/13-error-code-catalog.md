# Phase 0 Error Code Catalog

Scope amendment (2026-10-06): [ADR-011](../decisions/ADR-011-seller-fulfilled-marketplace.md) and [revised scope](22-scope-phasing.md) control this historical baseline. Warehouse, fleet, platform-owned stock, platform goods/COD custody, and unconditional settlement requirements are OUT_OF_SCOPE. Seller stock reservations, seller order processing, delivery visibility, and applicable controls remain required. Authorized safe implementation may proceed; excluded capabilities and older blanket implementation stops do not create release blockers.

**Status:** proposed stable client contract  
**Rule:** clients branch on `code`, never on localized `message`.

## 1. Error contract

```ts
type ApiError = {
  code: string;
  message: string; // safe Arabic/French/English rendering
  correlationId: string;
  details?: Record<string, unknown>; // allowlisted, non-sensitive fields
};
```

### 1.1 HTTP and retry semantics

| HTTP | Meaning in this API                                                                     |
| ---- | --------------------------------------------------------------------------------------- |
| 400  | Malformed syntax, invalid cursor, or unsupported request shape before domain validation |
| 401  | Missing, invalid, expired, or revoked authentication                                    |
| 403  | Authenticated principal lacks permission, scope, MFA, or re-verification                |
| 404  | Resource is absent or intentionally hidden because the caller does not own its scope    |
| 409  | Current state, uniqueness, idempotency, or optimistic-concurrency conflict              |
| 410  | Token/link/export is intentionally expired and cannot be refreshed in place             |
| 413  | Request or file exceeds the accepted limit                                              |
| 415  | MIME/media type is unsupported                                                          |
| 422  | Well-formed request violates field validation or business eligibility                   |
| 423  | Resource is locked by a controlled review/settlement/processing workflow                |
| 429  | Rate limit, OTP cooldown, or abuse control                                              |
| 502  | An upstream provider returned an invalid or failed response                             |
| 503  | Required dependency is temporarily unavailable                                          |
| 504  | Required dependency timed out and the final outcome is unknown or pending               |
| 500  | Unexpected internal failure with no internal details exposed                            |

`Retryable = Yes` means a client or worker may retry only according to `Retry-After`, idempotency rules, and operation-specific policy. `Retryable = No` means the caller must change state/input or follow the documented next action. `Conditional` means status refresh or retry is safe only with the same idempotency key.

## 2. Platform, protocol, authentication, and authorization

| Code                               | HTTP | Meaning / client action                                                                       | Retryable   |
| ---------------------------------- | ---: | --------------------------------------------------------------------------------------------- | ----------- |
| `VALIDATION_FAILED`                |  422 | One or more allowlisted field errors are returned in `details.fields`; fix input              | No          |
| `MALFORMED_REQUEST`                |  400 | JSON, query, cursor, or path syntax cannot be parsed; correct request                         | No          |
| `PAYLOAD_TOO_LARGE`                |  413 | Body exceeds operation limit; reduce it or use upload intent                                  | No          |
| `UNSUPPORTED_MEDIA_TYPE`           |  415 | Content type is not accepted by the operation                                                 | No          |
| `METHOD_NOT_ALLOWED`               |  405 | HTTP method is not supported for this route                                                   | No          |
| `RESOURCE_NOT_FOUND`               |  404 | Generic resource is absent or hidden from this caller                                         | No          |
| `VERSION_CONFLICT`                 |  409 | Aggregate version/ETag is stale; refetch and reapply intent                                   | No          |
| `IDEMPOTENCY_KEY_REQUIRED`         |  400 | Operation requires `Idempotency-Key`                                                          | No          |
| `IDEMPOTENCY_KEY_REUSED`           |  409 | Key was previously bound to a different request hash; generate a new key for the new intent   | No          |
| `REQUEST_IN_PROGRESS`              |  409 | Same idempotent operation is still running; poll or retry with the same key                   | Conditional |
| `RATE_LIMITED`                     |  429 | Request class limit reached; wait for `Retry-After`                                           | Yes         |
| `INTERNAL_ERROR`                   |  500 | Unexpected failure; show safe generic state and retain correlation ID                         | Conditional |
| `SERVICE_UNAVAILABLE`              |  503 | Required internal dependency is temporarily unavailable                                       | Yes         |
| `UPSTREAM_TIMEOUT`                 |  504 | Provider/dependency did not return a definitive result; query status before retrying mutation | Conditional |
| `AUTHENTICATION_REQUIRED`          |  401 | A valid session/access token is required                                                      | No          |
| `AUTHENTICATION_FAILED`            |  401 | Identifier or credential is invalid; do not disclose which                                    | No          |
| `ACCOUNT_SUSPENDED`                |  403 | Account cannot authenticate; present support route                                            | No          |
| `IDENTIFIER_ALREADY_EXISTS`        |  409 | Normalized phone/email is already registered; route to login/recovery                         | No          |
| `REFRESH_TOKEN_INVALID`            |  401 | Refresh token is invalid/expired; sign in again                                               | No          |
| `REFRESH_TOKEN_REUSED`             |  401 | Rotated token replay detected; session family revoked and sign-in required                    | No          |
| `SESSION_REVOKED`                  |  401 | Session was revoked; sign in again                                                            | No          |
| `SESSION_NOT_FOUND`                |  404 | Requested owned session does not exist                                                        | No          |
| `TOKEN_INVALID`                    |  422 | Verification/reset token is invalid                                                           | No          |
| `TOKEN_EXPIRED`                    |  410 | Verification/reset token expired; start a new challenge                                       | No          |
| `PASSWORD_POLICY_FAILED`           |  422 | Password does not meet configured policy; return safe rule indicators                         | No          |
| `INVALID_PHONE`                    |  422 | Phone format/normalization is invalid for supported flow                                      | No          |
| `OTP_COOLDOWN`                     |  429 | New OTP cannot be sent yet; wait for returned retry time                                      | Yes         |
| `OTP_INVALID`                      |  422 | OTP is incorrect                                                                              | No          |
| `OTP_EXPIRED`                      |  410 | OTP expired; request a new challenge                                                          | No          |
| `OTP_ATTEMPTS_EXCEEDED`            |  429 | Challenge locked after configured attempts; create a new challenge later                      | Yes         |
| `MFA_REQUIRED`                     |  403 | Primary authentication succeeded but MFA must be completed                                    | No          |
| `MFA_INVALID`                      |  422 | MFA proof is invalid                                                                          | No          |
| `MFA_EXPIRED`                      |  410 | MFA challenge expired; start a new challenge                                                  | No          |
| `FORBIDDEN`                        |  403 | Principal lacks permission or tenant/resource scope                                           | No          |
| `STEP_UP_AUTH_REQUIRED`            |  403 | Sensitive action requires recent MFA/re-verification                                          | No          |
| `IDENTITY_REVERIFICATION_REQUIRED` |  403 | User must re-prove identity before privacy/financial action                                   | No          |
| `SEPARATION_OF_DUTIES_REQUIRED`    |  403 | Initiator cannot approve the same protected action                                            | No          |
| `REASON_REQUIRED`                  |  422 | Controlled administrative action requires a reason                                            | No          |

## 3. Customer, address, location, and privacy

| Code                                   | HTTP | Meaning / client action                                                                               | Retryable |
| -------------------------------------- | ---: | ----------------------------------------------------------------------------------------------------- | --------- |
| `CUSTOMER_NOT_FOUND`                   |  404 | Customer is absent or hidden from caller                                                              | No        |
| `ADDRESS_NOT_FOUND`                    |  404 | Address is absent or not owned by customer                                                            | No        |
| `ADDRESS_IN_USE`                       |  409 | Saved address is referenced by an active flow and cannot be deleted; order snapshots remain immutable | No        |
| `ADDRESS_NOT_SERVICEABLE`              |  422 | No permitted delivery service reaches selected address                                                | No        |
| `INVALID_WILAYA_COMMUNE`               |  422 | Commune does not belong to supplied active Wilaya dataset version                                     | No        |
| `INVALID_LOCATION`                     |  422 | Location filter/reference is invalid                                                                  | No        |
| `WILAYA_NOT_FOUND`                     |  404 | Wilaya code is unknown/inactive                                                                       | No        |
| `INVALID_LOCALE`                       |  422 | Locale is not `ar`, `fr`, or enabled `en`                                                             | No        |
| `REQUIRED_NOTIFICATION_CANNOT_DISABLE` |  422 | Policy-required transactional topic cannot be disabled                                                | No        |
| `PRIVACY_REQUEST_ALREADY_OPEN`         |  409 | Equivalent privacy workflow is already active                                                         | No        |

## 4. Catalog, offer, search, cart, and wishlist

| Code                                 | HTTP | Meaning / client action                                                                        | Retryable |
| ------------------------------------ | ---: | ---------------------------------------------------------------------------------------------- | --------- |
| `CATEGORY_NOT_FOUND`                 |  404 | Category is absent/inactive                                                                    | No        |
| `CATEGORY_NOT_ALLOWED`               |  422 | Seller/product cannot use this category under marketplace policy                               | No        |
| `CATEGORY_SLUG_EXISTS`               |  409 | Category slug collides in its scope                                                            | No        |
| `CATEGORY_PARENT_INVALID`            |  422 | Selected category parent is invalid                                                            | No        |
| `CATEGORY_CYCLE`                     |  409 | Category update would create a cycle                                                           | No        |
| `BRAND_NOT_FOUND`                    |  404 | Brand is absent/inactive                                                                       | No        |
| `BRAND_ALREADY_EXISTS`               |  409 | Normalized brand/slug appears to exist                                                         | No        |
| `VERIFICATION_EVIDENCE_REQUIRED`     |  422 | Brand/official status requires approved evidence                                               | No        |
| `PRODUCT_NOT_FOUND`                  |  404 | Product is absent or not visible to caller                                                     | No        |
| `PRODUCT_NOT_AVAILABLE`              |  409 | Product exists but is inactive/restricted for purchase                                         | No        |
| `PRODUCT_NOT_APPROVED`               |  409 | Product/variant has not passed moderation                                                      | No        |
| `PRODUCT_VALIDATION_FAILED`          |  422 | Required category/product validation failed; details contain safe findings                     | No        |
| `DUPLICATE_PRODUCT_CANDIDATE`        |  409 | Identifiers/brand-model indicate existing catalog candidates; use returned catalog search refs | No        |
| `PRODUCTS_NOT_DUPLICATES`            |  422 | Requested merge records fail duplicate policy                                                  | No        |
| `MERGE_CONFLICT`                     |  409 | Product merge conflicts with active variants/offers/policies; resolve listed blockers          | No        |
| `COMPLIANCE_REVIEW_REQUIRED`         |  423 | Product/category must complete legal/compliance review                                         | No        |
| `RESTRICTED_PRODUCT_REVIEW_REQUIRED` |  423 | Seller product request entered restricted-category review                                      | No        |
| `INVALID_PRODUCT_STATE`              |  409 | Product moderation transition is not permitted                                                 | No        |
| `OFFER_NOT_FOUND`                    |  404 | Offer is absent or outside seller/customer visibility                                          | No        |
| `OFFER_NOT_BUYABLE`                  |  409 | Offer is inactive, restricted, expired, or seller is ineligible                                | No        |
| `OFFER_NOT_ELIGIBLE`                 |  422 | Offer lacks price, policy, inventory, fulfillment, or approval prerequisite                    | No        |
| `DUPLICATE_ACTIVE_OFFER`             |  409 | Seller already has an active offer for the variant under current policy                        | No        |
| `PRICE_INVALID`                      |  422 | Price is negative, currency-invalid, or violates configured constraint                         | No        |
| `SEARCH_UNAVAILABLE`                 |  503 | Search projection is unavailable; allow retry and direct known-item navigation                 | Yes       |
| `QUERY_TOO_SHORT`                    |  422 | Search/autocomplete query is below configured length                                           | No        |
| `INVALID_FILTER`                     |  422 | Filter key/value is unsupported for this category/endpoint                                     | No        |
| `INVALID_SORT`                       |  422 | Sort option is unsupported                                                                     | No        |
| `QUERY_TOO_BROAD`                    |  422 | Admin search/export lacks required narrowing filters                                           | No        |
| `CART_NOT_FOUND`                     |  404 | Cart token/owned cart is absent or expired                                                     | No        |
| `CART_EMPTY`                         |  422 | Checkout cannot start with no buyable items                                                    | No        |
| `CART_ITEM_NOT_FOUND`                |  404 | Cart item is absent or not owned                                                               | No        |
| `CART_LIMIT_EXCEEDED`                |  422 | Item/quantity/cart configured limit is exceeded                                                | No        |
| `CART_MERGE_CONFLICT`                |  409 | Anonymous/authenticated cart merge needs client review of conflicts                            | No        |
| `QUANTITY_INVALID`                   |  422 | Quantity is zero, negative, over configured limit, or incompatible with available unit         | No        |
| `WISHLIST_NOT_FOUND`                 |  404 | Wishlist is absent or not owned                                                                | No        |
| `WISHLIST_ITEM_NOT_FOUND`            |  404 | Wishlist item is absent or not owned                                                           | No        |
| `WISHLIST_ITEM_EXISTS`               |  409 | Same item is already present in wishlist                                                       | No        |
| `WISHLIST_LIMIT_EXCEEDED`            |  422 | Configured wishlist/item limit reached                                                         | No        |

## 5. Checkout, inventory, order, and cancellation

| Code                            | HTTP | Meaning / client action                                                                          | Retryable   |
| ------------------------------- | ---: | ------------------------------------------------------------------------------------------------ | ----------- |
| `CHECKOUT_EXPIRED`              |  410 | Checkout quote/session expired; start/reprice checkout                                           | No          |
| `PRICE_CHANGED`                 |  409 | Current price differs from reviewed snapshot; display changes and require reconfirmation         | No          |
| `OUT_OF_STOCK`                  |  409 | One or more quantities cannot be reserved; safe item availability is in details                  | No          |
| `PROMOTION_INVALID`             |  409 | Promotion became ineligible/exhausted/expired; recalculate totals                                | No          |
| `TERMS_NOT_ACCEPTED`            |  422 | Current terms/policy versions were not explicitly accepted                                       | No          |
| `SHIPPING_NOT_AVAILABLE`        |  422 | No shipping option covers every requested fulfillment group                                      | No          |
| `INVALID_SHIPPING_SELECTION`    |  422 | Selection does not match current fulfillment group/quote                                         | No          |
| `QUOTE_EXPIRED`                 |  410 | Shipping/rate quote expired; request new options                                                 | No          |
| `PICKUP_POINT_UNAVAILABLE`      |  409 | Pickup point became inactive/full/unsupported                                                    | No          |
| `PAYMENT_METHOD_UNAVAILABLE`    |  422 | Chosen payment method is disabled/ineligible for order/location/value                            | No          |
| `PAYMENT_INITIALIZATION_FAILED` |  502 | Provider setup failed definitively; retain order/checkout state and offer safe retry/alternative | Conditional |
| `ORDER_NOT_FOUND`               |  404 | Order is absent or outside caller scope                                                          | No          |
| `ORDER_ITEM_NOT_FOUND`          |  404 | Order item is absent or outside caller scope                                                     | No          |
| `SELLER_ORDER_NOT_FOUND`        |  404 | Seller order is absent or outside seller scope                                                   | No          |
| `SELLER_ORDER_EXPIRED`          |  409 | Seller acceptance/preparation deadline expired                                                   | No          |
| `ORDER_NOT_CANCELLABLE`         |  409 | Current item/order state or policy disallows cancellation                                        | No          |
| `CANCELLATION_ALREADY_OPEN`     |  409 | Equivalent cancellation request is pending                                                       | No          |
| `INVALID_ORDER_STATE`           |  409 | Requested order/seller-order transition is not allowed                                           | No          |
| `NO_ITEMS_REORDERABLE`          |  422 | No prior item currently maps to a buyable offer                                                  | No          |
| `INVENTORY_ADJUSTMENT_INVALID`  |  422 | Adjustment reason/quantity/scope violates inventory policy                                       | No          |
| `SERIAL_REQUIRED`               |  422 | Serialized SKU requires valid serial/IMEI data                                                   | No          |
| `SERIAL_DUPLICATE`              |  409 | Serial/IMEI already exists or is already allocated                                               | No          |

## 6. COD, payment, webhook, refund, and reconciliation

| Code                              | HTTP | Meaning / client action                                                                      | Retryable   |
| --------------------------------- | ---: | -------------------------------------------------------------------------------------------- | ----------- |
| `COD_NOT_ELIGIBLE`                |  422 | COD is disabled or order/customer/location is ineligible under configured policy             | No          |
| `COD_LIMIT_EXCEEDED`              |  422 | Order COD amount exceeds configured maximum                                                  | No          |
| `COD_VERIFICATION_REQUIRED`       |  409 | Customer must complete OTP/confirmation before order can proceed                             | No          |
| `COD_MANUAL_REVIEW`               |  423 | COD order awaits authorized manual review                                                    | No          |
| `COD_REJECTED`                    |  422 | COD was rejected with auditable safe reason category; offer permitted alternative            | No          |
| `COD_AMOUNT_MISMATCH`             |  409 | Courier-declared collection differs from expected amount; create discrepancy flow            | No          |
| `PAYMENT_NOT_FOUND`               |  404 | Payment is absent or outside caller scope                                                    | No          |
| `PAYMENT_NOT_CANCELLABLE`         |  409 | Payment state no longer permits cancellation                                                 | No          |
| `PAYMENT_PROVIDER_UNAVAILABLE`    |  503 | Payment provider cannot currently serve request                                              | Yes         |
| `PAYMENT_STATUS_UNKNOWN`          |  504 | Provider outcome is uncertain; remain pending and refresh/reconcile, never duplicate blindly | Conditional |
| `WEBHOOK_SIGNATURE_INVALID`       |  401 | Provider webhook authenticity failed; do not process event                                   | No          |
| `WEBHOOK_REPLAYED`                |  200 | Provider event was already processed; acknowledge without side effect                        | No          |
| `PROVIDER_EVENT_INVALID`          |  422 | Authenticated callback fails canonical schema/state mapping; quarantine for operations       | No          |
| `REFUND_NOT_FOUND`                |  404 | Refund is absent or outside caller scope                                                     | No          |
| `REFUND_BASIS_INVALID`            |  422 | No approved cancellation/return/payment basis supports refund                                | No          |
| `REFUND_AMOUNT_EXCEEDS_AVAILABLE` |  409 | Requested cumulative refund exceeds refundable captured amount                               | No          |
| `REFUND_NOT_APPROVABLE`           |  409 | Refund state/prerequisites do not permit approval                                            | No          |
| `SOURCE_ALREADY_PROCESSED`        |  409 | Reconciliation source checksum/reference was already imported                                | No          |
| `SOURCE_FORMAT_INVALID`           |  422 | Reconciliation source cannot be parsed/validated                                             | No          |
| `AMOUNT_MISMATCH`                 |  409 | Expected and submitted financial amounts differ; inspect/reconcile                           | No          |
| `BATCH_NOT_RECONCILABLE`          |  409 | COD/payment batch is incomplete, already final, or has invalid state                         | No          |
| `COLLECTION_ALREADY_BATCHED`      |  409 | COD collection already belongs to an active deposit batch                                    | No          |
| `LEDGER_RECONCILIATION_REQUIRED`  |  423 | Settlement/payment operation is blocked by unresolved ledger discrepancy                     | No          |

## 7. Shipping, warehouse, and courier

| Code                            | HTTP | Meaning / client action                                                  | Retryable |
| ------------------------------- | ---: | ------------------------------------------------------------------------ | --------- |
| `SHIPMENT_NOT_FOUND`            |  404 | Shipment is absent or outside caller scope                               | No        |
| `SHIPMENT_NOT_READY`            |  409 | Shipment/package has unmet fulfillment prerequisites                     | No        |
| `INVALID_SHIPMENT_STATE`        |  409 | Requested shipment transition is not allowed                             | No        |
| `SHIPPING_PROVIDER_UNAVAILABLE` |  503 | Selected courier integration is temporarily unavailable                  | Yes       |
| `COURIER_UNAVAILABLE`           |  503 | No configured courier can quote/accept requested service now             | Yes       |
| `COURIER_NOT_ASSIGNED`          |  403 | Courier actor is not assigned to the stop/shipment                       | No        |
| `PICK_TASK_NOT_FOUND`           |  404 | Pick task is absent or outside warehouse scope                           | No        |
| `PACK_TASK_NOT_FOUND`           |  404 | Pack task is absent or outside warehouse scope                           | No        |
| `INBOUND_NOT_FOUND`             |  404 | ASN/inbound record is absent or outside scope                            | No        |
| `WAREHOUSE_SCOPE_REQUIRED`      |  403 | Staff principal lacks an active warehouse scope                          | No        |
| `LOCATION_NOT_FOUND`            |  404 | Warehouse location is absent/inactive                                    | No        |
| `LOCATION_MISMATCH`             |  409 | Scanned location does not match task expectation                         | No        |
| `LOCATION_CAPACITY_EXCEEDED`    |  409 | Putaway location cannot accept requested stock                           | No        |
| `BARCODE_MISMATCH`              |  409 | Scanned item barcode does not match expected SKU/task                    | No        |
| `ITEM_NOT_RECEIVED`             |  409 | Putaway requested before inbound receipt/acceptance                      | No        |
| `ITEMS_NOT_VERIFIED`            |  409 | Package cannot complete until all expected items are scanned             | No        |
| `PACKAGE_DATA_REQUIRED`         |  422 | Weight, dimensions, packaging, serial or item verification is incomplete | No        |
| `PACKAGE_MISMATCH`              |  409 | Package scan is not part of selected manifest/shipment                   | No        |
| `MANIFEST_NOT_FOUND`            |  404 | Manifest is absent or outside warehouse scope                            | No        |
| `INVALID_MANIFEST_STATE`        |  409 | Manifest cannot perform requested handoff transition                     | No        |
| `STOP_NOT_FOUND`                |  404 | Courier stop is absent or outside assignment scope                       | No        |
| `PROOF_OF_DELIVERY_REQUIRED`    |  422 | Configured OTP/signature/photo/recipient evidence is missing             | No        |
| `DELIVERY_REASON_INVALID`       |  422 | Failure/reschedule reason is not allowed for current state               | No        |
| `TRACKING_TOKEN_INVALID`        |  404 | Public tracking token is malformed, expired, revoked, or unknown         | No        |
| `TRACKING_NOT_FOUND`            |  404 | No customer-safe tracking projection exists                              | No        |
| `TRACKING_REFERENCE_INVALID`    |  422 | Customer return tracking reference fails provider/format validation      | No        |

## 8. Seller onboarding, compliance, and enforcement

| Code                            | HTTP | Meaning / client action                                                                    | Retryable   |
| ------------------------------- | ---: | ------------------------------------------------------------------------------------------ | ----------- |
| `SELLER_NOT_FOUND`              |  404 | Seller is absent or hidden from caller                                                     | No          |
| `SELLER_NOT_ACTIVE`             |  403 | Seller is not approved/active for requested operation                                      | No          |
| `SELLER_RESTRICTED`             |  403 | Seller has category/product/account restriction                                            | No          |
| `SELLER_APPLICATION_EXISTS`     |  409 | User already has an active application/membership                                          | No          |
| `SELLER_APPLICATION_INCOMPLETE` |  422 | Required business, representative, document, bank, warehouse or agreement input is missing | No          |
| `INVALID_SELLER_STATE`          |  409 | Onboarding/enforcement transition is not allowed                                           | No          |
| `DOCUMENT_TYPE_INVALID`         |  422 | Seller/return/support document type is not allowed in this workflow                        | No          |
| `DOCUMENT_NOT_READY`            |  409 | Document is generating, quarantined, unscanned, expired, or unavailable                    | Conditional |
| `AGREEMENT_NOT_ACCEPTED`        |  422 | Current seller/customer contractual version was not accepted                               | No          |
| `AGREEMENT_VERSION_INVALID`     |  422 | Agreement version is unknown/inactive                                                      | No          |
| `OPEN_ENFORCEMENT_CASE`         |  423 | Reactivation/action is blocked by unresolved enforcement                                   | No          |

## 9. Returns, reviews, support, and files

| Code                        | HTTP | Meaning / client action                                             | Retryable   |
| --------------------------- | ---: | ------------------------------------------------------------------- | ----------- |
| `RETURN_NOT_FOUND`          |  404 | Return/RMA is absent or outside caller scope                        | No          |
| `RETURN_NOT_ELIGIBLE`       |  422 | Policy evaluation denies return; safe reason codes in details       | No          |
| `RETURN_WINDOW_EXPIRED`     |  422 | Configured return window ended                                      | No          |
| `RETURN_QUANTITY_EXCEEDED`  |  409 | Requested cumulative return exceeds delivered eligible quantity     | No          |
| `RETURN_ALREADY_OPEN`       |  409 | Equivalent item quantity already has active return                  | No          |
| `RETURN_NOT_RECEIVED`       |  409 | Inspection attempted before controlled receipt                      | No          |
| `ITEM_NOT_DELIVERED`        |  409 | Return/review requires a delivered item                             | No          |
| `INVALID_RETURN_STATE`      |  409 | Requested return transition is not allowed                          | No          |
| `INVALID_DISPOSITION`       |  422 | Inspection outcome is not an allowed disposition                    | No          |
| `SERIAL_MISMATCH`           |  409 | Returned serial/IMEI differs from sold unit; route to investigation | No          |
| `EVIDENCE_REQUIRED`         |  422 | Policy requires valid photo/video/document evidence                 | No          |
| `FILE_TYPE_NOT_ALLOWED`     |  415 | Detected MIME/content type is prohibited for workflow               | No          |
| `FILE_TOO_LARGE`            |  413 | File exceeds configured limit                                       | No          |
| `ATTACHMENT_NOT_READY`      |  409 | Attachment has not completed upload/scan                            | Conditional |
| `REVIEW_NOT_FOUND`          |  404 | Review is absent/not visible                                        | No          |
| `REVIEW_NOT_ELIGIBLE`       |  422 | Customer lacks eligible verified purchase or policy window          | No          |
| `REVIEW_ALREADY_EXISTS`     |  409 | Policy permits only one review for this purchase/product            | No          |
| `OWN_REVIEW_VOTE_FORBIDDEN` |  422 | Author cannot vote on own review                                    | No          |
| `REPORT_ALREADY_EXISTS`     |  409 | Same actor already has active report for target                     | No          |
| `TICKET_NOT_FOUND`          |  404 | Support ticket is absent or outside caller scope                    | No          |
| `TICKET_CLOSED`             |  409 | Closed ticket no longer accepts messages; open new permitted ticket | No          |
| `TICKET_RATE_LIMITED`       |  429 | Support creation/reply abuse threshold reached                      | Yes         |
| `INVALID_TICKET_STATE`      |  409 | Requested ticket transition is not allowed                          | No          |
| `AGENT_NOT_ELIGIBLE`        |  422 | Assignee lacks queue/role/scope eligibility                         | No          |
| `NOTIFICATION_NOT_FOUND`    |  404 | In-app notification is absent or not owned by caller                | No          |

## 10. Promotion, CMS, configuration, reporting, fraud, and finance

| Code                            | HTTP | Meaning / client action                                                            | Retryable |
| ------------------------------- | ---: | ---------------------------------------------------------------------------------- | --------- |
| `PROMOTION_NOT_FOUND`           |  404 | Promotion is absent or outside scope                                               | No        |
| `PROMOTION_RULE_INVALID`        |  422 | Eligibility/reward/limit rule fails schema/business validation                     | No        |
| `PROMOTION_SCHEDULE_INVALID`    |  422 | Promotion dates/times are missing, inverted, or overlap prohibited version         | No        |
| `PROMOTION_ALREADY_STARTED`     |  409 | Requested field is immutable after activation; create a new version                | No        |
| `STACKING_RULE_INVALID`         |  422 | Promotion priority/stack group creates invalid combination                         | No        |
| `CONTENT_SCHEMA_INVALID`        |  422 | CMS component does not match type schema                                           | No        |
| `CONTENT_SCHEDULE_INVALID`      |  422 | CMS publication range/audience/locale is invalid                                   | No        |
| `CONTENT_INCOMPLETE`            |  422 | Required locale/content/asset is missing                                           | No        |
| `CONTENT_REFERENCE_NOT_VISIBLE` |  409 | Referenced category/product/brand is not publishable                               | No        |
| `CONFIGURATION_KEY_UNKNOWN`     |  404 | Configuration key has no registered typed schema                                   | No        |
| `CONFIGURATION_VALUE_INVALID`   |  422 | Value fails key schema or safe range                                               | No        |
| `FEATURE_FLAG_NOT_FOUND`        |  404 | Feature flag key is unknown                                                        | No        |
| `ROLLOUT_RULE_INVALID`          |  422 | Feature rollout targeting/percentage is invalid                                    | No        |
| `FRAUD_CASE_NOT_FOUND`          |  404 | Fraud/trust case is absent or outside permission scope                             | No        |
| `INVALID_CASE_STATE`            |  409 | Case transition is not permitted                                                   | No        |
| `DISPUTE_ALREADY_OPEN`          |  409 | Equivalent seller/finance dispute is active                                        | No        |
| `DISPUTE_WINDOW_EXPIRED`        |  422 | Configured dispute submission window ended                                         | No        |
| `SETTLEMENT_NOT_FOUND`          |  404 | Settlement is absent or outside seller/admin scope                                 | No        |
| `SETTLEMENT_PERIOD_INVALID`     |  422 | Settlement range/cutoff is invalid or already generated                            | No        |
| `SETTLEMENT_NOT_APPROVABLE`     |  409 | Settlement is incomplete, unreconciled, or wrong state                             | No        |
| `SETTLEMENT_NOT_PAYABLE`        |  409 | Settlement lacks approval/verified account or is already paid/in progress          | No        |
| `PAYOUT_ACCOUNT_NOT_VERIFIED`   |  422 | Seller payout account has not passed required verification                         | No        |
| `EXPORT_NOT_AUTHORIZED`         |  403 | Caller lacks report/field export permission                                        | No        |
| `REPORT_FILTER_INVALID`         |  422 | Report filters are unsupported/inconsistent                                        | No        |
| `INVALID_DATE_RANGE`            |  422 | Start/end dates are inverted, unsupported, or outside the operation's allowed span | No        |
| `REPORT_RANGE_TOO_LARGE`        |  422 | Requested period/row scope exceeds configured export limit                         | No        |
| `REPORT_NOT_FOUND`              |  404 | Report job is absent or outside requester scope                                    | No        |
| `EXPORT_EXPIRED`                |  410 | Generated download passed retention window; request a new export                   | No        |

## 11. Localization and disclosure rules

1. The server maps every error code to approved Arabic, French, and optional English message keys. Provider text is never passed through directly to customers.
2. Field errors use stable field paths and reason codes; values containing phone, email, address, token, document, payment, or evidence data are redacted.
3. `401` login/recovery errors do not reveal whether a phone/email exists.
4. Ownership failures may return `404` rather than `403` to prevent identifier enumeration.
5. COD/fraud errors expose a safe decision category and next step, while detailed signals remain restricted to authorized risk staff and audit records.
6. Payment errors never include PAN, CVV, PIN, authentication payload, full provider response, or secrets.
7. Operational logs attach internal exception class and stack only in protected telemetry, correlated by `correlationId`; the API envelope stays stable.

## 12. Error governance

- Adding a code requires owner module, HTTP mapping, Arabic/French copy, retry policy, alert class, metrics tag, OpenAPI entry, client fallback, and tests.
- Existing code meaning cannot be repurposed. A materially different condition receives a new code.
- Error code metrics are bounded-cardinality; raw IDs are trace attributes/log fields, not metric labels.
- Contract tests verify every API-inventory code exists in this catalog and every catalog code used by an endpoint has a deterministic status/message key.
