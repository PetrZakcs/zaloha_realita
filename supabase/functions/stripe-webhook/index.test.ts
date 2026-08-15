// Deno test suite for the stripe-webhook Edge Function (TD-11 in the tech-debt backlog).
// Run with: deno test --allow-env supabase/functions/stripe-webhook/index.test.ts
//
// Uses createHandler(fakeStripe, fakeCreateClient) — see index.ts — so this never touches a
// real Stripe secret, a real webhook signature, or a real Supabase project. What's under test
// is the branching logic: signature/payload validation, SUBSCRIPTION vs DEPOSIT_TEST handling,
// and which DB writes happen (or don't) for each case.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createHandler } from "./index.ts";

// Records every .from(table) call and lets each test script canned responses per table/method
// without needing a real Supabase client — same intent as the Jest chainable-stub mocks used
// elsewhere in this repo (src/App.test.js, src/store/slices/authSlice.test.js), just hand-rolled
// since Deno's std lib doesn't ship a jest-style mocking API.
function makeFakeSupabase(responses: Record<string, unknown>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];

  function chain(table: string) {
    const record = (method: string, args: unknown[]) => calls.push({ table, method, args });
    return {
      update(fields: unknown) {
        record("update", [fields]);
        return {
          eq(col: string, val: unknown) {
            record("eq", [col, val]);
            return {
              select(cols: string) {
                record("select", [cols]);
                return {
                  single: () =>
                    Promise.resolve(
                      (responses[`${table}.update`] as { data: unknown; error: unknown }) ?? {
                        data: null,
                        error: null,
                      }
                    ),
                };
              },
            };
          },
        };
      },
      insert(row: unknown) {
        record("insert", [row]);
        return Promise.resolve(
          (responses[`${table}.insert`] as { error: unknown }) ?? { error: null }
        );
      },
    };
  }

  return {
    calls,
    client: { from: (table: string) => chain(table) },
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
    type: "checkout.session.completed",
    data: {
      object: {
        client_reference_id: "user-123",
        mode: "subscription",
        amount_total: 49900,
        payment_intent: "pi_123",
        ...overrides,
      },
    },
  };
}

function req(body = "{}", signature: string | null = "t=1,v1=fake") {
  const headers = new Headers();
  if (signature) headers.set("Stripe-Signature", signature);
  return new Request("https://example.com/stripe-webhook", { method: "POST", body, headers });
}

Deno.test("missing Stripe-Signature header -> 400, verification never attempted", async () => {
  const { client } = makeFakeSupabase({});
  const handler = createHandler(fakeStripe(checkoutEvent()), () => client as never);

  const res = await handler(req("{}", null));

  assertEquals(res.status, 400);
});

Deno.test("invalid signature -> 400, no DB writes", async () => {
  const { calls, client } = makeFakeSupabase({});
  const handler = createHandler(
    fakeStripe(checkoutEvent(), new Error("signature mismatch")),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 400);
  assertEquals(calls.length, 0);
});

Deno.test("missing client_reference_id -> 200, no DB writes", async () => {
  const { calls, client } = makeFakeSupabase({});
  const handler = createHandler(
    fakeStripe(checkoutEvent({ client_reference_id: null })),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 200);
  assertEquals(calls.length, 0);
});

Deno.test("subscription checkout -> grants pass_holder, logs SUBSCRIPTION payment, posts Founder status", async () => {
  const { calls, client } = makeFakeSupabase({
    "profiles.update": { data: { display_name: "TestPlayer" }, error: null },
  });
  const handler = createHandler(
    fakeStripe(checkoutEvent({ mode: "subscription" })),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 200);

  const profileUpdate = calls.find((c) => c.table === "profiles" && c.method === "update");
  assertEquals(profileUpdate?.args[0], { pass_holder: true });

  const paymentInsert = calls.find((c) => c.table === "payments" && c.method === "insert");
  assertEquals((paymentInsert?.args[0] as { type: string }).type, "SUBSCRIPTION");

  const feedInsert = calls.find((c) => c.table === "feed_posts" && c.method === "insert");
  assertEquals((feedInsert?.args[0] as { user_name: string }).user_name, "TestPlayer");
});

// This is the exact regression the DEPOSIT_TEST/SUBSCRIPTION split in index.ts was written to
// prevent (see the comment above `isSubscription` in index.ts) — a deposit checkout used to
// silently grant full Founder Pass access the same as a real subscription.
Deno.test("DEPOSIT_TEST checkout (mode != subscription) -> does NOT grant pass_holder, logs DEPOSIT_TEST payment, no status post", async () => {
  const { calls, client } = makeFakeSupabase({});
  const handler = createHandler(
    fakeStripe(checkoutEvent({ mode: "payment", amount_total: 4900 })),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 200);
  assertEquals(
    calls.some((c) => c.table === "profiles" && c.method === "update"),
    false
  );

  const paymentInsert = calls.find((c) => c.table === "payments" && c.method === "insert");
  assertEquals((paymentInsert?.args[0] as { type: string }).type, "DEPOSIT_TEST");
  assertEquals((paymentInsert?.args[0] as { amount_czk: number }).amount_czk, 49);

  assertEquals(
    calls.some((c) => c.table === "feed_posts"),
    false
  );
});

Deno.test("profiles update fails -> 500, no payment/feed writes attempted", async () => {
  const { calls, client } = makeFakeSupabase({
    "profiles.update": { data: null, error: { message: "db down" } },
  });
  const handler = createHandler(
    fakeStripe(checkoutEvent({ mode: "subscription" })),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 500);
  assertEquals(
    calls.some((c) => c.table === "payments" || c.table === "feed_posts"),
    false
  );
});

Deno.test("unrelated event type -> 200, no DB writes", async () => {
  const { calls, client } = makeFakeSupabase({});
  const handler = createHandler(
    fakeStripe({ type: "payment_intent.created", data: { object: {} } }),
    () => client as never
  );

  const res = await handler(req());

  assertEquals(res.status, 200);
  assertEquals(calls.length, 0);
});
