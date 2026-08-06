'use client';

export interface DateTab {
  date: string; // dd-mm-yyyy
  label: string; // e.g. "Thu, Oct 24"
}

// Horizontal, side-scrolling date-tab row shared by the per-cinema page's
// date picker and the movie detail page's showtime picker, so both look
// and behave the same way rather than each having its own tab UI.
export function DateTabStrip({
  dates,
  selectedDate,
  onSelect,
}: {
  dates: DateTab[];
  selectedDate: string | null;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
      {dates.map((d) => {
        const isSelected = selectedDate === d.date;
        const [weekday, monthDay] = d.label.split(', ');
        return (
          <button
            key={d.date}
            type="button"
            onClick={() => onSelect(d.date)}
            aria-pressed={isSelected}
            className="flex h-20 min-w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors"
            style={
              isSelected
                ? { background: 'var(--accent)', color: 'var(--accent-ink)' }
                : { background: 'var(--bg-elevated)', color: 'var(--ink)' }
            }
          >
            <span className="text-[10px] font-bold tracking-widest uppercase opacity-80">
              {monthDay?.split(' ')[0]}
            </span>
            <span className="text-xl font-bold">{monthDay?.split(' ')[1]}</span>
            <span className="text-[10px] font-bold tracking-widest uppercase opacity-80">{weekday}</span>
          </button>
        );
      })}
    </div>
  );
}
