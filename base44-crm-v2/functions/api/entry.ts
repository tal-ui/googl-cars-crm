/**
 * api — v2 machine endpoint. HARDENED replacement for the legacy `api` function,
 * which was the single worst finding: full CRUD + DELETE + full backup over EVERY
 * entity behind one static x-api-key, reused by openclawWebhook (audit I-104).
 *
 * v2 changes:
 *  - Per-consumer keys (this endpoint uses API_KEY_INTEGRATIONS ONLY; openclaw
 *    has its own API_KEY_OPENCLAW). One leak no longer = total blast radius.
 *  - A default-DENY allowlist maps key → {entity → methods}. Anything not listed
 *    is rejected.
 *  - DELETE and full-backup are NOT reachable here (backup moved to a separate
 *    admin-authenticated function).
 *  - Fail closed if the key env is unset; generic errors; structured logs.
 *
 * Base44 SDK access is via createClientFromRequest at runtime; kept behind a thin
 * interface so the allowlist logic is unit-testable.
 */
import { withHandler } from "../_shared/withHandler.ts";
import { json, logLine } from "../_shared/http.ts";
import { verifyApiKey } from "../_shared/verify.ts";

/** Default-deny capability map. Extend deliberately, per integration need. */
export const INTEGRATION_SCOPES: Record<string, ("read" | "create" | "update")[]> = {
  Car: ["read", "update"],
  Customer: ["read", "create", "update"],
  Order: ["read", "create"],
  Payment: ["read", "create"],
  CustomerInteraction: ["read", "create"],
  VehicleCatalog: ["read"],
};

const METHOD_TO_OP: Record<string, "read" | "create" | "update"> = {
  GET: "read",
  POST: "create",
  PATCH: "update",
  PUT: "update",
};

export function isAllowed(entity: string, method: string): boolean {
  const op = METHOD_TO_OP[method];
  if (!op) return false; // DELETE and anything else → denied here
  return (INTEGRATION_SCOPES[entity] ?? []).includes(op);
}

export default withHandler("api", async ({ req, origin, requestId, url }) => {
  if (!verifyApiKey(req, "API_KEY_INTEGRATIONS")) {
    return json({ error: "unauthorized", request_id: requestId }, 401, origin);
  }

  // Path shape: /api/:entity[/:id]
  const parts = url.pathname.split("/").filter(Boolean);
  const entity = parts[1];
  const id = parts[2];
  if (!entity || !isAllowed(entity, req.method)) {
    logLine({ fn: "api", request_id: requestId, denied: `${req.method} ${entity ?? "?"}` });
    return json({ error: "forbidden", request_id: requestId }, 403, origin);
  }

  // Runtime SDK wiring (Base44). Imported lazily so tests can exercise isAllowed.
  const { createClientFromRequest } = await import("@base44/sdk");
  const base44 = createClientFromRequest(req);
  const model = base44.asServiceRole.entities[entity];

  if (req.method === "GET") {
    const data = id ? await model.get(id) : await model.list("-created_date", 100);
    return json({ data, request_id: requestId }, 200, origin);
  }
  const body = await req.json();
  if (req.method === "POST") {
    return json({ data: await model.create(body), request_id: requestId }, 201, origin);
  }
  // PATCH/PUT
  if (!id) return json({ error: "id required", request_id: requestId }, 400, origin);
  return json({ data: await model.update(id, body), request_id: requestId }, 200, origin);
});
