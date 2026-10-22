// Configuration Eleventy (générateur du site).
// Les pages sont dans src/, les données dans data/, le site produit dans _site/.
import { readFileSync } from "node:fs";
import { HtmlBasePlugin } from "@11ty/eleventy";
import Image, { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import { loadConcerts, LANGS } from "./lib/events.mjs";
import { buildIcs } from "./lib/ics.mjs";
import { formatDate, formatTime } from "./lib/dates.mjs";
import { icon } from "./lib/icons.mjs";

// Données structurées schema.org « MusicEvent » d'un concert
function musicEventJsonLd(c, lang, site) {
  const abs = (u) => (u && u.startsWith("/") ? site.url + u : u);
  const status = { annule: "EventCancelled", reporte: "EventPostponed" }[c.status] || "EventScheduled";
  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: c.summary,
    startDate: c.startUtc.toISOString(),
    endDate: c.endUtc.toISOString(),
    eventStatus: `https://schema.org/${status}`,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: c.venue.name, address: c.venue.address },
    organizer: { "@type": "Organization", name: site.asso.legalName, url: site.url },
    image: c.poster ? [abs(c.poster)] : undefined,
    description: c.description ? c.description[lang] || c.description.fr : undefined,
    performer: c.lineup.map((b) => ({ "@type": "MusicGroup", name: b.name, sameAs: [b.bandcamp, b.instagram].filter(Boolean) })),
    offers: (c.prices || []).map((p) => ({
      "@type": "Offer", name: p.label, price: p.amount, priceCurrency: "EUR",
      url: c.tickets || abs(c.url),
      availability: `https://schema.org/${c.status === "complet" ? "SoldOut" : "InStock"}`,
    })),
    url: abs(c.urls[lang]),
    inLanguage: lang,
  };
}

const readJson = (name) => JSON.parse(readFileSync(`data/${name}.json`, "utf8"));

// Options communes pour les images (affiches, photo, logo)
const IMG_OPTS = { outputDir: "_site/img/", urlPath: "/img/", formats: ["webp", "jpeg"] };

export default function (eleventyConfig) {
  // --- Données globales (relues à chaque construction) ---
  const site = () => {
    const s = readJson("site");
    if (process.env.SITE_URL) s.url = process.env.SITE_URL.replace(/\/$/, "");
    return s;
  };
  eleventyConfig.addGlobalData("site", site);
  eleventyConfig.addGlobalData("links", () => readJson("links").links.filter((l) => l.url));
  eleventyConfig.addGlobalData("i18n", () => readJson("i18n"));
  eleventyConfig.addGlobalData("concerts", () => loadConcerts({ siteUrl: site().url }));
  // Une page par concert et par langue
  eleventyConfig.addGlobalData("concertPages", () =>
    loadConcerts({ siteUrl: site().url }).all.flatMap((c) => LANGS.map((lang) => ({ lang, concert: c }))));
  eleventyConfig.addGlobalData("langs", LANGS);
  eleventyConfig.addWatchTarget("data/");
  eleventyConfig.addWatchTarget("lib/");

  // --- Fichiers copiés tels quels ---
  eleventyConfig.addPassthroughCopy("src/assets/fonts");
  eleventyConfig.addPassthroughCopy("src/assets/css");
  // Affiches originales (pour les moteurs de recherche) ; le site affiche les versions optimisées
  eleventyConfig.addPassthroughCopy("src/posters");

  // --- Filtres utilisables dans les pages ---
  eleventyConfig.addFilter("date", (d, locale, style) => formatDate(d, locale, style));
  eleventyConfig.addFilter("time", (t, lang) => formatTime(t, lang));
  eleventyConfig.addFilter("isoDate", (d) => new Date(d).toISOString());
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v));
  eleventyConfig.addFilter("absolute", (path, base) => (/^https?:/.test(path) ? path : base + path));
  // Traduit un libellé de tarif (« Prévente » → « Presale »)
  eleventyConfig.addFilter("priceLabel", (label, lang) => {
    if (lang === "fr") return label;
    const t = readJson("i18n").priceLabels[label.toLowerCase()];
    return (t && t[lang]) || label;
  });
  // Texte traduit : objet {fr,en,nl} ou simple texte
  eleventyConfig.addFilter("tr", (v, lang) => (v && typeof v === "object" ? v[lang] || v.fr || "" : v || ""));
  eleventyConfig.addFilter("jsonLd", (c, lang, s) => JSON.stringify(musicEventJsonLd(c, lang, s)).replace(/</g, "\\u003c"));
  eleventyConfig.addFilter("ics", (events, siteUrl, isFeed) => buildIcs(events, { siteUrl, isFeed }));
  // Liste compacte [adresse, fin] des concerts à venir non annulés (pour /next)
  eleventyConfig.addFilter("nextList", (list) =>
    list.filter((c) => c.status !== "annule").map((c) => [c.url, c.endUtc.toISOString()]));

  // --- Icônes SVG ---
  eleventyConfig.addShortcode("icon", icon);

  // --- Images optimisées (WebP + JPEG, plusieurs tailles, lazy-loading) ---
  const srcPath = (src) => (src.startsWith("/") ? `src${src}` : src);
  // On écrit des <img> simples ; le plugin officiel les transforme ensuite en <picture>
  // (WebP + JPEG/PNG, plusieurs tailles). « auto » = garde le format d'origine
  // (PNG pour le logo transparent, JPEG pour les photos).
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ["webp", "auto"],
    // Génération pendant la construction (le mode « à la demande » du serveur local
    // ne gère pas les chemins Windows)
    transformOnRequest: false,
    widths: [400, 800, 1200],
    htmlOptions: { imgAttributes: { loading: "lazy", decoding: "async" } },
  });
  eleventyConfig.addShortcode("image", (src, alt, sizes = "100vw", cls = "", eager = false, widths = [400, 800, 1200]) => {
    if (!src) return "";
    const attrs = [
      `src="${src}"`, `alt="${alt.replace(/"/g, "&quot;")}"`, `sizes="${sizes}"`,
      `eleventy:widths="${widths.join(",")}"`,
      cls ? `class="${cls}"` : "",
      eager ? `loading="eager" fetchpriority="high"` : "",
    ];
    return `<img ${attrs.filter(Boolean).join(" ")}>`;
  });
  // URL d'une version JPEG de taille donnée (images de partage, données structurées)
  eleventyConfig.addAsyncFilter("imageUrl", async (src, width = 1200) => {
    if (!src) return "";
    const format = src.endsWith(".png") ? "png" : "jpeg";
    const metadata = await Image(srcPath(src), { ...IMG_OPTS, widths: [width], formats: [format] });
    return metadata[format][0].url;
  });
  // Icônes du site (favicon, écran d'accueil) à partir de l'emblème
  eleventyConfig.addAsyncShortcode("favicons", async () => {
    const m = await Image("src/assets/img/emblem-dark.png", { ...IMG_OPTS, widths: [32, 180, 512], formats: ["png"] });
    const [s, a] = m.png;
    return `<link rel="icon" type="image/png" sizes="32x32" href="${s.url}">\n<link rel="apple-touch-icon" href="${a.url}">`;
  });

  // Préfixe d'adresse : quand le site est servi depuis un sous-dossier
  // (ex. dindonmaitre.github.io/heavy-fuzz/ avant le nom de domaine), toutes les
  // adresses « /… » des pages sont automatiquement corrigées.
  eleventyConfig.addPlugin(HtmlBasePlugin);

  return {
    pathPrefix: process.env.PATH_PREFIX || "/",
    dir: { input: "src", includes: "_includes", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
