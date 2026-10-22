// Prépare les versions du logo à partir de l'original (jamais modifié).
// - logo-light.png : fond transparent, couleurs d'origine (pour fond clair)
// - logo-dark.png  : fond transparent, lettrage noir passé en crème (pour fond sombre)
// - emblem.png     : uniquement le crâne/disque (favicon, icônes)
// Usage : node scripts/prepare-logo.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SOURCE = "../Heavy-Fuzz.jpg";
const OUT = "src/assets/img";
const CREAM = [242, 232, 213]; // #F2E8D5
const TEXT_TOP = 630; // en px dans l'original 1080×1080 : au-dessus = emblème, en dessous = « HEAVY FUZZ »

await mkdir(OUT, { recursive: true });

const { data, info } = await sharp(SOURCE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

// Pixels « blancs » (fond), puis zone de bord = à moins de EDGE px d'un pixel blanc.
const EDGE = 2;
const isWhite = new Uint8Array(width * height);
for (let k = 0; k < width * height; k++) {
  isWhite[k] = Math.min(data[k * 3], data[k * 3 + 1], data[k * 3 + 2]) > 238 ? 1 : 0;
}
const nearWhite = new Uint8Array(width * height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (!isWhite[y * width + x]) continue;
    for (let dy = -EDGE; dy <= EDGE; dy++) {
      for (let dx = -EDGE; dx <= EDGE; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && yy < height && xx >= 0 && xx < width) nearWhite[yy * width + xx] = 1;
      }
    }
  }
}

// Fond blanc → transparent. Sur les bords seulement, « couleur vers alpha »
// (comme dans GIMP) pour garder un anticrénelage propre ; ailleurs, couleurs intactes.
function whiteToAlpha(recolorText) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < data.length; i += 3, p += 4) {
    const k = i / 3;
    const c = [data[i], data[i + 1], data[i + 2]];
    let a = 1;
    let rgb = c;
    if (isWhite[k]) a = 0;
    else if (nearWhite[k]) {
      a = Math.max(...c.map((v) => (255 - v) / 255));
      // Au-delà de 0.6, c'est une vraie couleur du logo (ocre ≈ 0.75) : on la garde opaque.
      if (a > 0.6) a = 1;
      else rgb = c.map((v) => Math.round((v - 255 * (1 - a)) / a));
    }
    const y = Math.floor(k / width);
    // Pixel « noir » du lettrage → crème
    if (recolorText && y >= TEXT_TOP && Math.max(...rgb) < 90) rgb = CREAM;
    out[p] = rgb[0]; out[p + 1] = rgb[1]; out[p + 2] = rgb[2];
    out[p + 3] = Math.round(a * 255);
  }
  return sharp(out, { raw: { width, height, channels: 4 } });
}

// Liseré ocre autour de l'emblème (version fond sombre) : on « grossit » la silhouette
// de l'emblème (flou + seuil), on la remplit d'ocre, puis on pose le logo par-dessus.
const OCRE = { r: 195, g: 142, b: 64 };
const OUTLINE = 5; // épaisseur approximative en px
async function withOutline(rgbaPng) {
  const { width: w, height: h } = await sharp(rgbaPng).metadata();
  const emblemAlpha = await sharp(rgbaPng)
    .extract({ left: 0, top: 0, width: w, height: TEXT_TOP - 10 })
    .extend({ bottom: h - (TEXT_TOP - 10), background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extractChannel("alpha").blur(OUTLINE).threshold(8).toBuffer();
  const ring = await sharp({ create: { width: w, height: h, channels: 3, background: OCRE } })
    .joinChannel(emblemAlpha).png().toBuffer();
  return sharp(ring).composite([{ input: rgbaPng }]).png().toBuffer();
}

const light = await whiteToAlpha(false).png().toBuffer();
const dark = await withOutline(await whiteToAlpha(true).png().toBuffer());
const save = (buf, name) => sharp(buf).trim({ threshold: 1 }).png({ compressionLevel: 9 }).toFile(`${OUT}/${name}.png`);
await save(light, "logo-light");
await save(dark, "logo-dark");

// Emblème seul (au-dessus du texte) : favicon, icônes, en-tête compact
const crop = (buf) => sharp(buf).extract({ left: 0, top: 0, width, height: TEXT_TOP - 10 }).png().toBuffer();
await save(await crop(light), "emblem");
await save(await crop(dark), "emblem-dark");

console.log("Logos générés dans", OUT);
