// Lecture du flux iCal public du Google Agenda et conversion en concerts.
// Le parseur est volontairement tolérant : les membres de l'asso écrivent
// la description à la main (majuscules, espaces, accents, HTML de Google…).
import { utcToZoned, zonedToUtc } from "./dates.mjs";

// ---------------------------------------------------------------------------
// 1. Lecture du format iCalendar (.ics)
// ---------------------------------------------------------------------------

// Les longues lignes .ics sont « pliées » : une ligne qui commence par un espace
// continue la précédente.
function unfold(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

const unescapeText = (s) =>
  s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

// « DTSTART;TZID=Europe/Brussels:20261023T200000 » → { name, params, value }
function parseLine(line) {
  const colon = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/); // premier « : » hors guillemets
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...rawParams] = head.split(";");
  const params = {};
  for (const p of rawParams) {
    const [k, v = ""] = p.split("=");
    params[k.toUpperCase()] = v.replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

// Renvoie la liste des VEVENT sous forme d'objets { SUMMARY: {value, params}, ATTACH: [...] }
export function parseIcs(text) {
  const events = [];
  let current = null;
  for (const line of unfold(text).split("\n")) {
    if (!line.trim()) continue;
    if (line === "BEGIN:VEVENT") { current = { ATTACH: [] }; continue; }
    if (line === "END:VEVENT") { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const { name, params, value } = parseLine(line);
    if (name === "ATTACH") current.ATTACH.push({ value, params });
    else current[name] = { value, params };
  }
  return events;
}

// Date iCal → objet Date (UTC). Gère « …Z », « TZID=… » et les journées entières.
export function icsDate(prop) {
  if (!prop) return null;
  const v = prop.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh = "00", mi = "00", , z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi));
  // Heure « flottante » ou avec fuseau : on considère l'heure belge (ou le TZID donné)
  return zonedToUtc(`${y}-${mo}-${d}`, `${hh}:${mi}`, prop.params.TZID || "Europe/Brussels");
}

// ---------------------------------------------------------------------------
// 2. Lecture de la description (convention « Champ: valeur »)
// ---------------------------------------------------------------------------

// Google Agenda stocke parfois la description en HTML : on la remet en texte brut.
export function htmlToText(s) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>[^<]*<\/a>/gi, "$1") // garde l'adresse du lien
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// minuscules, sans accents, espaces simplifiés : « Line-Up » → « line up »
const norm = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();

// Noms de champs acceptés (après normalisation) → nom interne
const FIELDS = {
  lineup: ["line up", "lineup", "groupes", "groupe", "bands", "artistes"],
  tickets: ["billetterie", "billeterie", "tickets", "ticket", "billets", "billet", "reservation"],
  prices: ["prix", "price", "prices", "tarif", "tarifs", "entree"],
  doors: ["portes", "doors", "ouverture", "ouverture des portes"],
  poster: ["affiche", "poster", "visuel", "image"],
  status: ["statut", "status", "etat"],
  partners: ["partenaires", "partenaire", "partners", "coproduction", "avec"],
  tagline: ["accroche", "tagline", "slogan", "titre de la soiree"],
  forFansOf: ["pour les fans de", "for fans of", "fans de", "fans"],
  note: ["note", "info", "infos", "remarque"],
  "description.fr": ["description", "description fr", "texte", "texte fr", "presentation"],
  "description.en": ["description en", "texte en", "english"],
  "description.nl": ["description nl", "texte nl", "nederlands"],
};
const FIELD_OF = Object.fromEntries(Object.entries(FIELDS).flatMap(([k, names]) => names.map((n) => [n, k])));

// « 13€ / 15€ », « Prévente 13€, Soutien 15 €, Étudiant 9€ », « gratuit », « prix libre »
export function parsePrices(text) {
  const t = norm(text);
  if (/gratuit|free|gratis/.test(t)) return { free: "gratuit", prices: [] };
  if (/prix libre|pay what|vrije bijdrage|chapeau/.test(t)) return { free: "prix-libre", prices: [] };
  const prices = [];
  // Séparateurs : « , » (sauf virgule décimale « 12,50 »), « ; », « / », « | », « - »
  for (const part of text.split(/,(?!\d)|[;/|\n]| - /)) {
    const m = part.match(/^(.*?)(\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os?)?)?(.*)$/i);
    if (!m) continue;
    const label = (m[1] + " " + m[3]).replace(/[:€=()]/g, " ").replace(/\s+/g, " ").trim();
    prices.push({ label: label ? label[0].toUpperCase() + label.slice(1) : "", amount: Number(m[2].replace(",", ".")) });
  }
  return { prices };
}

export function parseStatus(text) {
  const t = norm(text);
  if (/annul|cancel/.test(t)) return "annule";
  if (/report|postpon|uitgesteld/.test(t)) return "reporte";
  if (/complet|sold ?out|uitverkocht/.test(t)) return "complet";
  return "";
}

// « 20h », « 20h00 », « 20:00 », « 20.00 » → « 20:00 »
export function parseTime(text) {
  const m = String(text).match(/(\d{1,2})\s*[h:.]\s*(\d{2})?/i);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2] || "00"}`;
}

// Découpe la description en champs. Les lignes sans « Champ: » sont ajoutées
// à la description française (texte libre).
export function parseDescription(raw = "") {
  const text = htmlToText(unescapeText(raw));
  const out = {};
  const free = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([^:]{2,30}?)\s*:\s*(.*)$/);
    const key = m && FIELD_OF[norm(m[1])];
    // « https://… » contient « : » mais n'est pas un champ
    if (!key || /^https?$/i.test(m[1].trim())) { if (line.trim()) free.push(line.trim()); continue; }
    const value = m[2].trim();
    if (!value) continue;
    if (key === "lineup") out.lineup = value.split(/\s*(?:,|\+|\/|;|&| et | and )\s*/).map((s) => s.trim()).filter(Boolean);
    else if (key === "prices") Object.assign(out, parsePrices(value));
    else if (key === "doors") out.doors = parseTime(value);
    else if (key === "status") out.status = parseStatus(value);
    else if (key === "tickets") out.tickets = (value.match(/https?:\/\/\S+/) || [value])[0];
    else if (key.startsWith("description.")) (out.description ||= {})[key.split(".")[1]] = value;
    else out[key] = value;
  }
  if (free.length && !(out.description && out.description.fr)) (out.description ||= {}).fr = free.join(" ");
  return out;
}

// ---------------------------------------------------------------------------
// 3. Événement Google → concert (même format que events.manual.json)
// ---------------------------------------------------------------------------

// Lien Google Drive → identifiant du fichier
export function driveId(url = "") {
  const m = url.match(/\/file\/d\/([\w-]{10,})/) || url.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : null;
}

export function eventFromVevent(v) {
  const start = icsDate(v.DTSTART);
  if (!start) return null;
  const end = icsDate(v.DTEND) || new Date(start.getTime() + 4 * 3600e3);
  const s = utcToZoned(start);
  const e = utcToZoned(end);
  const allDay = /^\d{8}$/.test(v.DTSTART.value.trim());
  const summary = unescapeText(v.SUMMARY ? v.SUMMARY.value : "").trim();
  const desc = parseDescription(v.DESCRIPTION ? v.DESCRIPTION.value : "");

  // Titre « Mr. Bison + Acid Talk » sans champ Line-up → on le découpe
  let title = summary;
  let lineup = desc.lineup;
  const parts = summary.split(/\s+\+\s+/);
  if (parts.length > 1) { title = parts[0]; lineup ||= parts; }
  // Un statut peut aussi être écrit dans le titre : « [COMPLET] Mr. Bison »
  const statusInTitle = parseStatus((summary.match(/^\s*\[([^\]]+)\]/) || [])[1] || "");
  title = title.replace(/^\s*\[[^\]]+\]\s*/, "");
  if (lineup && lineup.length && norm(lineup[0]) !== norm(title)) lineup = [title, ...lineup.filter((b) => norm(b) !== norm(title))];

  // Affiche : pièce jointe image (Google Drive) en priorité, sinon champ « Affiche: »
  const imageAttach = v.ATTACH.find((a) => /^image\//i.test(a.params.FMTTYPE || "") || /\.(jpe?g|png|webp)$/i.test(a.params.FILENAME || ""));
  const posterSource = imageAttach ? imageAttach.value : desc.poster || "";

  const status = (v.STATUS && v.STATUS.value === "CANCELLED") ? "annule" : desc.status || statusInTitle || "";

  const ev = {
    uid: v.UID ? v.UID.value : "",
    date: s.date,
    title,
    lineup: lineup || [title],
    venue: v.LOCATION ? unescapeText(v.LOCATION.value).trim() : "",
    start: allDay ? "" : s.time,
    doors: desc.doors || (allDay ? "" : s.time),
    end: allDay ? "" : e.time,
    endDate: allDay || e.date === s.date ? undefined : e.date,
    status,
    prices: desc.prices || [],
    free: desc.free,
    tickets: desc.tickets || "",
    posterSource,
    tagline: desc.tagline,
    partners: desc.partners,
    forFansOf: desc.forFansOf,
    note: desc.note,
    description: desc.description,
  };
  // On retire les champs vides pour garder un fichier lisible
  return Object.fromEntries(Object.entries(ev).filter(([, x]) => x !== undefined && x !== "" && !(Array.isArray(x) && !x.length)));
}
