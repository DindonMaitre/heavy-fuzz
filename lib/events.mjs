// Charge les concerts (Google Agenda synchronisé + fichier manuel),
// les fusionne et calcule tout ce dont les pages ont besoin.
import { readFileSync, existsSync } from "node:fs";
import { zonedToUtc, addDays } from "./dates.mjs";
import { googleCalendarUrl } from "./ics.mjs";

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);

export const LANGS = ["fr", "en", "nl"];

// « Mr. Bison » → « mr-bison » ; « Fuzz Populi (10ᵉ anniv.) » → « fuzz-populi-10e-anniv »
export function slugify(s) {
  return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Clé de rapprochement entre un événement Google et une entrée manuelle
const keyOf = (ev) => `${ev.date}-${slugify(ev.title)}`;

// Les champs remplis dans le fichier manuel remplacent ceux du Google Agenda
function mergeEvents(synced, manual) {
  const byKey = new Map(synced.map((ev) => [keyOf(ev), { ...ev }]));
  for (const ev of manual) {
    const k = keyOf(ev);
    const base = byKey.get(k) || {};
    const filled = Object.fromEntries(Object.entries(ev).filter(([, v]) => v !== "" && v != null));
    byKey.set(k, { ...base, ...filled });
  }
  return [...byKey.values()].filter((ev) => !ev.hidden);
}

// Retrouve une salle connue (venues.json) à partir d'une clé ou d'un texte libre
function resolveVenue(venue, venues) {
  if (!venue) return { name: "Lieu à confirmer", address: "" };
  if (typeof venue === "string" && venues[venue]) return { key: venue, ...venues[venue] };
  const text = typeof venue === "string" ? venue : `${venue.name || ""} ${venue.address || ""}`;
  const lower = text.toLowerCase();
  for (const [key, v] of Object.entries(venues)) {
    if (key.startsWith("_")) continue;
    if ((v.match || []).some((m) => lower.includes(m.toLowerCase()))) return { key, ...v };
  }
  if (typeof venue === "string") {
    // Texte libre « Nom, adresse »
    const [name, ...rest] = venue.split(",");
    return { name: name.trim(), address: rest.join(",").trim() };
  }
  return { name: venue.name || "", address: venue.address || "" };
}

function priceText(ev) {
  if (ev.free === "gratuit") return "Gratuit";
  if (ev.free === "prix-libre") return "Prix libre";
  return (ev.prices || []).map((p) => `${p.label} ${p.amount} €`.trim()).join(" · ");
}

export function loadConcerts({ dataDir = "data", now = new Date(), siteUrl } = {}) {
  const site = readJson(`${dataDir}/site.json`, {});
  const venues = readJson(`${dataDir}/venues.json`, {});
  const bands = readJson(`${dataDir}/bands.json`, {});
  const synced = readJson(`${dataDir}/events.json`, { events: [] }).events || [];
  const manual = readJson(`${dataDir}/events.manual.json`, { events: [] }).events || [];
  const baseUrl = siteUrl || process.env.SITE_URL || site.url;

  const concerts = mergeEvents(synced, manual).filter((ev) => ev.date && ev.title).map((ev) => {
    const slug = ev.slug || keyOf(ev);
    const start = ev.start || ev.doors || "20:00";
    const end = ev.end || "23:59";
    // Fin après minuit (ex. 01:00) → lendemain
    const endDate = ev.endDate || (end < start ? addDays(ev.date, 1) : ev.date);
    const lineupNames = ev.lineup && ev.lineup.length ? ev.lineup : [ev.title];
    const lineup = lineupNames.map((name) => {
      const known = Object.entries(bands).find(([k]) => k.toLowerCase() === name.toLowerCase());
      return known ? { name: known[0], ...known[1] } : { name };
    });
    const venue = resolveVenue(ev.venue, venues);
    venue.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name}, ${venue.address}`)}`;
    const poster = ev.poster ? (/^https?:/.test(ev.poster) ? ev.poster : `/posters/${ev.poster}`) : "";
    const support = lineup.slice(1).map((b) => b.name);
    const concert = {
      ...ev,
      slug,
      title: lineup[0].name.toLowerCase() === ev.title.toLowerCase() ? lineup[0].name : ev.title,
      summary: support.length ? `${ev.title} + ${support.join(" + ")}` : ev.title,
      lineup,
      support,
      venue,
      poster,
      startUtc: zonedToUtc(ev.date, start),
      endUtc: zonedToUtc(endDate, end),
      status: ev.status || "",
      priceText: priceText(ev),
      url: `/concerts/${slug}/`,
      urls: { fr: `/concerts/${slug}/`, en: `/en/concerts/${slug}/`, nl: `/nl/concerts/${slug}/` },
      icsUrl: `/concerts/${slug}.ics`,
    };
    concert.isPast = concert.endUtc < now;
    concert.googleUrl = googleCalendarUrl(concert, baseUrl);
    return concert;
  });

  concerts.sort((a, b) => a.startUtc - b.startUtc);
  const upcoming = concerts.filter((c) => !c.isPast);
  const past = concerts.filter((c) => c.isPast).reverse();
  // Prochain concert = premier à venir qui n'est pas annulé
  const next = upcoming.find((c) => c.status !== "annule") || null;
  return { all: concerts, upcoming, past, next };
}
