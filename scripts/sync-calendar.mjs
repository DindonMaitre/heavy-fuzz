// Synchronisation du Google Agenda « Heavy Fuzz – Concerts » → data/events.json
// + téléchargement des affiches dans src/posters/.
//
// Usage : ICAL_URL="https://calendar.google.com/calendar/ical/.../public/basic.ics" npm run sync
// ICAL_URL peut aussi être un chemin de fichier local (tests).
// Sans ICAL_URL, le script ne fait rien (le site utilise alors seulement events.manual.json).
import { readFile, writeFile, appendFile, access } from "node:fs/promises";
import { parseIcs, eventFromVevent, driveId } from "../lib/calendar.mjs";
import { slugify, loadConcerts } from "../lib/events.mjs";

const ICAL_URL = (process.env.ICAL_URL || "").trim();
const OUT = "data/events.json";
const POSTERS = "src/posters";
const SINCE = "2024-12-01"; // on ignore ce qui précède la création de l'asso

const warnings = [];
const warn = (msg) => { warnings.push(msg); console.warn("⚠️ ", msg); };

async function exists(path) { try { await access(path); return true; } catch { return false; } }

async function fetchText(url) {
  if (!/^https?:/.test(url)) return readFile(url, "utf8");
  const res = await fetch(url, { headers: { "User-Agent": "HeavyFuzzSite/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en téléchargeant l'agenda`);
  return res.text();
}

// Télécharge une affiche (pièce jointe Drive, lien direct ou nom de fichier déjà présent)
async function fetchPoster(source, slug) {
  if (!source) return "";
  // Simple nom de fichier → doit déjà exister dans src/posters
  if (!/^https?:/.test(source)) {
    const name = source.replace(/^.*[\\/]/, "");
    if (await exists(`${POSTERS}/${name}`)) return name;
    warn(`${slug} : l'affiche « ${name} » est introuvable dans src/posters/.`);
    return "";
  }
  // Déjà téléchargée lors d'une synchronisation précédente ?
  for (const ext of ["jpg", "png", "webp"]) {
    if (await exists(`${POSTERS}/${slug}.${ext}`)) return `${slug}.${ext}`;
  }
  const id = driveId(source);
  const url = id ? `https://drive.google.com/uc?export=download&id=${id}` : source;
  try {
    const res = await fetch(url, { redirect: "follow" });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) {
      warn(`${slug} : impossible de récupérer l'affiche (${res.status}, ${type || "type inconnu"}). ` +
        `Dans Google Drive, partage le fichier en « Tous les utilisateurs disposant du lien ».`);
      return "";
    }
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    await writeFile(`${POSTERS}/${slug}.${ext}`, Buffer.from(await res.arrayBuffer()));
    console.log(`🖼️  Affiche téléchargée : ${slug}.${ext}`);
    return `${slug}.${ext}`;
  } catch (err) {
    warn(`${slug} : erreur en téléchargeant l'affiche (${err.message}).`);
    return "";
  }
}

async function main() {
  if (!ICAL_URL) {
    console.log("ℹ️  ICAL_URL non défini : pas de synchronisation (seul events.manual.json est utilisé).");
    return;
  }
  const ics = await fetchText(ICAL_URL);
  if (!ics.includes("BEGIN:VCALENDAR")) throw new Error("Le contenu téléchargé n'est pas un agenda iCal (adresse incorrecte ?)");

  const events = [];
  for (const v of parseIcs(ics)) {
    const ev = eventFromVevent(v);
    if (!ev || ev.date < SINCE) continue;
    const slug = `${ev.date}-${slugify(ev.title)}`;
    ev.poster = await fetchPoster(ev.posterSource, slug);
    delete ev.posterSource;
    if (!ev.poster) delete ev.poster;
    events.push(ev);
  }
  events.sort((a, b) => a.date.localeCompare(b.date));

  const data = {
    _aide: "Fichier GÉNÉRÉ automatiquement depuis le Google Agenda (scripts/sync-calendar.mjs). Ne pas modifier à la main : utiliser events.manual.json.",
    updatedAt: new Date().toISOString(),
    events,
  };
  await writeFile(OUT, JSON.stringify(data, null, 2) + "\n");
  console.log(`✅ ${events.length} concert(s) synchronisé(s) depuis Google Agenda.`);

  // Résumé affiché sur la page du « run » GitHub Actions
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = events.map((e) => `| ${e.date} | ${e.title} | ${e.venue || "—"} | ${e.poster ? "✅" : "❌"} | ${e.tickets ? "✅" : "❌"} |`);
    const md = [
      `### 🎸 ${events.length} concert(s) lus dans Google Agenda`, "",
      "| Date | Concert | Lieu | Affiche | Billetterie |", "|---|---|---|---|---|", ...rows, "",
      ...(warnings.length ? ["#### ⚠️ À vérifier", ...warnings.map((w) => `- ${w}`)] : ["Aucun problème détecté."]),
    ].join("\n");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  }
}

main().catch((err) => {
  // En cas d'échec, on arrête tout : l'ancienne version du site reste en ligne.
  console.error("❌ Synchronisation impossible :", err.message);
  process.exit(1);
});
