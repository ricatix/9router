"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components";
import WebhookForm from "./WebhookForm";

async function request(path, signal, method = "GET", body) {
  const response = await fetch(`/api/webhooks${path}`, {
    signal, method, cache: "no-store",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) throw new Error("Session expired. Sign in, then retry; your form is still here.");
    if (response.status === 409) throw new Error("Destination changed elsewhere or the 20-destination limit was reached. Refresh destinations and retry without losing your form.");
    if (response.status === 429) throw new Error("The delivery queue is full. Wait, check delivery status and retry.");
    const fields = [...new Set((data.errors || []).map((entry) => entry.field))]
      .filter((field) => ["name", "kind", "url", "events", "cooldownSeconds", "headers", "signingSecret", "allowPrivateNetwork"].includes(field));
    throw new Error(fields.length ? `Check ${fields.join(", ")} and retry. Values were not saved.` : "Request failed. Check your connection and retry.");
  }
  return data;
}

function time(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function WebhooksClient() {
  const [destinations, setDestinations] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deliveryError, setDeliveryError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(undefined);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const actionController = useRef(null);
  const errorRef = useRef(null);
  const addRef = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; actionController.current?.abort(); };
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    request("", controller.signal).then((data) => {
      if (!controller.signal.aborted) { setDestinations(data.destinations); setLoadError(""); }
    }).catch((failure) => {
      if (!controller.signal.aborted) setLoadError(failure.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    let timer;
    let controller;
    let stopped = false;
    async function poll() {
      if (stopped || document.visibilityState !== "visible") return;
      controller = new AbortController();
      const signal = controller.signal;
      try {
        const data = await request("/deliveries?limit=20", signal);
        if (!stopped && !signal.aborted) { setDeliveries(data.deliveries); setHealth(data.health); setDeliveryError(""); }
      } catch (failure) {
        if (!stopped && !signal.aborted) setDeliveryError(failure.message);
      } finally {
        if (!stopped && !signal.aborted) timer = setTimeout(poll, 5000);
      }
    }
    function visibility() {
      clearTimeout(timer);
      controller?.abort();
      if (document.visibilityState === "visible") poll();
    }
    poll();
    document.addEventListener("visibilitychange", visibility);
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", visibility); };
  }, [refreshKey]);

  const closeForm = useCallback(() => { setEditing(undefined); setError(""); addRef.current?.focus(); }, []);
  async function mutate(path, method, body, success) {
    if (actionController.current) return;
    const controller = new AbortController();
    actionController.current = controller;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(path, controller.signal, method, body);
      if (mounted.current && !controller.signal.aborted) { success(data); setRefreshKey((value) => value + 1); }
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted) setError(failure.message);
    } finally {
      actionController.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 text-text-main">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">Webhooks</h1><p className="mt-1 text-sm text-text-muted">Send selected operational alerts to Discord, Slack or Generic JSON destinations.</p></div>
        <Button ref={addRef} disabled={busy || editing !== undefined} onClick={() => { setEditing(null); setError(""); setDeleting(null); }}>Add destination</Button>
      </header>
      <p className="rounded-lg border border-border bg-surface-2 p-4 text-sm">If dashboard login is disabled, anyone who can reach this dashboard can manage webhook targets and send tests. This includes other users on your LAN when exposed there. Enable login in Settings before sharing access.</p>
      <div role="status" className="break-words text-sm">{notice}</div>
      {error && <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-lg border border-red-500 p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{error}</div>}
      {editing !== undefined && <WebhookForm key={editing?.id || "new"} destination={editing} busy={busy}
        onCancel={closeForm} onSave={(input) => mutate(editing ? `/${encodeURIComponent(editing.id)}` : "", editing ? "PATCH" : "POST", input, () => { closeForm(); setNotice("Destination saved."); })} />}
      <section aria-labelledby="destinations-title" className="space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><h2 id="destinations-title" className="text-lg font-semibold">Destinations</h2><Button variant="ghost" disabled={loading || busy} onClick={() => setRefreshKey((value) => value + 1)}>Refresh destinations</Button></div>
        {loading && <p role="status">Loading destinations…</p>}
        {loadError && <p role="alert">{loadError} <Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>Retry loading</Button></p>}
        {!loading && !loadError && destinations.length === 0 && <p className="py-6 text-text-muted">No destinations yet. Add one to receive alerts. Only final request failures are selected by default.</p>}
        <ul className="divide-y divide-border">
          {destinations.map((destination) => <li key={destination.id} className="py-4 space-y-2">
            <div className="flex flex-wrap justify-between gap-3">
              <div className="min-w-0"><h3 className="font-semibold break-words">{destination.name}</h3><p className="text-sm break-all">{destination.kind} · {destination.enabled ? "Enabled" : "Disabled"} · {destination.url?.scheme}://{destination.url?.host || "Not configured"}</p><p className="text-sm text-text-muted break-words">{destination.events.join(", ")} · Cooldown {destination.cooldownSeconds}s{destination.allowPrivateNetwork ? " · Private network allowed" : " · Public HTTPS only"}</p></div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy || editing !== undefined} aria-label={`Edit ${destination.name}`} onClick={() => { setEditing(destination); setDeleting(null); setError(""); }}>Edit</Button>
                <Button variant="secondary" disabled={busy || editing !== undefined} aria-label={`Send saved synthetic test to ${destination.name}`} onClick={() => mutate(`/${encodeURIComponent(destination.id)}/test`, "POST", {}, (data) => setNotice(`Synthetic test queued: ${data.deliveryId}. Queued does not mean delivered; check the table below.`))}>Send test</Button>
                <Button variant="ghost" disabled={busy || editing !== undefined} aria-label={`Delete ${destination.name}`} onClick={() => { setDeleting(destination); setError(""); }}>Delete</Button>
              </div>
            </div>
            {!destination.enabled && <p className="text-sm text-text-muted">Operational alerts are disabled. Send test explicitly queues one synthetic delivery to this saved destination.</p>}
          </li>)}
        </ul>
        {deleting && <div className="border border-border rounded-lg p-4 space-y-3">
          <p>Delete <strong>{deleting.name}</strong>? Queued deliveries will be cancelled; already sent messages cannot be recalled.</p>
          <div className="flex flex-wrap gap-2"><Button variant="danger" disabled={busy} onClick={() => mutate(`/${encodeURIComponent(deleting.id)}`, "DELETE", { expectedRevision: deleting.revision }, () => { setDeleting(null); setNotice("Destination deleted."); addRef.current?.focus(); })}>Confirm delete</Button><Button variant="secondary" disabled={busy} onClick={() => { setDeleting(null); addRef.current?.focus(); }}>Keep destination</Button></div>
        </div>}
      </section>
      <section aria-labelledby="deliveries-title" className="space-y-3">
        <h2 id="deliveries-title" className="text-lg font-semibold">Latest deliveries</h2>
        <p className="text-sm text-text-muted">Latest 20; refreshes every 5 seconds while this page is visible. Tests use saved credentials, including for disabled destinations.</p>
        {health?.degraded?.enqueueFailures > 0 && <p role="alert" className="border border-border rounded-lg p-3">Delivery service degraded: {health.degraded.enqueueFailures} enqueue failures since process start. Some alerts could not be queued. Last class: {health.degraded.lastErrorClass || "unknown"}. Check server storage and queue capacity.</p>}
        {health && <p className="text-sm">Queue: {health.queue.pending} pending · {health.queue.inflight} in flight · {health.queue.retry} retrying · {health.queue.failed} failed</p>}
        {deliveryError && <p role="alert">Status may be stale. {deliveryError} <Button variant="secondary" onClick={() => setRefreshKey((value) => value + 1)}>Retry status</Button></p>}
        {!health && !deliveryError && <p role="status">Loading delivery status…</p>}
        {health && deliveries.length === 0 && <p className="text-text-muted">No deliveries recorded.</p>}
        {deliveries.length > 0 && <div className="overflow-x-auto rounded-lg border border-border" role="region" aria-label="Latest webhook deliveries" tabIndex={0}>
          <table className="w-full text-left text-sm"><caption className="sr-only">Latest webhook delivery status, including synthetic tests</caption>
            <thead className="bg-surface-2"><tr>{["Destination / delivery", "Event / kind", "Status", "Attempts", "Last result", "Created / next retry"].map((heading) => <th key={heading} scope="col" className="p-3 whitespace-nowrap">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{deliveries.map((delivery) => <tr key={delivery.id}>
              <td className="p-3"><span className="block break-words">{destinations.find((item) => item.id === delivery.destinationId)?.name || "Deleted destination"}</span><span className="block text-xs text-text-muted break-all">{delivery.id}</span></td>
              <td className="p-3">{delivery.type}<span className="block text-text-muted">{delivery.deliveryKind}</span></td><td className="p-3">{delivery.status}</td><td className="p-3 tabular-nums">{delivery.attempts}</td>
              <td className="p-3">{delivery.lastStatus || "—"}<span className="block">{delivery.lastErrorClass || "—"}</span></td><td className="p-3 whitespace-nowrap">{time(delivery.createdAt)}<span className="block text-text-muted">{delivery.status === "retry" ? time(delivery.nextAttemptAt) : "—"}</span></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </section>
    </div>
  );
}
