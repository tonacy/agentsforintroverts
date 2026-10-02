import type { Day } from "@/lib/day";
import { Ledger } from "./Ledger";

import "./day-record.css";

/** A day's full ledger, folded away until it is asked for. */
export function DayRecord({ day }: { day: Day }) {
  return (
    <details className="day-record">
      <summary>
        <span>{day.example ? "See the full example day" : "See the published day"}</span>
        <span className="day-record__note">sources, context, and suggested next steps</span>
        <span className="day-record__toggle" aria-hidden="true" />
      </summary>
      <Ledger day={day} />
    </details>
  );
}
