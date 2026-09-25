// Deno test suite for the stripe-webhook Edge Function (TD-11 in the tech-debt backlog).
// Run with: deno test --allow-env --no-check supabase/functions/stripe-webhook/index.test.ts
//
// Uses createHandler(fakeStripe, fakeCreateClient) — see index.ts — so this never touches a
// real Stripe secret, a real webhook signature, or a real Supabase project. What's under test
// is the branching logic: signature validation, idempotency, which checkouts grant the Pass,
// subscription cancellation, and which DB writes happen (or don't) for each case.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createHandler } from "./index.ts";

type Response = { data?: unknown; error: unknown };

// Records every query-builder call and lets each test script canned responses keyed by
// `${table}.${operation}` (operation = the first builder method: insert/update/upsert/delete/
// select). Each builder is awaitable like supabase-js, and .single()/.maybeSingle() resolve
// to the same scripted response. Same intent as the Jest chainable-stub mocks used elsewhere
// in this repo, hand-rolled since Deno's std lib doesn't ship a jest-style mocking API.
function makeFakeSupabase(responses: Record<string, Response> = {}) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];

  function builder(table: string) {
    let operation: string | null = null;
    const resolve = () =>
      Promise.resolve(responses[`${table}.${operation}`] ?? { data: null, error: null });

    const b: Record<string, unknown> = {};
    for (const method of ["insert", "update", "upsert", "delete", "select", "eq", "in"]) {
      b[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (operation === null) operation = method;
        return b;
      };
    }
    b.single = resolve;
    b.maybeSingle = resolve;
    b.then = (onFulfilled: (v: Response) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected);
    return b;
  }

  return {
    calls,
    client: { from: (table: string) => builder(table) },
  };
}

function fakeStripe(event: unknown, verifyError: Error | null = null) {
  return {
    webhooks: {
      constructEventAsync: (_body: string, _sig: string, _secret: string) => {
        if (verifyError) return Promise.reject(verifyError);
        return Promise.resolve(event);
      },
    },
  } as unknown as import("https://esm.sh/stripe@12.0.0?target=deno").default;
}

function checkoutEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_checkout_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_123",
        client_reference_id: "user-123",
        mode: "subscription",
        payment_status: "paid",
        metadata: { user_id: "user-123", plan: "monthly" },
        subscription: "sub_123",
        customer: "cus_123",
        amount_total: 14900,
        payment_intent: "pi_123",
        ...overrides,
      },
    },
  };
}

function subscriptionEvent(type: string, status: string) {
  return {
    id: `evt_${type}_1`,
    type,
    data: {
      object: {
        id: "sub_123",
        status,
        customer: "cus_123",
        metadata: { user_id: "user-123", plan: "monthly" },
      },
    },
  };
}

function req(body = "{}", signature: string | null = "t=1,v1=fake") {
  const headers = new Headers();
  if (signature) headers.set("Stripe-Signature", signature);
  return new Request("https://example.com/stripe-webhook", { method: "POST", body, headers });
}

const find = (calls: { table: string; method: string; args: unknown[] }[], table: string, method: string) =>
  calls.find((c) => c.table === table && c.method === method);

Deno.test("missing Stripe-Signature header -> 400, verification never attempted", async () => {
  const { client } = makeFakeSupabase();
  const handler = createHandler(fakeStripe(checkoutEvent()), () => client as never);

  const res = await handler(req("{}", null));

  assertEquals(res.status, 400);
});

Deno.test("invalid signature -> 400, no DB writes", async () => {
  const { calls, client } = makeFakeSupabase();
  const handler = createHandler(
    fakeStripe(checkoutEvent(), new Error("signature mismatch")),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("unrelated event type -> 200, no DB writes", async () => {
  const { calls, client } = makeFakeSupabase();
  const handler = createHandler(
    fakeStripe({ id: "evt_x", type: "payment_intent.created", data: { object: {} } }),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 200);
  assertEquals(calls.length, 0);
});

Deno.test("duplicate event delivery -> 200, no side effects beyond the idempotency claim", async () => {
  const { calls, client } = makeFakeSupabase({
    "stripe_events.insert": { error: { code: "23505", message: "duplicate key" } },
  });
  const handler = createHandler(fakeStripe(checkoutEvent()), () => client as never);

  const res = await handler(req());

  assertEquals(res.status, 200);
  assertEquals(calls.filter((c) => c.table !== "stripe_events").length, 0);
});

Deno.test("missing client_reference_id -> 200, only the event claim is written", async () => {
  const { calls, client } = makeFakeSupabase();
  const handler = createHandler(
    fakeStripe(checkoutEvent({ client_reference_id: null })),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 200);
  assertEquals(calls.filter((c) => c.table !== "stripe_events").length, 0);
});

Deno.test("subscription checkout -> grants pass_holder, records subscription + payment, posts Founder status", async () => {
  const { calls, client } = makeFakeSupabase({
    "profiles.update": { data: { display_name: "TestPlayer" }, error: null },
  });
  const handler = createHandler(fakeStripe(checkoutEvent()), () => client as never);

  const res = await handler(req());

  assertEquals(res.status, 200);
  assertEquals(find(calls, "profiles", "update")?.args[0], { pass_holder: true });

  const subUpsert = find(calls, "subscriptions", "upsert")?.args[0] as Record<string, unknown>;
  assertEquals(subUpsert.stripe_subscription_id, "sub_123");
  assertEquals(subUpsert.user_id, "user-123");

  const paymentInsert = find(calls, "payments", "insert")?.args[0] as { type: string; amount_czk: number };
  assertEquals(paymentInsert.type, "SUBSCRIPTION");
  assertEquals(paymentInsert.amount_czk, 149);

  const feedInsert = find(calls, "feed_posts", "insert")?.args[0] as { user_name: string };
  assertEquals(feedInsert.user_name, "TestPlayer");
});

// This is the exact regression the DEPOSIT_TEST/SUBSCRIPTION split in index.ts was written to
// prevent — a deposit checkout used to silently grant full Founder Pass access the same as a
// real subscription.
Deno.test("DEPOSIT_TEST checkout (mode != subscription) -> does NOT grant pass_holder, logs DEPOSIT_TEST payment, no status post", async () => {
  const { calls, client } = makeFakeSupabase();
  const handler = createHandler(
    fakeStripe(checkoutEvent({
      mode: "payment",
      amount_total: 4900,
      subscription: null,
      metadata: { user_id: "user-123", plan: "deposit" },
    })),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 200);
  assertEquals(find(calls, "profiles", "update"), undefined);

  const paymentInsert = find(calls, "payments", "insert")?.args[0] as { type: string; amount_czk: number };
  assertEquals(paymentInsert.type, "DEPOSIT_TEST");
  assertEquals(paymentInsert.amount_czk, 49);

  assertEquals(calls.some((c) => c.table === "feed_posts"), false);
});

Deno.test("subscription checkout without Founder plan metadata -> does NOT grant pass_holder", async () => {
  const { calls, client } = makeFakeSupabase();
  const handler = createHandler(
    fakeStripe(checkoutEvent({ metadata: {} })),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 200);
  assertEquals(find(calls, "profiles", "update"), undefined);
  assertEquals(find(calls, "subscriptions", "upsert"), undefined);
});

Deno.test("checkout completed but unpaid -> no grant, no payment row", async () => {
  const { calls, client } = makeFakeSupabase();
  const handler = createHandler(
    fakeStripe(checkoutEvent({ payment_status: "unpaid" })),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 200);
  assertEquals(calls.filter((c) => c.table !== "stripe_events").length, 0);
});

Deno.test("profiles update fails -> 500, event claim released, no payment/feed writes", async () => {
  const { calls, client } = makeFakeSupabase({
    "profiles.update": { data: null, error: { message: "db down" } },
  });
  const handler = createHandler(fakeStripe(checkoutEvent()), () => client as never);

  const res = await handler(req());

  assertEquals(res.status, 500);
  assertEquals(calls.some((c) => c.table === "payments" || c.table === "feed_posts"), false);
  assertEquals(find(calls, "stripe_events", "delete") !== undefined, true);
});

Deno.test("subscription deleted, no other live subscription -> revokes pass_holder", async () => {
  const { calls, client } = makeFakeSupabase({
    "subscriptions.select": { data: [], error: null },
  });
  const handler = createHandler(
    fakeStripe(subscriptionEvent("customer.subscription.deleted", "canceled")),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 200);
  const statusUpsert = find(calls, "subscriptions", "upsert")?.args[0] as { status: string };
  assertEquals(statusUpsert.status, "canceled");
  assertEquals(find(calls, "profiles", "update")?.args[0], { pass_holder: false });
});

Deno.test("subscription deleted while another subscription is live -> keeps pass_holder", async () => {
  const { calls, client } = makeFakeSupabase({
    "subscriptions.select": { data: [{ stripe_subscription_id: "sub_new" }], error: null },
  });
  const handler = createHandler(
    fakeStripe(subscriptionEvent("customer.subscription.deleted", "canceled")),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 200);
  assertEquals(find(calls, "profiles", "update")?.args[0], { pass_holder: true });
});
