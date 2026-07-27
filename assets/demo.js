/* Guided demo ribbon — scripted walkthrough of the 3 scenarios.
   Removable: the × hides it (a floating "Guided demo" pill re-opens). Delete this
   file + its <script> + #demo-ribbon to remove entirely. */
(function () {
  function q(sel) { return document.querySelector(sel); }
  function click(sel) { var e = q(sel); if (e) e.click(); }
  function tab(name) { click('.ctab[data-tab="' + name + '"]'); }
  function closeCopilot() { if (window.COPILOT && window.COPILOT.close) window.COPILOT.close(); }
  function retro() { window.APP.setRole("analyst"); if (window.APP.isPrepay()) window.APP.setMode("retrospective"); }

  function ensureRecords(id, channel) { if (!window.APP.recordsRequestFor(id)) window.APP.requestRecords(id, { channel: channel || "portal", items: "Progress notes and E/M documentation supporting the level billed." }); }

  // ~20-minute depth-first walkthrough. Take one lead (Alamo upcoding) all the way
  // through — evidence, pricing, records, decision, history — then widen to the ring,
  // the chain and entity fraud, the supervisor's two-tier review, and prepay + the
  // legitimate dismiss. Acts are marked in the notes.
  var STEPS = [
    // ---- Act 1 · Measure & detect ----
    { t: "Start with what we measure", n: "Analytics is the oversight lens — exposure & recovery trends, exposure by anomaly type, detection source, and peer comparison. Alamo Internal Medicine already stands out: 90% of its E/M visits at level 5 vs a 14% peer norm. That gap is what an outlier looks like.", a: function () { retro(); closeCopilot(); window.APP.nav("analytics"); } },
    { t: "The provider report card", n: "Adjudication can start from the provider, not just a claim. The radar scores each composite group vs the peer norm — Alamo's Coding and Charge spokes spike as outliers. Click a spoke to drill into the attributes; the outlier comparison ranks it against peers below.", a: function () { retro(); window.APP.openProvider("PR001"); } },

    // ---- Act 2 · One lead, end to end (Alamo upcoding) ----
    { t: "Drill to the lead", n: "Open Alamo's lead #20481. The milestone bar up top shows where it sits in its lifecycle and the last action; the header carries the subject of investigation (a provider here) and the exposure type (post-pay), and Overview gives the risk, confidence and an Explainable-AI “why this was flagged.”", a: function () { retro(); window.APP.openAllegation("20481"); tab("overview"); } },
    { t: "The claim record", n: "The Claim tab is the full record a reviewer works from — control number and place of service, the diagnoses, and every service line with its line-level adjudication reconciling submitted → contractual (CO-45) → allowed → paid, down to the CARC/RARC remarks. The standards toggle shows the very same claim as the X12 837 it arrived on and the HL7 FHIR ExplanationOfBenefit it maps to.", a: function () { retro(); window.APP.openAllegation("20481"); tab("claim"); } },
    { t: "Where the rules show their work", n: "Evidence is the compliance view behind those numbers — every claim line, flagged AND clean, tied to the specific edit or model that fired, with the records on file alongside. Amounts read as Exposure (what's recoverable). Click any line to expand what tripped it.", a: function () { retro(); window.APP.openAllegation("20481"); tab("evidence"); } },
    { t: "Priced against CMS", n: "Pricing compares the submitted charge against CMS reference pricing (via Zellis), line by line — the level-5 visit sits well above the CMS-allowed amount, and the recoverable exposure is called out. Each pricing rule also carries its version history: click one for the prior fee-schedule versions and what changed.", a: function () { retro(); window.APP.openAllegation("20481"); tab("pricing"); } },
    { t: "Clinical guidelines & graphs", n: "Utilization runs the claim against Milliman MCG — level of care and criteria met/not-met: medical necessity, not just coding. The Analysis tab adds the peer 99215 mix, an exposure breakdown and volume-over-time — the evidence behind the score.", a: function () { retro(); window.APP.openAllegation("20481"); tab("utilization"); } },
    { t: "What precedent says", n: "Similar cases pulls the prior adjudicated cases of this FWA type — the confirm rate and the recovered amounts. It's the precedent an analyst leans on: here upcoding has a mixed history, so read the dismissed ones before recovering.", a: function () { retro(); window.APP.openAllegation("20481"); tab("similar"); } },
    { t: "Request the records", n: "Documentation is missing, so request it — the left rail composes a records request on a channel: fax, secure email, or a provider-portal invite. The recipient (the provider's contact on file) fills in live; pick a channel and send.", a: function () { retro(); window.APP.openAllegation("20481"); tab("overview"); var b = document.getElementById("c-req"); if (b) b.click(); } },
    { t: "The provider portal", n: "A portal invite hands off to the provider's own screen — a simulated context switch where the provider sees the request and uploads the records. On submit, the file flows straight back into the lead's evidence and the request closes as Received. Then Return to PIVOT.", a: function () { retro(); ensureRecords("20481", "portal"); window.APP.openPortal("20481"); } },
    { t: "The decision — pay or convert", n: "On Decision the analyst picks the outcome by its consequence: Dismiss (clean — payment stands) or Confirm (improper — convert to a case). Confirm asks a coded reason, suggests which existing case to add to with a typed link, and can generate an AI justification memo to attach — then submit routes it to a supervisor.", a: function () { retro(); closeCopilot(); window.APP.openAllegation("20481"); tab("decision"); var seg = document.querySelector('.seg[data-d="c"]'); if (seg) seg.click(); } },
    { t: "The chain of custody", n: "History is every action on the lead, newest first — the flag, the records request and its responses, notes, the decision, supervisor actions — the full record for a handoff or an appeal.", a: function () { retro(); window.APP.openAllegation("20481"); tab("history"); } },

    // ---- Act 3 · The ring & the coding (Rio Grande unbundling) ----
    { t: "The coding crosswalk", n: "Rings aren't one-offs. Rio Grande Surgical's lead #20517 is unbundling — the Coding tab runs the NCCI crosswalk: 43235 is bundled into 43239 and billed with modifier 59 to bypass the edit. That's “this code with this modifier,” line by line.", a: function () { retro(); window.APP.openAllegation("20517"); tab("coding"); } },
    { t: "The collusion network", n: "The network lives on the case, not buried in Insights. Rio Grande shares a billing TIN with Alamo — one entity, coordinated anomalies. The narrative spells out why in plain language: claim → provider → network.", a: function () { retro(); window.APP.openAllegation("20517"); tab("network"); } },
    { t: "Building the case", n: "On the case page, Entity context, the case narrative (AI-draftable across the leads), and typed links tie it together. Ten leads from the same provider? Select them and bulk-link them to one case — each joins as it's confirmed.", a: function () { retro(); window.APP.openProvider("PR001"); } },

    // ---- Act 4 · The chain & entity fraud (Sonoran / Pacific Sands) ----
    { t: "Impossible days", n: "The residential chain's lead #20544 — Utilization leads with facility capacity: patient-days billed exceed what the staffed beds can physically hold, plus a peak census above the bed count. Impossible days no coding review would catch, on top of length-of-stay past medical necessity.", a: function () { retro(); window.APP.openAllegation("20544"); tab("utilization"); } },
    { t: "Excluded from federal programs", n: "Pacific Sands, a chain affiliate. Entity context puts business, network and licensure in one place — and Licensure carries an OIG LEIE exclusion: the provider is barred from federal health-care programs, so every claim paid during exclusion is recoverable in full. An automatic finding, independent of coding.", a: function () { retro(); window.APP.openProvider("PR301"); } },
    { t: "Flag the business, not the claim", n: "Insights › Businesses rolls the chain up to the entity behind it — Meridian Behavioral Holdings controls all four facilities across three states. The graph puts the business at the center; watchlist it and every provider it owns is on the radar.", a: function () { retro(); window.APP.openBusiness("REG-AZ-0098124"); } },
    { t: "When the subject isn't the provider", n: "Fraud doesn't only run through providers — every lead names its subject of investigation. Lead #20805 is a pharmacy: its Claim tab is an NCPDP prescription claim with NDC-level drug lines, days-supply and DAW — a brand billed under DAW-1 with no dispensing record on file. A companion beneficiary lead (#20806) flags one member ID billed across six providers in three states. Same workflow, provider or pharmacy or beneficiary.", a: function () { retro(); window.APP.openAllegation("20805"); tab("claim"); } },

    // ---- Act 5 · The supervisor's two-tier review ----
    { t: "Supervisor — lead approvals", n: "Switch to Supervisor (Karen Boyd, top-right) and the workspace changes. Confirmed leads wait under Casework › Approvals; Approve releases the recovery, Return sends it back. Only approval moves the money — the analyst can't do this.", a: function () { closeCopilot(); window.APP.setRole("supervisor"); window.APP.nav("approvals"); } },
    { t: "Supervisor — case reviews", n: "Beyond individual leads, the analyst hands up the whole CASE for sign-off. Case reviews is a separate queue — narrative, all constituent leads and total exposure reviewed as a unit. The supervisor approves the case or returns it. Closing and referral are supervisor-only too.", a: function () { window.APP.setRole("supervisor"); window.APP.nav("casereviews"); } },
    { t: "Case disposition", n: "Once approved, the supervisor dispositions the case: close it with a coded reason and a closing narrative, or refer it out — to VA-OIG, law enforcement, or recoupment. The narrative and reason stay on the record.", a: function () { window.APP.setRole("supervisor"); window.APP.openProvider("PR204"); } },

    // ---- Act 6 · Prepay & the legitimate catch ----
    { t: "Prepay — stop it before it pays", n: "Flip the top toggle to Prepay. The same models score claims BEFORE payment; the analyst decides Pay · Hold · Deny with a coded reason. A chain readmission is denied up front — the improper payment never leaves the VA. Retrospective recovers; prepay prevents.", a: function () { window.APP.setRole("analyst"); window.APP.setMode("prepay"); window.APP.nav("queue"); } },
    { t: "Human-in-the-loop — the legit catch", n: "Not every flag is fraud. Dialysis lead #20463 is flagged for frequency but the record shows a standing ESRD order — thrice-weekly is appropriate. The analyst dismisses it: clean, payment stands, logged for model retraining. The tool supports judgment, not a wrong accusation.", a: function () { retro(); window.APP.openAllegation("20463"); tab("evidence"); } },
    { t: "The rulebook behind it all", n: "Library › Rules catalogs every rule — grouped by regulatory source, entity type, fraud type, detection level or severity, from CMS NCCI edits to the False Claims Act, OIG exclusions and Anti-Kickback. Open one and it's fully transparent: the decision logic it applies, the exact claim fields and 837 segments it reads, and what it emits — a flag, a disposition, the CARC it drives. No black box.", a: function () { retro(); closeCopilot(); window.APP.nav("rules"); var rr = document.querySelector('.rule-row[data-rule="rule_em_level"]'); if (rr) rr.click(); } },
    { t: "How a rule reaches production", n: "That governance is auditable, not a promise — Library › Releases. Every build runs its tests and a secret scan before it deploys, and each rule version is promoted dev → test → pre-prod → production with QA, UAT and VA Change Advisory Board sign-off recorded against it. A newer pharmacy rule sits at pending-UAT, still gated out of production.", a: function () { retro(); closeCopilot(); window.APP.nav("releases"); } },
    { t: "Export & wrap", n: "Every surface — analytics, queue, report card, the claim record, network, case — exports to CSV, Excel and PDF. That's the loop: measure → outlier → claim record → coding, pricing, records → decide → case → supervisor → disposition, prepay or retrospective.", a: function () { retro(); closeCopilot(); window.APP.nav("analytics"); } }
  ];

  var DEMO = {
    i: 0,
    start: function () { DEMO.show(); DEMO.go(0); },
    show: function () { q("#demo-ribbon").style.display = "block"; var p = q("#demo-pill"); if (p) p.style.display = "none"; },
    hide: function () { q("#demo-ribbon").style.display = "none"; DEMO.pill(); window.APP.auditLog("DEMO_HIDDEN", "Guided demo ribbon dismissed"); },
    go: function (n) {
      DEMO.i = Math.max(0, Math.min(STEPS.length - 1, n));
      var s = STEPS[DEMO.i];
      try { if (s.a) s.a(); } catch (e) {}
      DEMO.render();
    },
    next: function () { if (DEMO.i < STEPS.length - 1) DEMO.go(DEMO.i + 1); },
    prev: function () { if (DEMO.i > 0) DEMO.go(DEMO.i - 1); },
    render: function () {
      var s = STEPS[DEMO.i], n = DEMO.i + 1, N = STEPS.length;
      var dots = STEPS.map(function (_, k) { return '<span data-go="' + k + '" style="width:7px;height:7px;border-radius:50%;cursor:pointer;background:' + (k === DEMO.i ? "#17b3a6" : "rgba(255,255,255,0.25)") + '"></span>'; }).join("");
      q("#demo-ribbon").innerHTML =
        '<div style="max-width:var(--page-max);margin:0 auto;padding:7px 24px">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
        '<div style="display:flex;align-items:center;gap:7px;white-space:nowrap"><i class="ti ti-player-play" style="color:#7fe0d6"></i><span style="font-size:12px;font-weight:500;color:#fff">Guided demo</span><span style="font-size:11px;color:#93a7bf">' + n + '/' + N + '</span></div>' +
        '<div style="flex:1;display:flex;justify-content:center;align-items:center;gap:5px">' + dots + '</div>' +
        '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap">' +
        '<button id="demo-prev" class="btn" style="padding:4px 9px;font-size:12px;background:rgba(255,255,255,0.1);color:#fff;border-color:rgba(255,255,255,0.25)"' + (DEMO.i === 0 ? " disabled" : "") + '><i class="ti ti-chevron-left"></i></button>' +
        '<button id="demo-next" class="btn" style="padding:4px 11px;font-size:12px;background:#17b3a6;color:#04342c;border-color:#17b3a6"' + (DEMO.i === N - 1 ? " disabled" : "") + '>Next <i class="ti ti-chevron-right"></i></button>' +
        '<button id="demo-close" title="Hide demo" class="btn" style="padding:4px 7px;font-size:12px;background:transparent;color:#93a7bf;border-color:rgba(255,255,255,0.2)"><i class="ti ti-x"></i></button>' +
        '</div></div>' +
        '<div style="font-size:12.5px;color:#cfe0f0;margin-top:5px;line-height:1.45"><span style="font-weight:500;color:#fff">' + s.t + '.</span> ' + s.n + '</div>' +
        '</div>';
      q("#demo-prev").onclick = DEMO.prev;
      q("#demo-next").onclick = DEMO.next;
      q("#demo-close").onclick = DEMO.hide;
      q("#demo-ribbon").querySelectorAll("[data-go]").forEach(function (d) { d.onclick = function () { DEMO.go(+d.getAttribute("data-go")); }; });
    },
    pill: function () {
      var p = q("#demo-pill");
      if (!p) {
        p = document.createElement("button");
        p.id = "demo-pill";
        p.style.cssText = "position:fixed;bottom:18px;left:18px;z-index:200;background:#10243b;color:#fff;border:0.5px solid rgba(255,255,255,0.2);border-radius:22px;padding:8px 14px;font-size:12.5px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:7px;box-shadow:0 2px 12px rgba(0,0,0,0.2)";
        p.innerHTML = '<i class="ti ti-player-play" style="color:#7fe0d6"></i> Guided demo';
        p.onclick = DEMO.start;
        document.body.appendChild(p);
      }
      p.style.display = "flex";
    }
  };
  window.DEMO = DEMO;

  function boot() { if (!window.APP || !window.APP.ready) { return setTimeout(boot, 100); } DEMO.start(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
