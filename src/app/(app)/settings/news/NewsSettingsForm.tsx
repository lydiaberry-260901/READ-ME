"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/ui";
import { checkNewsNow, saveNewsSettings } from "../../news/actions";

type Settings = { newsSource: string; newsFeeds: string[]; newsDailyCallLimit: number };

export function NewsSettingsForm({ settings, apiKeySet }: { settings: Settings; apiKeySet: boolean }) {
  const [state, action, pending] = useActionState(saveNewsSettings, null);
  const [source, setSource] = useState(settings.newsSource);
  return (
    <form action={action} className="grid max-w-2xl gap-5">
      <fieldset className="grid gap-2">
        <legend className="label">Where news comes from</legend>
        {[
          { value: "OFF", label: "Off", hint: "No news is looked for." },
          { value: "API", label: "News service (GNews)", hint: apiKeySet ? "The key is set on the server." : "The key (NEWS_API_KEY) is not set on the server yet, so nothing will be found until it is." },
          { value: "FEEDS", label: "News feeds", hint: "RSS or Atom feeds you choose, for example trade press. Each feed is read once a day." },
        ].map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-3 rounded-md border border-line px-4 py-3 has-[:checked]:border-line-strong has-[:checked]:bg-panel-raised">
            <input type="radio" name="newsSource" value={o.value} checked={source === o.value} onChange={() => setSource(o.value)} className="mt-1" />
            <span>
              <span className="block font-medium">{o.label}</span>
              <span className={`block text-xs ${o.value === "API" && !apiKeySet ? "text-amber-text" : "text-fg-muted"}`}>{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div hidden={source !== "API"} className="max-w-xs">
        <label htmlFor="news-limit" className="label">Most searches a day</label>
        <input id="news-limit" name="newsDailyCallLimit" type="number" min={1} max={1000} defaultValue={settings.newsDailyCallLimit} className="field" />
        <p className="mt-1 text-xs text-fg-muted">One search per company checked. Keep this within your news service plan. Companies not reached are checked the next day.</p>
      </div>
      {source !== "API" ? <input type="hidden" name="newsDailyCallLimit" value={settings.newsDailyCallLimit} /> : null}

      <div hidden={source !== "FEEDS"}>
        <label htmlFor="news-feeds" className="label">Feed addresses, one per line</label>
        <textarea id="news-feeds" name="newsFeeds" rows={6} defaultValue={settings.newsFeeds.join("\n")} placeholder="https://www.example.com/news/feed" className="field font-mono text-sm" />
        <p className="mt-1 text-xs text-fg-muted">Only headlines and short descriptions are read. Sites that ask automated visitors not to read their feed are skipped.</p>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving" : "Save"}</button>
      </div>
      {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
    </form>
  );
}

export function CheckNowButton() {
  const [state, action, pending] = useActionState(checkNewsNow, null);
  return (
    <form action={action} className="grid gap-2">
      <div><button type="submit" className="btn btn-secondary py-1.5" disabled={pending}>{pending ? "Starting" : "Check for news now"}</button></div>
      {state ? <p role="status" className={`text-xs ${state.ok ? "text-green-text" : "text-red-text"}`}>{state.message}</p> : null}
    </form>
  );
}
