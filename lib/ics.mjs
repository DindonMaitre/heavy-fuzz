// Génération de fichiers agenda (.ics, norme iCalendar RFC 5545)
// et des liens « Ajouter à Google Agenda ».
import { toIcsUtc } from "./dates.mjs";

// Échappe le texte selon la norme iCalendar
const esc = (s = "") => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Les lignes .ics ne doivent pas dépasser 75 octets : on les « plie ».
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out = [];
  let chunk = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74; // la suite commence par un espace
    if (Buffer.byteLength(chunk + ch, "utf8") > limit) { out.push(chunk); chunk = ""; }
    chunk += ch;
  }
  out.push(chunk);
  return out.join("\r\n ");
}

// Texte de description commun (.ics et Google)
export function eventDetails(ev, siteUrl) {
  const lines = [];
  if (ev.lineup.length) lines.push(`Line-up : ${ev.lineup.map((b) => b.name).join(", ")}`);
  if (ev.doors) lines.push(`Portes : ${ev.doors.replace(":", "h")}`);
  if (ev.priceText) lines.push(`Prix : ${ev.priceText}`);
  if (ev.tickets) lines.push(`Billetterie : ${ev.tickets}`);
  lines.push(`Infos : ${siteUrl}${ev.url}`);
  return lines.join("\n");
}

function vevent(ev, siteUrl, stamp) {
  const status = ev.status === "annule" ? "CANCELLED" : "CONFIRMED";
  const prefix = ev.status === "annule" ? "[ANNULÉ] " : ev.status === "reporte" ? "[REPORTÉ] " : "";
  return [
    "BEGIN:VEVENT",
    `UID:${ev.slug}@heavyfuzz.be`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(ev.startUtc)}`,
    `DTEND:${toIcsUtc(ev.endUtc)}`,
    `SUMMARY:${esc(prefix + ev.summary)}`,
    `LOCATION:${esc(ev.venue.name + (ev.venue.address ? ", " + ev.venue.address : ""))}`,
    `DESCRIPTION:${esc(eventDetails(ev, siteUrl))}`,
    `URL:${siteUrl}${ev.url}`,
    `STATUS:${status}`,
    "END:VEVENT",
  ];
}

// Calendrier complet (un ou plusieurs concerts)
export function buildIcs(events, { siteUrl, name = "Heavy Fuzz – Concerts", isFeed = false } = {}) {
  const stamp = toIcsUtc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Heavy Fuzz ASBL//Site web//FR",
    "CALSCALE:GREGORIAN",
    `METHOD:PUBLISH`,
  ];
  if (isFeed) {
    lines.push(`X-WR-CALNAME:${esc(name)}`, "X-WR-TIMEZONE:Europe/Brussels",
      "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H");
  }
  for (const ev of events) lines.push(...vevent(ev, siteUrl, stamp));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// Lien « Ajouter à Google Agenda »
export function googleCalendarUrl(ev, siteUrl) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.summary,
    dates: `${toIcsUtc(ev.startUtc)}/${toIcsUtc(ev.endUtc)}`,
    details: eventDetails(ev, siteUrl),
    location: ev.venue.name + (ev.venue.address ? ", " + ev.venue.address : ""),
    ctz: "Europe/Brussels",
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
