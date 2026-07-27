// VA PIVOT — deterministic synthetic dataset generator.
// Emits a graph-shaped JSON (collections + graph nodes/edges) that mirrors the Neo4j
// model in PIVOT_DEMO_DATA_SPEC.md, so it doubles as a Neo4j loader later.
// ALL DATA IS FABRICATED. NPIs deliberately FAIL the NPI check digit; TINs use the
// `00-` prefix (never a real EIN). No real PII/PHI.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../src/data/dataset.json");

// ---------- deterministic RNG (mulberry32) ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 20260701;
const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const chance = (p) => rnd() < p;
const round2 = (n) => Math.round(n * 100) / 100;

// ---------- NPI check-digit helpers (ensure every NPI is INVALID) ----------
function npiCheckDigit(prefix9) {
  const s = "80840" + prefix9;
  let total = 0;
  const digits = s.split("").reverse();
  for (let i = 0; i < digits.length; i++) {
    let d = parseInt(digits[i], 10);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    total += d;
  }
  return (10 - (total % 10)) % 10;
}
function isValidNpi(npi) {
  return npiCheckDigit(npi.slice(0, 9)) === parseInt(npi[9], 10);
}
// make a random INVALID npi (looks like a valid 10-digit NPI but fails the check)
function makeInvalidNpi() {
  let prefix = "1";
  for (let i = 0; i < 8; i++) prefix += int(0, 9);
  const valid = npiCheckDigit(prefix);
  const bad = (valid + 1) % 10; // guaranteed wrong
  const npi = prefix + bad;
  if (isValidNpi(npi)) throw new Error("npi unexpectedly valid: " + npi);
  return npi;
}
let tinCounter = 1000;
const makeTin = () => `00-${String(1000000 + tinCounter++).slice(-7)}`;

// ---------- reference tables ----------
const CPT = {
  "99211": { desc: "Office visit, established, level 1", allowed: 24 },
  "99212": { desc: "Office visit, established, level 2", allowed: 57 },
  "99213": { desc: "Office visit, established, level 3", allowed: 92 },
  "99214": { desc: "Office visit, established, level 4", allowed: 131 },
  "99215": { desc: "Office visit, established, level 5", allowed: 184 },
  "43239": { desc: "Upper GI endoscopy with biopsy", allowed: 600 },
  "43235": { desc: "Upper GI endoscopy, diagnostic", allowed: 410 },
  "90935": { desc: "Hemodialysis, single evaluation", allowed: 88 },
  "93000": { desc: "Electrocardiogram, complete", allowed: 18 },
  "71046": { desc: "Chest X-ray, 2 views", allowed: 30 },
  "97110": { desc: "Therapeutic exercise, 15 min", allowed: 32 },
  "70551": { desc: "MRI brain without contrast", allowed: 250 },
  "20610": { desc: "Arthrocentesis, major joint", allowed: 65 },
  "99283": { desc: "Emergency dept visit, level 3", allowed: 120 },
  "E1390": { desc: "Oxygen concentrator (DME)", allowed: 210 },
  "D0120": { desc: "Periodic oral evaluation", allowed: 40 },
  "D1110": { desc: "Prophylaxis, adult cleaning", allowed: 95 },
  "H0018": { desc: "Behavioral health, short-term residential, per diem", allowed: 640 }
};
const DX = {
  I10: "Essential hypertension",
  "E11.9": "Type 2 diabetes mellitus",
  "N18.6": "End-stage renal disease",
  "K21.9": "Gastro-esophageal reflux disease",
  "M54.5": "Low back pain",
  "J45.909": "Asthma, unspecified",
  "R07.9": "Chest pain, unspecified",
  "Z00.00": "General adult medical exam",
  "F10.20": "Alcohol dependence, uncomplicated"
};
const TAXONOMY = {
  "207R00000X": "Internal Medicine",
  "208600000X": "Surgery",
  "207RN0300X": "Nephrology",
  "2085R0202X": "Diagnostic Radiology",
  "207RC0000X": "Cardiovascular Disease",
  "251E00000X": "Home Health Agency",
  "1223G0001X": "Dentist, General Practice",
  "332B00000X": "Durable Medical Equipment",
  "282N00000X": "General Acute Care Hospital",
  "324500000X": "Substance Abuse Rehabilitation Facility"
};
const FIRST = ["Robert","Danielle","Walter","Marcus","Linda","James","Patricia","Angela","Victor","Rosa","Derek","Sandra","Theodore","Gloria","Nathan","Yolanda","Curtis","Beatrice","Hector","Denise","Raymond","Estelle","Franklin","Camille","Oscar","Vivian","Leon","Marguerite","Clifford","Dolores"];
const LAST = ["Hayes","Cross","Briggs","Ellison","Navarro","Pruitt","Alvarado","Whitfield","Barrera","Kowalski","Sizemore","Delacroix","Ferris","Ackerman","Vega","Lombardi","Sturgeon","Mancini","Ocampo","Redding","Thibodeaux","Yancey","Holloway","Escobar","Ridley","Fontaine","Broussard","Galloway","Winslow","Cavazos"];
const TX_CITIES = ["San Antonio","Austin","Corpus Christi","Houston","El Paso","Laredo","McAllen","Waco","Lubbock","Odessa"];
const ANALYSTS = ["Dana Whitmore","Maria Delgado","Devon Carter","Priya Nair"];
const FWA = {
  UPCODING: "Upcoding",
  UNBUNDLING: "Unbundling",
  MODIFIER: "Modifier misuse",
  DUPLICATE: "Duplicate claim",
  FREQUENCY: "Frequency / over-utilization",
  OUTSIDE_SPECIALTY: "Billing outside specialty",
  DECEASED: "Deceased patient",
  PHANTOM: "Phantom billing",
  AUTH_MISMATCH: "Authorization mismatch",
  RESIDENTIAL_LOS: "Residential length-of-stay abuse"
};

// FAMS composite anomaly groups — the spokes on the provider report-card radar.
// Each provider gets a 0-100 score per group (vs a peer norm); outliers spike.
const GROUPS = ["Charge & Payment", "Diagnostic Testing", "Distance / Travel", "Utilization", "Coding"];
const RULES = [
  { id: "rule_ncci_43235_43239", code: "NCCI-PTP 43235/43239", name: "NCCI Procedure-to-Procedure edit", source: "CMS NCCI", category: "Coding", description: "43235 is a component of 43239 and not separately payable in the same session.", version: "2.3", effectiveDate: "2025-01-01", environment: "Production" },
  { id: "rule_mue", code: "MUE", name: "Medically Unlikely Edit", source: "CMS", category: "Coding", description: "Units billed exceed the medically unlikely threshold for the code.", version: "1.7", effectiveDate: "2024-10-01", environment: "Production" },
  { id: "rule_mod59", code: "MOD-59-OVERRIDE", name: "Modifier 59 override review", source: "CMS NCCI", category: "Coding", description: "Modifier 59 applied to bypass a PTP edit without documented distinct service.", version: "1.2", effectiveDate: "2025-02-01", environment: "Production" },
  { id: "rule_mppr", code: "MPPR", name: "Multiple Procedure Payment Reduction", source: "CMS", category: "Pricing", description: "Reduces payment for the second and subsequent procedures in the same session.", version: "1.0", effectiveDate: "2024-07-01", environment: "Production" },
  { id: "rule_fee", code: "FEE-SCHEDULE", name: "Fee schedule / pricing validation", source: "VA Fee Schedule", category: "Pricing", description: "Validates paid amount against the applicable VA fee schedule / CMAC allowance.", version: "3.1", effectiveDate: "2025-01-15", environment: "Production" },
  { id: "rule_dup", code: "DUP-CLAIM", name: "Duplicate claim detection", source: "VA", category: "Integrity", description: "Claim duplicates a previously adjudicated claim (same provider, patient, date, code).", version: "2.0", effectiveDate: "2024-09-01", environment: "Production" },
  { id: "rule_auth", code: "AUTH-MISMATCH", name: "Referral/authorization mismatch", source: "VA", category: "Coverage", description: "Billed service does not match the authorized referral.", version: "1.4", effectiveDate: "2024-12-01", environment: "Production" },
  { id: "rule_payreport", code: "PAY-REPORT", name: "Pay-and-report threshold", source: "VA", category: "Workflow", description: "Claim paid with appended flag metadata and routed to the analyst workload module for post-payment review.", version: "1.1", effectiveDate: "2025-01-01", environment: "Production" }
];
const MODELS = [
  { id: "model_em_peer", name: "E/M Peer-Group Profile", type: "Anomaly Detection", description: "Flags providers whose E/M level distribution deviates from specialty peers." },
  { id: "model_freq", name: "Per-Patient Frequency", type: "Anomaly Detection", description: "Flags procedure frequency far above per-patient norms." },
  { id: "model_mod", name: "Modifier Abuse Pattern", type: "Anomaly Detection", description: "Flags abnormal modifier-59 override rates vs peers." },
  { id: "model_los", name: "Residential LOS & Network", type: "Anomaly Detection", description: "Flags clusters of just-under-threshold residential stays with shared patients/registration across facilities." }
];

// ---------- date helpers (deterministic; no Date.now) ----------
const pad = (n) => String(n).padStart(2, "0");
function isoDate(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function randomDOS() { // within 2025
  const m = int(1, 12); const d = int(1, 28); return isoDate(2025, m, d);
}
function dob() { return isoDate(int(1945, 1985), int(1, 12), int(1, 28)); }

// ---------- collections ----------
const providers = [];
const veterans = [];
const claims = [];
const authorizations = [];
const payments = [];
const allegations = [];
const edges = [];

let claimSeq = 0, authSeq = 0, paySeq = 0, allgSeq = 20600;
function claimNumber() {
  const a = String.fromCharCode(65 + int(0, 25));
  return `${a}${int(100, 999)}X${int(10, 99)}K${int(1, 9)}-0${int(0, 9)}-${pad(int(1, 40))}`;
}

function addVeteran(explicit = {}) {
  const id = explicit.id || `V${String(veterans.length + 1).padStart(4, "0")}`;
  const v = {
    id,
    name: explicit.name || `${pick(FIRST)} ${pick(LAST)}`,
    dob: explicit.dob || dob(),
    sex: explicit.sex || pick(["M", "F"]),
    city: explicit.city || pick(TX_CITIES),
    state: "TX",
    memberId: `MBR-${int(100000, 999999)}`,
    ssn: "000-00-" + String(int(1000, 9999))
  };
  veterans.push(v);
  return v;
}

function addClaim({ provider, veteran, type = "837P", dos, lines, claimStatus = "Paid", paymentType = "POST", pending = false }) {
  claimSeq++;
  // a pending (pre-payment) claim has nothing paid yet — allowed is the amount at risk.
  if (pending) lines.forEach((l) => { l.paid = 0; });
  const billed = round2(lines.reduce((s, l) => s + l.billed, 0));
  const allowed = round2(lines.reduce((s, l) => s + l.allowed, 0));
  const paid = round2(lines.reduce((s, l) => s + l.paid, 0));
  const id = `C${String(claimSeq).padStart(5, "0")}`;
  // authorization always on file; payment only exists once the claim is paid
  authSeq++; const authId = `A${String(authSeq).padStart(5, "0")}`;
  authorizations.push({ id: authId, authId: `AUTH-${int(100000, 999999)}`, veteranId: veteran.id, providerId: provider.id, service: lines[0].description, validFrom: "2025-01-01", validTo: "2025-12-31", status: "Active" });
  let payId = null;
  if (!pending) { paySeq++; payId = `P${String(paySeq).padStart(5, "0")}`; payments.push({ id: payId, paymentId: `RA-${int(1000000, 9999999)}`, claimId: id, amount: paid, date: dos, remittance835: `835-${int(100000, 999999)}` }); }
  const claim = {
    id, claimNumber: claimNumber(), type, providerId: provider.id, veteranId: veteran.id,
    dateOfService: dos, billedAmount: billed, allowedAmount: allowed, paidAmount: paid,
    claimStatus: pending ? "Pending" : claimStatus, paymentType: pending ? "PRE" : paymentType, authorizationId: authId, paymentId: payId,
    diagnosisCodes: lines[0].dx ? [lines[0].dx] : [],
    lines: lines.map((l, i) => ({
      lineId: `${id}-L${i + 1}`, cpt: l.cpt, modifiers: l.modifiers || [], units: l.units || 1,
      billed: l.billed, allowed: l.allowed, paid: l.paid, description: l.description,
      violatesRuleIds: l.violatesRuleIds || []
    }))
  };
  claims.push(claim);
  return claim;
}
const cptLine = (cpt, opts = {}) => {
  const base = CPT[cpt];
  const allowed = opts.allowed ?? base.allowed;
  return { cpt, description: base.desc, units: opts.units || 1, billed: opts.billed ?? allowed, allowed, paid: opts.paid ?? allowed, modifiers: opts.modifiers || [], dx: opts.dx, violatesRuleIds: opts.violatesRuleIds || [] };
};

// ========== HERO PROVIDERS ==========
const P1 = { id: "PR001", name: "Alamo Internal Medicine Associates", npi: "1326579229", tin: "00-6820473", taxonomyCode: "207R00000X", city: "San Antonio", state: "TX", peerGroup: "internal_medicine_tx", role: "hero" };
const P2 = { id: "PR002", name: "Rio Grande Surgical Partners", npi: "1487653920", tin: "00-6820473", taxonomyCode: "208600000X", city: "San Antonio", state: "TX", peerGroup: "surgery_tx", role: "hero" };
const P3 = { id: "PR003", name: "Coastal Kidney Care", npi: "1902887434", tin: "00-2039118", taxonomyCode: "207RN0300X", city: "Corpus Christi", state: "TX", peerGroup: "nephrology_tx", role: "hero" };
[P1, P2, P3].forEach((p) => { p.taxonomyLabel = TAXONOMY[p.taxonomyCode]; providers.push(p); });

// ---- Scenario 1: Upcoding at P1 (340 visits, ~92% level-5) ----
const s1Vets = [];
for (let i = 0; i < 30; i++) s1Vets.push(addVeteran());
const robert = addVeteran({ id: "V0001", name: "Robert Hayes", sex: "M", city: "San Antonio" });
s1Vets.push(robert);
let s1Upcoded = 0, s1ExposurePost = 0;
const P1_TOTAL = 340;
for (let i = 0; i < P1_TOTAL; i++) {
  const isUp = i < 312; // 312/340 = ~92% billed at 99215
  const cpt = isUp ? "99215" : pick(["99213", "99214"]);
  const dx = pick(["I10", "E11.9", "K21.9", "Z00.00"]);
  const line = cptLine(cpt, { dx });
  if (isUp) {
    line.violatesRuleIds = ["model_em_peer"];
    const appropriate = chance(0.5) ? "99213" : "99214"; // what it should have been
    s1ExposurePost += CPT["99215"].allowed - CPT[appropriate].allowed;
    s1Upcoded++;
  }
  const v = i === 0 ? robert : pick(s1Vets);
  addClaim({ provider: P1, veteran: v, dos: i === 0 ? "2025-03-11" : randomDOS(), lines: [line] });
}
s1ExposurePost = round2(s1ExposurePost);

// ---- Scenario 2: Unbundling / modifier-59 at P2 (31 paired claims, 28 improper) ----
const s2Vets = [];
const danielle = addVeteran({ id: "V0002", name: "Danielle Cross", sex: "F", city: "San Antonio" });
s2Vets.push(danielle);
for (let i = 0; i < 5; i++) s2Vets.push(addVeteran()); // 6 shared with P1 total (danielle + 5)
// wire the 6 shared vets into P1 too (shared-patient ring signal)
s2Vets.forEach((v) => {
  addClaim({ provider: P1, veteran: v, dos: randomDOS(), lines: [cptLine("99214", { dx: "I10" })] });
  edges.push({ type: "SHARES_PATIENT_WITH", source: P1.id, target: P2.id, props: { veteranId: v.id } });
});
let s2Improper = 0, s2ExposurePost = 0;
for (let i = 0; i < 31; i++) {
  const improper = i < 28;
  const l1 = cptLine("43239", { dx: "K21.9" });
  const l2 = cptLine("43235", { dx: "K21.9", modifiers: improper ? ["59"] : [] });
  if (improper) {
    l2.violatesRuleIds = ["rule_ncci_43235_43239", "rule_mod59"];
    s2ExposurePost += CPT["43235"].allowed; // the improperly paid component
    s2Improper++;
  }
  const v = i === 0 ? danielle : pick(s2Vets);
  addClaim({ provider: P2, veteran: v, dos: i === 0 ? "2025-04-22" : randomDOS(), lines: [l1, l2] });
}
s2ExposurePost = round2(s2ExposurePost);

// ---- Scenario 3: legitimate high-frequency dialysis at P3 ----
const walter = addVeteran({ id: "V0003", name: "Walter Briggs", sex: "M", city: "Corpus Christi", dob: "1951-03-09" });
let s3ExposurePost = 0;
for (let i = 0; i < 36; i++) {
  const line = cptLine("90935", { dx: "N18.6", violatesRuleIds: ["model_freq"] });
  s3ExposurePost += CPT["90935"].allowed;
  // spread across ~90 days (Feb-Apr 2025)
  const month = 2 + Math.floor(i / 12); const day = 1 + (i % 12) * 2;
  addClaim({ provider: P3, veteran: walter, type: "837P", dos: isoDate(2025, month, Math.min(day, 28)), lines: [line] });
}
s3ExposurePost = round2(s3ExposurePost);

// ========== PEER PROVIDERS (Internal Medicine, scenario-1 comparison) ==========
const PEERS = [
  { name: "Hill Country Primary Care", npi: "1558210048", share: 0.12 },
  { name: "Bexar Family Physicians", npi: "1730264871", share: 0.16 },
  { name: "Guadalupe Medical Group", npi: "1649073322", share: 0.11 },
  { name: "Mission Trails Internists", npi: "1902114565", share: 0.15 },
  { name: "Live Oak Family Health", npi: "1265498035", share: 0.09 },
  { name: "Riverwalk Primary Care", npi: "1417802258", share: 0.18 }
];
PEERS.forEach((pd, idx) => {
  const p = { id: `PR1${String(idx).padStart(2, "0")}`, name: pd.name, npi: pd.npi, tin: makeTin(), taxonomyCode: "207R00000X", taxonomyLabel: TAXONOMY["207R00000X"], city: pick(TX_CITIES), state: "TX", peerGroup: "internal_medicine_tx", role: "peer", em99215Share: pd.share };
  providers.push(p);
  edges.push({ type: "IN_PEER_GROUP", source: p.id, target: P1.id, props: {} });
  // small sample of claims per peer to make drill-down real
  const n = int(10, 14);
  for (let i = 0; i < n; i++) {
    const cpt = chance(pd.share) ? "99215" : pick(["99212", "99213", "99214"]);
    addClaim({ provider: p, veteran: pick(veterans), dos: randomDOS(), lines: [cptLine(cpt, { dx: pick(["I10", "E11.9", "Z00.00"]) })] });
  }
});

// ========== BACKGROUND PROVIDERS ==========
const BG = [
  { id: "PR200", name: "Gulf Coast Radiology", tax: "2085R0202X", cpts: ["70551", "71046"], flagged: true },
  { id: "PR201", name: "Lone Star DME Supply", tax: "332B00000X", cpts: ["E1390"], flagged: true },
  { id: "PR202", name: "Pecos Valley Hospital", tax: "282N00000X", cpts: ["99283"], type: "837I", flagged: true },
  { id: "PR203", name: "South Texas Dental", tax: "1223G0001X", cpts: ["D0120", "D1110"], type: "837D", flagged: true },
  { id: "PR204", name: "Big Bend Cardiology", tax: "207RC0000X", cpts: ["93000", "99214"], flagged: true },
  { id: "PR205", name: "Trinity Home Health", tax: "251E00000X", cpts: ["97110"], type: "837I", flagged: true },
  { id: "PR206", name: "Concho Valley Orthopedics", tax: "208600000X", cpts: ["20610", "99214"], flagged: false },
  { id: "PR207", name: "Padre Island Pediatrics", tax: "207R00000X", cpts: ["99213", "99214"], flagged: false },
  { id: "PR208", name: "West Texas Neurology", tax: "207RC0000X", cpts: ["70551", "99214"], flagged: false }
];
BG.forEach((b) => {
  const p = { id: b.id, name: b.name, npi: makeInvalidNpi(), tin: makeTin(), taxonomyCode: b.tax, taxonomyLabel: TAXONOMY[b.tax], city: pick(TX_CITIES), state: "TX", peerGroup: b.tax, role: "background", flagged: b.flagged };
  providers.push(p);
  const n = int(8, 12);
  for (let i = 0; i < n; i++) {
    const cpt = pick(b.cpts);
    addClaim({ provider: p, veteran: pick(veterans), type: b.type || "837P", dos: randomDOS(), lines: [cptLine(cpt, { dx: pick(Object.keys(DX)) })] });
  }
});

// ========== COLLUSION CHAIN: cross-state residential-treatment shuffling ==========
// A ring of residential/substance-abuse facilities under one holding company (shared
// business registration + shared officer) shuffles the SAME veterans across AZ→CA→NV
// for back-to-back <30-day stays, banking near-full 30-day per-diem charges each time.
// Distinct from the P1/P2 shared-TIN ring — this is a multi-state chain with shared
// registration/officer and shared patients but SEPARATE TINs (a harder-to-see ring).
const CHAIN_REG = { officer: "Marcus D. Feld", registration: "Meridian Behavioral Holdings LLC", regId: "REG-AZ-0098124" };
const CHAIN = [
  { id: "PR300", name: "Sonoran Recovery Center", city: "Phoenix", state: "AZ" },
  { id: "PR301", name: "Pacific Sands Treatment", city: "San Diego", state: "CA" },
  { id: "PR302", name: "Silver State Wellness", city: "Las Vegas", state: "NV" },
  { id: "PR303", name: "Desert Bloom Behavioral", city: "Tucson", state: "AZ" }
];
const chainProviders = CHAIN.map((c) => {
  const p = { id: c.id, name: c.name, npi: makeInvalidNpi(), tin: makeTin(), taxonomyCode: "324500000X", taxonomyLabel: TAXONOMY["324500000X"], city: c.city, state: c.state, peerGroup: "residential_treatment", role: "chain", flagged: true, officer: CHAIN_REG.officer, registration: CHAIN_REG.registration, registrationId: CHAIN_REG.regId };
  providers.push(p);
  return p;
});
// shared officer + shared business registration across every pair in the chain
for (let i = 0; i < chainProviders.length; i++) {
  for (let j = i + 1; j < chainProviders.length; j++) {
    edges.push({ type: "SHARES_OFFICER", source: chainProviders[i].id, target: chainProviders[j].id, props: { officer: CHAIN_REG.officer } });
    edges.push({ type: "SHARES_REGISTRATION", source: chainProviders[i].id, target: chainProviders[j].id, props: { registration: CHAIN_REG.registration, regId: CHAIN_REG.regId } });
  }
}
// 7 veterans cycled through the chain: each does 2-3 back-to-back <30-day stays in
// different states within a quarter. Track shared-patient overlap between facilities.
const chainVets = [];
const chainVetNames = [["V0004", "Curtis Holloway"], ["V0005", "Beatrice Vega"], ["V0006", "Franklin Ridley"], ["V0007", "Estelle Munoz"], ["V0008", "Leon Ackerman"], ["V0009", "Gloria Sturgeon"], ["V0010", "Hector Ocampo"]];
chainVetNames.forEach(([id, name]) => chainVets.push(addVeteran({ id, name, state: "AZ", city: "Phoenix" })));
const chainPairCounts = {}; // "PR300|PR301" -> shared veteran count
let chainExposureByProvider = {}; chainProviders.forEach((p) => (chainExposureByProvider[p.id] = 0));
let chainStayTotal = 0, chainShortStays = 0;
chainVets.forEach((v, vi) => {
  const hops = 2 + (vi % 2); // 2 or 3 facilities
  const visited = [];
  let month = 1, day = 3;
  for (let h = 0; h < hops; h++) {
    const fac = chainProviders[(vi + h) % chainProviders.length];
    visited.push(fac.id);
    const stayDays = int(21, 29); // deliberately just under the 30-day threshold
    chainStayTotal++; chainShortStays++;
    // one per-diem residential claim covering the stay (units = days)
    const line = cptLine("H0018", { dx: "F10.20", units: stayDays, billed: 640 * stayDays, allowed: 640 * stayDays, paid: 640 * stayDays, violatesRuleIds: ["model_los"] });
    addClaim({ provider: fac, veteran: v, type: "837I", dos: isoDate(2025, month, Math.min(day, 28)), lines: [line] });
    chainExposureByProvider[fac.id] += Math.round(640 * stayDays * 0.5); // ~half deemed improper (over-length / medically unnecessary readmission)
    // advance ~1 month for the next back-to-back stay
    month += 1; day = int(2, 10);
    edges.push({ type: "TREATED_BY", source: v.id, target: fac.id, props: { stayDays } });
  }
  // record shared-patient overlap for each facility pair this veteran links
  for (let a = 0; a < visited.length; a++) {
    for (let b = a + 1; b < visited.length; b++) {
      const key = [visited[a], visited[b]].sort().join("|");
      chainPairCounts[key] = (chainPairCounts[key] || 0) + 1;
    }
  }
});
// SHARES_PATIENT_WITH edges between chain facilities (weighted by shared-veteran count)
Object.keys(chainPairCounts).forEach((key) => {
  const [s, t] = key.split("|");
  edges.push({ type: "SHARES_PATIENT_WITH", source: s, target: t, props: { sharedVeterans: chainPairCounts[key] } });
});

// ========== ALLEGATIONS ==========
function addAllegation({ providerId, claimId = null, fwaType, riskScore, confidence, source, status, assignee = null, claimType = "837P", exposurePre = 0, exposurePost, submittedForRecovery = 0, verifiedRecoupment = 0, narrative = "", xai = null, decision = null, model = null, rules = [], id = null, mode = "retrospective", recommendedAction = null }) {
  const aid = id || String(++allgSeq);
  const a = { id: aid, providerId, claimId, fwaType, riskScore, confidence, source, status, assignee, claimType, exposurePre, exposurePost, submittedForRecovery, verifiedRecoupment, narrative, xai, decision, modelId: model, ruleIds: rules, mode, recommendedAction, createdDate: isoDate(2025, int(6, 10), int(1, 28)) };
  allegations.push(a);
  if (claimId) edges.push({ type: "FLAGS", source: `ALLG-${aid}`, target: claimId, props: {} });
  edges.push({ type: "HAS_ALLEGATION", source: providerId, target: `ALLG-${aid}`, props: { fwaType } });
  return a;
}
// computed P1 E/M share (consistent with final aggregates — includes ring-shared claims)
const p1Em = claims.filter((c) => c.providerId === P1.id && c.lines.some((l) => l.cpt.startsWith("9921")));
const p1Lvl5 = p1Em.filter((c) => c.lines.some((l) => l.cpt === "99215")).length;
const p1SharePct = Math.round((p1Lvl5 / p1Em.length) * 100);

// find a representative claim id for each hero
const p1Claim = claims.find((c) => c.providerId === P1.id && c.lines.some((l) => l.cpt === "99215"));
const p2Claim = claims.find((c) => c.providerId === P2.id && c.lines.some((l) => l.modifiers.includes("59")));
const p3Claim = claims.find((c) => c.providerId === P3.id);

// Hero 1
addAllegation({
  id: "20481", providerId: P1.id, claimId: p1Claim.id, fwaType: FWA.UPCODING, riskScore: 94, confidence: 88,
  source: "Pattern Recognition", status: "New", claimType: "837P", exposurePost: s1ExposurePost, model: "model_em_peer",
  narrative: "",
  xai: {
    summary: `E/M level distribution deviates 5.8σ from the Internal Medicine peer group: 99215 share ${p1SharePct}% vs peer median 14%, sustained across 11 months. Linked diagnoses show low clinical complexity. No rules fired — flagged by a composite ML/AI anomaly model.`,
    factors: [
      { label: "99215 share", value: `${p1SharePct}%`, benchmark: "peer median 14%" },
      { label: "Deviation", value: "5.8σ above peer group" },
      { label: "Claims in pattern", value: `${p1Lvl5} of ${p1Em.length}` },
      { label: "Diagnosis support", value: "Low complexity (e.g. I10)" }
    ]
  }
});
// Hero 2
addAllegation({
  id: "20517", providerId: P2.id, claimId: p2Claim.id, fwaType: FWA.UNBUNDLING, riskScore: 91, confidence: 92,
  source: "Both", status: "New", claimType: "837P", exposurePost: s2ExposurePost, model: "model_mod",
  rules: ["rule_ncci_43235_43239", "rule_mod59"], narrative: "",
  xai: {
    summary: "NCCI Procedure-to-Procedure edit: 43235 is bundled into 43239 and not separately payable in the same session. Modifier 59 applied on 28/31 paired claims to bypass the edit; documentation does not support a distinct procedural service. Override rate 90% vs peer 6%.",
    factors: [
      { label: "NCCI PTP edit", value: "43235 ↔ 43239" },
      { label: "Modifier-59 override rate", value: "90%", benchmark: "peer 6%" },
      { label: "Improper paired claims", value: `${s2Improper} of 31` },
      { label: "Shared TIN with PR001", value: "00-6820473 (ring)" }
    ]
  }
});
// Hero 3 (legitimate / to be dismissed)
addAllegation({
  id: "20463", providerId: P3.id, claimId: p3Claim.id, fwaType: FWA.FREQUENCY, riskScore: 78, confidence: 61,
  source: "Pattern Recognition", status: "Under review", assignee: "Dana Whitmore", claimType: "837P",
  exposurePost: s3ExposurePost, model: "model_freq",
  narrative: "Requested medical record. Patient has ESRD (N18.6) with standing order for thrice-weekly in-center hemodialysis.",
  xai: {
    summary: "Per-patient procedure frequency 6.2σ above norm: CPT 90935 billed 36× in 90 days for a single patient. Confidence is low — frequency alone, no corroborating anomaly. Review of the medical record indicates a standing dialysis regimen consistent with ESRD.",
    factors: [
      { label: "Frequency", value: "36 claims / 90 days" },
      { label: "Deviation", value: "6.2σ (single patient)" },
      { label: "Model confidence", value: "61% (low)" },
      { label: "Clinical context", value: "ESRD dialysis — appropriate" }
    ]
  }
});

// Background allegations (flagged BG providers + a couple more on hero providers)
const bgAllegs = [
  { id: "20390", p: "PR200", fwa: FWA.MODIFIER, risk: 83, conf: 79, src: "Pattern Recognition", status: "Assigned", who: "Maria Delgado", exp: 9240 },
  { id: "20355", p: "PR201", fwa: FWA.DUPLICATE, risk: 71, conf: 84, src: "Rules Engine", status: "Assigned", who: "Devon Carter", exp: 6010, rules: ["rule_dup"] },
  { id: "20318", p: "PR202", fwa: FWA.UPCODING, risk: 88, conf: 76, src: "Pattern Recognition", status: "New", who: null, exp: 41900, type: "837I" },
  { id: "20274", p: "PR203", fwa: FWA.OUTSIDE_SPECIALTY, risk: 64, conf: 70, src: "Pattern Recognition", status: "Under review", who: "Priya Nair", exp: 2830, type: "837D" },
  { id: "20208", p: "PR204", fwa: FWA.UNBUNDLING, risk: 80, conf: 81, src: "Both", status: "Assigned", who: "Dana Whitmore", exp: 7450, rules: ["rule_ncci_43235_43239"] },
  { id: "20155", p: "PR205", fwa: FWA.PHANTOM, risk: 90, conf: 69, src: "Pattern Recognition", status: "New", who: null, exp: 18300, type: "837I" },
  { id: "20092", p: "PR001", fwa: FWA.DECEASED, risk: 96, conf: 74, src: "Rules Engine", status: "New", who: null, exp: 540 },
  { id: "20061", p: "PR002", fwa: FWA.AUTH_MISMATCH, risk: 68, conf: 83, src: "Rules Engine", status: "Assigned", who: "Maria Delgado", exp: 3900, rules: ["rule_auth"] },
  { id: "20033", p: "PR003", fwa: FWA.MODIFIER, risk: 52, conf: 66, src: "Pattern Recognition", status: "Recommended close", who: "Devon Carter", exp: 1210 }
];
bgAllegs.forEach((b) => addAllegation({
  id: b.id, providerId: b.p, fwaType: b.fwa, riskScore: b.risk, confidence: b.conf, source: b.src,
  status: b.status, assignee: b.who, claimType: b.type || "837P", exposurePost: b.exp, rules: b.rules || [],
  xai: { summary: `${b.fwa} flagged for review. Estimated post-payment exposure $${b.exp.toLocaleString()}.`, factors: [] }
}));
// ---- collusion-chain allegations (one per residential facility) ----
const chainSharedTotal = Object.values(chainPairCounts).reduce((s, n) => s + n, 0);
const CHAIN_ALLEGS = [
  { id: "20544", p: "PR300", risk: 92, conf: 87, status: "New", who: null },
  { id: "20538", p: "PR301", risk: 89, conf: 85, status: "New", who: null },
  { id: "20531", p: "PR302", risk: 90, conf: 84, status: "Assigned", who: "Devon Carter" },
  { id: "20525", p: "PR303", risk: 86, conf: 82, status: "Assigned", who: "Priya Nair" }
];
CHAIN_ALLEGS.forEach((c) => {
  const fac = providers.find((p) => p.id === c.p);
  const claim = claims.find((cl) => cl.providerId === c.p && cl.lines.some((l) => l.cpt === "H0018"));
  const sharedWith = Object.keys(chainPairCounts).filter((k) => k.indexOf(c.p) >= 0).reduce((s, k) => s + chainPairCounts[k], 0);
  addAllegation({
    id: c.id, providerId: c.p, claimId: claim ? claim.id : null, fwaType: FWA.RESIDENTIAL_LOS,
    riskScore: c.risk, confidence: c.conf, source: "Both", status: c.status, assignee: c.who,
    claimType: "837I", exposurePost: chainExposureByProvider[c.p], model: "model_los", rules: ["rule_fee"],
    xai: {
      summary: `${fac.name} is one of ${chainProviders.length} residential facilities under a single holding company (${CHAIN_REG.registration}, officer ${CHAIN_REG.officer}) that cycle the same veterans across AZ/CA/NV for back-to-back stays kept just under the 30-day threshold — banking near-full per-diem charges on each readmission. Shared patients with ${sharedWith} cross-facility overlaps; separate TINs mask the common ownership.`,
      factors: [
        { label: "Chain facilities", value: `${chainProviders.length} across AZ · CA · NV` },
        { label: "Shared registration", value: CHAIN_REG.registration, benchmark: "separate TINs" },
        { label: "Avg length of stay", value: "~25 days", benchmark: "30-day threshold" },
        { label: "Cross-facility shared patients", value: `${sharedWith}` }
      ]
    }
  });
});

// a few more generic ones to fill the queue to 24+ (excludes the chain-only FWA type)
const genProviders = ["PR200", "PR204", "PR205", "PR206", "PR207", "PR208"];
const genFwa = Object.values(FWA).filter((f) => f !== FWA.RESIDENTIAL_LOS);
while (allegations.length < 28) {
  const p = pick(genProviders);
  const fwa = pick(genFwa);
  addAllegation({ providerId: p, fwaType: fwa, riskScore: int(40, 79), confidence: int(60, 90), source: pick(["Pattern Recognition", "Rules Engine"]), status: pick(["New", "Assigned", "Under review"]), assignee: chance(0.5) ? pick(ANALYSTS) : null, exposurePost: int(800, 12000), xai: { summary: `${fwa} flagged for review.`, factors: [] } });
}

// ========== RING EDGES ==========
edges.push({ type: "SHARES_TIN", source: P1.id, target: P2.id, props: { tin: "00-6820473" } });
for (let i = 0; i < 9; i++) edges.push({ type: "REFERRED_TO", source: P1.id, target: P2.id, props: {} });

// ========== provider aggregates ==========
providers.forEach((p) => {
  const pClaims = claims.filter((c) => c.providerId === p.id);
  const emClaims = pClaims.filter((c) => c.lines.some((l) => l.cpt.startsWith("9921")));
  const lvl5 = emClaims.filter((c) => c.lines.some((l) => l.cpt === "99215")).length;
  p.claimCount = pClaims.length;
  p.totalPaid = round2(pClaims.reduce((s, c) => s + c.paidAmount, 0));
  if (emClaims.length) p.em99215ShareComputed = round2(lvl5 / emClaims.length);
  const pAllegs = allegations.filter((a) => a.providerId === p.id);
  p.openAllegations = pAllegs.length;
  p.riskScore = pAllegs.length ? Math.max(...pAllegs.map((a) => a.riskScore)) : 0;
});

// ========== provider report-card group scores (radar spokes + drill-down) ==========
// Each provider scores 0-100 per FAMS composite group vs a peer norm. Scenario
// providers spike on the group matching their anomaly; peers/clean sit near the norm.
const PEER_NORM = { "Charge & Payment": 38, "Diagnostic Testing": 34, "Distance / Travel": 30, "Utilization": 40, "Coding": 36 };
const SPIKE = {
  PR001: { "Coding": 88, "Charge & Payment": 74 },
  PR002: { "Coding": 84, "Charge & Payment": 71 },
  PR003: { "Utilization": 86 },
  PR300: { "Distance / Travel": 92, "Utilization": 83, "Charge & Payment": 68 },
  PR301: { "Distance / Travel": 90, "Utilization": 81, "Charge & Payment": 66 },
  PR302: { "Distance / Travel": 91, "Utilization": 84, "Charge & Payment": 69 },
  PR303: { "Distance / Travel": 88, "Utilization": 79, "Charge & Payment": 64 }
};
// map a background provider's primary FWA to the group it spikes
const FWA_GROUP = {
  [FWA.UPCODING]: "Coding", [FWA.UNBUNDLING]: "Coding", [FWA.MODIFIER]: "Coding",
  [FWA.OUTSIDE_SPECIALTY]: "Coding", [FWA.DUPLICATE]: "Charge & Payment",
  [FWA.PHANTOM]: "Charge & Payment", [FWA.DECEASED]: "Charge & Payment",
  [FWA.AUTH_MISMATCH]: "Charge & Payment", [FWA.FREQUENCY]: "Utilization",
  [FWA.RESIDENTIAL_LOS]: "Distance / Travel"
};
const OUTLIER_DELTA = 22; // score - peer at/above this = outlier spoke
function attrRows(p, group, outlier) {
  // scenario-specific attribute drill-downs where we have a story; else generic.
  if (p.id === "PR001" && group === "Coding") return [
    { label: "99215 share of established E/M", value: "90%", peer: "14%", outlier: true },
    { label: "Level-5 vs documented complexity", value: "5.8σ high", peer: "±1σ", outlier: true },
    { label: "Down-coding rate", value: "0.4%", peer: "6%", outlier: true }
  ];
  if (p.id === "PR003" && group === "Utilization") return [
    { label: "Per-patient procedure frequency", value: "36 / 90 days", peer: "9 / 90 days", outlier: true },
    { label: "Single-patient concentration", value: "100%", peer: "18%", outlier: true },
    { label: "Clinical justification on file", value: "ESRD dialysis order", peer: "—", outlier: false }
  ];
  if ((p.role === "chain") && group === "Distance / Travel") return [
    { label: "Cross-state stays / patient", value: "2–3 (AZ·CA·NV)", peer: "0", outlier: true },
    { label: "Avg miles between stays", value: "540 mi", peer: "35 mi", outlier: true },
    { label: "Shared-registration facilities", value: `${chainProviders.length}`, peer: "1", outlier: true }
  ];
  if ((p.role === "chain") && group === "Utilization") return [
    { label: "Avg length of stay", value: "25 days", peer: "14 days", outlier: true },
    { label: "Stays under 30-day threshold", value: "100%", peer: "22%", outlier: true },
    { label: "30-day readmission rate", value: "71%", peer: "9%", outlier: true }
  ];
  // generic rows
  return [
    { label: group + " index vs peers", value: outlier ? "elevated" : "in range", peer: "norm", outlier: !!outlier },
    { label: "Percentile within specialty", value: outlier ? "97th" : "" + int(35, 70) + "th", peer: "50th", outlier: !!outlier }
  ];
}
providers.forEach((p) => {
  const primaryFwa = (allegations.filter((a) => a.providerId === p.id).sort((a, b) => b.riskScore - a.riskScore)[0] || {}).fwaType;
  const spike = SPIKE[p.id] || (p.flagged && primaryFwa && FWA_GROUP[primaryFwa] ? { [FWA_GROUP[primaryFwa]]: int(60, 68) } : {});
  p.groupScores = GROUPS.map((g) => {
    const peer = PEER_NORM[g];
    const score = spike[g] != null ? spike[g] : Math.max(8, Math.min(96, peer + int(-8, 9)));
    return { group: g, score, peer, outlier: score - peer >= OUTLIER_DELTA };
  });
  p.groupAttributes = {};
  p.groupScores.forEach((gs) => { p.groupAttributes[gs.group] = attrRows(p, gs.group, gs.outlier); });
});

// ========== graph nodes (curated for the network view) ==========
const graphNodes = [];
providers.forEach((p) => graphNodes.push({ id: p.id, type: "Provider", label: p.name, props: { npi: p.npi, tin: p.tin, specialty: p.taxonomyLabel, risk: p.riskScore, role: p.role } }));
// include key veterans (shared ring + dialysis + collusion chain)
[robert, danielle, walter, ...s2Vets, ...chainVets].forEach((v) => {
  if (!graphNodes.find((n) => n.id === v.id)) graphNodes.push({ id: v.id, type: "Veteran", label: v.name, props: { city: v.city, state: v.state } });
});
allegations.forEach((a) => graphNodes.push({ id: `ALLG-${a.id}`, type: "Allegation", label: `${a.fwaType} (${a.riskScore})`, props: { fwaType: a.fwaType, risk: a.riskScore, status: a.status } }));
// veteran<->provider edges for graph (shared ring + dialysis); chain TREATED_BY edges
// were already pushed during chain generation.
s2Vets.forEach((v) => { edges.push({ type: "TREATED_BY", source: v.id, target: P1.id, props: {} }); edges.push({ type: "TREATED_BY", source: v.id, target: P2.id, props: {} }); });
edges.push({ type: "TREATED_BY", source: walter.id, target: P3.id, props: { claims: 36 } });

// ========== KPIs ==========
const openAllegs = allegations.length;
const totalExposurePost = round2(allegations.reduce((s, a) => s + (a.exposurePost || 0), 0));
const kpis = {
  openAllegations: openAllegs,
  closedAllegations: 8734,
  exposurePre: 514902.40,
  exposurePost: totalExposurePost,
  submittedForRecovery: 4126540.00,
  verifiedRecoupment: 168430.00,
  mostAgedAllegationId: "20044",
  mostAgedDate: "2025-04-30",
  avgTimeToCompletionDays: 71
};
const anomalyBreakdown = {};
allegations.forEach((a) => { anomalyBreakdown[a.fwaType] = (anomalyBreakdown[a.fwaType] || 0) + 1; });

// ========== precedents (historical adjudicated cases, for "similar cases") ==========
// Synthetic closed cases the reviewer can consult for precedent. Grouped by FWA type.
const PRECEDENTS = [
  { id: "19842", fwaType: FWA.UPCODING, provider: "Trinity Valley Clinic", specialty: "Internal Medicine", exposure: 18400, outcome: "Confirmed", recovered: 15200, adjudicatedDate: "2025-01-14", analyst: "Maria Delgado", note: "E/M level inflation confirmed; provider education + partial recovery." },
  { id: "19765", fwaType: FWA.UPCODING, provider: "Brazos Family Care", specialty: "Family Medicine", exposure: 9100, outcome: "Dismissed", recovered: 0, adjudicatedDate: "2024-12-03", analyst: "Devon Carter", note: "Documentation supported higher-complexity visits; no overpayment." },
  { id: "19710", fwaType: FWA.UNBUNDLING, provider: "Gulf Surgical Center", specialty: "Surgery", exposure: 12600, outcome: "Confirmed", recovered: 12600, adjudicatedDate: "2025-02-02", analyst: "Priya Nair", note: "NCCI PTP violation with modifier 59; full recovery." },
  { id: "19688", fwaType: FWA.UNBUNDLING, provider: "Coastal Endoscopy Assoc.", specialty: "Gastroenterology", exposure: 5400, outcome: "Confirmed", recovered: 4800, adjudicatedDate: "2024-11-21", analyst: "Maria Delgado", note: "Component billing of a comprehensive code; partial recovery after appeal." },
  { id: "19655", fwaType: FWA.FREQUENCY, provider: "Rio Dialysis Partners", specialty: "Nephrology", exposure: 3300, outcome: "Dismissed", recovered: 0, adjudicatedDate: "2025-01-28", analyst: "Devon Carter", note: "ESRD dialysis regimen; thrice-weekly frequency clinically appropriate." },
  { id: "19640", fwaType: FWA.FREQUENCY, provider: "Permian Imaging", specialty: "Radiology", exposure: 7700, outcome: "Confirmed", recovered: 6900, adjudicatedDate: "2024-10-30", analyst: "Priya Nair", note: "Excessive repeat imaging without documented indication." },
  { id: "19602", fwaType: FWA.MODIFIER, provider: "Hill Country Orthopedics", specialty: "Orthopedics", exposure: 6100, outcome: "Confirmed", recovered: 5200, adjudicatedDate: "2025-01-09", analyst: "Maria Delgado", note: "Modifier 25 misuse on E/M billed with a procedure." },
  { id: "19588", fwaType: FWA.DUPLICATE, provider: "Sabine DME Services", specialty: "Durable Medical Equipment", exposure: 4200, outcome: "Confirmed", recovered: 4200, adjudicatedDate: "2024-12-19", analyst: "Devon Carter", note: "Exact duplicate resubmission; recovered." },
  { id: "19571", fwaType: FWA.DECEASED, provider: "Guadalupe Home Health", specialty: "Home Health", exposure: 2600, outcome: "Confirmed", recovered: 2600, adjudicatedDate: "2024-11-05", analyst: "Priya Nair", note: "Services billed after date of death; recovered and referred." },
  { id: "19560", fwaType: FWA.PHANTOM, provider: "Chisholm Therapy Group", specialty: "Physical Therapy", exposure: 14800, outcome: "Confirmed", recovered: 11200, adjudicatedDate: "2025-02-11", analyst: "Maria Delgado", note: "Services not rendered; referred to OIG." },
  { id: "19544", fwaType: FWA.OUTSIDE_SPECIALTY, provider: "South Plains Dental", specialty: "Dental", exposure: 1900, outcome: "Dismissed", recovered: 0, adjudicatedDate: "2024-12-08", analyst: "Devon Carter", note: "Provider dual-credentialed; billing appropriate." },
  { id: "19531", fwaType: FWA.AUTH_MISMATCH, provider: "Nueces Surgical", specialty: "Surgery", exposure: 5600, outcome: "Confirmed", recovered: 5600, adjudicatedDate: "2025-01-22", analyst: "Priya Nair", note: "Service exceeded authorized referral scope." }
];

// ========== monthly trends (temporal analysis) ==========
const TRENDS = [
  { month: "2024-08", flagged: 21, exposure: 148300, recovered: 41200 },
  { month: "2024-09", flagged: 26, exposure: 176800, recovered: 52600 },
  { month: "2024-10", flagged: 19, exposure: 131500, recovered: 47800 },
  { month: "2024-11", flagged: 31, exposure: 212400, recovered: 63900 },
  { month: "2024-12", flagged: 28, exposure: 198700, recovered: 58100 },
  { month: "2025-01", flagged: 34, exposure: 241900, recovered: 71500 },
  { month: "2025-02", flagged: 30, exposure: 219600, recovered: 66200 },
  { month: "2025-03", flagged: 24, exposure: totalExposurePostForTrend(), recovered: 39400 }
];
function totalExposurePostForTrend() { return round2(allegations.reduce((s, a) => s + (a.exposurePost || 0), 0)); }

// ========== seed a couple of pre-existing investigations (escalated) ==========
["20155", "20092"].forEach((id) => { var a = allegations.find((x) => x.id === id); if (a) a.status = "Escalated"; });

// ========== PREPAY: pre-payment triage (pending claims scored BEFORE payment) ==========
// A parallel "prepay" mode. Claims are scored before money goes out and the analyst
// decides Pay / Hold / Deny. Several come from providers already flagged post-pay (stop
// the NEXT improper payment); a couple are clean auto-pay candidates. Kept out of the
// retrospective KPIs/graph/report-cards on purpose (this block runs after those).
const provById = (id) => providers.find((p) => p.id === id);
const PREPAY = [
  { pid: "PR300", type: "837I", cpt: "H0018", units: 27, fwa: FWA.RESIDENTIAL_LOS, risk: 93, conf: 88, rec: "deny", model: "model_los", rules: ["rule_fee"], note: "New 27-day residential stay from a facility in the flagged Meridian Behavioral chain — the same veteran was discharged from the AZ facility 26 days ago. Deny before the per-diem is paid." },
  { pid: "PR002", type: "837P", cpts: [["43239", { dx: "K21.9" }], ["43235", { dx: "K21.9", modifiers: ["59"] }]], fwa: FWA.UNBUNDLING, risk: 88, conf: 90, rec: "deny", rules: ["rule_ncci_43235_43239", "rule_mod59"], note: "43235 unbundled from 43239 with modifier 59 — the same NCCI-PTP pattern this TIN was flagged for post-pay. Deny the component line." },
  { pid: "PR001", type: "837P", cpt: "99215", dx: "I10", fwa: FWA.UPCODING, risk: 82, conf: 74, rec: "hold", model: "model_em_peer", note: "Level-5 E/M on an established hypertension visit from a provider billing 99215 on ~90% of visits. Hold for records before paying." },
  { pid: "PR201", type: "837P", cpt: "E1390", fwa: FWA.DUPLICATE, risk: 77, conf: 85, rec: "deny", rules: ["rule_dup"], note: "Oxygen concentrator billed twice within 30 days for the same veteran. Duplicate — deny the second." },
  { pid: "PR205", type: "837I", cpt: "97110", units: 8, fwa: FWA.PHANTOM, risk: 84, conf: 66, rec: "hold", model: "model_freq", note: "8 therapeutic-exercise units billed for a home-health visit with no matching visit note on file. Hold pending documentation." },
  { pid: "PR200", type: "837P", cpt: "70551", fwa: FWA.FREQUENCY, risk: 70, conf: 72, rec: "hold", model: "model_freq", note: "Third brain MRI for this veteran in 60 days. Hold for prior-imaging review." },
  { pid: "PR204", type: "837P", cpts: [["93000", {}], ["99214", { dx: "R07.9" }]], fwa: FWA.MODIFIER, risk: 44, conf: 61, rec: "pay", note: "EKG + E/M billed same day; modifier logic checks out and the amount matches the fee schedule. Low risk — clear to pay." },
  { pid: "PR206", type: "837P", cpt: "20610", dx: "M54.5", fwa: "Routine — no anomaly", risk: 19, conf: 95, rec: "pay", note: "Major-joint injection consistent with the referral and fee schedule. No anomaly — auto-pay candidate." },
  { pid: "PR207", type: "837P", cpt: "99213", dx: "Z00.00", fwa: "Routine — no anomaly", risk: 14, conf: 96, rec: "pay", note: "Routine established-patient visit. Clean — clear to pay." }
];
const recLabel = { pay: "Pay", hold: "Hold for records", deny: "Deny" };
let ppId = 20721;
PREPAY.forEach((s) => {
  const prov = provById(s.pid);
  const vet = pick(veterans);
  const lines = (s.cpts || [[s.cpt, { dx: s.dx }]]).map(([cpt, o]) => {
    o = o || {}; const units = o.units || s.units || 1; const base = CPT[cpt].allowed;
    return cptLine(cpt, Object.assign({ units, billed: base * units, allowed: base * units }, o));
  });
  if (s.rec !== "pay") lines.forEach((l) => { l.violatesRuleIds = (s.rules && s.rules.length ? s.rules : (s.model ? [s.model] : [])); });
  const claim = addClaim({ provider: prov, veteran: vet, type: s.type, dos: "2025-07-0" + (1 + (ppId % 9)), lines, pending: true });
  const src = (s.rules && s.rules.length && s.model) ? "Both" : s.model ? "Pattern Recognition" : "Rules Engine";
  addAllegation({
    id: String(ppId++), providerId: s.pid, claimId: claim.id, fwaType: s.fwa, riskScore: s.risk, confidence: s.conf,
    source: src, status: "Pending", claimType: s.type, exposurePre: claim.allowedAmount, exposurePost: 0,
    mode: "prepay", recommendedAction: s.rec, model: s.model || null, rules: s.rules || [],
    xai: { summary: s.note, factors: [{ label: "Amount at risk", value: "$" + claim.allowedAmount.toLocaleString() }, { label: "Recommended", value: recLabel[s.rec] }] }
  });
});

// ========== provider historical-claim volumes (12 months) — retro aggregate + sparklines ==========
const HIST_MONTHS = ["2024-04", "2024-05", "2024-06", "2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03"];
providers.forEach((p) => {
  const perMonth = Math.max(1, Math.round((p.claimCount || 6) / 12));
  const avgPaid = (p.totalPaid || 0) / Math.max(1, p.claimCount || 1);
  p.history = HIST_MONTHS.map((m) => {
    const claims = Math.max(0, perMonth + int(-2, 3));
    const flagged = (p.flagged || p.role === "chain" || p.role === "hero") && chance(0.45) ? int(1, 3) : 0;
    return { month: m, claims, paid: round2(claims * avgPaid), flagged };
  });
});

// ========== ensure EVERY lead carries an itemized claim (consistency) ==========
// Some data-driven leads were created without a claim reference, so they couldn't be
// expanded to line items on the case page. Attach a synthetic itemized claim to each
// claimless retrospective lead — FWA-appropriate CPT lines, at least one flagged — so
// all leads load their claim data the same way. Runs LAST: no earlier RNG shifts, so
// the tuned hero scenarios stay byte-stable.
const FWA_LINES = {
  [FWA.UPCODING]: () => [cptLine("99215", { dx: "I10", violatesRuleIds: ["rule_fee"] }), cptLine("99213", { dx: "I10" })],
  [FWA.UNBUNDLING]: () => [cptLine("43239", { dx: "K21.9" }), cptLine("43235", { dx: "K21.9", modifiers: ["59"], violatesRuleIds: ["rule_ncci_43235_43239", "rule_mod59"] })],
  [FWA.MODIFIER]: () => [cptLine("20610", { dx: "M54.5", modifiers: ["59"], violatesRuleIds: ["rule_mod59"] }), cptLine("99213", { dx: "M54.5" })],
  [FWA.DUPLICATE]: () => [cptLine("E1390", { violatesRuleIds: ["rule_dup"] }), cptLine("E1390", {})],
  [FWA.FREQUENCY]: () => [cptLine("90935", { dx: "N18.6", units: 4, billed: CPT["90935"].allowed * 4, allowed: CPT["90935"].allowed * 4, paid: CPT["90935"].allowed * 4, violatesRuleIds: ["rule_mue"] })],
  [FWA.OUTSIDE_SPECIALTY]: () => [cptLine("70551", { violatesRuleIds: ["rule_fee"] }), cptLine("99213", { dx: "Z00.00" })],
  [FWA.DECEASED]: () => [cptLine("99214", { dx: "Z00.00", violatesRuleIds: ["rule_fee"] })],
  [FWA.PHANTOM]: () => [cptLine("97110", { units: 8, billed: CPT["97110"].allowed * 8, allowed: CPT["97110"].allowed * 8, paid: CPT["97110"].allowed * 8, violatesRuleIds: ["rule_fee"] })],
  [FWA.AUTH_MISMATCH]: () => [cptLine("71046", { violatesRuleIds: ["rule_auth"] }), cptLine("99213", { dx: "R07.9" })],
  [FWA.RESIDENTIAL_LOS]: () => [cptLine("H0018", { units: 28, billed: CPT["H0018"].allowed * 28, allowed: CPT["H0018"].allowed * 28, paid: CPT["H0018"].allowed * 28, violatesRuleIds: ["rule_fee"] })]
};
const defaultLines = () => [cptLine("99214", { dx: "I10", violatesRuleIds: ["rule_fee"] }), cptLine("99213", { dx: "I10" })];
allegations.forEach((a) => {
  if (a.claimId || a.mode === "prepay") return;
  const prov = provById(a.providerId); if (!prov) return;
  const claim = addClaim({ provider: prov, veteran: pick(veterans), type: a.claimType || "837P", dos: randomDOS(), lines: (FWA_LINES[a.fwaType] || defaultLines)() });
  a.claimId = claim.id;
  edges.push({ type: "FLAGS", source: `ALLG-${a.id}`, target: claim.id, props: {} });
});

// ---- give every lead's claim a MIX of flagged + unflagged lines (full context) ----
// Adjudicators need the whole picture: the flagged line(s) AND the routine, clean
// lines around them. Append clean ancillary context line(s) to any lead-claim that is
// all-flagged. Non-E/M codes so provider E/M-share metrics stay put. Runs last.
const _claimById = {}; claims.forEach((c) => { _claimById[c.id] = c; });
const _payByClaim = {}; payments.forEach((p) => { _payByClaim[p.claimId] = p; });
const CLEAN_CTX = ["93000", "71046"];
allegations.forEach((a) => {
  const c = a.claimId ? _claimById[a.claimId] : null; if (!c) return;
  const hasFlagged = c.lines.some((l) => (l.violatesRuleIds || []).length);
  const hasClean = c.lines.some((l) => !(l.violatesRuleIds || []).length);
  if (!hasFlagged || hasClean) return; // only all-flagged claims need clean context
  const extras = [cptLine(CLEAN_CTX[0], {})];
  if (chance(0.6)) extras.push(cptLine(CLEAN_CTX[1], {}));
  extras.forEach((l) => {
    c.lines.push({ lineId: `${c.id}-L${c.lines.length + 1}`, cpt: l.cpt, modifiers: [], units: l.units || 1, billed: l.billed, allowed: l.allowed, paid: c.paymentType === "PRE" ? 0 : l.paid, description: l.description, violatesRuleIds: [] });
  });
  c.billedAmount = round2(c.lines.reduce((s, l) => s + l.billed, 0));
  c.allowedAmount = round2(c.lines.reduce((s, l) => s + l.allowed, 0));
  c.paidAmount = round2(c.lines.reduce((s, l) => s + l.paid, 0));
  const pay = _payByClaim[c.id]; if (pay) pay.amount = c.paidAmount;
});

// ========== assemble + write ==========
const dataset = {
  meta: {
    generator: "generate-data.mjs", seed: SEED,
    disclaimer: "Synthetic data — for demonstration only. Not real Veterans, providers, or claims.",
    riskScale: "0-100 (High >= 80, Medium 50-79, Low < 50)",
    notes: "NPIs deliberately fail the NPI check digit; TINs use the 00- prefix. Amounts are illustrative CMS-allowed proxies.",
    counts: {}
  },
  providers, veterans, claims, authorizations, payments, rules: RULES, models: MODELS, allegations,
  precedents: PRECEDENTS,
  trends: TRENDS,
  peerBenchmarks: { internal_medicine_em: { median99215Share: 0.14, peerCount: PEERS.length } },
  kpis, anomalyBreakdown,
  graph: { nodes: graphNodes, edges }
};
dataset.meta.counts = {
  providers: providers.length, veterans: veterans.length, claims: claims.length,
  allegations: allegations.length, edges: edges.length, graphNodes: graphNodes.length
};

// sanity checks
const badNpi = providers.filter((p) => isValidNpi(p.npi));
if (badNpi.length) throw new Error("Some NPIs are VALID (must be invalid): " + badNpi.map((p) => p.npi).join(","));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(dataset, null, 2));

// Also emit a browser global so the static site opens with no server (file://):
// assets/data.js -> window.PIVOT_DATA = {...}
const JS_OUT = resolve(__dirname, "../assets/data.js");
mkdirSync(dirname(JS_OUT), { recursive: true });
writeFileSync(JS_OUT, "/* Auto-generated by generate-data.mjs — do not edit. */\nwindow.PIVOT_DATA = " + JSON.stringify(dataset) + ";\n");

console.log("PIVOT dataset written to", OUT, "and", JS_OUT);
console.log("counts:", dataset.meta.counts);
console.log("hero exposures — S1 upcoding: $%s | S2 unbundling: $%s | S3 dialysis(flagged): $%s",
  s1ExposurePost.toLocaleString(), s2ExposurePost.toLocaleString(), s3ExposurePost.toLocaleString());
console.log("P1 computed 99215 share:", providers.find((p) => p.id === "PR001").em99215ShareComputed);
console.log("all NPIs invalid-by-construction:", badNpi.length === 0);
console.log("anomaly breakdown:", anomalyBreakdown);
