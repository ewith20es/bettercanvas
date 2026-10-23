import { useState, type FormEvent } from "react";
import { bellSchools, chosenDay, validBells, type BellPreference, type SchoolGrade } from "./bell-schedules";

export function BellSchedule({ value, onChange, today }: {
  value: BellPreference; onChange: (value: BellPreference) => void; today: string;
}) {
  const school = bellSchools.find(s => s.id === value.school);
  const selected = chosenDay(value, today);
  const needsGrade = !!school?.days.some(d => d.grade);
  const [error, setError] = useState("");
  const saveCustom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const rows = Array.from({ length: 11 }, (_, period) => {
      const start = String(form.get(`start-${period}`) ?? "");
      const end = String(form.get(`end-${period}`) ?? "");
      if (!start && !end) return null;
      const minutes = (s: string) => /^\d{2}:\d{2}$/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : NaN;
      return { period, start: minutes(start), end: minutes(end) };
    }).filter(row => row !== null);
    if (!validBells(rows) || !rows.length) { setError("Enter both times for at least one period, with the end after the start."); return; }
    onChange({ ...value, school: "custom", day: "custom", date: today, custom: rows });
    setError("");
  };
  const inputTime = (n?: number) => n === undefined ? "" : `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  return <section className="gb-bells" aria-label="Class countdown schedule">
    <div className="gb-bell-controls">
      <label>School<select value={value.school} onChange={e => { setError(""); onChange({ ...value, school: e.target.value, date: "", day: "" }); }}>
        <option value="">Use StudentVUE times when available</option>
        {(["High schools", "Middle schools"] as const).map(level => <optgroup key={level} label={level}>
          {bellSchools.filter(s => s.level === level).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </optgroup>)}
        <option value="custom">Other school / custom times</option>
      </select></label>
      {needsGrade && <label>Grade level<select value={value.grade ?? ""} onChange={e => onChange({ ...value, grade: e.target.value ? Number(e.target.value) as SchoolGrade : undefined, date: "", day: "" })}>
        <option value="">Choose your grade</option>
        {[6, 7, 8].map(grade => <option key={grade} value={grade}>Grade {grade}</option>)}
      </select></label>}
      {value.school && <label>Today’s schedule<select disabled={needsGrade && !value.grade} value={selected} onChange={e => onChange({ ...value, date: today, day: e.target.value })}>
        <option value="">Choose today’s schedule</option>
        {(school?.days.filter(d => !d.grade || d.grade === value.grade) ?? [{ id: "custom", name: "My bell times" }]).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        <option value="off">No school / pause today</option>
      </select></label>}
    </div>
    <p className="gb-bell-note">{value.school
      ? "Countdowns use Eastern time. Choose the correct schedule for today; holidays and special schedules are not detected automatically."
      : "StudentVUE isn’t supplying bell times? Choose your school to restore the class countdown."}
      {needsGrade && <> Grade level sets your class times around lunch.</>}
      {school?.note && <> {school.note}</>}
      {school && <> <a href={school.source} target="_blank" rel="noreferrer">Official bell schedule</a></>}
    </p>
    {value.school === "custom" && <details open={!value.custom.length}>
      <summary>Edit bell times</summary>
      <form onSubmit={saveCustom}>
        <p>Enter your regular weekday times. Leave periods you don’t use blank. Saved only on this device.</p>
        <div className="gb-bell-inputs">
          {Array.from({ length: 11 }, (_, period) => {
            const row = value.custom.find(b => b.period === period);
            return <div key={period}><strong>Period {period}</strong>
              <input type="time" name={`start-${period}`} aria-label={`Period ${period} start`} defaultValue={inputTime(row?.start)} />
              <span>to</span><input type="time" name={`end-${period}`} aria-label={`Period ${period} end`} defaultValue={inputTime(row?.end)} />
            </div>;
          })}
        </div>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="button">Save bell times</button>
      </form>
    </details>}
  </section>;
}
