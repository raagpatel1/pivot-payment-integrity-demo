/* DataProvider — the swappable seam. Reads window.PIVOT_DATA (build-time snapshot).
   Later: a Neo4jProvider returning the same shapes. Attaches to window.DP. */
(function () {
  var D = window.PIVOT_DATA;
  var idx = function (arr) { var o = {}; arr.forEach(function (x) { o[x.id] = x; }); return o; };
  var providers = idx(D.providers), claims = idx(D.claims), veterans = idx(D.veterans),
      rules = idx(D.rules), models = idx(D.models);

  function band(r) { return r >= 80 ? "high" : r >= 50 ? "med" : "low"; }
  // Lead source taxonomy — answers "leads aren't all data-driven; some are manual."
  // data-mining · rules · ML/AI (automated) + hotline/tip · referral · OIG · email · phone (manual).
  var SOURCES = ["ML/AI", "Rules", "Data mining", "Hotline / tip", "Referral", "OIG", "Email", "Phone / call"];
  function sourceOf(a) {
    if (!a) return "ML/AI";
    if (a.sourceType) return a.sourceType;              // explicit (manual / created leads)
    if (a.source === "Rules Engine") return "Rules";
    return "ML/AI";                                     // Pattern Recognition / Both → ML/AI-driven
  }

  // Lead → Case model: a flagged item is a LEAD; once the supervisor APPROVES the
  // analyst's Confirm or Escalate decision, the lead joins or opens the provider's CASE.
  // Leads with status "Pending review" are awaiting supervisor approval and do NOT yet
  // appear in the Cases list. Dismissed leads never open a case.
  var CASE_STATUS = { "Confirmed": 1, "Escalated": 1 };
  var CLOSED_STATUS = { "Dismissed": 1, "Cleared to pay": 1, "Denied": 1 };
  function isCaseLead(a) {
    return !!CASE_STATUS[a.status];
  }
  function usd(n) { return "$" + Math.round(n).toLocaleString(); }
  function usdShort(n) {
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + Math.round(n).toLocaleString();
  }

  window.DP = {
    raw: D,
    meta: D.meta,
    disclaimer: D.meta.disclaimer,
    band: band, usd: usd, usdShort: usdShort,
    SOURCES: SOURCES, sourceOf: sourceOf,
    getKpis: function () { return D.kpis; },
    getAnomalyBreakdown: function () { return D.anomalyBreakdown; },
    getGraph: function () { return D.graph; },
    getPeerBenchmark: function (k) { return D.peerBenchmarks[k]; },
    getProvider: function (id) { return providers[id] || null; },
    getClaim: function (id) { return claims[id] || null; },
    getVeteran: function (id) { return veterans[id] || null; },
    listProviders: function () { return D.providers; },
    listPeers: function () { return D.providers.filter(function (p) { return p.role === "peer"; }); },

    // Historical adjudicated cases of the same FWA type, for reviewer precedent.
    getSimilarAdjudicated: function (fwaType, limit) {
      var rows = (D.precedents || []).filter(function (p) { return p.fwaType === fwaType; })
        .sort(function (a, b) { return a.adjudicatedDate < b.adjudicatedDate ? 1 : -1; });
      return typeof limit === "number" ? rows.slice(0, limit) : rows;
    },

    // ---- subject of investigation (Round 6 Phase B) ----
    // Who/what is under review on a lead: the Provider, the Beneficiary (veteran), or
    // the Pharmacy. Derived from an explicit subjectType on the lead, defaulting to
    // Provider (every data-driven lead today is provider-subject).
    SUBJECT_TYPES: {
      Provider: { label: "Provider", icon: "building-hospital", tone: "asg", desc: "The billing or rendering provider is the subject of the review." },
      Beneficiary: { label: "Beneficiary", icon: "user-heart", tone: "esc", desc: "The veteran / beneficiary is the subject — identity, eligibility or utilization pattern." },
      Pharmacy: { label: "Pharmacy", icon: "prescription", tone: "rev", desc: "The dispensing pharmacy is the subject — NCPDP / NDC prescription claims." }
    },
    subjectTypeOf: function (a) { return (a && a.subjectType && this.SUBJECT_TYPES[a.subjectType]) ? a.subjectType : "Provider"; },

    getAllegation: function (id) {
      var a = D.allegations.find(function (x) { return x.id === id; });
      if (!a) return null;
      var provider = providers[a.providerId] || null;
      var claim = a.claimId ? claims[a.claimId] : null;
      // beneficiary-subject leads carry the veteran directly (no single claim); fall
      // back to the claim's veteran for provider/pharmacy leads.
      var veteran = (claim ? veterans[claim.veteranId] : null) || (a.subjectVeteranId ? veterans[a.subjectVeteranId] : null) || null;
      return Object.assign({}, a, {
        provider: provider, claim: claim, veteran: veteran, subjectType: this.subjectTypeOf(a),
        model: a.modelId ? models[a.modelId] : null,
        rules: (a.ruleIds || []).map(function (rid) { return rules[rid]; }).filter(Boolean)
      });
    },

    listAllegations: function (f) {
      f = f || {};
      var self = this;
      var rows = D.allegations.map(function (a) {
        var p = providers[a.providerId];
        return {
          id: a.id, fwaType: a.fwaType, riskScore: a.riskScore, confidence: a.confidence,
          source: a.source, sourceType: sourceOf(a), status: a.status, assignee: a.assignee, claimType: a.claimType,
          exposurePost: a.exposurePost, exposurePre: a.exposurePre, createdDate: a.createdDate, providerId: a.providerId,
          mode: a.mode || "retrospective", recommendedAction: a.recommendedAction, manual: !!a.manual,
          providerName: p ? p.name : "—", providerNpi: p ? p.npi : "", providerState: p ? p.state : "",
          subjectType: self.subjectTypeOf(a),
          hero: ["20481", "20517", "20463"].indexOf(a.id) >= 0 ? 1 : 0
        };
      });
      // default to the retrospective (post-payment) population; "prepay" or "all" opt in.
      var mode = f.mode || "retrospective";
      if (mode !== "all") rows = rows.filter(function (r) { return r.mode === mode; });
      if (f.fwaType) rows = rows.filter(function (r) { return r.fwaType === f.fwaType; });
      if (f.status) rows = rows.filter(function (r) { return r.status === f.status; });
      if (f.source) rows = rows.filter(function (r) { return r.sourceType === f.source; });
      if (typeof f.minRisk === "number") rows = rows.filter(function (r) { return r.riskScore >= f.minRisk; });
      if (f.query) {
        var q = f.query.toLowerCase();
        rows = rows.filter(function (r) { return [r.providerName, r.fwaType, r.providerNpi, r.id].join(" ").toLowerCase().indexOf(q) >= 0; });
      }
      rows.sort(function (a, b) { return b.riskScore - a.riskScore; });
      return rows;
    },

    getTrends: function () { return D.trends || []; },

    // ---- rule taxonomy (derived, no data regen) ----
    // Every rule is classifiable along five dimensions the compliance program uses.
    // Existing generator rules get their tags here; a few catalog-only rules are
    // appended so each dimension value has real coverage (exclusion, anti-kickback,
    // phantom billing, DME, beneficiary have no firing rule in the seed data).
    RULE_DIMENSIONS: [
      { key: "regulatorySource", label: "Regulatory source", values: ["CMS NCCI edits", "CMS payment rules", "VA CCN policy", "False Claims Act", "Anti-Kickback Statute", "OIG advisories"] },
      { key: "entityType", label: "Entity type", values: ["Provider", "DME supplier", "Pharmacy", "Beneficiary"] },
      { key: "fraudType", label: "Fraud type", values: ["Upcoding", "Unbundling", "Phantom billing", "Medically unnecessary", "Duplicate billing", "Exclusion violations", "Kickback / self-referral", "Authorization / coverage", "Overpayment / pricing", "Workflow"] },
      { key: "detectionLevel", label: "Detection level", values: ["Claim-level", "Provider-pattern", "Network-level"] },
      { key: "severity", label: "Severity", values: ["Critical", "High", "Medium", "Low"] }
    ],
    // taxonomy for the 8 generator rules, keyed by rule id
    RULE_TAXONOMY: {
      rule_ncci_43235_43239: { regulatorySource: "CMS NCCI edits", entityType: "Provider", fraudType: "Unbundling", detectionLevel: "Claim-level", severity: "High" },
      rule_mue: { regulatorySource: "CMS NCCI edits", entityType: "Provider", fraudType: "Medically unnecessary", detectionLevel: "Claim-level", severity: "Medium" },
      rule_mod59: { regulatorySource: "CMS NCCI edits", entityType: "Provider", fraudType: "Unbundling", detectionLevel: "Provider-pattern", severity: "High" },
      rule_mppr: { regulatorySource: "CMS payment rules", entityType: "Provider", fraudType: "Overpayment / pricing", detectionLevel: "Claim-level", severity: "Low" },
      rule_fee: { regulatorySource: "VA CCN policy", entityType: "Provider", fraudType: "Overpayment / pricing", detectionLevel: "Claim-level", severity: "Medium" },
      rule_dup: { regulatorySource: "VA CCN policy", entityType: "Provider", fraudType: "Duplicate billing", detectionLevel: "Claim-level", severity: "High" },
      rule_auth: { regulatorySource: "VA CCN policy", entityType: "Provider", fraudType: "Authorization / coverage", detectionLevel: "Claim-level", severity: "Medium" },
      rule_payreport: { regulatorySource: "VA CCN policy", entityType: "Provider", fraudType: "Workflow", detectionLevel: "Claim-level", severity: "Low" },
      rule_rx_nondispense: { regulatorySource: "VA CCN policy", entityType: "Pharmacy", fraudType: "Phantom billing", detectionLevel: "Provider-pattern", severity: "High" },
      rule_ben_identity: { regulatorySource: "VA CCN policy", entityType: "Beneficiary", fraudType: "Duplicate billing", detectionLevel: "Network-level", severity: "High" }
    },
    // catalog-only rules that broaden coverage across every dimension
    RULE_CATALOG_EXTRA: [
      { id: "rule_em_level", code: "EM-LEVEL", name: "E/M level validation", source: "CMS payment rules", category: "Coding", description: "Evaluation & management level billed exceeds the documented history/exam/decision-making and the provider's peer-group distribution.", version: "2.1", effectiveDate: "2025-01-01", environment: "Production", regulatorySource: "CMS payment rules", entityType: "Provider", fraudType: "Upcoding", detectionLevel: "Provider-pattern", severity: "High" },
      { id: "rule_phantom", code: "SVC-RENDERED", name: "Services-not-rendered screen", source: "False Claims Act", category: "Integrity", description: "Billed service has no corroborating encounter, attendance or delivery record for the date of service.", version: "1.3", effectiveDate: "2024-11-01", environment: "Production", regulatorySource: "False Claims Act", entityType: "Provider", fraudType: "Phantom billing", detectionLevel: "Claim-level", severity: "Critical" },
      { id: "rule_mednec", code: "MED-NEC", name: "Medical-necessity / level-of-care", source: "VA CCN policy", category: "Coverage", description: "Level of care or length of stay exceeds clinical criteria (MCG) for the documented condition.", version: "1.6", effectiveDate: "2024-12-01", environment: "Production", regulatorySource: "VA CCN policy", entityType: "Provider", fraudType: "Medically unnecessary", detectionLevel: "Provider-pattern", severity: "High" },
      { id: "rule_excl", code: "EXCL-LEIE", name: "OIG LEIE exclusion screening", source: "OIG advisories", category: "Integrity", description: "Rendering or billing provider (or ordering physician) appears on the OIG List of Excluded Individuals/Entities — claims paid during exclusion are recoverable in full.", version: "2.0", effectiveDate: "2025-01-01", environment: "Production", regulatorySource: "OIG advisories", entityType: "Provider", fraudType: "Exclusion violations", detectionLevel: "Provider-pattern", severity: "Critical" },
      { id: "rule_aks", code: "AKS-STARK", name: "Anti-kickback / self-referral", source: "Anti-Kickback Statute", category: "Integrity", description: "Referral or financial-arrangement pattern between linked entities indicates a prohibited inducement or self-referral.", version: "1.1", effectiveDate: "2024-10-15", environment: "Production", regulatorySource: "Anti-Kickback Statute", entityType: "Provider", fraudType: "Kickback / self-referral", detectionLevel: "Network-level", severity: "Critical" },
      { id: "rule_dme", code: "DME-NEC", name: "DME medical necessity & delivery", source: "VA CCN policy", category: "Coverage", description: "Durable medical equipment billed without a supporting order, proof of delivery, or documented medical necessity.", version: "1.2", effectiveDate: "2024-09-15", environment: "Production", regulatorySource: "VA CCN policy", entityType: "DME supplier", fraudType: "Medically unnecessary", detectionLevel: "Claim-level", severity: "Medium" },
      { id: "rule_benelig", code: "BEN-ELIG", name: "Beneficiary eligibility & identity", source: "VA CCN policy", category: "Coverage", description: "Service billed for a date the beneficiary was ineligible, deceased, or where identity could not be verified.", version: "1.0", effectiveDate: "2025-02-01", environment: "Production", regulatorySource: "VA CCN policy", entityType: "Beneficiary", fraudType: "Phantom billing", detectionLevel: "Claim-level", severity: "High" }
    ],
    ruleTaxonomyFor: function (id) { return this.RULE_TAXONOMY[id] || null; },
    // full catalog: generator rules enriched with taxonomy + the catalog-only rules.
    getRuleCatalog: function () {
      var tax = this.RULE_TAXONOMY;
      var base = (D.rules || []).map(function (r) { return Object.assign({}, r, tax[r.id] || {}); });
      return base.concat(this.RULE_CATALOG_EXTRA);
    },
    getRules: function () { return D.rules; },

    // ---- rule drill-down (Round 6 Phase D) --------------------------------
    // For a selected rule: its decision LOGIC (criteria / pseudo-logic), the required
    // DATA INPUTS it reads (claim fields → 837/NCPDP segments + external references),
    // and its OUTPUT structure (flag / score / disposition + what it feeds downstream).
    // Rich, hand-authored specs for the rules that matter in the demo; a generic spec
    // derived from the rule's dimensions for the rest. Synthetic — real edit logic
    // (Wendy's FAMS examples) drops in later behind this same shape.
    RULE_DETAIL: {
      rule_ncci_43235_43239: {
        logic: {
          summary: "NCCI procedure-to-procedure (PTP) edit: a column-2 code billed with its column-1 code on the same date by the same provider is bundled unless a valid override modifier documents a distinct service.",
          criteria: [
            { when: "Two lines on the claim form an NCCI PTP pair (column-1 / column-2), same DOS & rendering provider", then: "The pair is subject to the edit" },
            { when: "Modifier indicator = 0", then: "No modifier may override — deny the column-2 line" },
            { when: "Indicator = 1 and no 59 / X{EPSU} modifier present", then: "Bundle — column-2 not separately payable" },
            { when: "Indicator = 1 and a 59 / X modifier present", then: "Payable only if the record documents a distinct procedural service — route to review" }
          ],
          pseudocode: "for each PTP pair (c1,c2) on claim:\n  if indicator==0: deny(c2)\n  elif no override_modifier(c2): bundle(c2)\n  else: review(c2, 'distinct service?')"
        },
        inputs: [
          { field: "Procedure code (HCPCS/CPT)", source: "837P · 2400 · SV1-01", example: "43235, 43239" },
          { field: "Line modifiers", source: "837P · 2400 · SV1-01 (2–5)", example: "59" },
          { field: "Date of service", source: "837P · 2400 · DTP*472", example: "2025-04-22" },
          { field: "Rendering provider NPI", source: "837P · 2310B · NM1*82", example: "1…" },
          { field: "NCCI PTP edit file", source: "External reference · CMS (quarterly)", example: "v31.1" }
        ],
        output: { signal: "flag", emits: "NCCI_PTP_VIOLATION", disposition: "Column-2 line not separately payable — recover as bundled", downstream: "Line adjudication CARC CO-97 · lead created (Unbundling)" }
      },
      rule_mod59: {
        logic: {
          summary: "Modifier-59 / X{EPSU} misuse: an override modifier applied where no distinct procedural service is documented, or a provider whose 59-modifier rate far exceeds the peer norm.",
          criteria: [
            { when: "A 59/X modifier is applied to a line", then: "Confirm an NCCI PTP edit actually exists to override" },
            { when: "No PTP edit exists for the pair", then: "The override is unnecessary — flag as potential unbundling mask" },
            { when: "Provider 59-modifier rate > 3σ above specialty peers", then: "Escalate to a provider-pattern review" }
          ],
          pseudocode: "if modifier in {59,XE,XP,XS,XU}:\n  if not ptp_edit(line): flag('unsupported override')\n  if provider.mod59_rate > peer_mean + 3*peer_sd: flag('pattern')"
        },
        inputs: [
          { field: "Line modifiers", source: "837P · 2400 · SV1-01 (2–5)", example: "59, XU" },
          { field: "Procedure code", source: "837P · 2400 · SV1-01", example: "43235" },
          { field: "Provider 59-modifier rate", source: "Derived · provider claim history", example: "31% vs peer 4%" },
          { field: "NCCI PTP edit file", source: "External reference · CMS", example: "v31.1" }
        ],
        output: { signal: "flag + score", emits: "MODIFIER_59_MISUSE (+ pattern score)", disposition: "Route to review — payable only if the record documents a distinct service", downstream: "Line adjudication · provider-pattern lead" }
      },
      rule_em_level: {
        logic: {
          summary: "E/M upcoding: the evaluation & management level billed exceeds both the documented history/exam/decision-making and the provider's peer-group level distribution.",
          criteria: [
            { when: "Billed E/M level (e.g. 99215) share is far above the specialty peer median", then: "Compute a peer-deviation score (σ)" },
            { when: "Linked diagnoses map to low clinical complexity", then: "Documentation unlikely to support the level" },
            { when: "Deviation ≥ threshold sustained across months", then: "Flag for provider-pattern review + downcode basis" }
          ],
          pseudocode: "share = pct(level5_visits)\nsigma = (share - peer_mean)/peer_sd\nif sigma >= 4 and dx_complexity == 'low': flag(score=sigma)"
        },
        inputs: [
          { field: "E/M procedure code", source: "837P · 2400 · SV1-01", example: "99215" },
          { field: "Diagnosis pointers / codes", source: "837P · 2300 · HI (ABK/ABF)", example: "K21.9" },
          { field: "Provider E/M distribution", source: "Derived · provider claim history", example: "90% level-5 vs peer 14%" },
          { field: "Peer-group benchmark", source: "External reference · specialty peer set", example: "Internal Medicine" }
        ],
        output: { signal: "score → flag", emits: "EM_UPCODE (peer-deviation σ)", disposition: "Downcode to the supported level — recover the differential", downstream: "Lead created (Upcoding) · remittance RARC N657" }
      },
      rule_mednec: {
        logic: {
          summary: "Medical-necessity / level-of-care: the billed level of care or length of stay exceeds clinical criteria (MCG) for the documented condition.",
          criteria: [
            { when: "Billed level of care > MCG-recommended level for the diagnosis", then: "Flag the excess" },
            { when: "Length of stay > authorized / continued-stay criteria", then: "Recover the unauthorized days" },
            { when: "Continued-stay criteria not met on review day", then: "Step-down indicated" }
          ],
          pseudocode: "if los.actual > auth.days and not continued_stay_criteria_met():\n  flag(excess_days = los.actual - auth.days)"
        },
        inputs: [
          { field: "Revenue / procedure code", source: "837I · 2400 · SV2", example: "H0018" },
          { field: "Statement dates (admit–discharge)", source: "837I · 2300 · DTP*434", example: "2025-01-03 – 01-31" },
          { field: "Prior authorization", source: "External reference · UM auth record", example: "14 days approved" },
          { field: "MCG care guideline", source: "External reference · Milliman MCG", example: "BHG-RES" }
        ],
        output: { signal: "flag", emits: "LOC_LOS_EXCEEDED", disposition: "Recover the days beyond the authorized / criteria-met stay", downstream: "Lead (Residential LOS) · remittance RARC N130" }
      },
      rule_excl: {
        logic: {
          summary: "OIG LEIE exclusion screening: the rendering or billing provider (or ordering physician) appears on the OIG List of Excluded Individuals/Entities for a date of service — claims paid during exclusion are recoverable in full.",
          criteria: [
            { when: "Provider NPI/name matches an active LEIE exclusion", then: "Any claim with a DOS during the exclusion is an automatic finding" },
            { when: "Exclusion effective ≤ DOS ≤ reinstatement (or open)", then: "Recover 100% — no medical review needed" }
          ],
          pseudocode: "hit = LEIE.match(provider.npi | provider.name)\nif hit and hit.effective <= dos: flag('excluded', recover=paid)"
        },
        inputs: [
          { field: "Billing / rendering provider NPI", source: "837 · 2010AA / 2310B · NM1", example: "1…" },
          { field: "Ordering physician", source: "837 · 2420E · NM1*DK", example: "—" },
          { field: "Date of service", source: "837 · 2400 · DTP*472/434", example: "…" },
          { field: "OIG LEIE list", source: "External reference · OIG (monthly)", example: "exclusion since 2023-08" }
        ],
        output: { signal: "flag", emits: "LEIE_EXCLUSION (critical)", disposition: "Automatic finding — recover in full; refer to OIG", downstream: "Lead (Exclusion) · supervisor referral" }
      },
      rule_rx_nondispense: {
        logic: {
          summary: "Prescription non-dispensing / DAW screen: a prescription billed with no matching dispensing (pickup) record, or a brand billed under DAW-1 without documented medical necessity where a generic equivalent exists.",
          criteria: [
            { when: "Claim paid but no dispensing / pickup record within the fill window", then: "Flag as non-dispensed — recoverable" },
            { when: "Brand billed with DAW 1 and a generic equivalent exists", then: "Require documented medical necessity" },
            { when: "Quantity billed exceeds the days-supply norm for the drug", then: "Flag excess quantity" }
          ],
          pseudocode: "if paid and not pickup_record(rx): flag('non-dispensed')\nif daw==1 and generic_exists(ndc) and not medical_necessity(): flag('DAW misuse')"
        },
        inputs: [
          { field: "Drug (NDC)", source: "NCPDP D.0 · Claim · 407-D7", example: "00000-0471-30" },
          { field: "DAW / product-selection code", source: "NCPDP D.0 · Claim · 408-D8", example: "1" },
          { field: "Quantity dispensed / days supply", source: "NCPDP D.0 · Claim · 442-E7 / 405-D5", example: "30 mL / 30 days" },
          { field: "Dispensing (pickup) record", source: "External reference · pharmacy dispensing log", example: "none on file" }
        ],
        output: { signal: "flag + score", emits: "RX_NONDISPENSE / DAW_MISUSE", disposition: "Recover as non-dispensed / DAW misuse", downstream: "Lead (Non-dispensed) · remittance RARC M123 / CARC CO-16" }
      },
      rule_ben_identity: {
        logic: {
          summary: "Beneficiary identity / card-sharing screen: one member ID billed across multiple unrelated providers with overlapping dates of service or duplicate high-cost services — indicates identity misuse or card sharing.",
          criteria: [
            { when: "One member ID appears on claims from ≥ N distinct providers within a short window", then: "Compute a dispersion score" },
            { when: "Overlapping / same-day services at different providers or states", then: "Physically implausible — flag" },
            { when: "Duplicate high-cost services on the identity", then: "Flag duplicate exposure" }
          ],
          pseudocode: "grp = claims.group_by(member_id, window=21d)\nif grp.distinct_providers >= 6 or grp.has_overlapping_dos(): flag(score)"
        },
        inputs: [
          { field: "Member ID (subscriber)", source: "837 · 2010BA · NM1*IL / NCPDP 302-C2", example: "MBR-…" },
          { field: "Billing provider NPI", source: "837 · 2010AA · NM1*85", example: "multiple" },
          { field: "Date / place of service", source: "837 · 2400 · DTP / CLM05", example: "overlapping · TX·AZ·NM" },
          { field: "Enrollment / eligibility record", source: "External reference · VA enrollment", example: "single beneficiary" }
        ],
        output: { signal: "flag + score", emits: "BENEFICIARY_IDENTITY_MISUSE", disposition: "Investigate identity misuse / card sharing across the involved providers", downstream: "Lead (Beneficiary subject) · network review" }
      }
    },
    getRuleDetail: function (ruleId) {
      var rule = this.getRuleCatalog().find(function (r) { return r.id === ruleId; });
      if (!rule) return null;
      var spec = this.RULE_DETAIL[ruleId];
      if (!spec) {
        // generic spec derived from the rule's own dimensions
        var claimLevel = rule.detectionLevel === "Claim-level";
        spec = {
          logic: {
            summary: rule.description,
            criteria: [
              { when: "The claim/provider matches the " + (rule.fraudType || "").toLowerCase() + " pattern this rule screens for", then: "Evaluate against the rule threshold" },
              { when: "The condition is met at the " + (rule.detectionLevel || "claim") + " level", then: "Raise a " + (rule.severity || "") + "-severity flag" }
            ],
            pseudocode: null
          },
          inputs: [
            { field: "Procedure / service code", source: claimLevel ? "837 · 2400 · SV1/SV2" : "Derived · claim history", example: "—" },
            { field: "Provider identifiers", source: "837 · 2010AA / 2310B · NM1", example: "NPI / TIN" },
            { field: rule.regulatorySource + " reference", source: "External reference", example: "—" }
          ],
          output: { signal: rule.detectionLevel === "Claim-level" ? "flag" : "flag + score", emits: rule.code + "_FLAG", disposition: "Route to " + (rule.detectionLevel === "Network-level" ? "network" : rule.detectionLevel === "Provider-pattern" ? "provider-pattern" : "claim") + " review", downstream: "Lead created (" + rule.fraudType + ")" }
        };
      }
      return {
        id: rule.id, code: rule.code, name: rule.name, version: rule.version, effectiveDate: rule.effectiveDate, environment: rule.environment,
        regulatorySource: rule.regulatorySource, entityType: rule.entityType, fraudType: rule.fraudType, detectionLevel: rule.detectionLevel, severity: rule.severity,
        logic: spec.logic, inputs: spec.inputs, output: spec.output
      };
    },

    getModels: function () { return D.models; },

    // ---- CI/CD & release management (Round 6 Phase E) ---------------------
    // Simulated release pipeline for the app + rule-promotion history through the
    // controlled environments (dev → test → pre-prod → prod). Static / deterministic
    // (no data regen). All personas synthetic. Fixed timestamps (no Date.now).
    getReleasePipeline: function () {
      var env = function (key, label, appVer, ruleSet, deployedAt, gate, health) { return { key: key, label: label, appVersion: appVer, ruleSet: ruleSet, deployedAt: deployedAt, gate: gate, health: health }; };
      var stage = function (name, status, dur) { return { name: name, status: status, duration: dur }; };
      return {
        environments: [
          env("dev", "Development", "v2.7.0-rc3", "R2025.07", "2026-07-22 08:14", "Auto-deploy on merge", "healthy"),
          env("test", "Test / QA", "v2.7.0-rc2", "R2025.07", "2026-07-21 16:02", "QA sign-off", "healthy"),
          env("preprod", "Pre-prod / UAT", "v2.6.4", "R2025.06", "2026-07-18 11:30", "UAT sign-off", "healthy"),
          env("prod", "Production", "v2.6.3", "R2025.06", "2026-07-15 09:05", "VA Change Advisory Board", "healthy")
        ],
        builds: [
          {
            id: "#1487", version: "v2.7.0-rc3", branch: "round6-claim-detail", commit: "e029039", trigger: "Merge → main", startedAt: "2026-07-22 08:10", duration: "4m 21s", status: "Succeeded", target: "dev",
            stages: [stage("Checkout", "passed", "3s"), stage("Build (static site — no bundler)", "passed", "18s"), stage("Unit / view checks", "passed", "1m 12s"), stage("Secret scan — IBM Vault Radar", "passed", "22s"), stage("SAST", "passed", "48s"), stage("Deploy → dev (GitHub Pages)", "passed", "41s"), stage("Smoke test", "passed", "57s")],
            log: [
              "[checkout] round6-claim-detail @ e029039",
              "[build] static site — no build step; 42 assets verified",
              "[test] 134 view/DP checks passed",
              "[scan] IBM Vault Radar — no secrets detected",
              "[scan] SAST — 0 high · 0 medium · 2 low (accepted)",
              "[deploy:dev] published to GitHub Pages in 41s",
              "[smoke] boot OK · 6 areas reachable · 0 console errors",
              "[done] build #1487 succeeded"
            ]
          },
          {
            id: "#1486", version: "v2.7.0-rc2", branch: "round6-claim-detail", commit: "5e98131", trigger: "Merge → main", startedAt: "2026-07-21 15:52", duration: "4m 08s", status: "Succeeded", target: "test",
            stages: [stage("Checkout", "passed", "3s"), stage("Build", "passed", "17s"), stage("Unit / view checks", "passed", "1m 06s"), stage("Secret scan", "passed", "21s"), stage("SAST", "passed", "47s"), stage("Deploy → dev", "passed", "39s"), stage("Integration tests", "passed", "1m 02s"), stage("Promote → test", "passed", "13s")],
            log: [
              "[checkout] round6-claim-detail @ 5e98131",
              "[build] static site — 42 assets verified",
              "[test] 128 checks passed",
              "[scan] IBM Vault Radar — no secrets detected",
              "[deploy:dev] published in 39s",
              "[integration] subject badges + pharmacy NCPDP claim verified",
              "[promote:test] QA sign-off — Priya Nair",
              "[done] build #1486 succeeded"
            ]
          },
          {
            id: "#1481", version: "v2.6.4", branch: "main", commit: "ccec722", trigger: "Release cut", startedAt: "2026-07-18 11:18", duration: "6m 44s", status: "Succeeded", target: "preprod",
            stages: [stage("Checkout", "passed", "3s"), stage("Build", "passed", "19s"), stage("Unit / view checks", "passed", "1m 10s"), stage("Secret scan", "passed", "23s"), stage("SAST", "passed", "51s"), stage("Deploy → dev", "passed", "40s"), stage("Integration tests", "passed", "1m 08s"), stage("Deploy → test", "passed", "38s"), stage("UAT sign-off", "passed", "—"), stage("Promote → pre-prod", "passed", "15s")],
            log: [
              "[checkout] main @ ccec722",
              "[test] 121 checks passed",
              "[scan] IBM Vault Radar — no secrets detected",
              "[uat] pre-prod UAT sign-off — Dana Whitmore",
              "[promote:preprod] rule set R2025.06 attached",
              "[done] build #1481 succeeded"
            ]
          },
          {
            id: "#1468", version: "v2.6.2-hotfix", branch: "hotfix/pricing-locality", commit: "a91d004", trigger: "Hotfix", startedAt: "2026-07-09 13:40", duration: "2m 51s", status: "Failed", target: "test",
            stages: [stage("Checkout", "passed", "3s"), stage("Build", "passed", "16s"), stage("Unit / view checks", "failed", "1m 20s"), stage("Secret scan", "skipped", "—"), stage("Deploy → dev", "skipped", "—")],
            log: [
              "[checkout] hotfix/pricing-locality @ a91d004",
              "[test] FAIL — pricing locality regression (2 checks)",
              "[test] expected MPFS locality 05 · got 04",
              "[gate] pipeline halted — fix required before deploy",
              "[done] build #1468 failed"
            ]
          }
        ],
        rulePromotions: [
          { code: "EM-LEVEL", name: "E/M level validation", version: "v2.1", steps: [
            { env: "dev", version: "v2.1", at: "2026-06-20 10:02", approver: "Auto (merge)", status: "promoted" },
            { env: "test", version: "v2.1", at: "2026-06-24 14:11", approver: "Priya Nair (QA)", status: "promoted" },
            { env: "preprod", version: "v2.1", at: "2026-06-28 09:40", approver: "Dana Whitmore (UAT)", status: "promoted" },
            { env: "prod", version: "v2.1", at: "2026-07-01 09:05", approver: "VA CAB — Karen Boyd", status: "live" }
          ] },
          { code: "NCCI-PTP", name: "NCCI PTP edit set", version: "v31.1", steps: [
            { env: "dev", version: "v31.1", at: "2026-06-30 08:00", approver: "Auto (quarterly load)", status: "promoted" },
            { env: "test", version: "v31.1", at: "2026-07-02 13:20", approver: "Priya Nair (QA)", status: "promoted" },
            { env: "preprod", version: "v31.1", at: "2026-07-05 10:15", approver: "Dana Whitmore (UAT)", status: "promoted" },
            { env: "prod", version: "v31.1", at: "2026-07-08 09:00", approver: "VA CAB — Karen Boyd", status: "live" }
          ] },
          { code: "RX-NONDISP", name: "Prescription non-dispensing / DAW screen", version: "v1.0", steps: [
            { env: "dev", version: "v1.0", at: "2026-07-19 11:00", approver: "Auto (merge)", status: "promoted" },
            { env: "test", version: "v1.0", at: "2026-07-21 15:30", approver: "Priya Nair (QA)", status: "promoted" },
            { env: "preprod", version: "v1.0", at: "—", approver: "Pending UAT", status: "pending" },
            { env: "prod", version: "—", at: "—", approver: "—", status: "blocked" }
          ] },
          { code: "MED-NEC", name: "Medical-necessity / level-of-care", version: "v1.6", steps: [
            { env: "dev", version: "v1.6", at: "2026-06-15 09:30", approver: "Auto (merge)", status: "promoted" },
            { env: "test", version: "v1.6", at: "2026-06-18 14:00", approver: "Priya Nair (QA)", status: "promoted" },
            { env: "preprod", version: "v1.6", at: "2026-06-22 10:00", approver: "Dana Whitmore (UAT)", status: "promoted" },
            { env: "prod", version: "v1.6", at: "2026-06-25 09:05", approver: "VA CAB — Karen Boyd", status: "live" }
          ] },
          { code: "EXCL-LEIE", name: "OIG LEIE exclusion screening", version: "v2.0", steps: [
            { env: "dev", version: "v2.0", at: "2026-06-27 08:10", approver: "Auto (monthly LEIE load)", status: "promoted" },
            { env: "test", version: "v2.0", at: "2026-06-29 13:00", approver: "Priya Nair (QA)", status: "promoted" },
            { env: "preprod", version: "v2.0", at: "2026-07-01 10:30", approver: "Dana Whitmore (UAT)", status: "promoted" },
            { env: "prod", version: "v2.0", at: "2026-07-03 09:00", approver: "VA CAB — Karen Boyd", status: "live" }
          ] }
        ]
      };
    },

    getPrecedent: function (pid) { return (D.precedents || []).find(function (p) { return p.id === pid; }) || null; },
    // ---- business entities (TrackLight-style): providers grouped by a shared
    // business registration (holding company) or a shared TIN (one billing entity). ----
    listBusinesses: function (opts) {
      opts = opts || {};
      var groups = {};
      D.providers.forEach(function (p) {
        var key = p.registrationId || p.tin;
        var g = groups[key] || (groups[key] = { id: key, providers: [], regName: p.registration || null, officer: p.officer || null, tin: p.tin });
        g.providers.push(p);
      });
      return Object.keys(groups).map(function (k) { return groups[k]; })
        .filter(function (g) { return opts.all ? true : g.providers.length >= 2; })
        .map(function (g) {
          var provs = g.providers;
          var allegs = []; provs.forEach(function (p) { D.allegations.forEach(function (a) { if (a.providerId === p.id && (a.mode || "retrospective") === "retrospective") allegs.push(a); }); });
          return {
            id: g.id, name: g.regName || ("Billing entity · TIN " + g.tin),
            kind: g.regName ? "Holding company" : "Shared-TIN billing entity",
            officer: g.officer, registrationId: g.regName ? g.id : null, tin: g.regName ? provs[0].tin : g.tin,
            sharedTin: !g.regName, providers: provs, providerCount: provs.length,
            states: provs.map(function (p) { return p.state; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; }),
            totalPaid: provs.reduce(function (s, p) { return s + (p.totalPaid || 0); }, 0),
            flaggedExposure: allegs.reduce(function (s, a) { return s + (a.exposurePost || 0); }, 0),
            openAllegations: allegs.length,
            riskScore: Math.max.apply(null, provs.map(function (p) { return p.riskScore || 0; }).concat([0]))
          };
        }).sort(function (a, b) { return b.flaggedExposure - a.flaggedExposure; });
    },
    getBusiness: function (id) { return this.listBusinesses({ all: true }).find(function (b) { return b.id === id; }) || null; },

    listClaimsByProvider: function (providerId) { return D.claims.filter(function (c) { return c.providerId === providerId; }); },
    listAllegationsByProvider: function (providerId, mode) { return D.allegations.filter(function (a) { return a.providerId === providerId && (mode === "all" || (a.mode || "retrospective") === (mode || "retrospective")); }); },
    listInvestigations: function () { return D.allegations.filter(function (a) { return a.status === "Escalated"; }); },
    isCaseLead: isCaseLead,

    // ---- Cases (provider-level) ----------------------------------------------
    // A Case exists for a provider ONLY once ≥1 of its leads is reviewed & confirmed
    // (or escalated). It aggregates that provider's confirmed leads; the provider's
    // still-open leads "feed in" (they join the case if/when confirmed). `listCases`
    // = one row per provider that HAS a case; `getCase` = that provider (or a shell
    // with leadCount 0 if no case yet). Internal keys stay "allegation".
    listCases: function (opts) {
      opts = opts || {};
      var mode = opts.mode || "retrospective";
      var exposureKey = mode === "prepay" ? "exposurePre" : "exposurePost";
      var closedOf = function (pid) { return !!(window.APP && window.APP.isCaseClosed && window.APP.isCaseClosed(pid)); };
      // A lead's case key: the analyst's EXPLICIT case link (chosen on the Decision
      // tab — new case or an existing one) if set, else the provider's ring key
      // (shared registration / TIN → one multi-provider case) or its own solo case.
      var ringKey = function (pid) {
        var p = providers[pid] || {};
        if (p.registrationId) return "reg:" + p.registrationId;
        var sharedTin = p.tin && D.providers.filter(function (x) { return x.tin === p.tin; }).length > 1;
        return sharedTin ? "tin:" + p.tin : "solo:" + pid;
      };
      var linkOf = function (id) { return (window.APP && window.APP.state.caseLinks && window.APP.state.caseLinks[id]) || null; };
      var keyOf = function (a) { return linkOf(a.id) || ringKey(a.providerId); };
      // group leads (confirmed + still-open) by resolved case key
      var groups = {};
      D.allegations.forEach(function (a) {
        if (mode !== "all" && (a.mode || "retrospective") !== mode) return;
        var k = keyOf(a);
        var g = groups[k] || (groups[k] = { caseLeads: [], openLeads: [] });
        if (isCaseLead(a)) g.caseLeads.push(a);
        else if (!CLOSED_STATUS[a.status]) g.openLeads.push(a);
      });
      var byRisk = function (a, b) { return b.riskScore - a.riskScore; };
      return Object.keys(groups).map(function (k) {
        var g = groups[k];
        var caseLeads = g.caseLeads.slice().sort(byRisk);
        var src = (caseLeads.length ? caseLeads : g.openLeads).slice().sort(byRisk);
        var provIds = src.map(function (a) { return a.providerId; }).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
        var primary = providers[(src[0] || {}).providerId] || {};
        var escalated = caseLeads.some(function (a) { return a.status === "Escalated"; });
        var closed = provIds.some(closedOf);
        return {
          caseKey: k,
          providerId: primary.id, provider: primary, name: primary.name || "—", npi: primary.npi || "", state: primary.state || "",
          providerIds: provIds, providers: provIds.map(function (pid) { return providers[pid] || {}; }),
          multiProvider: provIds.length > 1, providerCount: provIds.length,
          leads: caseLeads, caseLeads: caseLeads, openLeads: g.openLeads,
          leadCount: caseLeads.length, openCount: g.openLeads.length,
          exposure: caseLeads.reduce(function (s, a) { return s + (a[exposureKey] || 0); }, 0),
          riskScore: Math.max.apply(null, caseLeads.map(function (a) { return a.riskScore || 0; }).concat([0])),
          fwaTypes: caseLeads.map(function (a) { return a.fwaType; }).filter(function (t, i, arr) { return t && arr.indexOf(t) === i; }),
          assignee: (caseLeads.find(function (a) { return a.assignee; }) || {}).assignee || null,
          subjectType: (src.find(function (a) { return a.subjectType && a.subjectType !== "Provider"; }) || {}).subjectType || "Provider",
          escalated: escalated, closed: closed,
          status: closed ? "Closed" : escalated ? "Under investigation" : "Open case"
        };
      }).filter(function (c) { return opts.all ? true : c.leadCount > 0; })
        .sort(function (a, b) { return b.exposure - a.exposure; });
    },
    getCase: function (providerId, mode) { return this.listCases({ all: true, mode: mode || "all" }).find(function (c) { return c.providerId === providerId || (c.providerIds && c.providerIds.indexOf(providerId) >= 0); }) || null; },

    // ---- TrackLight-style secondary scoring / external enrichment --------------
    // Synthetic external-data profile (business registry + individual/officer OSINT)
    // used to corroborate a claims-based flag with outside signals. Deterministic
    // per provider. Seam: a real feed can populate p.secondaryProfile to override.
    getSecondaryProfile: function (id) {
      var p = providers[id]; if (!p) return null;
      if (p.secondaryProfile) return p.secondaryProfile;
      var seed = 0; for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
      var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      var money = function (min, max) { return Math.round((min + rnd() * (max - min)) / 1000) * 1000; };
      var chain = p.role === "chain";
      var ring = D.providers.filter(function (x) { return x.tin === p.tin; }).length > 1;
      var tier = chain ? "chain" : ring ? "ring" : (p.riskScore || 0) >= 78 ? "risky" : "clean";
      var base = { chain: { regs: 3, liens: 2, judg: 1, bank: 1, dock: 2, score: 88 }, ring: { regs: 2, liens: 1, judg: 1, bank: 0, dock: 1, score: 73 }, risky: { regs: 1, liens: 1, judg: 0, bank: 0, dock: 1, score: 61 }, clean: { regs: 0, liens: 0, judg: 0, bank: 0, dock: 0, score: 24 } }[tier];
      var bizOsint = [];
      if (chain) { bizOsint.push("Registered agent shared with 3 affiliated facilities"); bizOsint.push("Principal address is a commercial mail-drop (CMRA)"); }
      else if (ring) { bizOsint.push("Suite # matches an unrelated billing company at the same address"); }
      else if (tier === "risky") { bizOsint.push("No active web presence; listed phone disconnected"); }
      else { bizOsint.push("No adverse business records found"); }
      var offOsint = [];
      if (p.officer) {
        if (chain) { offOsint.push("Named on " + base.regs + " other active registrations (Enformion)"); offOsint.push("Linked to a dissolved behavioral-health entity (2019)"); }
        else if (ring) { offOsint.push("Associated with the partner provider on state filings"); }
        offOsint.push("No SSA Death Master File match");
      }
      return {
        tier: tier, score: Math.min(99, base.score + Math.floor(rnd() * 8)),
        business: {
          name: p.registration || ("Billing entity · TIN " + p.tin),
          registryStatus: tier === "risky" ? "Delinquent" : "Active",
          state: p.state || "—",
          incorporated: (2011 + Math.floor(rnd() * 11)) + "-" + String(1 + Math.floor(rnd() * 9)).padStart(2, "0"),
          entityNo: (p.state || "US") + "-" + (1000000 + Math.floor(rnd() * 8999999)),
          openCorporatesRelated: base.regs,
          liens: base.liens, lienAmount: base.liens ? money(8000, 90000) : 0,
          judgments: base.judg, judgmentAmount: base.judg ? money(5000, 120000) : 0,
          bankruptcies: base.bank,
          courtDockets: base.dock,
          osint: bizOsint
        },
        officer: p.officer ? {
          name: p.officer,
          lexisConfidence: 82 + Math.floor(rnd() * 17),
          addresses: 2 + Math.floor(rnd() * 4),
          enformionBusinesses: base.regs + 1 + Math.floor(rnd() * 2),
          relatives: 2 + Math.floor(rnd() * 5),
          licenseStatus: chain ? "Active — 3 states" : "Active",
          ssdiMatch: false,
          osint: offOsint
        } : null
      };
    },

    // ---- licensure & credentials (incl. OIG LEIE exclusion) ----
    // Derived here (static, seeded per provider — no data.js regen). Identifiers are
    // impossible-to-be-real by construction: license numbers carry a 0000 block, DEA
    // numbers deliberately fail the checksum. Excluded-while-billing is an automatic
    // finding, so the OIG LEIE exclusions are a small curated list (LEIE is itself a
    // specific list) and surface as the headline credential signal.
    LEIE_EXCLUSIONS: {
      PR301: { basis: "1128(b)(4)", reason: "Licensure revocation / suspension in another state", since: "2024-08-19", reinstatement: null, npiOnList: true },
      PR205: { basis: "1128(a)(3)", reason: "Felony conviction — health-care fraud", since: "2023-11-02", reinstatement: "2028-11-02", npiOnList: true }
    },
    getLicensure: function (id) {
      var p = providers[id]; if (!p) return null;
      var tax = p.taxonomyCode || "";
      var isOrg = /^3/.test(tax) || /^28/.test(tax) || /^251/.test(tax);
      var seed = 0; for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
      var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      var yr = function (min, max) { return (min + Math.floor(rnd() * (max - min + 1))); };
      var n4 = function () { return String(1000 + Math.floor(rnd() * 8999)); };
      var st = p.state || "TX";
      var excl = this.LEIE_EXCLUSIONS[id] || null;
      var risk = p.riskScore || 0;

      // Credential friction is reserved for high-risk providers so a clean peer reads
      // as genuinely clear. A lapsed license/DEA/board cert is a softer signal than
      // exclusion; a revalidation-due is benign/administrative. Deterministic per seed.
      var lapse = !excl && risk >= 82 && rnd() > 0.45;
      var deaExpired = !excl && risk >= 82 && rnd() > 0.5;
      var boardExpired = !excl && risk >= 85 && rnd() > 0.5;
      var revalDue = !excl && risk >= 65 && rnd() > 0.5;

      var creds = [];
      if (isOrg) {
        creds.push({ type: "State facility license", authority: st + " Dept. of Health", number: st + "-FAC-0000" + n4().slice(-3), status: (excl ? "Suspended" : lapse ? "Lapsed — renewal pending" : "Active"), expires: yr(2026, 2028) + "-0" + (1 + Math.floor(rnd() * 8)) + "-15" });
        creds.push({ type: "Accreditation", authority: rnd() > 0.5 ? "CARF" : "The Joint Commission", number: "ACR-0000" + n4().slice(-3), status: excl ? "Under review" : "Accredited", expires: yr(2026, 2027) + "-11-30" });
      } else {
        creds.push({ type: "State medical license", authority: st + " Medical Board", number: st + "-MD-0000" + n4().slice(-3), status: (excl ? "Suspended" : lapse ? "Lapsed — renewal pending" : "Active"), expires: yr(2026, 2028) + "-0" + (1 + Math.floor(rnd() * 8)) + "-31" });
        creds.push({ type: "DEA registration", authority: "DEA", number: "B" + String.fromCharCode(65 + Math.floor(rnd() * 26)) + "0000000", status: (excl ? "Retired" : deaExpired ? "Expired" : "Active"), expires: yr(2025, 2027) + "-06-30" });
        creds.push({ type: "Board certification", authority: p.taxonomyLabel || "Specialty board", number: "ABMS-0000" + n4().slice(-3), status: excl ? "Not certified" : boardExpired ? "Expired" : "Certified", expires: yr(2026, 2030) + "-12-31" });
      }
      creds.push({ type: "Medicare/PECOS enrollment", authority: "CMS", number: "PECOS-" + (p.npi || id), status: excl ? "Deactivated" : revalDue ? "Revalidation due" : "Enrolled", expires: revalDue ? yr(2026, 2026) + "-09-30" : yr(2027, 2028) + "-03-31" });

      // alerts, most severe first
      var alerts = [];
      if (excl) alerts.push({ sev: "high", text: "OIG LEIE exclusion — excluded from all federal health-care programs; claims paid during exclusion are recoverable in full." });
      creds.forEach(function (c) {
        if (/Suspended|Lapsed|Expired|Deactivated|Retired|Under review/.test(c.status) && !(excl && c.status === "Suspended"))
          alerts.push({ sev: c.status === "Expired" && c.type === "Board certification" ? "med" : "med", text: c.type + " " + c.status.toLowerCase() + " (" + c.authority + ")." });
        if (c.status === "Revalidation due") alerts.push({ sev: "low", text: "Medicare revalidation due " + c.expires + "." });
      });

      return {
        isOrg: isOrg,
        entityType: isOrg ? "Facility / organization" : "Individual practitioner",
        credentials: creds,
        exclusion: excl ? { basis: excl.basis, reason: excl.reason, since: excl.since, reinstatement: excl.reinstatement, npiOnList: excl.npiOnList } : null,
        excluded: !!excl,
        alerts: alerts,
        // a benign revalidation-due (low sev) alone does not warrant "Action needed"
        status: excl ? "Excluded" : alerts.some(function (x) { return x.sev !== "low"; }) ? "Action needed" : "Clear"
      };
    },
    isExcluded: function (id) { return !!this.LEIE_EXCLUSIONS[id]; },

    // ---- provider report card (radar spokes + drill-down) ----
    getGroups: function () { var p = D.providers.find(function (x) { return x.groupScores; }); return p ? p.groupScores.map(function (g) { return g.group; }) : []; },
    getReportCard: function (id) { var p = providers[id]; return p ? { groups: p.groupScores || [], attributes: p.groupAttributes || {} } : null; },
    // Providers ranked by a single group's score (outlier comparison / ranking).
    rankByGroup: function (group) {
      return D.providers.filter(function (p) { return p.groupScores; })
        .map(function (p) { var gs = p.groupScores.find(function (g) { return g.group === group; }); return { id: p.id, name: p.name, specialty: p.taxonomyLabel, role: p.role, score: gs ? gs.score : 0, peer: gs ? gs.peer : 0, outlier: gs ? gs.outlier : false }; })
        .sort(function (a, b) { return b.score - a.score; });
    },

    // ---- collusion network: providers connected to `id` by shared identifiers ----
    // Traverses SHARES_TIN / SHARES_OFFICER / SHARES_REGISTRATION / REFERRED_TO /
    // SHARES_PATIENT_WITH (provider↔provider) plus TREATED_BY (veteran→provider).
    getCollusionNetwork: function (id) {
      var provEdge = { SHARES_TIN: 1, SHARES_OFFICER: 1, SHARES_REGISTRATION: 1, REFERRED_TO: 1, SHARES_PATIENT_WITH: 1 };
      var E = D.graph.edges, adj = {};
      E.forEach(function (e) {
        if (provEdge[e.type] && providers[e.source] && providers[e.target]) {
          (adj[e.source] = adj[e.source] || []).push(e.target);
          (adj[e.target] = adj[e.target] || []).push(e.source);
        }
      });
      var seen = {}, queue = [id]; seen[id] = 1;
      while (queue.length) { var cur = queue.shift(); (adj[cur] || []).forEach(function (n) { if (!seen[n]) { seen[n] = 1; queue.push(n); } }); }
      var provIds = Object.keys(seen);
      var links = E.filter(function (e) { return provEdge[e.type] && seen[e.source] && seen[e.target]; });
      var vetLinks = E.filter(function (e) { return e.type === "TREATED_BY" && seen[e.target] && veterans[e.source]; });
      var vetSeen = {}; vetLinks.forEach(function (e) { vetSeen[e.source] = 1; });
      return {
        providers: provIds.map(function (x) { return providers[x]; }),
        links: links,
        veterans: Object.keys(vetSeen).map(function (x) { return veterans[x]; }),
        vetLinks: vetLinks,
        isRing: provIds.length > 1
      };
    },

    // ---- 837 EDI / CMS Pricing (Zellis) / Utilization Mgmt (Milliman) mocks ----
    // Deterministic per-claim synthetic data. Seams for real third-party feeds:
    // a real 837 parser, the Zellis pricing service, and Milliman MCG guidelines.
    _seed: function (id, salt) { var s = 0; id = String(id) + (salt || ""); for (var i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) >>> 0; return function () { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; },

    // Map an internal claim to X12 837 loops/segments (837P professional / 837I institutional).
    get837: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      var p = providers[cl.providerId] || {}, ve = veterans[cl.veteranId] || {};
      var inst = cl.type === "837I", resid = (cl.lines || []).some(function (l) { return l.cpt === "H0018"; });
      var rnd = this._seed(claimId, "edi"), npi = function () { return "1" + String(100000000 + Math.floor(rnd() * 899999999)); };
      var pos = inst ? (resid ? "55" : "21") : ((cl.lines || []).some(function (l) { return l.cpt === "90935"; }) ? "65" : "11");
      var posLabel = { "11": "Office", "21": "Inpatient Hospital", "22": "Outpatient Hospital", "55": "Residential Facility", "65": "ESRD Facility", "12": "Home" }[pos] || pos;
      var rp = { "Dr. A. Morgan": 0, "Dr. L. Chen": 0, "Dr. R. Patel": 0, "Dr. S. Okafor": 0 };
      var refName = Object.keys(rp)[Math.floor(rnd() * 4)];
      return {
        transaction: { setId: "837", implementationGuide: inst ? "005010X223A2 (Institutional)" : "005010X222A1 (Professional)", purpose: "CH — Chargeable", controlNumber: "0" + (1001 + Math.floor(rnd() * 8999)) },
        submitter: { name: "VA Community Care Network", id: "VACCN01" },
        receiver: { name: "VHA Payment Integrity", id: "VHAPI" },
        billingProvider: { loop: "2010AA · NM1*85", npi: p.npi, name: p.name, taxIdType: "EI", taxId: p.tin, taxonomy: p.taxonomyCode || "—", address: (p.city || "") + ", " + (p.state || "") },
        renderingProvider: { loop: "2310B · NM1*82", npi: npi(), name: p.name },
        referringProvider: { loop: "2310A · NM1*DN", npi: npi(), name: refName },
        subscriber: { loop: "2010BA · NM1*IL", memberId: ve.memberId || "—", name: ve.name || "—", dob: ve.dob || "—", gender: ve.sex || "—", relationship: "18 — Self", responsibility: "P — Primary" },
        payer: { loop: "2010BB · NM1*PR", name: "VA CCN", id: "VACCN", claimControlNumber: "VACCN" + (1000000 + Math.floor(rnd() * 8999999)) },
        claim: {
          loop: "2300 · CLM", patientControlNumber: cl.claimNumber, totalClaimCharge: cl.billedAmount,
          placeOfService: pos + " — " + posLabel, facilityQualifier: inst ? "A — Institutional" : "B — Professional",
          frequencyCode: "1 — Original", providerSignature: "Y", assignmentOfBenefits: "Y", benefitAssignment: "Y", releaseOfInfo: "I — Informed consent",
          billType: inst ? (resid ? "86X — Special facility (residential)" : "111 — Hospital inpatient") : null,
          admissionType: inst ? "3 — Elective" : null,
          statementDates: inst ? (cl.dateOfService + " – " + cl.dateOfService) : null,
          diagnoses: (cl.diagnosisCodes || []).map(function (dx, i) { return { pointer: i + 1, qualifier: i === 0 ? "ABK — Principal (ICD-10-CM)" : "ABF — Other (ICD-10-CM)", code: dx }; })
        },
        serviceLines: (cl.lines || []).map(function (l, i) {
          return {
            lineNumber: i + 1, segment: inst ? "SV2 (2400)" : "SV1 (2400)",
            procedure: "HC:" + l.cpt + ((l.modifiers || []).length ? ":" + l.modifiers.join(":") : ""),
            revenueCode: inst ? (l.cpt === "H0018" ? "1002" : "0" + (250 + i * 50)) : null,
            chargeAmount: l.billed, unitBasis: "UN", units: l.units || 1,
            placeOfService: pos, diagnosisPointers: "1", serviceDate: "472 — " + cl.dateOfService,
            flagged: (l.violatesRuleIds || []).length > 0
          };
        })
      };
    },

    // CMS reference pricing (Zellis): submitted charge vs CMS-allowed per line + methodology.
    getCmsPricing: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      if (cl.type === "NCPDP") return null;
      var p = providers[cl.providerId] || {}, inst = cl.type === "837I";
      var rnd = this._seed(claimId, "cms");
      var method = function (l) {
        if (inst) return l.cpt === "H0018" ? "Per-diem (residential)" : "OPPS / APC";
        if (/^7/.test(l.cpt)) return "MPFS — Radiology";
        if (/^9[0-3]/.test(l.cpt) && !/^99/.test(l.cpt)) return "MPFS — Medicine";
        if (/^99/.test(l.cpt)) return "MPFS — E/M";
        if (/^E/.test(l.cpt)) return "DMEPOS fee schedule";
        return "MPFS";
      };
      var lines = (cl.lines || []).map(function (l) {
        var flagged = (l.violatesRuleIds || []).length > 0;
        // CMS reference pricing: a flagged line prices LOWER than paid (correct code /
        // bundled / MUE-limited); clean lines price at the fee-schedule allowed.
        var cms = flagged ? Math.round(l.allowed * (0.4 + rnd() * 0.2) * 100) / 100 : l.allowed;
        var charge = Math.max(l.billed, Math.round(l.allowed * (1.7 + rnd() * 1.1)));
        return {
          cpt: l.cpt, description: l.description, modifiers: l.modifiers || [],
          submittedCharge: charge, cmsAllowed: cms, paid: l.paid,
          variance: Math.round((charge - cms) * 100) / 100, variancePct: cms ? Math.round(((charge - cms) / cms) * 100) : 0,
          overPaid: l.paid > cms + 0.5, methodology: method(l), flagged: flagged
        };
      });
      var sum = function (k) { return Math.round(lines.reduce(function (s, l) { return s + l[k]; }, 0) * 100) / 100; };
      return {
        source: "Zellis — CMS reference pricing", asOf: "2025 CMS fee schedules", locality: (p.state || "TX") + " · locality 05",
        lines: lines,
        totals: { submitted: sum("submittedCharge"), cmsAllowed: sum("cmsAllowed"), paid: sum("paid"), variance: Math.round((sum("submittedCharge") - sum("cmsAllowed")) * 100) / 100, overpayment: Math.round(Math.max(0, sum("paid") - sum("cmsAllowed")) * 100) / 100 },
        rulesApplied: ["MPFS locality adjustment (" + (p.state || "TX") + " 05)", inst ? "OPPS status-indicator pricing" : "RVU × conversion factor ($32.74)", "MPPR — multiple-procedure payment reduction", "NCCI PTP bundling edits", "Site-of-service differential"],
        ruleVersions: this.getPricingRuleVersions(claimId)
      };
    },
    // Version history for the pricing rules that priced the claim. Static / synthetic
    // (no data regen). A claim's date of service could fall under a prior version —
    // this surfaces what changed and when, so the reviewer can see the lineage of the
    // rates applied. Effective as of DOS is the one that priced the claim.
    getPricingRuleVersions: function (claimId) {
      var cl = claims[claimId]; if (!cl) return [];
      var p = providers[cl.providerId] || {}, st = p.state || "TX", inst = cl.type === "837I";
      return [
        {
          name: "MPFS conversion factor", authority: "CMS", current: { version: "CY2025", effective: "2025-01-01", value: "$32.74 / RVU" },
          note: "The dollar multiplier applied to each code's relative value units. Updated annually in the Medicare Physician Fee Schedule final rule.",
          history: [
            { version: "CY2024", effective: "2024-01-01", value: "$33.89 / RVU", change: "−3.4% CF reduction (CY2025 final rule)" },
            { version: "CY2023", effective: "2023-01-01", value: "$33.06 / RVU", change: "CF set by CY2024 final rule" }
          ]
        },
        {
          name: "GPCI locality adjustment", authority: "CMS", current: { version: "CY2025 GPCI", effective: "2025-01-01", value: st + " · locality 05" },
          note: "Geographic Practice Cost Index — adjusts the fee for local cost differences.",
          history: [
            { version: "CY2024 GPCI", effective: "2024-01-01", value: st + " · locality 05", change: "Work/PE/MP indices refreshed" },
            { version: "CY2023 GPCI", effective: "2023-01-01", value: st + " · locality 05", change: "Prior triennial GPCI update" }
          ]
        },
        {
          name: "MPPR — multiple-procedure payment reduction", authority: "CMS", current: { version: "v1.0", effective: "2024-07-01", value: "50% on 2nd+ procedure" },
          note: "Reduces payment for the second and subsequent procedures billed in the same session.",
          history: [
            { version: "v0.9", effective: "2023-01-01", value: "25% on 2nd+ procedure", change: "Reduction increased 25% → 50%" }
          ]
        },
        {
          name: inst ? "OPPS status-indicator pricing" : "RVU relative value file", authority: "CMS", current: { version: inst ? "CY2025 OPPS" : "CY2025 RVU", effective: "2025-01-01", value: inst ? "APC weights CY2025" : "RVUs CY2025" },
          note: inst ? "Outpatient Prospective Payment System — APC weights and status indicators." : "Work / practice-expense / malpractice RVUs per code.",
          history: [
            { version: inst ? "CY2024 OPPS" : "CY2024 RVU", effective: "2024-01-01", value: inst ? "APC weights CY2024" : "RVUs CY2024", change: "Annual valuation update" }
          ]
        },
        {
          name: "NCCI PTP edit set", authority: "CMS NCCI", current: { version: "v31.1", effective: "2025-01-01", value: "Q1 CY2025 edit file" },
          note: "Procedure-to-procedure bundling edits, refreshed quarterly.",
          history: [
            { version: "v30.3", effective: "2024-10-01", value: "Q4 CY2024 edit file", change: "212 pairs added, 47 removed" },
            { version: "v30.0", effective: "2024-01-01", value: "Q1 CY2024 edit file", change: "Annual baseline refresh" }
          ]
        },
        {
          name: "VA fee schedule / CMAC allowance", authority: "VA CCN", current: { version: "v3.1", effective: "2025-01-15", value: "CMAC table 2025" },
          note: "VA Community Care allowance table used where it governs over MPFS.",
          history: [
            { version: "v3.0", effective: "2024-07-01", value: "CMAC table 2024 H2", change: "Mid-year CMAC refresh" },
            { version: "v2.4", effective: "2024-01-01", value: "CMAC table 2024 H1", change: "Annual CMAC update" }
          ]
        }
      ];
    },

    // ---- provider contact (for records requests) ----
    // Deterministic, and impossible-to-be-real by construction: fax numbers sit in the
    // 555-01xx block reserved for fiction, and email uses the reserved example.com
    // domain. Derived here rather than generated so the dataset stays byte-stable.
    AREA_BY_STATE: { TX: "210", AZ: "602", CA: "619", NV: "702", NM: "505", OK: "405", LA: "504", AR: "501" },
    getProviderContact: function (pid) {
      var p = providers[pid]; if (!p) return null;
      var digits = String(pid).replace(/\D/g, "") || "0";
      var last2 = String(Number(digits) % 100).padStart(2, "0");
      var area = this.AREA_BY_STATE[p.state] || "210";
      var slug = String(p.name || "provider").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").split("-").slice(0, 3).join("-");
      return {
        fax: "+1 (" + area + ") 555-01" + last2,
        email: "records@" + slug + ".example.com",
        portal: "VA Provider Portal · " + (p.npi || pid),
        attention: "Health Information Management / Release of Information"
      };
    },

    // ---- facility capacity (beds vs patient-days billed) ----
    // Only meaningful for bedded facilities (residential / inpatient). The fraud
    // signal is billing more patient-days than the staffed bed count can physically
    // hold over a period — impossible days that no coding review would surface,
    // and a peak-concurrent census above the staffed beds. Derived (no data regen).
    getFacilityCapacity: function (id) {
      var p = providers[id]; if (!p) return null;
      var tax = p.taxonomyCode || "";
      var residential = /^3245/.test(tax);   // substance-abuse residential
      var hospital = /^282N/.test(tax);      // general hospital
      if (!residential && !hospital) return null;
      var seed = 0; for (var i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i) + 7) >>> 0;
      var rnd = function () { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
      var chain = p.role === "chain";
      var periodDays = 90;
      var licensedBeds = residential ? 36 + Math.floor(rnd() * 10) : 140 + Math.floor(rnd() * 60);
      var staffedBeds = Math.round(licensedBeds * (residential ? 0.72 : 0.86));
      var capacityDays = staffedBeds * periodDays;
      // a chain residential facility bills beyond what its beds can hold; others sit within
      var util = chain ? 1.10 + rnd() * 0.09 : 0.58 + rnd() * 0.22;
      var patientDaysBilled = Math.round(capacityDays * util);
      var peakConcurrent = chain ? staffedBeds + 4 + Math.floor(rnd() * 5) : Math.round(staffedBeds * (0.68 + rnd() * 0.18));
      return {
        periodLabel: "trailing 90 days", periodDays: periodDays,
        licensedBeds: licensedBeds, staffedBeds: staffedBeds,
        capacityDays: capacityDays, patientDaysBilled: patientDaysBilled,
        utilization: Math.round(util * 100),
        overCapacity: patientDaysBilled > capacityDays,
        excessDays: Math.max(0, patientDaysBilled - capacityDays),
        peakConcurrent: peakConcurrent, peakOverStaffed: peakConcurrent > staffedBeds,
        peakExcess: Math.max(0, peakConcurrent - staffedBeds)
      };
    },

    // ---- CPT crosswalk: is THIS code payable billed with THIS modifier? ----
    // Three reference checks per claim line, the way a coder reads a claim:
    //   PTP  — NCCI procedure-to-procedure edits. A column-2 code billed with its
    //          column-1 code on the same day is bundled and not separately payable.
    //          Modifier indicator 1 means a 59/X{EPSU} modifier may override it *if*
    //          a distinct service is documented; 0 means no override is permitted.
    //   MUE  — medically unlikely edits: the max units of a code per day.
    //   MOD  — is each modifier even valid on this code?
    // Reference tables are static (no RNG) so the hero scenarios stay byte-stable.
    CPT_XWALK: {
      // column-1 code : { column-2 codes bundled into it : NCCI modifier indicator }
      ptp: {
        "43239": { "43235": 1 },              // EGD w/ biopsy includes the diagnostic EGD
        "20610": { "99213": 1, "99214": 1 },  // E/M bundled into the injection unless separately identifiable
        "90935": { "99213": 1 },
        "97110": { "97140": 1 },
        "99283": { "93000": 0 }               // indicator 0 — no override permitted
      },
      // max units per code per day
      mue: { "99211": 1, "99212": 1, "99213": 1, "99214": 1, "99215": 1, "43239": 1, "43235": 1, "90935": 1, "93000": 1, "71046": 2, "97110": 4, "70551": 1, "20610": 2, "99283": 1, "E1390": 1, "D0120": 1, "D1110": 1, "H0018": 30 },
      mod: {
        "25": { name: "Significant, separately identifiable E/M service", appliesTo: "em", note: "Valid only on an E/M code billed alongside a procedure the same day." },
        "59": { name: "Distinct procedural service", appliesTo: "proc", note: "Valid only on a procedure code, and only to override an NCCI PTP edit when a distinct session/site is documented." },
        "XU": { name: "Unusual non-overlapping service", appliesTo: "proc", note: "NCCI-specific subset of modifier 59." },
        "XS": { name: "Separate structure", appliesTo: "proc", note: "NCCI-specific subset of modifier 59." },
        "26": { name: "Professional component", appliesTo: "pctc", note: "Valid only on codes with a professional/technical split." },
        "TC": { name: "Technical component", appliesTo: "pctc", note: "Valid only on codes with a professional/technical split." },
        "50": { name: "Bilateral procedure", appliesTo: "bilat", note: "Valid only on bilateral-eligible procedures." },
        "76": { name: "Repeat procedure by the same physician", appliesTo: "proc", note: "Valid on a repeated procedure the same day." },
        "91": { name: "Repeat clinical diagnostic laboratory test", appliesTo: "lab", note: "Valid only on clinical lab codes." }
      },
      pctc: ["70551", "71046", "93000"],
      bilat: ["20610", "71046"]
    },
    getCptCrosswalk: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      if (cl.type === "NCPDP") return null;
      var X = this.CPT_XWALK, lines = cl.lines || [];
      var isEm = function (c) { return /^99/.test(c); };
      var codes = lines.map(function (l) { return l.cpt; });
      var overrideMods = ["59", "XU", "XS", "XE", "XP"];

      var rows = lines.map(function (l) {
        var mods = l.modifiers || [], checks = [], verdict = "pass";
        var worse = function (v) { var rank = { pass: 0, review: 1, fail: 2 }; if (rank[v] > rank[verdict]) verdict = v; };

        // --- PTP: is this line a column-2 code of another line on the same claim?
        var ptp = null;
        Object.keys(X.ptp).forEach(function (c1) {
          if (codes.indexOf(c1) < 0 || c1 === l.cpt) return;
          var ind = X.ptp[c1][l.cpt];
          if (ind === undefined) return;
          var ovr = mods.filter(function (m) { return overrideMods.indexOf(m) >= 0; });
          ptp = { column1: c1, column2: l.cpt, indicator: ind, overrides: ovr };
          if (ind === 0) {
            ptp.status = "fail";
            ptp.note = "Bundled into " + c1 + ". Modifier indicator 0 — no modifier may override this edit; the code is not separately payable.";
            worse("fail");
          } else if (!ovr.length) {
            ptp.status = "fail";
            ptp.note = "Bundled into " + c1 + " and billed without an override modifier — not separately payable in the same session.";
            worse("fail");
          } else {
            ptp.status = "review";
            ptp.note = "Bundled into " + c1 + ", overridden with modifier " + ovr.join("/") + ". Payable only if the record documents a distinct procedural service — verify before paying.";
            worse("review");
          }
        });

        // --- MUE
        var limit = X.mue[l.cpt], mue = null;
        if (limit !== undefined) {
          mue = { limit: limit, billed: l.units, exceeded: l.units > limit };
          if (mue.exceeded) { worse("fail"); mue.note = "Billed " + l.units + " units against an MUE of " + limit + " per day."; }
        }

        // --- modifier validity
        mods.forEach(function (m) {
          var def = X.mod[m];
          if (!def) { checks.push({ mod: m, name: "Unrecognized modifier", valid: false, note: "Not a recognized modifier for this code set." }); worse("fail"); return; }
          var ok = true, note = def.note;
          if (def.appliesTo === "em") ok = isEm(l.cpt);
          else if (def.appliesTo === "proc") ok = !isEm(l.cpt);
          else if (def.appliesTo === "pctc") ok = X.pctc.indexOf(l.cpt) >= 0;
          else if (def.appliesTo === "bilat") ok = X.bilat.indexOf(l.cpt) >= 0;
          else if (def.appliesTo === "lab") ok = false;
          if (!ok) { note = "Modifier " + m + " is not valid on " + l.cpt + ". " + def.note; worse("fail"); }
          // a 59-family modifier with no PTP edit to override is an unsupported override
          else if (overrideMods.indexOf(m) >= 0 && !ptp) {
            ok = false; worse("review");
            note = "Modifier " + m + " applied but no NCCI PTP edit exists for " + l.cpt + " on this claim — the override is unnecessary and may mask an unbundling pattern.";
          }
          checks.push({ mod: m, name: def.name, valid: ok, note: note });
        });

        return {
          cpt: l.cpt, description: l.description, modifiers: mods, units: l.units,
          ptp: ptp, mue: mue, modChecks: checks, verdict: verdict,
          flagged: (l.violatesRuleIds || []).length > 0
        };
      });

      var fails = rows.filter(function (r) { return r.verdict === "fail"; }).length;
      var reviews = rows.filter(function (r) { return r.verdict === "review"; }).length;
      return {
        source: "CMS NCCI edits + AMA CPT reference", asOf: "NCCI v31.1 · effective 2025-01-01",
        lines: rows, fails: fails, reviews: reviews,
        clean: rows.length - fails - reviews,
        determination: fails ? "Coding edits failed — one or more lines are not separately payable as billed"
          : reviews ? "Overrides present — payable only if the record documents a distinct service"
            : "All lines pass NCCI PTP, MUE and modifier validity checks",
        editsApplied: ["NCCI procedure-to-procedure (PTP) edits", "Medically unlikely edits (MUE) — units per day", "Modifier-to-code validity", "Modifier 59 / X{EPSU} override review"]
      };
    },

    // Utilization management (Milliman MCG): clinical criteria, level of care, LOS.
    getUtilizationMgmt: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      if (cl.type === "NCPDP") return null;
      var resid = (cl.lines || []).some(function (l) { return l.cpt === "H0018"; });
      var dialysis = (cl.lines || []).some(function (l) { return l.cpt === "90935"; });
      var em = (cl.lines || []).some(function (l) { return /^99/.test(l.cpt); });
      var rnd = this._seed(claimId, "um"), base = { source: "Milliman MCG Care Guidelines", edition: "28th Edition (2025)" };
      if (resid) {
        return Object.assign(base, {
          guideline: { code: "BHG-RES", title: "Residential Behavioral Health Treatment" },
          levelOfCare: { recommended: "Intensive Outpatient / Partial Hospitalization", billed: "Residential — 24-hour" },
          lengthOfStay: { recommendedDays: 14, actualDays: 27 + Math.floor(rnd() * 4), unit: "days" },
          priorAuth: { required: true, number: "UM-" + (100000 + Math.floor(rnd() * 899999)), status: "Approved — 14 days" },
          criteria: [
            { label: "24-hour supervision medically necessary", met: false, note: "Documentation does not support 24-hour level of care beyond day 14." },
            { label: "Active treatment plan with measurable goals", met: true },
            { label: "Failed a lower level of care", met: true },
            { label: "Continued-stay criteria met (day 15+)", met: false, note: "Patient stable, no worsening — step-down indicated." }
          ],
          determination: "Does not meet continued-stay criteria beyond the authorized 14 days"
        });
      }
      if (dialysis) {
        return Object.assign(base, {
          guideline: { code: "ORG-DIAL", title: "Hemodialysis — Chronic (ESRD)" },
          levelOfCare: { recommended: "Outpatient dialysis 3×/week", billed: "Outpatient dialysis" },
          priorAuth: { required: false, number: null, status: "Standing ESRD order on file" },
          criteria: [
            { label: "ESRD diagnosis documented (N18.6)", met: true },
            { label: "Frequency ≤ 3 sessions / week", met: true, note: "Standing M/W/F regimen consistent with guideline." },
            { label: "Vascular access functioning", met: true }
          ],
          determination: "Meets criteria — frequency consistent with ESRD standing order"
        });
      }
      return Object.assign(base, {
        guideline: { code: "AMB-EM", title: "Ambulatory Evaluation & Management" },
        levelOfCare: { recommended: "Outpatient office visit", billed: "Outpatient office visit" },
        priorAuth: { required: false, number: null, status: "Not required for this service" },
        criteria: [
          { label: "Service medically necessary for documented condition", met: true },
          { label: "Level of service supported by documentation", met: !em, note: em ? "MCG complexity mapping supports a lower E/M level than billed." : undefined },
          { label: "Frequency within expected range", met: true }
        ],
        determination: em ? "Review — documented complexity maps to a lower E/M level" : "Meets criteria"
      });
    },

    // ---------------------------------------------------------------------------
    // Reviewer-grade claim record (Round 6). Everything below is DERIVED, seeded and
    // deterministic — no data.js regen — so the hero dollar figures never move.
    // The remittance reconciles to the claim's existing paidAmount by construction:
    //   submitted (gross charge)  = allowed + CO-45 contractual write-off
    //   allowed (fee schedule)    = payer-paid + patient responsibility
    //   patient responsibility    = $0  (VA Community Care — veteran has no cost-share)
    //   Σ payer-paid              = claim.paidAmount   (byte-stable)
    // ---------------------------------------------------------------------------

    // ICD-10-CM descriptors (principal + the comorbidity pools we derive from). Kept
    // deliberately small; anything unseen falls back to a generic label.
    ICD10: {
      "K21.9": "Gastro-esophageal reflux disease without esophagitis",
      "F10.20": "Alcohol dependence, uncomplicated",
      "N18.6": "End stage renal disease",
      // GI / GERD comorbidities
      "E78.5": "Hyperlipidemia, unspecified", "I10": "Essential (primary) hypertension",
      "E11.9": "Type 2 diabetes mellitus without complications", "K29.70": "Gastritis, unspecified, without bleeding",
      "R10.13": "Epigastric pain", "F41.1": "Generalized anxiety disorder", "Z79.899": "Other long term (current) drug therapy",
      // Behavioral health / SUD comorbidities
      "F17.210": "Nicotine dependence, cigarettes, uncomplicated", "F32.9": "Major depressive disorder, single episode, unspecified",
      "E66.9": "Obesity, unspecified", "K70.30": "Alcoholic cirrhosis of liver without ascites",
      "R45.851": "Suicidal ideations", "F10.239": "Alcohol dependence with withdrawal, unspecified",
      // ESRD / renal comorbidities
      "I12.0": "Hypertensive chronic kidney disease with stage 5 CKD or ESRD", "E11.22": "Type 2 diabetes mellitus with diabetic chronic kidney disease",
      "D63.1": "Anemia in chronic kidney disease", "E83.42": "Hypomagnesemia",
      "N25.81": "Secondary hyperparathyroidism of renal origin", "Z99.2": "Dependence on renal dialysis"
    },
    // Comorbidity pools keyed by the principal's category — the derived secondary Dx.
    COMORBIDITY_POOL: {
      K: ["E78.5", "I10", "E11.9", "K29.70", "R10.13", "F41.1", "Z79.899"],
      F: ["F17.210", "F32.9", "F41.1", "E66.9", "K70.30", "R45.851", "F10.239", "Z79.899"],
      N: ["I12.0", "E11.22", "D63.1", "E83.42", "N25.81", "Z99.2", "I10"],
      _: ["I10", "E78.5", "E11.9", "Z79.899", "F41.1"]
    },
    // ICD-10-PCS procedure descriptors (institutional 837I only).
    ICD10PCS: {
      "HZ2ZZZZ": "Detoxification Services for Substance Abuse Treatment",
      "HZ30ZZZ": "Individual Counseling for Substance Abuse Treatment, Cognitive",
      "HZ63ZZZ": "Group Counseling for Substance Abuse Treatment, Interpersonal",
      "GZ56ZZZ": "Psychotherapy for Mental Health, Interactive"
    },
    // Claim Adjustment Reason Codes (CARC) + Remittance Advice Remark Codes (RARC).
    // Standard X12 835 codes — real code numbers, synthetic amounts.
    CARC_CATALOG: {
      "45": { group: "CO", label: "Charge exceeds fee schedule / maximum allowable amount", kind: "Contractual obligation" },
      "97": { group: "CO", label: "Payment is included in the allowance for another service/procedure (bundled)", kind: "Contractual obligation" },
      "16": { group: "CO", label: "Claim/service lacks information or has submission/billing error(s)", kind: "Contractual obligation" },
      "59": { group: "CO", label: "Processed based on multiple or concurrent procedure rules", kind: "Contractual obligation" },
      "1": { group: "PR", label: "Deductible amount", kind: "Patient responsibility" }
    },
    RARC_CATALOG: {
      "N657": "This should be billed with the appropriate code for these services.",
      "N19": "Procedure code incidental to primary procedure.",
      "N130": "Consult plan benefit documents/guidelines for information about restrictions for this service.",
      "M80": "Not covered when performed during the same session/date as a previously processed service.",
      "M123": "Missing/incomplete/invalid name, strength, or dosage of the drug furnished.",
      "N59": "Please refer to your provider manual for additional program and provider information."
    },
    // Post-payment integrity remark attached to a flagged line, keyed by the rule that
    // fired. These are informational on the 835 (the claim was paid); they carry the
    // recovery basis a reviewer would act on. The dialysis frequency flag is benign —
    // clinical review clears it — which is exactly the human-in-the-loop dismiss story.
    _integrityRemark: function (ruleIds) {
      var ids = ruleIds || [];
      if (ids.indexOf("model_em_peer") >= 0) return { rarc: "N657", carc: "45", text: "Level-5 E/M not substantiated by the record — documentation supports 99213. Recoverable as the level-of-service differential.", recover: true };
      if (ids.indexOf("rule_ncci_43235_43239") >= 0 || ids.indexOf("rule_mod59") >= 0) return { rarc: "N19", carc: "97", text: "Diagnostic endoscopy is a component of 43239; modifier 59 not substantiated by a distinct procedural service. Recoverable as bundled.", recover: true };
      if (ids.indexOf("model_los") >= 0) return { rarc: "N130", carc: "16", text: "Continued-stay days beyond the authorized 14 are not supported by continued-stay criteria. Recoverable for the unauthorized days.", recover: true };
      if (ids.indexOf("rule_rx_nondispense") >= 0) return { rarc: "M123", carc: "16", text: "Brand billed with DAW 1 but a generic equivalent is available with no documented medical necessity; no dispensing (pickup) record on file for the quantity billed. Recoverable as non-dispensed / DAW misuse.", recover: true };
      if (ids.indexOf("model_freq") >= 0) return { rarc: "N59", carc: null, text: "Frequency flagged by the model; clinical review found it consistent with the ESRD standing order (M/W/F). No adjustment.", recover: false };
      return { rarc: "N59", carc: null, text: "Flagged for post-payment integrity review — see the rule-engine outcomes on the Evidence tab.", recover: false };
    },

    // A stable helper — add whole days to an ISO date (deterministic in the browser).
    _addDays: function (iso, n) { var d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + (n || 0)); return d.toISOString().slice(0, 10); },

    // The consolidated claim record: header + diagnoses + procedures + adjudicated
    // service lines + remittance, all reconciled to the existing paidAmount.
    getClaimDetail: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      if (cl.type === "NCPDP") return this.getPharmacyDetail(claimId);
      var p = providers[cl.providerId] || {}, ve = veterans[cl.veteranId] || {};
      var inst = cl.type === "837I";
      var resid = (cl.lines || []).some(function (l) { return l.cpt === "H0018"; });
      var dialysis = (cl.lines || []).some(function (l) { return l.cpt === "90935"; });
      var rnd = this._seed(claimId, "detail");
      var self = this;

      // ---- place of service / bill type (same mapping as get837) ----
      var pos = inst ? (resid ? "55" : "21") : (dialysis ? "65" : "11");
      var posLabel = { "11": "Office", "21": "Inpatient Hospital", "22": "Outpatient Hospital", "55": "Residential Facility", "65": "ESRD Facility", "12": "Home" }[pos] || pos;
      var billType = inst ? (resid ? "86X — Special facility (residential)" : "111 — Hospital inpatient") : null;

      // ---- diagnoses: principal + seeded secondaries with POA (institutional) ----
      var principal = (cl.diagnosisCodes || [])[0] || null;
      var pool = (this.COMORBIDITY_POOL[(principal || "_").charAt(0)] || this.COMORBIDITY_POOL._).slice();
      // deterministic shuffle + count (institutional carries a fuller problem list)
      for (var s = pool.length - 1; s > 0; s--) { var j = Math.floor(rnd() * (s + 1)); var t = pool[s]; pool[s] = pool[j]; pool[j] = t; }
      var secCount = inst ? 6 + Math.floor(rnd() * 4) : 2 + Math.floor(rnd() * 3);
      var secs = pool.filter(function (c) { return c !== principal; }).slice(0, secCount);
      var poaCodes = ["Y", "Y", "Y", "N", "W", "U"];
      var diagnoses = [];
      if (principal) diagnoses.push({ seq: 1, code: principal, description: this.ICD10[principal] || "Diagnosis " + principal, type: "principal", poa: inst ? "Y" : null });
      secs.forEach(function (c, i) { diagnoses.push({ seq: diagnoses.length + 1, code: c, description: self.ICD10[c] || "Diagnosis " + c, type: "secondary", poa: inst ? poaCodes[i % poaCodes.length] : null }); });

      // ---- ICD-10-PCS procedures (institutional only) ----
      var procedures = [];
      if (inst) {
        var pcs = resid ? ["HZ2ZZZZ", "HZ30ZZZ", "HZ63ZZZ"] : ["GZ56ZZZ"];
        pcs.forEach(function (code, i) { procedures.push({ seq: i + 1, code: code, description: self.ICD10PCS[code] || code, date: cl.dateOfService }); });
      }

      // ---- rendering / attending provider (deterministic, synthetic NPI) ----
      var npi = function () { return "1" + String(100000000 + Math.floor(rnd() * 899999999)); };
      var attendingNames = ["Dr. A. Morgan", "Dr. L. Chen", "Dr. R. Patel", "Dr. S. Okafor"];
      var attending = attendingNames[Math.floor(rnd() * attendingNames.length)];
      var attendingNpi = npi(), renderingNpi = npi();

      // ---- statement / admit-discharge dates + DRG + discharge status (institutional) ----
      var los = null, admitDate = null, dischargeDate = null, drg = null, dischargeStatus = null;
      if (inst) {
        var um = this.getUtilizationMgmt(claimId);
        los = (um && um.lengthOfStay && um.lengthOfStay.actualDays) || (resid ? 27 : 4);
        admitDate = cl.dateOfService;
        dischargeDate = this._addDays(admitDate, los);
        drg = resid ? "896 — Alcohol/drug abuse or dependence w/o rehabilitation therapy w/o MCC" : "897 — Alcohol/drug abuse or dependence w/o rehabilitation therapy";
        dischargeStatus = "01 — Discharged to home / self-care (routine)";
      }

      // ---- service lines with line-level adjudication ----
      var carcUsed = {}, rarcUsed = {};
      var lines = (cl.lines || []).map(function (l, i) {
        var flagged = (l.violatesRuleIds || []).length > 0;
        var allowed = l.allowed, paid = l.paid;                 // byte-stable
        // gross submitted charge: deterministic markup over the fee-schedule allowed
        var submitted = Math.max(l.billed, Math.round(allowed * (1.6 + rnd() * 1.2)));
        var co45 = Math.round((submitted - allowed) * 100) / 100; // contractual write-off (CARC CO-45)
        var patientResp = 0;                                     // VA CCN — no veteran cost-share
        var carc = [];
        if (co45 > 0) { carc.push({ group: "CO", code: "45", amount: co45 }); carcUsed["45"] = true; }
        var remark = flagged ? self._integrityRemark(l.violatesRuleIds) : null;
        if (remark) { rarcUsed[remark.rarc] = true; if (remark.carc) carcUsed[remark.carc] = true; }
        return {
          lineNo: i + 1, cpt: l.cpt, description: l.description, modifiers: l.modifiers || [], units: l.units || 1,
          revenueCode: inst ? (l.cpt === "H0018" ? "1002" : "0" + (250 + i * 50)) : null,
          renderingNpi: renderingNpi,
          submitted: submitted, allowed: allowed, contractual: co45, patientResp: patientResp, paid: paid,
          carc: carc, remark: remark, flagged: flagged
        };
      });

      var sum = function (k) { return Math.round(lines.reduce(function (a, l) { return a + l[k]; }, 0) * 100) / 100; };
      var totals = { submitted: sum("submitted"), contractual: sum("contractual"), allowed: sum("allowed"), patientResp: sum("patientResp"), paid: sum("paid") };
      // recovery basis (post-pay) — the exposure a reviewer would pursue on the flagged lines
      var recoverable = Math.round(lines.filter(function (l) { return l.remark && l.remark.recover; }).reduce(function (a, l) { return a + l.paid; }, 0) * 100) / 100;

      var carcLegend = Object.keys(carcUsed).map(function (c) { return { code: c, group: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].group : "CO", label: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].label : c, kind: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].kind : "" }; });
      var rarcLegend = Object.keys(rarcUsed).map(function (c) { return { code: c, label: self.RARC_CATALOG[c] || c }; });

      return {
        header: {
          controlNumber: cl.claimNumber, type: cl.type, formName: inst ? "837I / UB-04 institutional" : "837P / CMS-1500 professional",
          placeOfService: pos + " — " + posLabel, billType: billType,
          dateOfService: cl.dateOfService, statementDates: inst ? (admitDate + " – " + dischargeDate) : cl.dateOfService,
          admitDate: admitDate, dischargeDate: dischargeDate, lengthOfStay: los, drg: drg, dischargeStatus: dischargeStatus,
          attending: inst ? { name: attending, npi: attendingNpi } : null,
          rendering: inst ? null : { name: p.name, npi: renderingNpi },
          billingProvider: { name: p.name, npi: p.npi, tin: p.tin, taxonomy: p.taxonomyCode || "—" },
          payer: "VA Community Care Network (VACCN)", subscriber: { name: ve.name || "—", memberId: ve.memberId || "—", dob: ve.dob || "—", sex: ve.sex || "—" },
          claimStatus: cl.claimStatus, paymentType: cl.paymentType, mode: cl.mode || "retrospective"
        },
        diagnoses: diagnoses, procedures: procedures, serviceLines: lines,
        remittance: { totals: totals, patientResponsibility: 0, recoverable: recoverable, carc: carcLegend, rarc: rarcLegend },
        reconciliation: "Submitted charge − CO-45 contractual write-off = fee-schedule allowed; allowed − $0 veteran cost-share = payer-paid. Payer-paid ties to the paid amount on file (" + usd(cl.paidAmount) + ")."
      };
    },

    // The same claim expressed as an HL7 FHIR R4 ExplanationOfBenefit resource (CARIN
    // Blue Button-aligned) — for the interoperability toggle on the Claim tab.
    getClaimFhir: function (claimId) {
      var d = this.getClaimDetail(claimId); if (!d) return null;
      var cl = claims[claimId], inst = d.header.type === "837I", h = d.header;
      var money = function (v) { return { value: Math.round(v * 100) / 100, currency: "USD" }; };
      var eob = {
        resourceType: "ExplanationOfBenefit",
        id: String(h.controlNumber).replace(/[^A-Za-z0-9-]/g, "-"),
        meta: { profile: ["http://hl7.org/fhir/us/carin-bb/StructureDefinition/C4BB-ExplanationOfBenefit-" + (inst ? "Inpatient-Institutional" : "Professional-NonClinician")] },
        status: "active",
        type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claim-type", code: inst ? "institutional" : "professional" }] },
        use: "claim",
        patient: { reference: "Patient/" + h.subscriber.memberId, display: h.subscriber.name },
        billablePeriod: inst ? { start: h.admitDate, end: h.dischargeDate } : { start: h.dateOfService, end: h.dateOfService },
        insurer: { display: "VA Community Care Network" },
        provider: { display: h.billingProvider.name, identifier: { system: "http://hl7.org/fhir/sid/us-npi", value: h.billingProvider.npi } },
        outcome: "complete",
        diagnosis: d.diagnoses.map(function (dx) {
          var o = { sequence: dx.seq, diagnosisCodeableConcept: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code: dx.code, display: dx.description }] }, type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/ex-diagnosistype", code: dx.type }] }] };
          if (dx.poa) o.onAdmission = { coding: [{ system: "https://www.cms.gov/Medicare/Medicare-Fee-for-Service-Payment/HospitalAcqCond/Coding", code: dx.poa }] };
          return o;
        })
      };
      if (inst && d.procedures.length) eob.procedure = d.procedures.map(function (pr) { return { sequence: pr.seq, procedureCodeableConcept: { coding: [{ system: "http://www.cms.gov/Medicare/Coding/ICD10", code: pr.code, display: pr.description }] }, date: pr.date }; });
      if (inst && h.drg) eob.supportingInfo = [{ sequence: 1, category: { coding: [{ code: "drg" }] }, code: { text: h.drg } }];
      eob.item = d.serviceLines.map(function (l) {
        var adj = [
          { category: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/adjudication", code: "submitted" }] }, amount: money(l.submitted) },
          { category: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/adjudication", code: "eligible" }] }, amount: money(l.allowed) },
          { category: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/adjudication", code: "deductible" }] }, amount: money(l.patientResp) },
          { category: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/adjudication", code: "benefit" }] }, amount: money(l.paid) }
        ];
        l.carc.forEach(function (c) { adj.push({ category: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/adjudication", code: "adjustmentreason" }] }, reason: { coding: [{ system: "https://x12.org/codes/claim-adjustment-reason-codes", code: c.group + "-" + c.code }] }, amount: money(c.amount) }); });
        var item = {
          sequence: l.lineNo,
          productOrService: l.ndc
            ? { coding: [{ system: "http://hl7.org/fhir/sid/ndc", code: l.ndc, display: l.description }] }
            : { coding: [{ system: "http://www.ama-assn.org/go/cpt", code: l.cpt, display: l.description }] },
          servicedDate: cl.dateOfService, quantity: l.ndc ? { value: l.units, unit: "each" } : { value: l.units },
          unitPrice: money(l.submitted), net: money(l.submitted), adjudication: adj
        };
        if (l.ndc && l.daysSupply) item.detail = [{ sequence: 1, productOrService: item.productOrService, quantity: { value: l.daysSupply, unit: "days-supply" } }];
        if (l.modifiers.length) item.modifier = l.modifiers.map(function (m) { return { coding: [{ system: "http://www.ama-assn.org/go/cpt", code: m }] }; });
        if (l.revenueCode) item.revenue = { coding: [{ system: "https://www.nubc.org/CodeSystem/RevenueCodes", code: l.revenueCode }] };
        return item;
      });
      eob.total = [
        { category: { coding: [{ code: "submitted" }] }, amount: money(d.remittance.totals.submitted) },
        { category: { coding: [{ code: "eligible" }] }, amount: money(d.remittance.totals.allowed) },
        { category: { coding: [{ code: "benefit" }] }, amount: money(d.remittance.totals.paid) }
      ];
      eob.payment = { amount: money(d.remittance.totals.paid) };
      return eob;
    },

    // ------------------------------------------------------------------
    // Pharmacy (NCPDP / NDC) claim record — the same reviewer-grade shape as
    // getClaimDetail but for a retail-pharmacy prescription claim. NDC lives here.
    // Reconciles to the claim's paid amount the same way (veteran cost-share $0).
    // ------------------------------------------------------------------
    getPharmacyDetail: function (claimId) {
      var cl = claims[claimId]; if (!cl) return null;
      var p = providers[cl.providerId] || {}, ve = veterans[cl.veteranId] || {};
      var rnd = this._seed(claimId, "rx"), self = this;
      var npi = function () { return "1" + String(100000000 + Math.floor(rnd() * 899999999)); };
      var prescriberNpi = npi();
      var principal = (cl.diagnosisCodes || [])[0] || null;
      var diagnoses = principal ? [{ seq: 1, code: principal, description: this.ICD10[principal] || "Diagnosis " + principal, type: "principal", poa: null }] : [];

      var carcUsed = {}, rarcUsed = {};
      var lines = (cl.lines || []).map(function (l, i) {
        var flagged = (l.violatesRuleIds || []).length > 0;
        var allowed = l.allowed, paid = l.paid;
        var submitted = Math.max(l.billed, Math.round(allowed * (1.5 + rnd() * 0.9)));
        var co45 = Math.round((submitted - allowed) * 100) / 100;
        var carc = [];
        if (co45 > 0) { carc.push({ group: "CO", code: "45", amount: co45 }); carcUsed["45"] = true; }
        var remark = flagged ? self._integrityRemark(l.violatesRuleIds) : null;
        if (remark) { rarcUsed[remark.rarc] = true; if (remark.carc) carcUsed[remark.carc] = true; }
        return {
          lineNo: i + 1, ndc: l.ndc, cpt: l.ndc, description: l.description, drugName: l.drugName || l.description,
          modifiers: [], units: l.units || 1, qtyDispensed: l.qtyDispensed || l.units, daysSupply: l.daysSupply || null,
          daw: l.daw || "0 — No product selection indicated", rxNumber: l.rxNumber || null, refill: l.refill || "00", prescriberNpi: prescriberNpi,
          submitted: submitted, allowed: allowed, contractual: co45, patientResp: 0, paid: paid,
          carc: carc, remark: remark, flagged: flagged
        };
      });
      var sum = function (k) { return Math.round(lines.reduce(function (a, l) { return a + l[k]; }, 0) * 100) / 100; };
      var totals = { submitted: sum("submitted"), contractual: sum("contractual"), allowed: sum("allowed"), patientResp: 0, paid: sum("paid") };
      var recoverable = Math.round(lines.filter(function (l) { return l.remark && l.remark.recover; }).reduce(function (a, l) { return a + l.paid; }, 0) * 100) / 100;
      var carcLegend = Object.keys(carcUsed).map(function (c) { return { code: c, group: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].group : "CO", label: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].label : c, kind: self.CARC_CATALOG[c] ? self.CARC_CATALOG[c].kind : "" }; });
      var rarcLegend = Object.keys(rarcUsed).map(function (c) { return { code: c, label: self.RARC_CATALOG[c] || c }; });

      return {
        pharmacy: true,
        header: {
          controlNumber: cl.claimNumber, type: "NCPDP", formName: "NCPDP D.0 telecommunication (retail pharmacy)",
          placeOfService: "01 — Pharmacy", billType: null, dateOfService: cl.dateOfService, statementDates: cl.dateOfService,
          rxNumber: (lines[0] && lines[0].rxNumber) || null,
          pharmacyName: p.name, pharmacyNpi: p.npi, ncpdpId: p.ncpdp || "—", pharmacyDea: cl.pharmacyDea || null,
          binPcn: cl.binPcn || "610239 / VACCNRX",
          prescriber: { name: cl.prescriber || "Dr. M. Alvarez", npi: prescriberNpi },
          billingProvider: { name: p.name, npi: p.npi, tin: p.tin, taxonomy: p.taxonomyCode || "3336C0003X" },
          payer: "VA Community Care Network — Pharmacy (VACCN Rx)", subscriber: { name: ve.name || "—", memberId: ve.memberId || "—", dob: ve.dob || "—", sex: ve.sex || "—" },
          claimStatus: cl.claimStatus, paymentType: cl.paymentType, mode: cl.mode || "retrospective"
        },
        diagnoses: diagnoses, procedures: [], serviceLines: lines,
        remittance: { totals: totals, patientResponsibility: 0, recoverable: recoverable, carc: carcLegend, rarc: rarcLegend },
        reconciliation: "Submitted (ingredient cost + dispensing fee) − CO-45 contractual = plan allowed; allowed − $0 veteran cost-share = plan-paid. Plan-paid ties to the paid amount on file (" + usd(cl.paidAmount) + ")."
      };
    },

    // NCPDP D.0 telecommunication representation (the pharmacy analog of get837).
    getNcpdp: function (claimId) {
      var cl = claims[claimId]; if (!cl || cl.type !== "NCPDP") return null;
      var d = this.getPharmacyDetail(claimId); var h = d.header;
      return {
        transaction: { standard: "NCPDP Telecommunication D.0", type: "B1 — Billing", bin: (h.binPcn.split(" / ")[0] || "610239"), pcn: (h.binPcn.split(" / ")[1] || "VACCNRX"), softwareVendor: "VACCN-RXSWITCH" },
        pharmacy: { qualifier: "01 — NPI", npi: h.pharmacyNpi, ncpdp: h.ncpdpId, name: h.pharmacyName, serviceProvider: "01 — Community/Retail" },
        patient: { memberId: h.subscriber.memberId, name: h.subscriber.name, dob: h.subscriber.dob, gender: h.subscriber.sex, relationship: "1 — Cardholder" },
        prescriber: { qualifier: "01 — NPI", npi: h.prescriber.npi, name: h.prescriber.name },
        claim: { rxServiceRef: h.rxNumber || "—", rxQualifier: "1 — Rx Billing", dateOfService: h.dateOfService, payer: h.payer },
        drugs: d.serviceLines.map(function (l, i) {
          return {
            line: i + 1, ndc: l.ndc, name: l.drugName, productQualifier: "03 — NDC",
            qtyDispensed: l.qtyDispensed, daysSupply: l.daysSupply, daw: l.daw, refill: l.refill,
            ingredientCost: l.submitted, dispensingFee: 1.40, patientPay: 0, planPaid: l.paid, flagged: l.flagged
          };
        })
      };
    },

    // Pharmacy claims are NCPDP, not 837 — the professional-claim engines (NCCI, MPFS,
    // MCG) don't apply. These early-outs let the Coding/Pricing/Utilization tabs show a
    // clear "not applicable" note instead of nonsensical CPT-based output.
    isPharmacyClaim: function (claimId) { var c = claims[claimId]; return !!(c && c.type === "NCPDP"); },

    // ---- Phase B seed: subject-of-investigation coverage --------------------
    // Adds a Pharmacy-subject lead (with a real NCPDP/NDC claim) and a Beneficiary-
    // subject lead so all three subject types show out of the box. Deterministic and
    // idempotent; inserts into the raw dataset AND the private lookup maps (the maps
    // are built once at init, so seeding must live here rather than in app.js).
    // All identifiers are impossible-to-be-real: NPI fails the 80840 check digit,
    // TIN uses the 00- prefix, NDC uses the 00000 labeler (never FDA-assigned).
    seedSubjects: function () {
      if (providers["PRX01"]) return; // already seeded this session

      // -- synthetic pharmacy (the Pharmacy subject) --
      var pharm = {
        id: "PRX01", name: "Lone Star Community Pharmacy", npi: "1730495861", tin: "00-4471903",
        ncpdp: "5551180", taxonomyCode: "3336C0003X", taxonomyLabel: "Community/Retail Pharmacy",
        city: "El Paso", state: "TX", peerGroup: "Pharmacy", role: "star",
        claimCount: 4120, totalPaid: 0, openAllegations: 1, riskScore: 87, groupScores: [], groupAttributes: {}, history: []
      };
      D.providers.push(pharm); providers[pharm.id] = pharm;

      // -- pharmacy NCPDP/NDC claim (NDC lives here) --
      var rxClaim = {
        id: "CPH01", claimNumber: "RX7742019-00-63", type: "NCPDP", providerId: "PRX01", veteranId: "V0001",
        dateOfService: "2025-05-14", diagnosisCodes: ["E11.9"], claimStatus: "Paid", paymentType: "POST", mode: "retrospective",
        binPcn: "610239 / VACCNRX", prescriber: "Dr. Helen Ruiz",
        billedAmount: 4704, allowedAmount: 4704, paidAmount: 4704,
        authorizationId: null, paymentId: "PRX0001",
        lines: [
          { ndc: "00000-0471-30", drugName: "Insulin glargine 100 units/mL (brand)", description: "Insulin glargine 100 units/mL — 3 × 10 mL vials", units: 30, qtyDispensed: "30 mL", daysSupply: 30, daw: "1 — Substitution not allowed (brand medically necessary)", rxNumber: "RX-4471902", refill: "02", billed: 4680, allowed: 4680, paid: 4680, violatesRuleIds: ["rule_rx_nondispense"] },
          { ndc: "00000-2231-05", drugName: "Metformin HCl 500 mg tablet (generic)", description: "Metformin HCl 500 mg — 60 tablets", units: 60, qtyDispensed: "60 ea", daysSupply: 30, daw: "0 — No product selection indicated", rxNumber: "RX-4471903", refill: "05", billed: 24, allowed: 24, paid: 24, violatesRuleIds: [] }
        ]
      };
      D.claims.push(rxClaim); claims[rxClaim.id] = rxClaim;

      // -- rules the new leads reference (so Evidence resolves real rule objects) --
      [
        { id: "rule_rx_nondispense", code: "RX-NONDISP", name: "Prescription non-dispensing / DAW screen", source: "VA CCN policy", category: "Integrity", description: "Prescription billed with no matching dispensing (pickup) record, or brand billed under DAW-1 without documented medical necessity where a generic equivalent exists.", version: "1.0", effectiveDate: "2025-03-01", environment: "Production" },
        { id: "rule_ben_identity", code: "BEN-IDENT", name: "Beneficiary identity / card-sharing screen", source: "VA CCN policy", category: "Integrity", description: "One member ID billed across multiple unrelated providers with overlapping dates of service or duplicate high-cost services — indicates beneficiary identity misuse or card sharing.", version: "1.0", effectiveDate: "2025-02-01", environment: "Production" }
      ].forEach(function (r) { if (!rules[r.id]) { D.rules.push(r); rules[r.id] = r; } });

      // -- the two leads --
      [
        {
          id: "20805", providerId: "PRX01", claimId: "CPH01", subjectType: "Pharmacy", fwaType: "Non-dispensed prescriptions",
          riskScore: 87, confidence: 91, source: "Rules Engine", sourceType: "Rules", claimType: "NCPDP", status: "New", assignee: null,
          mode: "retrospective", exposurePre: 0, exposurePost: 61400, submittedForRecovery: 0, verifiedRecoupment: 0, narrative: "",
          ruleIds: ["rule_rx_nondispense"], modelId: null, createdDate: "2026-06-30",
          xai: {
            summary: "Lone Star Community Pharmacy shows a 22% rate of brand DAW-1 fills with no matching pickup (dispensing) record, concentrated in high-cost insulins and specialty drugs — 8.1σ above the retail-pharmacy peer norm. Pattern indicates billing for non-dispensed prescriptions and DAW-1 misuse.",
            factors: [
              { label: "Brand DAW-1 no-pickup rate", value: "22%", benchmark: "peer 1.3%" },
              { label: "Deviation", value: "8.1σ above peer group" },
              { label: "NDC in pattern", value: "Insulin glargine (brand)" },
              { label: "Claims in pattern", value: "906 of 4,120" }
            ]
          }
        },
        {
          id: "20806", providerId: "PR100", claimId: null, subjectType: "Beneficiary", subjectVeteranId: "V0007", fwaType: "Beneficiary identity misuse",
          riskScore: 78, confidence: 84, source: "Data mining", sourceType: "Data mining", status: "New", assignee: null,
          mode: "retrospective", exposurePre: 0, exposurePost: 18900, submittedForRecovery: 0, verifiedRecoupment: 0, narrative: "",
          ruleIds: ["rule_ben_identity"], modelId: null, createdDate: "2026-07-05",
          xai: {
            summary: "One member ID appears on claims from 6 distinct providers across TX, AZ and NM inside a 21-day window, with overlapping service dates and duplicate high-cost fills. The concentration points to beneficiary-side identity misuse / card sharing rather than any single provider's billing error.",
            factors: [
              { label: "Distinct billers · 21 days", value: "6 providers" },
              { label: "States", value: "TX · AZ · NM" },
              { label: "Overlapping DOS", value: "4 same-day pairs" },
              { label: "Duplicate high-cost fills", value: "3" }
            ]
          }
        }
      ].forEach(function (a) { if (!D.allegations.some(function (x) { return x.id === a.id; })) D.allegations.push(a); });
    }
  };
})();
