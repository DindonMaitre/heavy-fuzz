// Outils de dates : tout est saisi en heure belge (Europe/Brussels),
// converti en UTC pour les agendas (.ics, Google), et réaffiché en heure belge.

export const TZ = "Europe/Brussels";

// Décalage (en ms) entre l'heure locale du fuseau `tz` et l'UTC, à un instant donné.
function tzOffset(date, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - date.getTime();
}

// "2026-10-23" + "20:00" (heure belge) → objet Date (UTC)
export function zonedToUtc(dateStr, timeStr = "00:00", tz = TZ) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let guess = naive;
  // Deux passes suffisent, même autour des changements d'heure.
  for (let i = 0; i < 2; i++) guess = naive - tzOffset(new Date(guess), tz);
  return new Date(guess);
}

// Date (UTC) → { date: "2026-10-23", time: "20:00" } en heure belge
export function utcToZoned(date, tz = TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

// Ajoute n jours à "YYYY-MM-DD"
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Affichage : formatDate(date, "fr-BE", "long") → « vendredi 23 octobre 2026 »
export function formatDate(date, locale = "fr-BE", style = "long") {
  const options = {
    long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
    short: { weekday: "short", day: "numeric", month: "short", year: "numeric" },
    compact: { day: "2-digit", month: "2-digit", year: "2-digit" },
  }[style];
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: TZ }).format(new Date(date));
}

// Heure « 20:00 » → « 20h00 » en français, inchangée sinon
export function formatTime(time, lang = "fr") {
  if (!time) return "";
  return lang === "fr" ? time.replace(":", "h") : time;
}

// Format compact UTC utilisé par les .ics et Google : 20261023T180000Z
export function toIcsUtc(date) {
  return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
