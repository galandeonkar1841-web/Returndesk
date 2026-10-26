// Black-box check of the five business rules against a running server.
// Usage: npm run dev (in one terminal), then npm run check:rules
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let failures = 0;

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { status: res.status, json };
}

function expect(name: string, actual: { status: number; json: any }, status: number, code?: string) {
  const okStatus = actual.status === status;
  const okCode = code === undefined || actual.json?.error?.code === code;
  if (okStatus && okCode) {
    console.log(`  ok    ${name}  (${actual.status}${code ? " " + code : ""})`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}: expected ${status} ${code ?? ""}, got ${actual.status} ${JSON.stringify(actual.json)}`);
  }
}

const unique = Date.now().toString(36);
const base = (item: string) => ({
  customerName: "Rule Tester",
  customerEmail: "tester@example.com",
  orderRef: `TEST-${unique}`,
  itemRef: item,
  quantity: 1,
  reason: "damaged",
});

async function main() {
  console.log("Rule 1: status flow");
  const a = await call("POST", "/api/requests", base("A"));
  expect("create", a, 201);
  const id = a.json.data.id;
  expect("reference is generated", { status: /^RD-\d{6}$/.test(a.json.data.reference) ? 201 : 0, json: null }, 201);
  expect("open -> completed refused", await call("POST", `/api/requests/${id}/transition`, { to: "completed" }), 409, "ILLEGAL_TRANSITION");
  expect("open -> rejected refused", await call("POST", `/api/requests/${id}/transition`, { to: "rejected" }), 409, "ILLEGAL_TRANSITION");
  expect("open -> in_review", await call("POST", `/api/requests/${id}/transition`, { to: "in_review" }), 200);

  console.log("Rule 2: approval needs a resolution");
  expect("approve without resolution", await call("POST", `/api/requests/${id}/transition`, { to: "approved" }), 422, "VALIDATION_ERROR");
  expect("refund without amount", await call("POST", `/api/requests/${id}/transition`, { to: "approved", resolution: "refund" }), 422, "VALIDATION_ERROR");
  expect("refund amount zero", await call("POST", `/api/requests/${id}/transition`, { to: "approved", resolution: "refund", refundAmount: 0 }), 422, "VALIDATION_ERROR");
  expect("replacement with amount", await call("POST", `/api/requests/${id}/transition`, { to: "approved", resolution: "replacement", refundAmount: 10 }), 422, "VALIDATION_ERROR");
  expect("approve with refund 499.50", await call("POST", `/api/requests/${id}/transition`, { to: "approved", resolution: "refund", refundAmount: 499.5 }), 200);

  console.log("Rule 4: locked once decided");
  expect("edit approved refused", await call("PATCH", `/api/requests/${id}`, { customerName: "Changed" }), 409, "REQUEST_LOCKED");
  expect("note on approved allowed", await call("POST", `/api/requests/${id}/notes`, { body: "Still can write notes" }), 201);
  expect("remove approved refused", await call("DELETE", `/api/requests/${id}`), 409, "NOT_REMOVABLE");
  expect("approved -> completed", await call("POST", `/api/requests/${id}/transition`, { to: "completed" }), 200);
  expect("completed is final", await call("POST", `/api/requests/${id}/transition`, { to: "in_review" }), 409, "ILLEGAL_TRANSITION");

  console.log("Rule 3: one live request per item");
  const b = await call("POST", "/api/requests", base("B"));
  expect("create B", b, 201);
  expect("duplicate live refused", await call("POST", "/api/requests", base("B")), 409, "DUPLICATE_LIVE_REQUEST");
  const done = await call("POST", "/api/requests", base("A"));
  expect("same item allowed after completion", done, 201);

  console.log("Rule 5: removal");
  expect("remove open", await call("DELETE", `/api/requests/${b.json.data.id}`), 204);
  expect("removed is not fetchable", await call("GET", `/api/requests/${b.json.data.id}`), 404, "NOT_FOUND");
  expect("item slot freed after removal", await call("POST", "/api/requests", base("B")), 201);

  console.log("Errors and edge cases");
  expect("bad json", await fetch(`${BASE}/api/requests`, { method: "POST", body: "{nope" }).then(async (r) => ({ status: r.status, json: await r.json() })), 400, "BAD_REQUEST");
  expect("invalid body", await call("POST", "/api/requests", { customerName: "" }), 422, "VALIDATION_ERROR");
  expect("non numeric id", await call("GET", "/api/requests/abc"), 400, "BAD_REQUEST");
  expect("missing id", await call("GET", "/api/requests/99999999"), 404, "NOT_FOUND");
  expect("unknown api path is JSON", await call("GET", "/api/nope"), 404, "NOT_FOUND");
  expect("bad sort refused", await call("GET", "/api/requests?sort=password"), 422, "VALIDATION_ERROR");

  console.log("List: search + filter + sort + paging together");
  const list = await call("GET", "/api/requests?q=ORD-50&status=approved&sort=customer_name&order=asc&page=2&pageSize=2");
  expect("combined list query", list, 200);
  console.log(`        meta: ${JSON.stringify(list.json?.meta)}`);

  console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
