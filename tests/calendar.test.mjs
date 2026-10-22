// Tests du parseur d'agenda : npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseIcs, eventFromVevent, parsePrices, parseTime, parseStatus, parseDescription, driveId } from "../lib/calendar.mjs";
import { zonedToUtc, utcToZoned } from "../lib/dates.mjs";
import { buildIcs } from "../lib/ics.mjs";
import { loadConcerts } from "../lib/events.mjs";

const ics = readFileSync(new URL("./fixtures/google-sample.ics", import.meta.url), "utf8");
const events = parseIcs(ics).map(eventFromVevent);

test("heures UTC → heure belge (été/hiver)", () => {
  assert.deepEqual(utcToZoned(new Date("2026-10-23T18:00:00Z")), { date: "2026-10-23", time: "20:00" }); // été (UTC+2)
  assert.deepEqual(utcToZoned(new Date("2026-11-13T18:30:00Z")), { date: "2026-11-13", time: "19:30" }); // hiver (UTC+1)
  assert.equal(zonedToUtc("2026-10-23", "20:00").toISOString(), "2026-10-23T18:00:00.000Z");
  assert.equal(zonedToUtc("2027-03-28", "03:30").toISOString(), "2027-03-28T01:30:00.000Z"); // juste après le passage à l'heure d'été
});

test("événement simple (heures en UTC, texte échappé, lignes pliées)", () => {
  const e = events[0];
  assert.equal(e.title, "Mr. Bison");
  assert.equal(e.date, "2026-10-23");
  assert.equal(e.start, "20:00");
  assert.deepEqual(e.lineup, ["Mr. Bison", "Acid Talk"]);
  assert.equal(e.tickets, "https://www.billetweb.fr/mr-bison-it-acid-talk");
  assert.deepEqual(e.prices, [{ label: "Prévente", amount: 13 }, { label: "Soutien", amount: 15 }]);
  assert.equal(e.doors, "20:00");
  assert.match(e.venue, /^Belvédère, Avenue Marie d'Artois 1/);
});

test("description HTML de Google, majuscules, fin après minuit, pièce jointe Drive", () => {
  const e = events[1];
  assert.equal(e.title, "Riff Lords");
  assert.deepEqual(e.lineup, ["Riff Lords", "Test Band"]);
  assert.equal(e.tickets, "https://www.billetweb.fr/test-band");
  assert.deepEqual(e.prices, [{ label: "", amount: 10 }, { label: "", amount: 13 }]);
  assert.equal(e.status, "complet");
  assert.equal(e.endDate, "2027-03-06");
  assert.equal(e.end, "01:00");
  assert.equal(e.description.en, "A heavy night.");
  assert.equal(e.description.fr, "Une soirée lourde et chaude.");
  assert.equal(driveId(e.posterSource), "1AbCdEfGhIjKlMnOpQrStUvWxYz");
});

test("annulé, prix libre, affiche par nom de fichier", () => {
  const e = events[2];
  assert.equal(e.title, "Jam Session");
  assert.equal(e.status, "annule");
  assert.equal(e.free, "prix-libre");
  assert.equal(e.posterSource, "2027-04-10-jam.jpg");
});

test("petits parseurs tolérants", () => {
  assert.equal(parseTime("20h"), "20:00");
  assert.equal(parseTime("19h30"), "19:30");
  assert.equal(parseTime("8.30 pm"), "08:30");
  assert.equal(parseStatus("Complet !"), "complet");
  assert.equal(parseStatus("reporté au 12/03"), "reporte");
  assert.deepEqual(parsePrices("Gratuit"), { free: "gratuit", prices: [] });
  assert.deepEqual(parsePrices("12,50€ sur place").prices, [{ label: "Sur place", amount: 12.5 }]);
  const d = parseDescription("Tickets: https://x.be/a\nhttps://instagram.com/foo\nPortes : 19h");
  assert.equal(d.tickets, "https://x.be/a");
  assert.equal(d.doors, "19:00");
  assert.equal(d.description.fr, "https://instagram.com/foo");
});

test("le fichier manuel complète/écrase l'événement Google", () => {
  const { all } = loadConcerts({ dataDir: "tests/fixtures/data" });
  const bison = all.find((c) => c.slug === "2026-10-23-mr-bison");
  assert.ok(bison, "Mr. Bison présent");
  assert.equal(bison.venue.key, "belvedere");
  assert.equal(bison.startUtc.toISOString(), "2026-10-23T18:00:00.000Z");
  assert.equal(bison.prices[0].label, "Prévente", "les prix du fichier manuel remplacent ceux de Google");
  assert.deepEqual(bison.lineup.map((b) => b.name), ["Mr. Bison", "Acid Talk"]);
});

test(".ics généré valide (CRLF, lignes ≤ 75 octets)", () => {
  const { all } = loadConcerts({ dataDir: "tests/fixtures/data" });
  const out = buildIcs(all, { siteUrl: "https://heavyfuzz.be", isFeed: true });
  assert.ok(out.startsWith("BEGIN:VCALENDAR\r\n"));
  for (const line of out.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, `ligne trop longue : ${line}`);
});
