// Check-up automatique de Masse dans un vrai navigateur, avec Supabase SIMULE
// (aucune lecture ni ecriture dans la vraie base ; donnees fictives, PIN de test « 1234 »).
// Resultat : checkup.txt (OK / ECHEC) + captures d'ecran et fiche PDF pour la revue visuelle.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
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
  return { materials, elements, components, lists, list_items };
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

await step("Ecran principal", async () => {
  const { c, page, etat } = await ctx();
  await aller(page);
  await shot(page, "01-elements");
  verif("Titre h1 « Masse » dans le selecteur", (await page.locator("h1").first().innerText()).trim() === "Masse");
  await page.getByRole("button", { name: "Changer d'application" }).click(); await page.waitForTimeout(200);
  const applis = await page.getByRole("menuitem").allInnerTexts();
  verif("Selecteur : 6 applis dans l'ordre", ["Format", "Index", "Linear", "Masse", "Strate", "Trame"].every((a, i) => applis[i]?.startsWith(a)), applis.map((t) => t.split(/\s/)[0]).join(", "));
  await shot(page, "02-selecteur", false);
  await page.keyboard.press("Escape");
  const pied = (await page.locator("footer").innerText()).replace(/\s+/g, " ").trim();
  verif("Pied de page", pied === "Masse v2.0 · Conçu par Hugo N. · 2026 · Sauvegarde", pied);
  await page.getByRole("button", { name: "Conçu par Hugo N." }).click(); await page.waitForTimeout(200);
  verif("Fenetre À propos", await page.getByRole("dialog").getByText("Version 2.0").isVisible());
  await shot(page, "03-a-propos", false);
  await page.keyboard.press("Escape");
  verif("Format suisse dans la liste « 1'200 × 3'000 mm »", await page.getByText("1'200 × 3'000 mm").first().isVisible());
  const axe = await new AxeBuilder({ page }).analyze();
  const graves = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  verif("Accessibilite Elements : aucun defaut grave", !graves.length, graves.map((v) => `${v.id} ${v.nodes.length} : ${v.nodes.slice(0, 5).map((x) => x.target.join(" ") + " " + (x.any[0]?.data?.contrastRatio ?? "")).join(" ; ")}`).join(", "));

  // Valeurs absurdes : signalees et enregistrement refuse (sans demander le PIN)
  await page.getByLabel("Largeur L (mm)").fill("-1000"); await page.keyboard.press("Tab");
  verif("Largeur negative signalee", await page.getByText("La largeur doit être supérieure à 0.").isVisible());
  await page.getByRole("button", { name: "Enregistrer" }).click(); await page.waitForTimeout(300);
  verif("Largeur negative : enregistrement refuse", !(await page.getByText("Code PIN requis").isVisible()), await toasts(page));
  await page.getByLabel("Largeur L (mm)").fill("1200"); await page.keyboard.press("Tab");
  await page.getByLabel("Composition verre").first().fill("abc"); await page.keyboard.press("Tab");
  verif("Composition de verre « abc » signalee", await page.getByText(/composition de verre non reconnue/).isVisible());
  await shot(page, "04-saisie-invalide");
  await page.getByLabel("Composition verre").first().fill("6/16/6"); await page.keyboard.press("Tab");

  // Modifications non enregistrees : fenetre au style de l'appli
  await page.getByRole("link", { name: "Matériaux" }).click(); await page.waitForTimeout(300);
  const quitter = await page.getByRole("alertdialog").isVisible();
  verif("Quitter avec des modifs : fenetre Épure", quitter);
  await shot(page, "05-quitter-modifs", false);
  if (quitter) await page.getByRole("button", { name: "Rester" }).click();
  await page.waitForTimeout(200);
  verif("« Rester » garde la page", page.url().endsWith("/"));

  // Enregistrement : PIN faux puis bon PIN
  await page.getByLabel("Largeur L (mm)").fill("1250"); await page.keyboard.press("Tab");
  await page.getByRole("button", { name: "Enregistrer" }).click(); await page.waitForTimeout(300);
  await page.getByLabel("Code PIN", { exact: true }).fill("0000"); await page.keyboard.press("Enter"); await page.waitForTimeout(400);
  await page.getByLabel("Code PIN", { exact: true }).fill("1234"); await page.keyboard.press("Enter"); await page.waitForTimeout(900);
  const t = await toasts(page);
  verif("Bon PIN : plus de « PIN incorrect » affiche", !/PIN incorrect/.test(t), t);
  verif("Element enregistre", /enregistré/.test(t) && etat.rpc.includes("save_element"));

  // Fiche PDF telechargee directement
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByRole("button", { name: "Fiche PDF" }).click()]);
  await dl.saveAs(`${OUT}/fiche.pdf`);
  verif("Fiche PDF telechargee", /\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename());

  // Suppression : fenetre Épure, annulation
  await page.getByRole("button", { name: "Supprimer" }).click(); await page.waitForTimeout(300);
  verif("Supprimer : fenetre Épure", await page.getByRole("alertdialog").getByText("Mettre cet élément à la corbeille ?").isVisible());
  await shot(page, "06-supprimer", false);
  await page.getByRole("button", { name: "Annuler" }).click();
  verif("Aucune fenetre native du navigateur", etat.natifs === 0, `${etat.natifs}`);

  // Hors ligne avec copie locale
  etat.horsLigne = true;
  let t0 = Date.now();
  await page.reload({ waitUntil: "load" });
  const copie = await page.getByText(/copie locale du/).waitFor({ timeout: 20000 }).then(() => true, () => false);
  verif("Hors ligne : copie locale affichee", copie && await page.getByText("Cassette alu").first().isVisible(), `${Date.now() - t0} ms`);
  await shot(page, "07-hors-ligne-copie", false);
  await c.close();
});

await step("Hors ligne sans copie", async () => {
  const { c, page, etat } = await ctx();
  etat.horsLigne = true;
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: "load" });
  const vu = await page.getByText("Base de données injoignable").waitFor({ timeout: 20000 }).then(() => true, () => false);
  verif("Hors ligne sans copie : message et bouton Réessayer", vu && await page.getByRole("button", { name: "Réessayer" }).isVisible(), `${Date.now() - t0} ms`);
  await shot(page, "08-hors-ligne-vide", false);
  await c.close();
});

await step("Gros volume", async () => {
  const { c, page } = await ctx({ gros: true });
  await aller(page);
  const lat = [];
  for (const ch of ["1", "2", "3"]) {
    await page.getByLabel("Largeur L (mm)").focus();
    const t = await page.evaluate(() => performance.now());
    await page.keyboard.type(ch);
    lat.push(await page.evaluate((t) => new Promise((r) => requestAnimationFrame(() => r(performance.now() - t))), t));
  }
  const max = Math.round(Math.max(...lat));
  verif("50 composants / 207 materiaux : saisie fluide (< 300 ms par frappe)", max < 300, `${lat.map(Math.round).join(" / ")} ms`);
  await c.close();
});

for (const [chemin, nom] of [["materiaux", "Matériaux"], ["listes", "Listes"], ["corbeille", "Corbeille"]]) {
  await step(`Page ${nom}`, async () => {
    const { c, page } = await ctx();
    await aller(page, chemin);
    if (chemin === "listes") { await page.getByRole("button", { name: /Livraison 1/ }).click(); await page.waitForTimeout(300); }
    await shot(page, `10-${chemin}`);
    const axe = await new AxeBuilder({ page }).analyze();
    const graves = axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    verif(`Accessibilite ${nom} : aucun defaut grave`, !graves.length, graves.map((v) => `${v.id} ${v.nodes.length}`).join(", "));
    await c.close();
  });
}

await step("Mode sombre", async () => {
  const { c, page } = await ctx({ dark: true });
  await aller(page);
  verif("Mode sombre retenu", await page.evaluate(() => document.documentElement.classList.contains("dark")));
  await shot(page, "20-sombre");
  await aller(page, "listes"); await page.getByRole("button", { name: /Livraison 1/ }).click(); await page.waitForTimeout(300);
  await shot(page, "21-sombre-listes");
  await c.close();
});

await browser.close();
writeFileSync(`${OUT}/checkup.txt`, lignes.join("\n") + "\n");
console.log(lignes.join("\n"));
