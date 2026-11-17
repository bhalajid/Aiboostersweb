#!/usr/bin/env node
/* AI Draw public track record.
 *
 * Before every draw: saves AI Draw's 10 lines for that draw (exactly what the page suggests,
 * computed by the page's own code from ai-draw.html) and 10 random lines. Once saved, an entry
 * is never changed, and the git commit time proves it was saved before the draw.
 * After the draw: scores both sets against the official result and prize table.
 *
 * Usage: node scripts/ai-draw/track_record.js <site-root>
 * Reads ai-draw.html and data/ai-draw-results.json, writes data/ai-draw-track.json.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

const root = process.argv[2] || ".";
const LINES = 10;
const html = fs.readFileSync(path.join(root, "ai-draw.html"), "utf8");
const results = JSON.parse(fs.readFileSync(path.join(root, "data/ai-draw-results.json"), "utf8"));
const outFile = path.join(root, "data/ai-draw-track.json");
const track = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : {games: {}};

// ---- the page's own data and picker code, so the record follows exactly what users see
const dLine = html.split("\n").find((l) => l.trim().startsWith("var D = "));
if (!dLine) throw new Error("ai-draw.html: data line not found");
const D = JSON.parse(dLine.trim().slice("var D = ".length).replace(/;\s*$/, ""));
const start = html.indexOf("// ================================================================ AI Draw app");
const end = html.indexOf("  function reasons(");
if (start < 0 || end < start) throw new Error("ai-draw.html: picker code not found");
const ctx = {D, S: {history: false}, Math, Date, Intl, JSON, Object, Array, Number, Infinity};
vm.createContext(ctx);
vm.runInContext(html.slice(start, end) +
  "\n;this.API = {GAMES: GAMES, pickLines: pickLines, drawMin: drawMin, hashStr: hashStr, mulberry: mulberry, sampleK: sampleK, wins: wins};", ctx);
const {GAMES, pickLines, drawMin, hashStr, mulberry, sampleK, wins} = ctx.API;

function berlinNow() {
  const p = {};
  new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"})
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return {date: p.year + "-" + p.month + "-" + p.day, min: +p.hour * 60 + +p.minute};
}
function addDays(iso, n) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weekday(iso) { return new Date(iso + "T12:00:00Z").getUTCDay(); }
function plain(l) { return {main: l.main.slice(), extra: (l.extra || []).slice()}; }
function stakeOf(key) {
  if (key === "eurojackpot") return D.pricing.stake;
  if (key === "lotto649") return D.lotto649.price.after;
  return D.euromillions.price;
}

// ---- 1. register the next draw of every game (only before its draw time)
const now = berlinNow();
let changed = false;
Object.keys(GAMES).forEach((key) => {
  const g = GAMES[key]; if (!g) return;
  const res = (results.games || {})[key] || {};
  let date = res.next && res.next >= now.date ? res.next : null;
  if (!date) { date = now.date; for (let i = 0; i < 8 && g.days.indexOf(weekday(date)) < 0; i++) date = addDays(date, 1); }
  if (date === now.date && now.min >= drawMin(g, date) - 5) return;      // too close to the draw: never register late
  const list = (track.games[key] = track.games[key] || []);
  if (list.some((e) => e.date === date)) return;                          // saved entries are never changed
  g.res = {next: date};
  const ai = pickLines(g, LINES, 0).map(plain);
  const rng = mulberry(hashStr(key + "|" + date + "|random"));
  const random = [];
  for (let i = 0; i < LINES; i++) random.push({
    main: sampleK(g.pool, g.pick, rng).sort((a, b) => a - b),
    extra: g.extra ? sampleK(g.extra.pool, g.extra.pick, rng).sort((a, b) => a - b) : []});
  const entry = {date, registered: new Date().toISOString().replace(/\.\d+Z$/, "Z"), algorithm: D.algorithm_version, stake: stakeOf(key), ai, random, result: null};
  if (key === "lotto649") entry.superzahl = Math.floor(mulberry(hashStr(key + "|" + date + "|sz"))() * 10);   // one ticket number for both sets
  list.push(entry);
  list.sort((a, b) => (a.date < b.date ? 1 : -1));
  changed = true;
  console.log("Registered", key, date);
});

// ---- 2. score every saved draw whose official result is in
function scoreSet(g, key, lines, draw, sz) {
  let prizes = 0, won = 0, unknown = 0;
  const per = lines.map((l) => {
    const m = l.main.filter((n) => draw.main.indexOf(n) >= 0).length;
    const e = l.extra.filter((n) => (draw.extra || []).indexOf(n) >= 0).length;
    const szHit = key === "lotto649" && sz === draw.superzahl;
    if (!wins(g, m, e, szHit)) return {m, e, amount: 0};
    prizes++;
    const cls = (draw.prizes || []).filter((p) => p.m === m && (key === "lotto649" ? p.sz === (szHit ? 1 : 0) : p.e === e))[0];
    if (cls && typeof cls.prize === "number") { won += cls.prize; return {m, e, amount: cls.prize}; }
    unknown++; return {m, e, amount: null};
  });
  return {prizes, won: Math.round(won * 100) / 100, unknown, lines: per};
}
Object.keys(track.games).forEach((key) => {
  const g = GAMES[key]; if (!g) return;
  const draws = ((results.games || {})[key] || {}).draws || [];
  track.games[key].forEach((entry) => {
    if (entry.result && entry.result.final) return;
    const draw = draws.filter((d) => d.date === entry.date)[0];
    if (!draw || !draw.main || !draw.main.length) return;
    const hasTable = (draw.prizes || []).some((p) => typeof p.prize === "number");
    const tooOld = addDays(entry.date, 7) < now.date;
    if (!hasTable && !tooOld && key !== "euromillions") return;           // wait for the prize table
    const r = {main: draw.main, extra: draw.extra || [], ai: scoreSet(g, key, entry.ai, draw, entry.superzahl),
      random: scoreSet(g, key, entry.random, draw, entry.superzahl), amounts: hasTable, final: hasTable || tooOld || key === "euromillions"};
    if (key === "lotto649") r.superzahl = draw.superzahl;
    if (JSON.stringify(r) !== JSON.stringify(entry.result)) { entry.result = r; changed = true; console.log("Scored", key, entry.date); }
  });
});

if (changed || !fs.existsSync(outFile)) {
  track.lines = LINES;
  track.updated = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  fs.writeFileSync(outFile, JSON.stringify(track) + "\n");
} else console.log("Track record unchanged.");
