# FLOW Smart Journey — jury walkthrough

Target: Green Mobility + NetRom purposeful integration; Living Labs evidence only after actual tests.
Suggested duration about four minutes; rehearse rather than claiming a measured pitch duration.

## Prepare

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
NODE_ENV=production pnpm -F backend start
```

Use a real HTTPS deployment for phone GPS. Set backend `ORS_API_KEY` securely and restart. Confirm ORS
walking/cycling/driving directions and matrices, OpenFreeMap access and API connectivity before judges
arrive. Never place the key in `VITE_`, a URL, a screenshot or a committed file. A Git push alone does not
deploy a site or configure these services. Public deployment is not verified in this cloud session.

## Live sequence when routing is provisioned

1. Open Explore; search **Piața Victoriei** (actual local dataset). Explain the position precision shown.
2. Choose **Locația mea** with consent or **Alege pe hartă** at a public point in Timișoara. The example
   [21.207,45.7503] is a geographic point, not an assertion of an already verified route.
3. Review computed journeys. Choose **Cea mai rapidă** or the car card. Point out the specific parking,
   drive → parking → final walk, time on routes and unknown parking-search overhead.
4. Open **Detalii parcare**: availability is unconfirmed; tariff is orientative for the chosen stay/time,
   or unknown. Payment stays in Timpark/CityApp. Tap **Pe jos** in the timeline to emphasize the actual foot
   geometry. On mobile the sheet contracts so the route remains visible; it can be expanded again.
5. Choose **Mai ecologică** or **Vezi alternativa** when an actual practical active option exists.
   The map, summary and timeline use the same selected journey; preference changes reuse computed routes.
6. Tap **Pornește această călătorie**. Existing Motion opens in walking/cycling mode. No GPS recording or
   reward starts from the route choice. An actual eligible session is a separate explicit action.
7. Show the wallet unchanged by route selection. For a short visual reward presentation, use the explicitly
   isolated Motion **DEMO**; its coins never enter the real prototype wallet.
8. Briefly show Data Trust and FLOW City public coverage. Its parking allocation simulation is labelled;
   do not describe it as measured traffic reduction, adoption or actual participant activity.

The car navigation link targets the selected parking from the chosen preview origin. GPS Start uses
actual current position. The final walking route remains in the planner; automatic car-to-foot navigation
is a future stage, so do not promise an automatic phase switch.

## When external providers are unavailable

Show the real unavailable state and actual municipal parking data. Explain that full active geometry
requires ORS. Do not draw an approximate route or present a synthetic result as a real provider response.

For engineering evidence, run:

```bash
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright \
JOURNEY_TEST_OUTPUT=/tmp/vlaiq-smart-journey \
node scripts/test-smart-journey-browser.cjs
```

The script first checks the actual missing-provider state, then intercepts the complete endpoint with
**SYNTHETIC TEST FIXTURES**. Screenshots are stamped accordingly. It is a repeatable interaction test,
not a live geographic demonstration, resident interview or physical ride.

Before presentation, verify the public URL on two real phones. Do not claim this step was completed by
the browser automation. See [usability protocol](user-testing/flow-smart-journey.md) for consent and feedback.
