import { useState, type FormEvent } from "react";
import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { tokenExpiry, validExpiryDate } from "./token-expiry";

type Props = { date: string; now: Date };

export function TokenExpiryReminder({ date, now }: Props) {
  const expiry = tokenExpiry(date, now);
  return (
    <Link to="/settings#canvas-key-expiry" className={`token-expiry token-expiry--${expiry.tone}`}>
      <CalendarClock size={18} aria-hidden="true" />
      <span>
        <small>Canvas key reminder</small>
        <strong>{expiry.label}</strong>
        <small>{expiry.dateLabel} · 12 AM ET</small>
      </span>
    </Link>
  );
}

export function TokenExpirySettings({ date, now, save }: Props & { save: (date: string) => void }) {
  const [draft, setDraft] = useState(date);
  const [message, setMessage] = useState("");
  const expiry = tokenExpiry(date, now);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validExpiryDate(draft)) { setMessage("Choose a valid expiration date."); return; }
    save(draft);
    setMessage("Expiration date saved on this browser.");
  };
  return (
    <div id="canvas-key-expiry" className="token-expiry-settings">
      <div className={`token-expiry token-expiry--${expiry.tone}`}>
        <CalendarClock size={22} aria-hidden="true" />
        <span>
          <small>Canvas key reminder</small>
          <strong>{expiry.label}</strong>
          <small>{expiry.dateLabel} at 12:00 AM Eastern time</small>
        </span>
      </div>
      <form onSubmit={submit} className="token-expiry-form">
        <label htmlFor="token-expiry-date">Key expiration date</label>
        <div>
          <input id="token-expiry-date" type="date" required value={draft}
            onChange={(event) => { setDraft(event.target.value); setMessage(""); }} />
          <button type="submit" className="button">Save date</button>
        </div>
        <p className="field-help">Expires at the start of this date (12 AM, America/New_York). This reminder uses the date you enter; it does not check or extend the key’s expiration.</p>
        <p className="field-help">Saved for this account in this browser. Set it on each device you use.</p>
        {message && <p role="status" className="field-help">{message}</p>}
      </form>
      <p className="field-help">When replacing your key, update <code>CANVAS_ACCESS_TOKEN</code> in Render → Environment and choose <strong>Save and deploy</strong>. Then save the new key’s expiration date here.</p>
    </div>
  );
}
