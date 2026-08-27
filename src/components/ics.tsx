import type { Obligation } from "@/lib/types";

/** RFC 5545 TEXT escaping. */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold to 75 octets. Calendar apps are unforgiving about long lines. */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 73) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

function compactDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return compactDate(d.toISOString().slice(0, 10));
}

function uid(): string {
  const c = globalThis.crypto;
  const id =
    typeof c?.randomUUID === "function"
      ? c.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${id}@kaifu.local`;
}

export function buildIcs(obligation: Obligation, documentTitle: string): string {
  const due = obligation.dueDate;
  if (!due) throw new Error("Cannot create an event without a date.");

  const description = [
    obligation.action,
    obligation.amount ? `Amount: ${obligation.amount.raw}` : null,
    `On the document: ${due.label} — ${due.raw}`,
    obligation.conflict
      ? `Unconfirmed: the scan read "${obligation.conflict.modelSaw}" but the page says "${obligation.conflict.documentSaid}". Check the paper.`
      : null,
    `From: ${documentTitle}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KAIFU//v0//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid()}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART;VALUE=DATE:${compactDate(due.iso)}`,
    `DTEND;VALUE=DATE:${nextDay(due.iso)}`,
    fold(`SUMMARY:${esc(obligation.action)}`),
    fold(`DESCRIPTION:${esc(description)}`),
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    fold(`DESCRIPTION:${esc(obligation.action)}`),
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n") + "\r\n";
}

export function downloadIcs(obligation: Obligation, documentTitle: string): void {
  const blob = new Blob([buildIcs(obligation, documentTitle)], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kaifu-${obligation.dueDate?.iso ?? "reminder"}.ics`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Safari needs the URL alive past the click tick.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
