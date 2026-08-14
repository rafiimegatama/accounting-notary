"use client";

import { useEffect, useState } from "react";

const DAY_ABBR = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatNow(d: Date) {
  const day = DAY_ABBR[d.getDay()];
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { day, date, time };
}

// Client-only clock: renders an empty (but height-reserved) placeholder on
// first paint so server and client markup match exactly, then fills in
// the real browser-local time after mount — avoids any Next.js hydration
// mismatch from computing `new Date()` during SSR. Updates once a minute,
// not every second (a setInterval tick, not a countdown/animation).
export function DashboardClock() {
  const [now, setNow] = useState<{ day: string; date: string; time: string } | null>(null);

  useEffect(() => {
    setNow(formatNow(new Date()));
    const id = setInterval(() => setNow(formatNow(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!now) return <div className="h-[34px]" aria-hidden="true" />;

  return (
    <div className="text-right text-white/80" aria-label={`Hari ini ${now.day} ${now.date}, pukul ${now.time} WIB`}>
      <div className="text-xs font-semibold uppercase tracking-wide">{now.day} {now.date}</div>
      <div className="text-xs">{now.time} WIB</div>
    </div>
  );
}
