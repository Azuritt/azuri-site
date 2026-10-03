# Azuri website setup

The storefront runs on GitHub Pages. Orders and stock use Supabase. Until the database connection is configured, visitors can browse and build a bag, but cannot submit orders. No payments are processed by this site.

1. Create a project at https://supabase.com/dashboard.
2. Run `database.sql` in the SQL editor of a **new** project. It creates the catalogue, stock, orders, and access rules. Initial stock is zero; enter actual quantities before opening orders. Existing website prices remain TT$500.
3. In Authentication, create your admin user with email and password. Disable public email signups if you do not need them.
4. In the SQL editor, run the following using your admin user's actual email:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"azuri_admin":true}'::jsonb
where email = 'YOUR_ADMIN_EMAIL';
```

5. Put the project URL and **public legacy anon key** from Project Settings → API into `config.js`. Never use a service-role or secret key. The project URL and anon key are intended to be public; the database policies protect customer records.
6. Open `admin.html`, sign in, and enter actual stock by colour and size. Set prices as desired.
7. In GitHub Settings → Pages, publish the root of `main` if it is not already enabled.
8. Test a single order request. It must appear as Pending and reserve stock. Mark it Paid only after confirming payment. Cancel the test order to restore stock. Test using a separate browser/device as well.

## Operation

- Website: `index.html`; dashboard: `admin.html`.
- Pending and Paid orders reserve stock. Cancelling returns stock once. Reopening checks stock again.
- Dashboard revenue counts Paid merchandise subtotals only. Delivery charges are arranged separately and not included in the totals.
- Prices and stock come from the database. The order function recalculates all prices and locks stock in a transaction, rather than trusting the browser.
- Customer records are available only to accounts carrying the admin role in protected app metadata.
- Admin sessions last until token expiry. Sign in again when expired. Sign out on shared devices.
- Refresh the dashboard for new orders and changed stock.
- The old browser-only cart and dashboard data are not imported as real orders.

## Before accepting public orders

Verify prices, stock, contact details, garment specifications, delivery arrangements, and returns wording. The public order function currently supports anonymous order requests; add CAPTCHA/rate limiting through an Edge Function before a high-traffic launch to limit bogus requests and stock reservations. Pending reservations do not expire automatically, so review and cancel abandoned requests. Set up regular database backups according to your Supabase plan.

Card payments, email notifications, courier integration, and automated reservation expiry are not enabled. This is an order-request workflow, with payment and delivery confirmed manually.

For local preview run `python3 -m http.server 8000` in the repository and open http://localhost:8000.
