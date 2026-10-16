import { logoImage, blackElanImage } from "./email-assets.ts";
const isBlackElan = (item: Record<string, unknown>) => {
  const name = String(item.product_name || "Elan").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return String(item.color).trim().toLowerCase() === "black" && /^elan(?:\s+i|\s+1)?$/i.test(name);
};
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character];
  });

const productLabel = (item: Record<string, unknown>) => {
  const name = String(item.product_name || "Élan").trim();
  return /^(?:élan|elan)(?:\s+i|\s+1)?$/i.test(name) ? "Élan" : name;
};

const money = (value: unknown) =>
  "TT$" + Number(value).toFixed(2);

Deno.serve(async (request: Request) => {
  const env = (name: string) => Deno.env.get(name) || "";
  const secret = env("ORDER_EMAIL_WEBHOOK_SECRET");

  if (
    !secret ||
    request.headers.get("x-order-email-secret") !== secret
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const event = await request.json();

    if (
      event.type !== "INSERT" ||
      event.schema !== "public" ||
      event.table !== "orders"
    ) {
      return new Response("Unsupported event", { status: 400 });
    }

    const id = event.record?.id;

    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      return new Response("Invalid order", { status: 400 });
    }

    const url = env("SUPABASE_URL").replace(/\/$/, "");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !serviceKey) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      );
    }

    // Log database errors without logging credentials or order data.
    const databaseError = async (
      response: Response,
      action: string,
    ) => {
      let details = "";

      try {
        const body = await response.json();
        details = [
          body.code,
          body.message,
          body.hint,
        ].filter(Boolean).join(" — ");
      } catch {
        details = response.statusText || "No error details available";
      }

      return new Error(
        `${action} (${response.status}): ${details}`,
      );
    };

    const databaseHeaders = {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      "Content-Type": "application/json",
    };

    const orderUrl =
      url + "/rest/v1/orders?id=eq." + encodeURIComponent(id);

    const response = await fetch(orderUrl + "&select=*", {
      headers: databaseHeaders,
    });

    if (!response.ok) {
      throw await databaseError(response, "Order lookup failed");
    }

    const [order] = await response.json();

    if (!order) {
      return new Response("Order not found", { status: 404 });
    }

    if (order.confirmation_email_sent_at) {
      return new Response("Already sent", { status: 200 });
    }

    if (order.status === "Cancelled") {
      return new Response("Cancelled order skipped", { status: 200 });
    }

    const apiKey = env("RESEND_API_KEY");
    const from = env("ORDER_EMAIL_FROM");

    if (!apiKey || !from) {
      throw new Error("Email sender is not configured");
    }

    if (!order.customer?.email || !Array.isArray(order.items)) {
      throw new Error("Order is missing customer email or items");
    }

    const items = order.items.map(
      (item: Record<string, unknown>) =>
        `${item.qty} × ${productLabel(item)} · ` +
        `${item.color} · Size ${item.size} — ` +
        money(Number(item.price) * Number(item.qty)),
    );

    const message =
      "Your order request has been received. " +
      "No payment has been taken. " +
      "Azuri will contact you to confirm payment and delivery.";

    const text = [
      "AZURI",
      "For the quietly ambitious.",
      "",
      `Thank you, ${order.customer.firstName}.`,
      message,
      "",
      `Order reference: ${id}`,
      ...items,
      "",
      `Merchandise subtotal: ${money(order.total)}`,
      "Delivery charges are confirmed separately.",
      "",
      "Delivery address:",
      order.customer.address,
      `${order.customer.city}, Trinidad & Tobago`,
      "",
      "Questions? Reply to azuriclothingtt@gmail.com.",
      "Crafted for what lasts.",
    ].join("\n");

    const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><style>:root{color-scheme:light dark;supported-color-schemes:light dark}body{margin:0;padding:0;background-color:#f4eee3;color:#472c1e;-webkit-text-size-adjust:100%}table{border-collapse:collapse}img{border:0;outline:none;text-decoration:none}.email-card{color:#472c1e}.email-brand,.email-brand p,.email-brand a{color:#f4eee3}.email-reference{word-break:break-all;overflow-wrap:anywhere}@media(prefers-color-scheme:dark){body,.email-outer{background-color:#1d1815!important;background-image:none!important}.email-card{background-color:#29211c!important;background-image:none!important;border-color:#665448!important}.email-card td,.email-card p,.email-card h1,.email-card a{color:#f2e9df!important;border-color:#665448!important}.email-delivery{background-color:#352a23!important;background-image:none!important}.email-card .email-muted{color:#cdbdaf!important}.email-brand{background-color:#472c1e!important;background-image:none!important}.email-card .email-brand p,.email-card .email-brand a{color:#f4eee3!important}}[data-ogsc] body,[data-ogsc] .email-outer{background-color:#1d1815!important;background-image:none!important}[data-ogsc] .email-card{background-color:#29211c!important;background-image:none!important;border-color:#665448!important}[data-ogsc] .email-card td,[data-ogsc] .email-card p,[data-ogsc] .email-card h1,[data-ogsc] .email-card a{color:#f2e9df!important;border-color:#665448!important}[data-ogsc] .email-delivery{background-color:#352a23!important;background-image:none!important}[data-ogsc] .email-card .email-muted{color:#cdbdaf!important}[data-ogsc] .email-brand{background-color:#472c1e!important;background-image:none!important}[data-ogsc] .email-card .email-brand p,[data-ogsc] .email-card .email-brand a{color:#f4eee3!important}@media only screen and (max-width:600px){.email-shell{padding:12px 8px!important}.email-header{padding:18px 20px 16px!important}.email-header-logo{width:140px!important;max-width:100%!important;height:auto!important}.email-header-tagline{margin:8px 0 0!important;font-size:8px!important;line-height:1.4!important;letter-spacing:1.5px!important}.email-content{padding-left:20px!important;padding-right:20px!important}.email-delivery-content{padding:18px!important}.email-heading{font-size:28px!important;line-height:1.2!important}.email-total{font-size:22px!important;white-space:nowrap!important}}</style></head>
<body style="margin:0;background:#f4eee3;color:#472c1e;">
<div style="display:none;max-height:0;overflow:hidden;">Your Azuri order request has been received. Crafted for what lasts.</div>
<table class="email-outer" bgcolor="#f4eee3" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4eee3;"><tr><td class="email-shell" align="center" style="padding:28px 12px;">
<table class="email-card" bgcolor="#faf6ed" role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#faf6ed;color:#472c1e;border:1px solid #ded3c3;">
<tr><td class="email-brand email-header" bgcolor="#472c1e" align="center" style="padding:30px 28px 24px;border-bottom:1px solid #ded3c3;background:#472c1e;color:#f4eee3;">
<a href="https://azuri.fit"><img class="email-header-logo" src="cid:azuri-logo" alt="Azuri" width="190" style="display:block;width:190px;max-width:100%;height:auto;border:0;"></a>
<p class="email-header-tagline" style="color:#f4eee3;margin:14px 0 0;font:9px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;">For the quietly ambitious.</p>
</td></tr>
<tr><td class="email-content" style="padding:32px 28px;">
<p class="email-muted" style="margin:0 0 14px;font:10px Arial,sans-serif;letter-spacing:2px;color:#76614e;">YOUR ORDER REQUEST</p>
<h1 class="email-heading" style="color:#472c1e;margin:0 0 18px;font:normal 30px/1.25 Georgia,serif;">A considered choice.<br>Made to last.</h1>
<p style="margin:0 0 10px;font:14px/1.8 Arial,sans-serif;">Thank you, ${escapeHtml(order.customer.firstName)}.</p>
<p class="email-muted" style="margin:0;font:14px/1.8 Arial,sans-serif;color:#756451;">We have received your order request. Azuri will be in touch to confirm payment and delivery arrangements.</p>
</td></tr>
<tr><td class="email-content" style="padding:0 28px;">
<p style="margin:0;padding:20px 0;border-top:1px solid #d9cbbb;font:10px Arial,sans-serif;letter-spacing:2px;">ORDER SUMMARY</p>
${order.items.map((item: Record<string, unknown>) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 0 24px;border-bottom:1px solid #ded3c3;">
${isBlackElan(item) ? '<img src="cid:elan-black" alt="Black Élan polo" width="440" style="display:block;width:100%;max-width:440px;height:auto;margin:0 auto 22px;border:0;">' : ""}
<p style="margin:0 0 10px;font:normal 23px Georgia,serif;">${escapeHtml(productLabel(item))}</p>
<p class="email-muted" style="margin:0 0 8px;font:13px/1.7 Arial,sans-serif;color:#756451;">${escapeHtml(item.color)} &nbsp; / &nbsp; Size ${escapeHtml(item.size)}</p>
<p class="email-muted" style="margin:0;font:12px/1.7 Arial,sans-serif;color:#76614e;">Quantity ${escapeHtml(item.qty)}</p>
</td></tr></table>`).join("")}
</td></tr>
<tr><td class="email-content" style="padding:26px 28px;">
<table class="email-delivery" bgcolor="#efe7da" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe7da;"><tr><td class="email-delivery-content" style="padding:22px;color:#472c1e;">
<p style="margin:0 0 12px;font:10px Arial,sans-serif;letter-spacing:2px;">DELIVERY INFORMATION</p>
<p style="margin:0;font:13px/1.8 Arial,sans-serif;">${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}<br>${escapeHtml(order.customer.address)}<br>${escapeHtml(order.customer.city)}<br>Trinidad &amp; Tobago</p>
<p class="email-muted" style="margin:14px 0 0;font:11px/1.7 Arial,sans-serif;color:#756451;">Delivery arrangements and charges will be confirmed with you.</p>
</td></tr></table></td></tr>
<tr><td class="email-content" style="padding:0 28px 28px;">
<p style="margin:0;padding:20px 0;border-top:1px solid #d9cbbb;font:10px Arial,sans-serif;letter-spacing:2px;">TOTALS</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${order.items.map((item: Record<string, unknown>) => `<tr><td class="email-muted" style="padding:0 0 12px;font:12px/1.7 Arial,sans-serif;color:#756451;">${escapeHtml(item.qty)} × ${escapeHtml(productLabel(item))} · ${escapeHtml(item.color)}</td><td align="right" style="padding:0 0 12px 10px;font:13px Arial,sans-serif;white-space:nowrap;">${money(Number(item.price) * Number(item.qty))}</td></tr>`).join("")}
<tr><td style="padding:16px 0;border-top:1px solid #ded3c3;font:13px Arial,sans-serif;">Merchandise subtotal</td><td class="email-total" align="right" style="padding:16px 0;border-top:1px solid #ded3c3;font:normal 24px Georgia,serif;white-space:nowrap;">${money(order.total)}</td></tr>
<tr><td class="email-muted" style="font:12px Arial,sans-serif;color:#76614e;">Delivery</td><td class="email-muted" align="right" style="font:12px Arial,sans-serif;color:#76614e;">To be confirmed</td></tr></table>
<p class="email-muted" style="margin:18px 0 0;font:11px/1.7 Arial,sans-serif;color:#76614e;">No payment has been taken. Your final total will be confirmed once delivery charges are agreed.</p>
<p class="email-muted email-reference" style="margin:24px 0 0;font:10px/1.8 Arial,sans-serif;color:#76614e;overflow-wrap:anywhere;">ORDER REFERENCE<br>${escapeHtml(id)}</p>
</td></tr>
<tr><td class="email-brand" bgcolor="#472c1e" align="center" style="padding:26px;background:#472c1e;color:#f4eee3;">
<p style="margin:0 0 14px;font:italic 20px Georgia,serif;">Crafted for what lasts.</p>
<p style="margin:0;font:12px/1.8 Arial,sans-serif;">A question about your order? Simply reply to this email.</p>
<p style="margin:16px 0 0;font:10px Arial,sans-serif;letter-spacing:1px;"><a href="https://azuri.fit" style="color:#f4eee3;text-decoration:none;">AZURI.FIT</a> &nbsp; · &nbsp; TRINIDAD &amp; TOBAGO</p>
</td></tr></table></td></tr></table></body></html>
    `;

    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": "azuri-order-confirmation-" + id,
      },
      body: JSON.stringify({
        from,
        to: [order.customer.email],
        reply_to: "azuriclothingtt@gmail.com",
        subject: "Azuri — Your order request has been received",
        html,
        text,
        attachments: [
          { filename: "azuri-logo.png", content: logoImage, content_id: "azuri-logo" },
          ...(order.items.some(isBlackElan) ? [{ filename: "elan-black.jpeg", content: blackElanImage, content_id: "elan-black" }] : []),
        ],
      }),
    });

    if (!sent.ok) {
      throw new Error(
        "Email provider rejected request: " + sent.status,
      );
    }

    const result = await sent.json();

    if (!result.id) {
      throw new Error("Email provider returned no email ID");
    }

    const saved = await fetch(orderUrl, {
      method: "PATCH",
      headers: databaseHeaders,
      body: JSON.stringify({
        confirmation_email_sent_at: new Date().toISOString(),
        confirmation_email_id: result.id,
      }),
    });

    if (!saved.ok) {
      throw await databaseError(
        saved,
        "Email sent but receipt state could not be saved",
      );
    }

    return new Response("Confirmation sent", { status: 200 });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Confirmation failed",
    );

    return new Response(
      "Confirmation failed; inspect function logs",
      { status: 500 },
    );
  }
});