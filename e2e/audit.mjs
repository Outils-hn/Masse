// Check-up automatique de Masse dans un vrai navigateur, avec Supabase SIMULE
// (aucune lecture ni ecriture dans la vraie base ; donnees fictives, PIN de test « 1234 »).
// Resultat : checkup.txt (OK / ECHEC) + captures d'ecran et fiche PDF pour la revue visuelle.
import { chromium } from "playwright";
import { mesures, axe as axeLib, tabsJusqua, focusVisible, note, tenter, ecrire } from "./audit-lib.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.APP_URL ?? "http://127.0.0.1:8080/";
const OUT = process.argv[2] ?? "captures";
mkdirSync(OUT, { recursive: true });
const lignes = [];
const verif = (nom, ok, detail = "") => lignes.push(`${ok ? "OK    " : "ECHEC "} ${nom}${detail ? ` (${detail})` : ""}`);
const browser = await chromium.launch();
const now = "2026-10-28T10:00:00Z";
let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const M = (name, category, mode, value) => ({ id: uid(), name, category, mode, value, source: "fiche test", note: "", deleted_at: null, created_at: now, updated_at: now });

function donnees({ gros = false } = {}) {
  const materials = [M("Aluminium", "metal", "density", 2700), M("Acier", "metal", "density", 7850), M("Verre", "verre", "density", 2500),
    M("Laine de roche", "isolant", "density", 40), M("Fibres-gypse 15", "panneau", "surface", 18), M("Profilé alu 50x50", "profile", "linear", 1.2), M("Patte de fixation", "joint", "unit", 0.35)];
  if (gros) for (let i = 0; i < 200; i++) materials.push(M(`Matériau ${i + 1}`, "autre", "density", 1000 + i));
  const elements = [], components = [];
  const nb = gros ? 300 : 3;
  for (let i = 0; i < nb; i++) {
    const id = uid();
    elements.push({ id, name: i === 0 ? "Cassette alu" : `Élément ${i + 1}`, description: "Façade sud", length_mm: 1200, height_mm: 3000, markup_pct: 5, deleted_at: null, created_at: now, updated_at: now });
    const nc = gros && i === 0 ? 50 : 4;
    for (let k = 0; k < nc; k++) components.push({ id: uid(), element_id: id, material_id: materials[k % 7].id, position: k, label: "", thickness_mm: [3, 2, 8, 100, 0, 0, 0][k % 7], faces: 1, length_m: 2.4, count: 4, custom_area_m2: null, glass_composition: k % 7 === 2 ? "6/16/6" : "", created_at: now });
  }
  const lists = [{ id: uid(), name: "Livraison 1", deleted_at: null, created_at: now, updated_at: now }];
  const list_items = [{ id: uid(), list_id: lists[0].id, element_id: elements[0].id, quantity: 12, position: 0 }, { id: uid(), list_id: lists[0].id, element_id: elements[1].id, quantity: 4, position: 1 }];
  // Fiches d'Index (autre base, simulee aussi) pour les liens « Fiche technique »
  const products = [{ id: "fiche-alu", name: "Tôle alu EN AW-5754", supplier: "Novelis", category: "Profilés & Accessoires", deleted_at: null }];
  return { materials, elements, components, lists, list_items, products };
}

async function ctx({ gros = false, dark = false } = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  if (dark) await c.addInitScript(() => localStorage.setItem("masse-theme", "dark"));
  const db = donnees({ gros });
  const etat = { horsLigne: false, natifs: 0, rpc: [] };
  await c.route(/supabase\.co/, async (route) => {
    if (etat.horsLigne) return route.abort();
    const url = new URL(route.request().url());
    const m = url.pathname.match(/\/rest\/v1\/(rpc\/)?([a-z_]+)/);
    if (!m) return route.fulfill({ json: {} });
    if (!m[1]) return route.fulfill({ json: db[m[2]] ?? [] });
    const body = JSON.parse(route.request().postData() || "{}");
    etat.rpc.push(m[2]);
    etat.bodies = etat.bodies || {}; etat.bodies[m[2]] = body;
    if (body.p_pin !== "1234") return route.fulfill({ json: { ok: false, error: "PIN incorrect (4 essai(s) restant(s))." } });
    if (m[2] === "save_element") {
      const p = body.p; const id = p.id || uid();
      db.elements = db.elements.filter((e) => e.id !== id).concat({ id, name: p.name, description: p.description, length_mm: p.length_mm, height_mm: p.height_mm, markup_pct: p.markup_pct, deleted_at: null, created_at: now, updated_at: new Date().toISOString() });
      db.components = db.components.filter((k) => k.element_id !== id).concat(p.components.map((k, i) => ({ ...k, id: uid(), element_id: id, position: i, label: k.label ?? "" })));
      return route.fulfill({ json: { ok: true, id } });
    }
    return route.fulfill({ json: { ok: true, id: uid() } });
  });
  const page = await c.newPage();
  page.on("pageerror", (e) => verif("Aucune erreur JavaScript", false, e.message.slice(0, 150)));
  page.on("dialog", (d) => { etat.natifs++; d.accept(); });
  return { c, page, etat };
}
const aller = async (page, chemin = "") => { await page.goto(BASE + chemin, { waitUntil: "networkidle" }); await page.waitForTimeout(500); };
const shot = (page, f, full = true) => page.screenshot({ path: `${OUT}/${f}.png`, fullPage: full });
const toasts = async (page) => (await page.locator("[data-sonner-toast]").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | ");
const step = async (nom, fn) => { try { await fn(); } catch (e) { verif(nom, false, e.message.split("\n")[0].slice(0, 180)); } };

// ---------- Audit UX ----------
const txt = async (p, sel = "body") => (await p.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, " ");
const ouvrirM = async (opts, chemin = "", dims) => { const x = await ctx(opts); if (dims) await x.page.setViewportSize(dims); const t0 = Date.now(); await aller(x.page, chemin); x.page._chargement = Date.now() - t0; return x; };
await step("premier-lancement", async () => { const { page } = await ouvrirM({}); await shot(page, "01-premier-lancement"); await mesures(page, "principal"); await axeLib(page, "principal"); note("principal:texte", (await txt(page)).slice(0, 800)); note("focus", await focusVisible(page)); note("boutons", (await page.getByRole("button").allInnerTexts()).map((s) => s.trim()).filter(Boolean).slice(0, 50).join(" | ")); note("champs", await page.locator("input:visible, select:visible, textarea:visible").evaluateAll((els) => els.map((e) => (e.labels?.[0]?.textContent || e.getAttribute("aria-label") || e.placeholder || e.id).trim()).slice(0, 40))); });
await step("saisies", async () => {
  const { page } = await ouvrirM({});
  const L = page.getByLabel("Largeur L (mm)");
  for (const [nom, v] of [["zero", "0"], ["negatif", "-1000"], ["texte", "abc"], ["enorme", "99999999"], ["decimal", "1200,75"], ["apostrophe", "1'200"]]) { await L.fill(v); await page.keyboard.press("Tab"); await page.waitForTimeout(400); note(`largeur:${nom}`, { champ: await L.inputValue(), texte: (await txt(page)).slice(0, 0) + (await page.locator("[role=alert], .text-destructive, [aria-invalid=true] ~ p").allInnerTexts().catch(() => [])).join(" | ").slice(0, 200) }); await shot(page, `02-largeur-${nom}`, false); }
  await L.fill("1200"); await page.keyboard.press("Tab");
  note("poids-affiche", (await txt(page)).match(/[\d'.,]+\s?kg/g)?.slice(0, 6));
});
await step("pin", async () => { const { page } = await ouvrirM({}); await page.getByRole("button", { name: "Enregistrer" }).click(); await page.waitForTimeout(500); await shot(page, "03-pin", false); note("pin:texte", (await txt(page, "[role=dialog]")).slice(0, 300)); const champ = page.getByRole("dialog").locator("input").first(); await champ.fill("0000"); await page.getByRole("dialog").getByRole("button", { name: /Valider|Enregistrer|OK/ }).first().click().catch(() => {}); await page.waitForTimeout(700); await shot(page, "03b-pin-faux", false); note("pin:faux", (await txt(page)).slice(0, 300) + " || " + await page.locator("[data-sonner-toast]").allInnerTexts().then((a) => a.join(" | ")).catch(() => "")); });
for (const ch of ["listes", "materiaux", "corbeille"]) await step(ch, async () => { const { page } = await ouvrirM({}, ch); await shot(page, `04-${ch}`); await mesures(page, ch); await axeLib(page, ch); note(`${ch}:texte`, (await txt(page)).slice(0, 600)); });
await step("volume", async () => { const { page } = await ouvrirM({ gros: true }); await shot(page, "05-volume", false); note("volume:300-elements", { chargement_ms: page._chargement }); await mesures(page, "volume"); const { page: pm } = await ouvrirM({ gros: true }, "materiaux"); await shot(pm, "05b-volume-materiaux", false); note("volume:materiaux-200", { chargement_ms: pm._chargement, texte: (await txt(pm)).slice(0, 200) }); });
await step("hors-ligne", async () => { const { page, etat } = await ouvrirM({}); etat.horsLigne = true; await page.reload({ waitUntil: "load" }); await page.waitForTimeout(1200); await shot(page, "06-hors-ligne", false); note("hors-ligne:texte", (await txt(page)).slice(0, 400)); });
for (const [nom, w, h] of [["mobile", 390, 844], ["tablette", 768, 1024]]) await step(nom, async () => { const { page } = await ouvrirM({}, "", { width: w, height: h }); await shot(page, `07-${nom}`); await mesures(page, nom); });
await step("sombre", async () => { const { page } = await ouvrirM({ dark: true }); await shot(page, "08-sombre", false); await axeLib(page, "sombre"); });
ecrire(); writeFileSync(`${OUT}/checkup-lignes.txt`, lignes.join("\n")); await browser.close();
