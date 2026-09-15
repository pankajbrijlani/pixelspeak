export type SendWindow = {
  timezone: string;
  sendWindowStart: number; // 0-23
  sendWindowEnd: number; // 0-23
  sendDays: number[]; // 0=Sun..6=Sat
};

// Given a target instant, returns the next instant that falls inside the
// campaign's allowed send window (day-of-week + hour range), in the
// campaign's timezone. If `from` is already inside the window, returns it
// unchanged.
export function nextWithinSendWindow(from: Date, window: SendWindow): Date {
  let candidate = new Date(from);

  for (let i = 0; i < 14; i++) {
    const parts = getZonedParts(candidate, window.timezone);

    if (!window.sendDays.includes(parts.weekday)) {
      candidate = setZonedHour(candidate, window.timezone, window.sendWindowStart, 0);
      candidate = addDays(candidate, 1);
      continue;
    }

    if (parts.hour < window.sendWindowStart) {
      return setZonedHour(candidate, window.timezone, window.sendWindowStart, randomMinute());
    }

    if (parts.hour >= window.sendWindowEnd) {
      candidate = setZonedHour(candidate, window.timezone, window.sendWindowStart, 0);
      candidate = addDays(candidate, 1);
      continue;
    }

    return candidate;
  }

  return candidate;
}

function randomMinute() {
  return Math.floor(Math.random() * 45);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const weekdayPart = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    hour: Number(hourPart) % 24,
    weekday: weekdays.indexOf(weekdayPart),
  };
}

// Sets the wall-clock hour/minute for `date` as observed in `timeZone`,
// keeping the same wall-clock day, by computing the timezone offset at that
// instant and adjusting the underlying UTC timestamp.
function setZonedHour(date: Date, timeZone: string, hour: number, minute: number): Date {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  // Start from a naive UTC guess, then correct for the zone's actual offset.
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMs = getTimezoneOffsetMs(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offsetMs);
}

function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return asUtc - date.getTime();
}
