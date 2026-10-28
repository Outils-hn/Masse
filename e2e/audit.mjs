// Audit utilisateur de Masse (branche audit/parcours, jamais fusionnee).
// Supabase est SIMULE (aucune lecture ni ecriture dans la vraie base) : donnees fictives,
// PIN de test « 1234 ». Parcours : premier lancement, tache principale, cas limites,
// gros volume, modifications non enregistrees, PDF, listes, hors ligne, clavier, axe.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.APP_URL ?? "http://127.0.0.1:8080/";
const OUT = (process.argv[2] ?? "audit") + "/audit";
mkdirSync(OUT, { recursive: true });
const notes = [];
const note = (k, v) => notes.push(`${k} : ${typeof v === "string" ? v : JSON.stringify(v)}`);
const browser = await chromium.launch();
const now = "2026-10-28T10:00:00Z";
let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

const M = (name, category, mode, value) => ({ id: uid(), name, category, mode, value, source: "test", note: "", deleted_at: null, created_at: now, updated_at: now });
function donnees({ vide = false, gros = false } = {}) {
  if (vide) return { materials: [], elements: [], components: [], lists: [], list_items: [] };
  const materials = [M("Aluminium", "metal", "density", 2700), M("Acier", "metal", "density", 7850), M("Verre", "verre", "density", 2500),
    M("Laine de roche", "isolant", "density", 40), M("Fibres-gypse 15", "panneau", "surface", 18), M("Profilé alu 50x50", "profile", "linear", 1.2), M("Patte de fixation", "joint", "unit", 0.35)];
  if (gros) for (let i = 0; i < 200; i++) materials.push(M(`Matériau ${i + 1}`, "autre", "density", 1000 + i));
  const elements = [], components = [];
  const nb = gros ? 300 : 3;
  for (let i = 0; i < nb; i++) {
    const id = uid();
    elements.push({ id, name: i === 0 ? "Cassette alu" : `Élément ${i + 1}`, description: "", length_mm: 1200, height_mm: 3000, markup_pct: 5, deleted_at: null, created_at: now, updated_at: now });
    const nc = gros && i === 0 ? 50 : 3;
    for (let k = 0; k < nc; k++) components.push({ id: uid(), element_id: id, material_id: materials[k % 7].id, position: k, label: "", thickness_mm: [3, 2, 8, 100, 0, 0, 0][k % 7], faces: 1, length_m: 2.4, count: 4, custom_area_m2: null, glass_composition: "", created_at: now });
  }
  const lists = [{ id: uid(), name: "Livraison 1", deleted_at: null, created_at: now, updated_at: now }];
  const list_items = [{ id: uid(), list_id: lists[0].id, element_id: elements[0].id, quantity: 12, position: 0 }];
  return { materials, elements, components, lists, list_items };
}

async function ctx({ vide = false, gros = false, horsLigne = false, mobile = false } = {}) {
  const c = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, acceptDownloads: true });
  await c.grantPermissions(["clipboard-read", "clipboard-write"]);
  const db = donnees({ vide, gros });
  const ecritures = [];
  // Simulation de Supabase : lectures des tables, fonctions RPC (PIN 1234) ; rien ne sort du navigateur
  await c.route(/supabase\.co/, async (route) => {
    if (horsLigne) return route.abort();
    const url = new URL(route.request().url());
    const m = url.pathname.match(/\/rest\/v1\/(rpc\/)?([a-z_]+)/);
    if (!m) return route.fulfill({ json: {} });
    if (!m[1]) return route.fulfill({ json: db[m[2]] ?? [] });
    const body = JSON.parse(route.request().postData() || "{}");
    ecritures.push(m[2]);
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
  page.on("pageerror", (e) => note("ERREUR JS", e.message));
  page.on("console", (msg) => { if (msg.type() === "error" && !/favicon/i.test(msg.text())) note("console", msg.text().slice(0, 200)); });
  page.on("dialog", (d) => { note("dialogue natif du navigateur", `${d.type()} « ${d.message().replace(/\n/g, " ")} »`); d.accept(); });
  return { c, page, ecritures };
}
const shot = (page, f, full = false) => page.screenshot({ path: `${OUT}/${f}.png`, fullPage: full });
const toasts = async (page) => (await page.locator("[data-sonner-toast]").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | ");
const step = async (nom, fn) => { try { await fn(); } catch (e) { note(`ECHEC ${nom}`, e.message.split("\n")[0]); } };
const aller = async (page, chemin = "") => { await page.goto(BASE + chemin, { waitUntil: "networkidle" }); await page.waitForTimeout(600); };
const resultat = async (page) => (await page.locator("section", { hasText: "Résultats" }).last().innerText()).slice(0, 220).replace(/\s+/g, " ");

await step("premier lancement base vide", async () => {
  const { c, page } = await ctx({ vide: true });
  const t0 = Date.now(); await aller(page); note("Chargement initial (ms)", Date.now() - t0);
  note("Titre de l'onglet", await page.title());
  await shot(page, "M01-premier-lancement-vide");
  note("Texte au premier ecran (vide)", (await page.locator("main").innerText()).slice(0, 300).replace(/\s+/g, " "));
  await page.getByRole("button", { name: /premier élément|Créer un élément/ }).click(); await page.waitForTimeout(300);
  await page.getByRole("button", { name: "+ Composant" }).click(); await page.waitForTimeout(300);
  note("Ajouter un composant sans materiau", await toasts(page));
  await shot(page, "M02-element-sans-materiau");
  await c.close();
});

await step("tache principale", async () => {
  const { c, page, ecritures } = await ctx();
  await aller(page);
  await shot(page, "M03-ecran-principal");
  await shot(page, "M04-ecran-principal-complet", true);
  const axe = await new AxeBuilder({ page }).analyze();
  note("axe Elements", axe.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`));
  // Creer un element de facade complet
  let clics = 0; const clic = async (loc) => { clics++; await loc.click(); await page.waitForTimeout(150); };
  await clic(page.getByRole("button", { name: "+ Nouveau" }));
  await page.getByLabel("Nom").first().fill("Cassette test");
  await page.getByLabel("Largeur L (mm)").fill("1250"); await page.getByLabel("Hauteur H (mm)").fill("2'800");
  for (const [mat, ep] of [["Aluminium", "3"], ["Laine de roche", "120"], ["Verre", null]]) {
    await clic(page.getByRole("button", { name: "+ Composant" }));
    const sel = page.locator("select").last();
    const val = await sel.locator("option", { hasText: mat }).first().getAttribute("value");
    await sel.selectOption(val);
    if (ep) await page.getByLabel("Épaisseur (mm)").last().fill(ep);
    else await page.getByLabel("Composition verre").last().fill("6/16/6");
    await page.keyboard.press("Tab");
  }
  note("Resultat apres saisie", await resultat(page));
  await shot(page, "M05-element-saisi", true);
  await clic(page.getByRole("button", { name: "Enregistrer" }));
  await page.waitForTimeout(400);
  note("PIN demande a l'enregistrement", await page.getByText("Code PIN requis").isVisible());
  await shot(page, "M06-demande-pin");
  await page.locator('input[type="password"]').fill("0000"); await page.keyboard.press("Enter"); await page.waitForTimeout(400);
  note("PIN faux", await toasts(page));
  await page.locator('input[type="password"]').fill("1234"); await page.keyboard.press("Enter"); await page.waitForTimeout(800);
  note("Apres bon PIN", await toasts(page));
  note("Clics pour creer et enregistrer l'element (hors saisie)", clics);
  note("Appels RPC", ecritures.join(", "));
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByRole("button", { name: "Fiche PDF" }).click()]);
  await dl.saveAs(`${OUT}/M-fiche.pdf`);
  note("PDF", dl.suggestedFilename());
  // Clavier
  await aller(page);
  let k = 0;
  for (; k < 80; k++) { await page.keyboard.press("Tab"); if (/Enregistrer/.test(await page.evaluate(() => document.activeElement?.textContent ?? ""))) break; }
  note("Tabulations jusqu'a Enregistrer", k + 1);
  await c.close();
});

const absurdes = [
  ["largeur negative", async (p) => p.getByLabel("Largeur L (mm)").fill("-1000")],
  ["hauteur 0", async (p) => p.getByLabel("Hauteur H (mm)").fill("0")],
  ["epaisseur negative", async (p) => p.getByLabel("Épaisseur (mm)").first().fill("-3")],
  ["majoration 500 %", async (p) => p.getByLabel("Majoration (%)").fill("500")],
  ["faces 2,5", async (p) => p.getByLabel("Faces / couches").first().fill("2,5")],
  ["surface perso negative", async (p) => p.getByLabel("Surface perso. (m²)").first().fill("-2")],
  ["verre « abc »", async (p) => { await p.getByRole("button", { name: "+ Composant" }).click(); const s = p.locator("select").last(); await s.selectOption(await s.locator("option", { hasText: "Verre" }).first().getAttribute("value")); await p.getByLabel("Composition verre").last().fill("abc"); }],
  ["largeur texte « douze »", async (p) => p.getByLabel("Largeur L (mm)").fill("douze")],
];
for (const [nom, action] of absurdes) {
  await step(`absurde ${nom}`, async () => {
    const { c, page } = await ctx();
    await aller(page);
    await action(page); await page.keyboard.press("Tab"); await page.waitForTimeout(300);
    note(`Absurde « ${nom} »`, await resultat(page));
    await page.getByRole("button", { name: "Enregistrer" }).click(); await page.waitForTimeout(300);
    note(`Absurde « ${nom} » : enregistrement`, (await page.getByText("Code PIN requis").isVisible()) ? "accepte (PIN demande)" : `refuse : ${await toasts(page)}`);
    await shot(page, `M10-absurde-${nom.replace(/[^\w]+/g, "-")}`);
    await c.close();
  });
}

await step("modifications non enregistrees", async () => {
  const { c, page } = await ctx();
  await aller(page);
  await page.getByLabel("Largeur L (mm)").fill("1500"); await page.keyboard.press("Tab");
  note("Badge non enregistre", await page.getByText("Non enregistré").isVisible());
  await page.getByRole("link", { name: "Matériaux" }).click(); await page.waitForTimeout(500);
  note("Apres clic sur Materiaux avec modifs", page.url());
  await c.close();
});

await step("gros volume", async () => {
  const { c, page } = await ctx({ gros: true });
  const t0 = Date.now(); await aller(page); note("Chargement 300 elements / 207 materiaux (ms)", Date.now() - t0);
  const lat = [];
  for (const ch of ["1", "2"]) {
    await page.getByLabel("Largeur L (mm)").focus();
    const t = await page.evaluate(() => performance.now());
    await page.keyboard.type(ch);
    lat.push(await page.evaluate((t) => new Promise((r) => requestAnimationFrame(() => r(performance.now() - t))), t));
  }
  note("Element a 50 composants : latence par frappe (ms)", lat.map(Math.round));
  await page.getByPlaceholder("Rechercher…").fill("Élément 29"); await page.waitForTimeout(300);
  note("Recherche « Élément 29 »", (await page.locator("aside li").count()) + " resultat(s)");
  await shot(page, "M20-gros-volume");
  note("Hauteur page gros volume (px)", await page.evaluate(() => document.body.scrollHeight));
  await c.close();
});

for (const [chemin, nom] of [["materiaux", "M30-materiaux"], ["listes", "M31-listes"], ["corbeille", "M32-corbeille"]]) {
  await step(`page ${chemin}`, async () => {
    const { c, page } = await ctx();
    await aller(page, chemin);
    await shot(page, nom, true);
    const axe = await new AxeBuilder({ page }).analyze();
    note(`axe ${chemin}`, axe.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`));
    note(`Texte ${chemin}`, (await page.locator("main").innerText()).slice(0, 250).replace(/\s+/g, " "));
    await c.close();
  });
}

await step("hors ligne", async () => {
  const { c, page } = await ctx({ horsLigne: true });
  await aller(page); await page.waitForTimeout(2500);
  note("Supabase injoignable", (await page.locator("main").innerText()).slice(0, 200).replace(/\s+/g, " "));
  await shot(page, "M40-hors-ligne");
  await c.close();
});

await step("mobile", async () => {
  const { c, page } = await ctx({ mobile: true });
  await aller(page);
  note("Mobile : debordement horizontal (px)", await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
  await c.close();
});

await browser.close();
writeFileSync(`${OUT}/notes.txt`, notes.join("\n"));
console.log(notes.join("\n"));
