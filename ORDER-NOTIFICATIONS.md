# Azuri order notifications

The order-push Supabase Edge Function handles administrator device enrollment, test pushes, and queued order delivery. The browser uses order-notifications.js and azuri-order-sw.js. There is no offline cache of customer or admin data.

## Device setup

Open https://azuri.fit/admin.html, sign in, and choose Enable on this device in Overview. Accept the browser prompt, then choose Send test notification. On iPhone/iPad, first use Safari Share > Add to Home Screen and open the installed Azuri Orders app. Repeat setup separately for each device. Sound follows operating-system notification, Focus and browser settings. Turning off alerts or signing out unsubscribes the current device.

## Backend

Deployed project: txxmviiyposodzbzsken; function: order-push. verify_jwt is false because dispatch uses a server-only shared secret. Every administrator request validates its bearer token via Auth /user and checks current app_metadata.azuri_admin === true. Public callers cannot register subscriptions or access device tables/configuration RPCs.

push-notifications-setup.sql is the already-applied, one-time schema setup. Do not blindly reapply it. Signing keys and worker secret are encrypted in Supabase Vault with names azuri_push_public_key, azuri_push_private_key and azuri_push_worker_secret. Do not rotate the public/private pair without re-enrolling devices. Never commit private keys or worker secrets.

An orders INSERT queues one delivery per registered administrator device in the same transaction. A pg_net wakeup sends after commit. The azuri-order-push-retry Cron job checks once per minute. Atomic SKIP LOCKED claims prevent concurrent dispatch of the same job. Temporary failures retry up to six attempts, within 24 hours; 404/410 subscriptions are removed. Revoked admins are excluded. Order notifications use a stable tag/topic to reduce duplicate alerts after ambiguous network outcomes; exactly-once push delivery is not guaranteed.

The lock-screen payload contains only order reference, merchandise total and unit count. Orders are requests, not proof of payment. Names, addresses, email and phone numbers stay in the authenticated dashboard. Push delivery is independent of confirmation email delivery and payment setup.

## Verification

Run npm ci && npm test inside supabase/functions/order-push with Node 24+. Tests cover endpoint allowlisting, auth failures, key isolation, encryption, retries, expired subscriptions and cancelled orders. Live database rollback checks covered order-trigger enqueue, claim exclusion and lease recovery without saving a fake order or sending customer email. Server invocation and anonymous denial were checked against the deployed function.

Actual browser permission, phone/desktop notification display, sound and tap-to-order behavior require a real subscribed device and must be checked using the dashboard test button. A test accepted by the push provider does not prove the device displayed it. Browser visual QA was unavailable in the execution environment.
