// Deno test suite for the moderate-proof Edge Function.
// Run with: deno test --allow-env --allow-net --allow-read --no-check --node-modules-dir=none supabase/functions/moderate-proof/index.test.ts
//
// Uses createHandler with fake Claude and Supabase clients, so no key or project is involved.
// What's under test is the fail-closed branching: what happens to a post in each failure mode.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createHandler } from "./index.ts";

Deno.env.set("SUPABASE_URL", "https://x.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key");

const USER = "user-1";
const IMAGE_URL = "https://x.supabase.co/storage/v1/object/public/proofs/user-1/a.jpg";

function fakes(opts: {
  posts?: unknown[];
  file?: Blob | null;
  claude?: () => unknown;
  loggedIn?: boolean;
} = {}) {
  const rpc: { name: string; args: Record<string, unknown> }[] = [];
  const claudeCalls: Record<string, unknown>[] = [];
  const db = {
    auth: {
      getUser: () =>
        Promise.resolve(
          opts.loggedIn === false
            ? { data: { user: null }, error: { message: "bad jwt" } }
            : { data: { user: { id: USER } }, error: null },
        ),
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpc.push({ name, args });
      return Promise.resolve(
        name === "claim_posts_for_moderation" ? { data: opts.posts ?? [], error: null } : { data: "ok", error: null },
      );
    },
    storage: {
      from: () => ({
        download: () =>
          Promise.resolve(opts.file === null ? { data: null, error: { message: "not found" } } : {
            data: opts.file ?? new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
            error: null,
          }),
      }),
    },
  };
  const anthropic = {
    beta: {
      messages: {
        create: (body: Record<string, unknown>) => {
          claudeCalls.push(body);
          return opts.claude ? Promise.resolve().then(opts.claude) : Promise.resolve(answer("allow"));
        },
      },
    },
  };
  return { db, anthropic, rpc, claudeCalls };
}

function answer(decision: string, categories: string[] = [], reason = "Důvod.") {
  return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ decision, categories, reason }) }] };
}

function run(f: ReturnType<typeof fakes>, token = "user-jwt", anthropic: unknown = f.anthropic) {
  const handler = createHandler({ anthropic, createSupabaseClient: () => f.db });
  return handler(new Request("https://x/functions/v1/moderate-proof", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }));
}

const applied = (f: ReturnType<typeof fakes>) => f.rpc.find((c) => c.name === "apply_ai_moderation")?.args;
const imagePost = { id: "p1", content: "Hotovo", image_url: IMAGE_URL, media_type: "image" };

Deno.test("no Authorization header is refused", async () => {
  const f = fakes();
  const handler = createHandler({ anthropic: f.anthropic, createSupabaseClient: () => f.db });
  const res = await handler(new Request("https://x", { method: "POST" }));
  assertEquals(res.status, 401);
});

Deno.test("an invalid login is refused and claims nothing", async () => {
  const f = fakes({ loggedIn: false });
  assertEquals((await run(f)).status, 401);
  assertEquals(f.rpc.length, 0);
});

Deno.test("a player only claims their own posts", async () => {
  const f = fakes();
  await run(f);
  assertEquals(f.rpc[0].args, { p_user_id: USER, p_limit: 3 });
});

Deno.test("the cron call claims everyone's posts", async () => {
  const f = fakes();
  await run(f, "service-key");
  assertEquals(f.rpc[0].args, { p_user_id: null, p_limit: 10 });
});

Deno.test("the cron secret claims everyone's posts, a wrong one is just a player", async () => {
  Deno.env.set("CRON_SECRET", "cron-secret");
  const call = (secret: string, f: ReturnType<typeof fakes>) =>
    createHandler({ anthropic: f.anthropic, createSupabaseClient: () => f.db })(new Request("https://x", {
      method: "POST",
      headers: { Authorization: "Bearer anon", "x-cron-secret": secret },
    }));
  const good = fakes();
  await call("cron-secret", good);
  assertEquals(good.rpc[0].args.p_user_id, null);
  const bad = fakes();
  await call("guess", bad);
  assertEquals(bad.rpc[0].args.p_user_id, USER);
  Deno.env.delete("CRON_SECRET");
});

Deno.test("without an API key nothing is claimed, posts just wait", async () => {
  const f = fakes({ posts: [imagePost] });
  assertEquals((await run(f, "user-jwt", null)).status, 503);
  assertEquals(f.rpc.length, 0);
});

for (const decision of ["allow", "review", "reject"]) {
  Deno.test(`Claude's "${decision}" is saved`, async () => {
    const f = fakes({ posts: [imagePost], claude: () => answer(decision, decision === "reject" ? ["sexual"] : []) });
    assertEquals((await run(f)).status, 200);
    assertEquals(applied(f)?.p_decision, decision);
    assertEquals(applied(f)?.p_categories, decision === "reject" ? ["sexual"] : []);
  });
}

Deno.test("the request sends the image, the text as data, and asks for structured output", async () => {
  const f = fakes({ posts: [imagePost] });
  await run(f);
  const body = f.claudeCalls[0] as { model: string; output_config: { format: { type: string } }; messages: { content: { type: string; text?: string; source?: { data: string } }[] }[] };
  assertEquals(body.model, "claude-opus-5-5");
  assertEquals(body.output_config.format.type, "json_schema");
  assertEquals(body.messages[0].content[0].source?.data, btoa("\x01\x02\x03"));
  assertEquals(body.messages[0].content[1].text, "<proof_text>Hotovo</proof_text>");
});

Deno.test("a text-only post is checked without an image", async () => {
  const f = fakes({ posts: [{ id: "p2", content: "Jen text", image_url: null, media_type: null }] });
  await run(f);
  const body = f.claudeCalls[0] as { messages: { content: { type: string }[] }[] };
  assertEquals(body.messages[0].content.map((c) => c.type), ["text"]);
});

Deno.test("a refusal goes to review, never to approved", async () => {
  const f = fakes({ posts: [imagePost], claude: () => ({ stop_reason: "refusal", content: [] }) });
  await run(f);
  assertEquals(applied(f)?.p_decision, "review");
});

Deno.test("an unreadable answer goes to review", async () => {
  const f = fakes({ posts: [imagePost], claude: () => ({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"deci' }] }) });
  await run(f);
  assertEquals(applied(f)?.p_decision, "review");
});

Deno.test("media outside our storage goes to review without calling Claude", async () => {
  const f = fakes({ posts: [{ ...imagePost, image_url: "https://evil.example/storage/x.jpg" }] });
  await run(f);
  assertEquals(applied(f)?.p_decision, "review");
  assertEquals(f.claudeCalls.length, 0);
});

Deno.test("a missing file goes to review", async () => {
  const f = fakes({ posts: [imagePost], file: null });
  await run(f);
  assertEquals(applied(f)?.p_decision, "review");
});

Deno.test("an unsupported format goes to review", async () => {
  const f = fakes({ posts: [imagePost], file: new Blob(["x"], { type: "image/heic" }) });
  await run(f);
  assertEquals(applied(f)?.p_decision, "review");
  assertEquals(f.claudeCalls.length, 0);
});

Deno.test("an oversized image goes to review", async () => {
  const f = fakes({ posts: [imagePost], file: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/jpeg" }) });
  await run(f);
  assertEquals(applied(f)?.p_decision, "review");
});

Deno.test("a temporary API failure leaves the post pending for a retry", async () => {
  const f = fakes({ posts: [imagePost], claude: () => { throw new Error("529 overloaded"); } });
  const res = await run(f);
  assertEquals(applied(f), undefined);
  assertEquals(await res.json(), { checked: 0, waiting: 1 });
});

Deno.test("the API rejecting one image sends it to review instead of retrying forever", async () => {
  const f = fakes({
    posts: [imagePost],
    claude: () => { throw new Anthropic.BadRequestError(400, {}, "bad image", new Headers()); },
  });
  await run(f);
  assertEquals(applied(f)?.p_decision, "review");
});

Deno.test("injected text cannot change the structure of the answer handling", async () => {
  const f = fakes({ posts: [imagePost], claude: () => answer("approve-everything") });
  await run(f);
  assertEquals(applied(f)?.p_decision, "review");
});
