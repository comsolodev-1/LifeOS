// Usage: BASE_URL=http://localhost:3000 node scripts/smoke.mjs
const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const get = (path) => fetch(base + path, { redirect: "manual" });

for (const path of ["/", "/tasks", "/calendar", "/ai", "/projects", "/goals", "/reality-check", "/profile", "/settings", "/setup", "/more", "/tasks/3f2b8c1e-5d7a-4b9e-8c21-0a1b2c3d4e5f", "/projects/3f2b8c1e-5d7a-4b9e-8c21-0a1b2c3d4e5f"]) {
  await check(`${path} redirects to /login when signed out`, async () => {
    const res = await get(path);
    assert([302, 307].includes(res.status), `status ${res.status}`);
    assert((res.headers.get("location") ?? "").includes("/login"), "no redirect to /login");
  });
}

await check("/login is public and renders", async () => {
  const res = await get("/login");
  assert(res.status === 200, `status ${res.status}`);
  assert((await res.text()).includes("LIFEOS"), "missing title");
});

await check("/api/health responds and leaks no values", async () => {
  const res = await get("/api/health");
  assert([200, 503].includes(res.status), `status ${res.status}`);
  const body = await res.json();
  assert(["ok", "degraded"].includes(body.status), "bad status field");
  for (const v of Object.values(body.config)) assert(typeof v === "boolean", "config must be booleans only");
});

await check("manifest is valid for PWA install", async () => {
  const res = await get("/manifest.webmanifest");
  assert(res.status === 200, `status ${res.status}`);
  const m = await res.json();
  assert(m.display === "standalone" && m.start_url === "/" && m.icons?.length > 0, "incomplete manifest");
});

await check("security headers present", async () => {
  const res = await get("/login");
  assert(res.headers.get("x-content-type-options") === "nosniff", "nosniff");
  assert(res.headers.get("x-frame-options") === "DENY", "frame options");
  assert(!res.headers.get("x-powered-by"), "x-powered-by exposed");
});

await check("unknown route returns 404 or redirect, not 500", async () => {
  const res = await get("/does-not-exist");
  assert(res.status < 500, `status ${res.status}`);
});

await check("signed-out session endpoint returns no session", async () => {
  const res = await get("/api/auth/session");
  assert(res.status === 200, `status ${res.status}`);
  const body = await res.json();
  assert(body === null || Object.keys(body).length === 0, "unexpected session when signed out");
});

console.log(failed ? `\n${failed} check(s) failed` : "\nAll smoke checks passed");
process.exit(failed ? 1 : 0);
