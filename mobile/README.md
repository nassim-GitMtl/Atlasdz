# atlas dz — Android app (shop and seller mode)

Native Android app built with Expo (React Native, SDK 58). The same code can later produce the
iPhone app. One app, two modes: customers shop, and a seller who signs in gets the seller
workspace (Seller Center stays available in the browser; staff keep the staff console).

**Customer:** home (search, categories, sort, recently viewed), product and offers (favorite,
quantity, share, ratings and reviews, similar products, seller's shop page with its rating),
favorites, cart without an account (kept on the phone; the email is asked at checkout, which
creates the account and emails a link to choose a password), pre-orders (badge, estimated
delivery window, accepted at checkout),
checkout (saved addresses, wilaya → commune,
delivery contact), order summary with cash-on-delivery terms, orders, order detail (timeline,
cancel, confirm receipt, reorder, help request, rate the delivered items), help requests with
replies, notifications,
account (email and phone confirmation, saved addresses, connected devices, language, legal
pages, sign out, delete account), seller sign-up.

**Seller:** dashboard (orders to accept, prepare and ship, delivered sales and a 14-day chart,
low-stock alerts, average rating), orders (search by name, phone or number; accept or reject,
prepare, ship with carrier and tracking number, delivered or failed delivery, call the customer,
customer reliability, share the delivery slip with the courier), catalogue (new product sent for review, photo from the camera
or gallery, offers with price and stock, pre-order with estimated window and origin), delivery zones (wilaya and commune rates), reviews
(average, public replies), customer requests, notifications, store account. Seller accounts sign in with an authenticator code, as
in Seller Center. The app remembers the mode: restarting it reopens the seller dashboard.

French and Arabic; Arabic phones get a right-to-left layout.

The app talks to the same API as the shop website. In production the shop domain forwards the
API paths the app uses, customer and seller (`infra/release/vps/Caddyfile`), so one address is
enough:

| Variable               | Meaning                                                   |
| ---------------------- | --------------------------------------------------------- |
| `EXPO_PUBLIC_SHOP_URL` | Shop website, e.g. `https://atlasdz.duckdns.org`          |
| `EXPO_PUBLIC_API_URL`  | Only for local development, when the API has its own port |

API types are imported (type-only) from `packages/contracts`, so the app and API stay in sync.

## Commands

Expo needs Node 22, 24 or 26. On this Mac (Node 25) prefix commands with a Node 24 runtime, e.g.
`npx -y -p node@24 -c "npm test"`, and run npm inside `mobile/` only.

```sh
npm install
npm test            # unit tests (API client, formats, contact checks, French/Arabic texts)
npm run typecheck
npm run lint
```

## Test on your Mac

Start the local API and shop first (from the repo root, two terminals):

```sh
cd apps/api && ATLAS_LOCAL_ACCOUNTS=true ATLAS_LOCAL_CHECKOUT=true \
  node --env-file=../../.env.local dist/local-main.js
cd apps/customer-web && APP_ENV=local ATLAS_LOCAL_ACCOUNTS=true ATLAS_LOCAL_CHECKOUT=true \
  CATALOG_API_BASE_URL=http://127.0.0.1:3003 node tools/start.mjs
```

**iPhone Simulator** (Xcode is enough; the same code as the Android app):

```sh
cd mobile
npx -y -p node@24 -c "EXPO_PUBLIC_API_URL=http://127.0.0.1:3003 EXPO_PUBLIC_SHOP_URL=http://127.0.0.1:3001 npx expo start --ios"
```

**Android emulator** (real Android): install Android Studio (`brew install --cask android-studio`),
run its setup wizard, create a Pixel device in Device Manager and start it. The emulator reaches
the Mac at `10.0.2.2`:

```sh
cd mobile
npx -y -p node@24 -c "EXPO_PUBLIC_API_URL=http://10.0.2.2:3003 EXPO_PUBLIC_SHOP_URL=http://10.0.2.2:3001 npx expo start --android"
```

In the terminal: `r` reloads, `i` / `a` reopens the simulator / emulator. In the simulator,
Cmd+D opens the Expo menu.

To place a test order: Compte → Se connecter → **Compte de démonstration (local)** (shown in
development builds only; locally, orders are limited to this demo customer), then
« Friteuse sans huile 5 L » from Maison Plus, Panier → Commander, Wilaya « Destinations de
test », Commune « Destination fictive A ». The demo sign-in works only from the same Mac
(simulator or emulator), not from a phone on the Wi-Fi.

Seller mode: Compte → Se connecter → **Vendeur de démonstration (local)** opens the dashboard of
the local demo seller (Maison Plus). Its orders, catalogue and delivery zones are synthetic;
« Se déconnecter » returns to the shop.

## Try it on your Android phone (Expo Go)

1. Install **Expo Go** from the Play Store. Phone and Mac on the same Wi-Fi.
2. Start the local stack so the phone can reach it (replace `192.168.1.20` with your Mac's IP,
   shown in System Settings → Wi-Fi → Details):

   ```sh
   # API (apps/api), reachable from the Wi-Fi
   ATLAS_LOCAL_ACCOUNTS=true ATLAS_LOCAL_CHECKOUT=true ATLAS_LOCAL_HOST=0.0.0.0 \
     node --env-file=../../.env.local dist/local-main.js
   # Shop website (apps/customer-web) for images
   ATLAS_WEB_HOST=0.0.0.0 APP_ENV=local ATLAS_LOCAL_ACCOUNTS=true ATLAS_LOCAL_CHECKOUT=true \
     CATALOG_API_BASE_URL=http://127.0.0.1:3003 node tools/start.mjs
   ```

3. In `mobile/`:

   ```sh
   EXPO_PUBLIC_API_URL=http://192.168.1.20:3003 EXPO_PUBLIC_SHOP_URL=http://192.168.1.20:3001 npx expo start
   ```

4. Scan the QR code with Expo Go.

Against the deployed server instead, set only `EXPO_PUBLIC_SHOP_URL=https://<your shop domain>`.
Locally, orders can only be placed by the local demo customer; real accounts order once
`ATLAS_LIVE_CHECKOUT=true` on the server. Changing the language inside Expo Go changes the text
but not the layout direction (Expo Go limitation); the installed app restarts and flips it.

## Build an installable APK, then the Play Store version

Builds run in the cloud with EAS (free Expo account; no Android Studio needed).

1. In `eas.json`, replace `https://your-shop-domain.example` with your shop domain.
2. `npx eas-cli@latest login`, then `npx eas-cli@latest build -p android --profile preview`.
   The result is an APK link you can install on any Android phone.
3. For Google Play: `npx eas-cli@latest build -p android --profile production` (AAB), then upload
   it in the Play Console. Change `android.package` in `app.json` (`dz.atlasdz.app`) first if you
   want another identifier: it can never change after the first Play Store release.
