"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components";

const fieldClass = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";
const events = ["request.failed", "account.unavailable", "token.refresh_failed"];

export default function WebhookForm({ destination, busy, onSave, onCancel }) {
  const firstInput = useRef(null);
  const [form, setForm] = useState({
    name: destination?.name || "", kind: destination?.kind || "discord", url: "",
    enabled: destination?.enabled ?? true, events: destination?.events || ["request.failed"],
    allowPrivateNetwork: destination?.allowPrivateNetwork || false,
    cooldownSeconds: destination?.cooldownSeconds ?? 300, signingSecret: "",
    clearSigningSecret: false, headerMode: "keep", headers: [{ name: "", value: "" }],
  });
  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  useEffect(() => { firstInput.current?.focus(); }, []);

  function submit(event) {
    event.preventDefault();
    const { headerMode, headers, signingSecret, clearSigningSecret, url, ...values } = form;
    const input = { ...values, cooldownSeconds: Number(values.cooldownSeconds) };
    if (url) input.url = url;
    if (values.kind === "generic") {
      if (signingSecret) input.signingSecret = signingSecret;
      else if (destination && clearSigningSecret) input.clearSigningSecret = true;
      if (headerMode === "replace") input.headers = Object.fromEntries(headers.map((row) => [row.name, row.value]));
      else if (destination && headerMode === "clear") input.clearHeaders = true;
    } else if (destination?.kind === "generic") {
      input.clearHeaders = true;
      input.clearSigningSecret = true;
    }
    if (destination) input.expectedRevision = destination.revision;
    onSave(input);
  }

  return (
    <section aria-labelledby="webhook-form-title" className="border-y border-border py-6">
      <h2 id="webhook-form-title" className="mb-4 text-lg font-semibold">{destination ? "Edit destination" : "Add destination"}</h2>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 block">Name
              <input ref={firstInput} className={fieldClass} required maxLength={80} value={form.name} onChange={(e) => set("name", e.target.value)} />
            </label>
            <label className="space-y-1 block">Kind
              <select className={fieldClass} value={form.kind} onChange={(e) => set("kind", e.target.value)}>
                <option value="discord">Discord</option><option value="slack">Slack</option><option value="generic">Generic JSON</option>
              </select>
            </label>
          </div>
          <label className="space-y-1 block">{destination ? "Replace URL (leave blank to keep)" : "Webhook URL"}
            <input className={fieldClass} type="password" autoComplete="new-password" spellCheck={false} required={!destination} maxLength={2048} value={form.url} onChange={(e) => set("url", e.target.value)} aria-describedby="webhook-url-help" />
          </label>
          <p id="webhook-url-help" className="text-sm text-text-muted">URLs are credentials and are never revealed. Use HTTPS for public destinations. No userinfo or fragments.</p>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />Enabled for operational events</label>
          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium">Events (choose at least one)</legend>
            {events.map((type) => <label key={type} className="flex items-center gap-2"><input type="checkbox" checked={form.events.includes(type)} onChange={(e) => set("events", e.target.checked ? [...form.events, type] : form.events.filter((value) => value !== type))} />{type}{type !== "request.failed" && " (opt-in)"}</label>)}
            <p className="text-sm text-text-muted">request.failed reports the final failure after fallback. Opt-in account and refresh events can be more frequent.</p>
          </fieldset>
          <label className="space-y-1 block">Cooldown (seconds, 0–3600)
            <input className={fieldClass} type="number" min={0} max={3600} step={1} required value={form.cooldownSeconds} onChange={(e) => set("cooldownSeconds", e.target.value)} />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.allowPrivateNetwork} onChange={(e) => set("allowPrivateNetwork", e.target.checked)} aria-describedby="webhook-network-help" />Allow private network and HTTP</label>
          <p id="webhook-network-help" className="text-sm text-text-muted">Opt-in permits HTTP and local/LAN targets, including localhost. HTTP exposes credentials and payloads in transit. Metadata, link-local, unspecified, multicast and broadcast addresses remain blocked; redirects are never followed.</p>
          {form.kind === "generic" && <>
            <label className="space-y-1 block">Replace signing secret (leave blank to keep)
              <input className={fieldClass} type="password" autoComplete="new-password" maxLength={2048} value={form.signingSecret} disabled={form.clearSigningSecret} onChange={(e) => set("signingSecret", e.target.value)} />
            </label>
            <p className="text-sm text-text-muted">{destination?.hasSigningSecret ? "A signing secret is configured." : "A random signing secret is generated when omitted on create."} Generic JSON uses Standard Webhooks signatures. Secrets cannot be revealed here; set your own to configure a receiver.</p>
            {destination && <label className="flex items-center gap-2"><input type="checkbox" checked={form.clearSigningSecret} onChange={(e) => { set("clearSigningSecret", e.target.checked); set("signingSecret", ""); }} />Clear and regenerate signing secret (never unsigned)</label>}
            <label className="space-y-1 block">Headers
              <select className={fieldClass} value={form.headerMode} onChange={(e) => set("headerMode", e.target.value)}>
                <option value="keep">{destination ? `Keep saved headers (${destination.headerCount || 0})` : "No custom headers"}</option>
                <option value="replace">Replace all headers</option>
                {destination && <option value="clear">Clear all saved headers</option>}
              </select>
            </label>
            <p className="text-sm text-text-muted">Only Authorization and allowed X-* headers, up to 8. Routing/forwarding headers are blocked. Blank edit fields preserve saved credentials; replacement requires every new value.</p>
            {form.headerMode === "replace" && <div className="space-y-3">
              {form.headers.map((row, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <label className="block">Header {index + 1} name<input className={fieldClass} required value={row.name} onChange={(e) => set("headers", form.headers.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} /></label>
                <label className="block">Header {index + 1} value<input className={fieldClass} required type="password" autoComplete="new-password" maxLength={2048} value={row.value} onChange={(e) => set("headers", form.headers.map((item, i) => i === index ? { ...item, value: e.target.value } : item))} /></label>
                <Button type="button" variant="ghost" className="self-end" disabled={form.headers.length === 1} onClick={() => set("headers", form.headers.filter((_, i) => i !== index))} aria-label={`Remove header ${index + 1}`}>Remove</Button>
              </div>)}
              <Button type="button" variant="secondary" disabled={form.headers.length >= 8} onClick={() => set("headers", [...form.headers, { name: "", value: "" }])}>Add header</Button>
            </div>}
          </>}
          {destination?.kind === "generic" && form.kind !== "generic" && <p className="text-sm text-text-muted">Changing away from Generic JSON clears its saved headers and signing secret.</p>}
          <p className="text-sm text-text-muted">Disabling, deleting or changing delivery credentials/network policy cancels queued deliveries for the old revision. Already sent messages cannot be recalled.</p>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy}>Save destination</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </section>
  );
}
