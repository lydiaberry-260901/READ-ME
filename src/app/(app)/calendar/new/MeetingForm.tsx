"use client";

import { useActionState } from "react";
import { Notice } from "@/components/ui";
import { bookMeeting } from "../actions";

export function MeetingForm({
  defaults,
  calendarConnected,
  canInvite,
  attendee,
}: {
  defaults: { title: string; date: string; time: string; contactId: string; dealId: string };
  calendarConnected: boolean;
  canInvite: boolean;
  attendee: string | null;
}) {
  const [state, action, pending] = useActionState(bookMeeting, null);
  return (
    <form action={action} className="grid max-w-2xl gap-5">
      <input type="hidden" name="contactId" value={defaults.contactId} />
      <input type="hidden" name="dealId" value={defaults.dealId} />
      <div>
        <label htmlFor="m-title" className="label">Title</label>
        <input id="m-title" name="title" defaultValue={defaults.title} required maxLength={200} className="field" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="m-date" className="label">Date</label>
          <input id="m-date" name="date" type="date" defaultValue={defaults.date} required className="field" />
        </div>
        <div>
          <label htmlFor="m-time" className="label">Start (London time)</label>
          <input id="m-time" name="time" type="time" step={900} defaultValue={defaults.time} required className="field" />
        </div>
        <div>
          <label htmlFor="m-duration" className="label">Length</label>
          <select id="m-duration" name="duration" defaultValue="30" className="field">
            {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} ${m === 60 ? "hour" : "hours"}`}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="m-location" className="label">Where</label>
        <input id="m-location" name="location" maxLength={300} placeholder="An address, or a video call link" className="field" />
      </div>
      <div>
        <label htmlFor="m-desc" className="label">Notes for the invitation</label>
        <textarea id="m-desc" name="description" rows={3} maxLength={2000} className="field" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="sendInvites" disabled={!calendarConnected || !canInvite} className="mt-0.5 size-4 accent-green" />
        <span>
          Send an invitation to {attendee ?? "the contact"}
          <span className="block text-xs text-fg-muted">
            {!calendarConnected ? "Connect your calendar to send invitations." : !canInvite ? "This contact has no email address, or has opted out." : "Their calendar will receive an invitation from your account."}
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Booking" : "Book the meeting"}</button>
      </div>
      {state ? <Notice tone={state.ok ? "green" : "red"}>{state.message}</Notice> : null}
    </form>
  );
}
