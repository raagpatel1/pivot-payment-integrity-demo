/* PIVOT app shell — router, state, audit trail, decision/case-flow. window.APP */
(function () {
  var mount;
  var APP = {
    state: { view: "queue", allegationId: null, filters: {}, decisions: {}, audit: [], investigations: [], role: "analyst", watchlist: {}, businessWatchlist: {}, mode: "retrospective", prepayDecisions: {}, comments: {}, workingRecord: {}, uploads: {}, artifacts: {}, recordsRequestText: {}, recordsRequests: {},
      caseLinks: {}, caseLinkTypes: {}, caseRelations: [], caseNarratives: {}, caseReviews: {}, closedCases: {}, referrals: {} },

    ROLES: { analyst: { name: "Dana Whitmore", title: "Analyst", initials: "DW" }, supervisor: { name: "Karen Boyd", title: "Supervisor", initials: "KB" } },
    isSupervisor: function () { return APP.state.role === "supervisor"; },
    setRoleHeader: function () {
      var r = APP.ROLES[APP.state.role];
      var n = document.getElementById("role-name"), t = document.getElementById("role-title"), av = document.getElementById("role-avatar");
      if (n) n.textContent = r.name; if (t) t.textContent = r.title; if (av) av.textContent = r.initials;
    },
    toggleRole: function () { APP.setRole(APP.state.role === "analyst" ? "supervisor" : "analyst"); },
    setRole: function (role) {
      if (APP.state.role === role) return;
      APP.state.role = role;
      APP.setRoleHeader();
      APP.auditLog("ROLE_SWITCH", "Now acting as " + APP.ROLES[role].name + " (" + APP.ROLES[role].title + ")");
      var v = APP.state.view;
      if (role === "analyst" && v === "approvals") v = "queue";
      if (role === "supervisor" && v === "queue") v = "approvals";
      APP.nav(v, { id: APP.state.allegationId });
    },

    fmtTs: function (d) {
      d = d || new Date();
      var p = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
    },
    fmtDate: function (d) {
      d = d || new Date();
      var p = function (n) { return String(n).padStart(2, "0"); };
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    },
    esc: function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); },

    ready: false,
    resetDemo: function () { location.reload(); }, // overridden by Supabase integration
    auditLog: function (action, detail) {
      APP.state.audit.unshift({ ts: new Date(), action: action, detail: detail, user: (APP.ROLES[APP.state.role] || {}).name || "Dana Whitmore" });
      var b = document.getElementById("audit-badge");
      if (b) { b.textContent = APP.state.audit.length; b.style.display = APP.state.audit.length ? "inline-block" : "none"; }
    },

    kpis: function () {
      var k = Object.assign({}, window.DP.getKpis());
      var add = 0;
      Object.keys(APP.state.decisions).forEach(function (id) {
        var dec = APP.state.decisions[id];
        // recovery counts only after a supervisor approves the confirmation
        if (dec.outcome === "confirm" && dec.reviewState === "approved") { var a = window.DP.getAllegation(id); if (a) add += a.exposurePost || 0; }
      });
      k.submittedForRecovery = k.submittedForRecovery + add;
      return k;
    },

    // Analyst submits a decision. Confirm/Escalate route to the supervisor queue;
    // Dismiss is analyst-final. Recovery/investigation only fire on supervisor approval.
    applyDecision: function (id, outcome, rationale, reason) {
      var a = window.DP.raw.allegations.find(function (x) { return x.id === id; });
      if (!a) return;
      var final = outcome === "dismiss";
      var status = final ? "Dismissed" : "Pending review";
      var reviewState = final ? "final" : "pending";
      a.status = status; a.assignee = a.assignee || "Dana Whitmore";
      APP.state.decisions[id] = { outcome: outcome, rationale: rationale, reason: reason || null, ts: new Date(), status: status, reviewState: reviewState };
      APP.auditLog("DECISION_" + outcome.toUpperCase(), "Lead #" + id + " · " + (final ? "Dismissed (false positive)" : outcome) + (reason ? " · reason " + APP.reasonLabel(outcome, reason) : "") + (rationale ? " · justification recorded" : ""));
      if (!final) {
        APP.auditLog("SUBMITTED_FOR_REVIEW", "Lead #" + id + " · " + outcome + " → supervisor (Karen Boyd)");
        // the analyst chose (Decision tab) to open a new case or add to an existing one
        var link = (APP.state.caseLinks || {})[id];
        var isNew = !link || String(link).indexOf("new:") === 0;
        var pv = window.DP.getProvider(a.providerId);
        APP.auditLog(isNew ? "CASE_OPENED" : "CASE_UPDATED", "Lead #" + id + " · " + (outcome === "escalate" ? "escalated" : "confirmed") + " → " + (isNew ? "opened a new case" : "added to an existing case") + " for " + a.providerId + (pv ? " (" + pv.name + ")" : ""));
      }
      APP.updateSupBadge();
    },

    // Supervisor approves or returns a pending decision.
    supervisorAction: function (id, action, note) {
      var dec = APP.state.decisions[id]; if (!dec) return;
      var a = window.DP.raw.allegations.find(function (x) { return x.id === id; });
      if (action === "approve") {
        dec.reviewState = "approved";
        a.status = dec.outcome === "confirm" ? "Confirmed" : "Escalated";
        dec.status = a.status;
        APP.auditLog("SUPERVISOR_APPROVED", "Lead #" + id + " · " + a.status + " · approver Karen Boyd");
        if (dec.outcome === "confirm") APP.auditLog("RECOVERY_SUBMITTED", "Lead #" + id + " · " + window.DP.usd(a.exposurePost || 0));
        if (dec.outcome === "escalate") { APP.state.investigations.push(id); APP.auditLog("CASE_OPENED", "Lead #" + id + " · " + a.providerId); }
      } else {
        dec.reviewState = "returned"; dec.returnNote = note || "";
        a.status = "Returned"; dec.status = "Returned";
        APP.auditLog("SUPERVISOR_RETURNED", "Lead #" + id + (note ? " · " + note : ""));
      }
      APP.updateSupBadge();
    },

    pendingReviews: function () {
      return Object.keys(APP.state.decisions)
        .filter(function (id) { return APP.state.decisions[id].reviewState === "pending"; })
        .map(function (id) { return { id: id, dec: APP.state.decisions[id], a: window.DP.getAllegation(id) }; });
    },
    updateSupBadge: function () {
      var n = APP.pendingReviews().length;
      var cr = APP.pendingCaseReviews ? APP.pendingCaseReviews().length : 0;
      var b = document.getElementById("sup-badge");
      if (b) { b.textContent = n + cr; b.style.display = ((n + cr) && APP.isSupervisor()) ? "inline-block" : "none"; }
      var sb = document.getElementById("sub-appr-badge");
      if (sb) sb.innerHTML = n ? '<span class="tag" style="background:#c77d11;color:#fff">' + n + '</span>' : "";
      var cb = document.getElementById("sub-casereview-badge");
      if (cb) cb.innerHTML = cr ? '<span class="tag" style="background:#c77d11;color:#fff">' + cr + '</span>' : "";
    },

    decisionFor: function (id) { return APP.state.decisions[id] || null; },

    // ---- structured decision reasons ----
    // Every decision carries a coded reason (the dropdown) AND a free-text
    // justification. The reason is what reports and appeals key off; the
    // justification is the analyst's narrative. Codes mirror VA denial-reason
    // families rather than free text so outcomes stay countable.
    REASONS: {
      confirm: [
        { c: "DOC-01", t: "Documentation does not support the level billed" },
        { c: "DOC-02", t: "No documentation of the service in the medical record" },
        { c: "MED-01", t: "Service not medically necessary for the documented diagnosis" },
        { c: "COD-01", t: "Unbundled component of a comprehensive procedure" },
        { c: "COD-02", t: "Modifier applied without supporting documentation" },
        { c: "COD-03", t: "Procedure/modifier pairing invalid per NCCI edits" },
        { c: "DUP-01", t: "Duplicate of a previously adjudicated claim" },
        { c: "FRQ-01", t: "Frequency exceeds clinically supported limits" },
        { c: "AUT-01", t: "No authorization on file for the billed service" },
        { c: "PRC-01", t: "Billed above the CMS/VA fee-schedule allowance" }
      ],
      dismiss: [
        { c: "FP-01", t: "Documentation supports the service as billed" },
        { c: "FP-02", t: "Medical necessity established on review of the record" },
        { c: "FP-03", t: "Modifier use is correct and documented" },
        { c: "FP-04", t: "Peer comparison not applicable — atypical panel/case mix" },
        { c: "FP-05", t: "Data or coding error in the flag itself" },
        { c: "FP-06", t: "Prior authorization on file — flag fired in error" }
      ],
      escalate: [
        { c: "ESC-01", t: "Coordinated behavior across linked providers" },
        { c: "ESC-02", t: "Pattern exceeds the scope of a single claim" },
        { c: "ESC-03", t: "Suspected phantom billing / services not rendered" },
        { c: "ESC-04", t: "Potential kickback or self-referral arrangement" },
        { c: "ESC-05", t: "Beneficiary identity concern" },
        { c: "ESC-06", t: "Recommend referral to VA-OIG" }
      ],
      pay: [
        { c: "PAY-01", t: "Claim is clean — documentation and coding support payment" },
        { c: "PAY-02", t: "Flag reviewed and cleared — no improper billing found" },
        { c: "PAY-03", t: "Records received and support the billed service" }
      ],
      hold: [
        { c: "HLD-01", t: "Awaiting medical records from the provider" },
        { c: "HLD-02", t: "Awaiting authorization documentation" },
        { c: "HLD-03", t: "Pending clinical review" },
        { c: "HLD-04", t: "Pending provider response to a coding inquiry" }
      ],
      deny: [
        { c: "DOC-01", t: "Documentation does not support the level billed" },
        { c: "DOC-02", t: "No documentation of the service in the medical record" },
        { c: "MED-01", t: "Service not medically necessary for the documented diagnosis" },
        { c: "COD-01", t: "Unbundled component of a comprehensive procedure" },
        { c: "COD-03", t: "Procedure/modifier pairing invalid per NCCI edits" },
        { c: "DUP-01", t: "Duplicate of a previously adjudicated claim" },
        { c: "AUT-01", t: "No authorization on file for the billed service" },
        { c: "PRC-01", t: "Billed above the CMS/VA fee-schedule allowance" }
      ]
    },
    reasonsFor: function (outcome) { return APP.REASONS[outcome] || []; },
    reasonText: function (outcome, code) {
      var r = APP.reasonsFor(outcome).find(function (x) { return x.c === code; });
      return r ? r.t : null;
    },
    reasonLabel: function (outcome, code) {
      var t = APP.reasonText(outcome, code);
      return t ? code + " · " + t : (code || "");
    },
    // The reason the model's evidence most supports — preselected, analyst can override.
    suggestedReason: function (a, outcome) {
      var byFwa = {
        "Upcoding": { confirm: "DOC-01", deny: "DOC-01" },
        "Unbundling": { confirm: "COD-01", deny: "COD-01" },
        "Modifier misuse": { confirm: "COD-02", deny: "COD-03" },
        "Duplicate claim": { confirm: "DUP-01", deny: "DUP-01" },
        "Duplicate billing": { confirm: "DUP-01", deny: "DUP-01" },
        "Frequency / over-utilization": { confirm: "FRQ-01", dismiss: "FP-02" },
        "Phantom billing": { confirm: "DOC-02", escalate: "ESC-03", deny: "DOC-02" },
        "Kickback / self-referral": { escalate: "ESC-04" },
        "Authorization mismatch": { confirm: "AUT-01", deny: "AUT-01" },
        "Residential length-of-stay abuse": { confirm: "MED-01", deny: "MED-01" }
      };
      var hit = (byFwa[a.fwaType] || {})[outcome];
      if (hit) return hit;
      var first = APP.reasonsFor(outcome)[0];
      return first ? first.c : null;
    },

    ANALYSTS: ["Dana Whitmore", "Maria Delgado", "Devon Carter", "Priya Nair"],
    // Per-analyst profile for supervisor workload management: FWA-type strengths
    // (assign work to whoever is best at it) + performance indicators.
    ANALYST_META: {
      "Dana Whitmore": { strengths: ["Upcoding", "Duplicate claim"], completed: 38, avgDays: 5.8, closedExp2w: 142000 },
      "Maria Delgado": { strengths: ["Unbundling", "Modifier misuse"], completed: 44, avgDays: 6.5, closedExp2w: 98000 },
      "Devon Carter": { strengths: ["Residential length-of-stay abuse", "Kickback / self-referral", "Deceased patient"], completed: 29, avgDays: 8.1, closedExp2w: 210000 },
      "Priya Nair": { strengths: ["Frequency / over-utilization", "Phantom billing", "Billing outside specialty", "Authorization mismatch"], completed: 33, avgDays: 6.9, closedExp2w: 76000 }
    },
    // The analyst who specializes in a given FWA type (for assign-by-strength).
    bestAnalystFor: function (fwaType) {
      var names = APP.ANALYSTS.filter(function (n) { return (APP.ANALYST_META[n] || {}).strengths && APP.ANALYST_META[n].strengths.indexOf(fwaType) >= 0; });
      return names.length ? names[0] : null;
    },
    // Supervisor assigns / reassigns a flagged claim to an analyst (or unassigns).
    assignCase: function (id, name) {
      var a = window.DP.raw.allegations.find(function (x) { return x.id === id; });
      if (!a) return;
      a.assignee = name || null;
      if (name && a.status === "New") a.status = "Assigned";
      APP.auditLog("CASE_ASSIGNED", "Lead #" + id + " · " + (name ? "→ " + name : "unassigned"));
    },
    // ---- typed relationships ----
    // A link records WHY a lead belongs to a case, not just that it does. The reason
    // is what a reviewer challenges on appeal ("why is this provider in that ring?"),
    // so it is stored alongside the link rather than inferred later.
    LEAD_LINK_TYPES: [
      { c: "same-provider", l: "Same provider", d: "The lead bills under the same provider as the case." },
      { c: "same-entity", l: "Same billing entity", d: "A different provider sharing the case's billing TIN or registration." },
      { c: "same-scheme", l: "Same scheme / pattern", d: "The same billing pattern as the case, potentially across providers." },
      { c: "manual", l: "Analyst judgment", d: "Linked on the analyst's assessment — see the justification." }
    ],
    CASE_LINK_TYPES: [
      { c: "related", l: "Related to", d: "Shares subject matter, providers or scheme with the other case." },
      { c: "duplicate", l: "Duplicate of", d: "Covers the same conduct as the other case." },
      { c: "supersedes", l: "Supersedes", d: "Replaces the other case, which should be closed." }
    ],
    leadLinkLabel: function (c) { var t = APP.LEAD_LINK_TYPES.find(function (x) { return x.c === c; }); return t ? t.l : c; },
    caseLinkLabel: function (c) { var t = APP.CASE_LINK_TYPES.find(function (x) { return x.c === c; }); return t ? t.l : c; },
    // Derive the link type from the evidence rather than making the analyst classify it.
    suggestLinkType: function (lead, caseObj) {
      if (!lead || !caseObj) return "manual";
      if ((caseObj.providerIds || []).indexOf(lead.providerId) >= 0) return "same-provider";
      var lp = window.DP.getProvider(lead.providerId) || {};
      var shares = (caseObj.providers || []).some(function (p) {
        return (p.tin && lp.tin && p.tin === lp.tin) || (p.registrationId && lp.registrationId && p.registrationId === lp.registrationId);
      });
      if (shares) return "same-entity";
      if ((caseObj.fwaTypes || []).indexOf(lead.fwaType) >= 0) return "same-scheme";
      return "manual";
    },
    linkTypeFor: function (leadId) { return (APP.state.caseLinkTypes || {})[leadId] || null; },

    // Which existing case should this lead join? Ranked, each with the reason it is
    // a candidate, so the analyst is choosing between explanations rather than
    // reading a flat dropdown of provider names.
    suggestCases: function (lead) {
      if (!lead) return [];
      var lp = window.DP.getProvider(lead.providerId) || {};
      var open = window.DP.listCases({ mode: "retrospective" }).filter(function (c) { return !c.closed; });
      return open.map(function (c) {
        var type = APP.suggestLinkType(lead, c), why = null, rank = 9;
        if (type === "same-provider") {
          rank = 1;
          // A multi-provider case is named for its primary provider, so "same
          // provider" would read as a mistake when the lead is on one of the others.
          why = c.multiProvider
            ? "This case already covers " + (lp.name || "this provider") + " — " + c.providerCount + " providers sharing " +
              (lp.tin ? "TIN " + lp.tin : "a business registration") + "."
            : "This is " + (lp.name || "this provider") + "'s case — the lead bills under it.";
        }
        else if (type === "same-entity") {
          var shared = (c.providers || []).find(function (p) { return (p.tin && lp.tin && p.tin === lp.tin) || (p.registrationId && lp.registrationId && p.registrationId === lp.registrationId); }) || {};
          rank = 2;
          why = shared.tin === lp.tin
            ? "Shares billing TIN " + lp.tin + " with " + (shared.name || "this case's provider") + "."
            : "Shares business registration " + (lp.registrationId || "") + " with " + (shared.name || "this case's provider") + ".";
        }
        else if (type === "same-scheme") { rank = 3; why = "Same scheme — this case already covers " + lead.fwaType.toLowerCase() + "."; }
        else return null;
        return { c: c, linkType: type, why: why, rank: rank };
      }).filter(Boolean).sort(function (x, y) { return (x.rank - y.rank) || (y.c.exposure - x.c.exposure); });
    },

    // Analyst's Decision-tab choice: start a NEW case or add the lead to an existing
    // one. Stored as a per-lead case link that DP.listCases groups by.
    setLeadCase: function (id, choice) {
      choice = choice || {};
      var key = (choice.mode === "existing" && choice.caseKey) ? choice.caseKey : "new:" + id;
      (APP.state.caseLinks = APP.state.caseLinks || {})[id] = key;
      if (choice.linkType) (APP.state.caseLinkTypes = APP.state.caseLinkTypes || {})[id] = choice.linkType;
      APP.auditLog("CASE_LINK", "Lead #" + id + " · " + (choice.mode === "existing" ? "added to existing case" + (choice.caseName ? " (" + choice.caseName + ")" : "") : "flagged to open a new case") +
        (choice.linkType ? " · link type: " + APP.leadLinkLabel(choice.linkType) : ""));
    },

    // ---- case ↔ case links ----
    // Keyed by providerId (the case's stable id — caseKey is derived and flips as
    // soon as a lead is re-linked, so it would orphan these).
    caseRelations: function (pid) {
      return (APP.state.caseRelations || []).filter(function (r) { return r.from === pid || r.to === pid; })
        .map(function (r) {
          // present the relation from the perspective of the case being viewed
          var out = r.from === pid;
          return { otherPid: out ? r.to : r.from, type: r.type, outbound: out, note: r.note, ts: r.ts, by: r.by };
        });
    },
    addCaseRelation: function (fromPid, toPid, type, note) {
      if (!fromPid || !toPid || fromPid === toPid) return null;
      var rels = (APP.state.caseRelations = APP.state.caseRelations || []);
      if (rels.some(function (r) { return r.from === fromPid && r.to === toPid && r.type === type; })) return null;
      var r = { from: fromPid, to: toPid, type: type, note: note || "", ts: new Date(), by: (APP.ROLES[APP.state.role] || {}).name };
      rels.push(r);
      var a = window.DP.getProvider(fromPid) || {}, b = window.DP.getProvider(toPid) || {};
      APP.auditLog("CASE_LINKED", "Case " + fromPid + " (" + (a.name || "—") + ") " + APP.caseLinkLabel(type).toLowerCase() + " case " + toPid + " (" + (b.name || "—") + ")" + (note ? " · " + note : ""));
      return r;
    },
    removeCaseRelation: function (fromPid, otherPid, type) {
      var rels = (APP.state.caseRelations || []);
      var i = rels.findIndex(function (r) { return r.type === type && ((r.from === fromPid && r.to === otherPid) || (r.from === otherPid && r.to === fromPid)); });
      if (i < 0) return;
      rels.splice(i, 1);
      APP.auditLog("CASE_UNLINKED", "Case " + fromPid + " · removed “" + APP.caseLinkLabel(type) + "” link to case " + otherPid);
    },

    // ---- case narrative (the story across a case's leads) ----
    // Keyed by providerId — the case's stable identity. caseKey is derived and
    // changes the moment a lead is re-linked, which would orphan the narrative.
    getCaseNarrative: function (pid) { return (APP.state.caseNarratives || {})[pid] || null; },
    setCaseNarrative: function (pid, text) {
      text = (text || "").trim();
      var store = (APP.state.caseNarratives = APP.state.caseNarratives || {});
      if (!text) { delete store[pid]; return null; }
      var first = !store[pid];
      var n = { text: text, ts: new Date(), by: (APP.ROLES[APP.state.role] || {}).name || "Dana Whitmore" };
      store[pid] = n;
      var p = window.DP.getProvider(pid);
      APP.auditLog(first ? "CASE_NARRATIVE_ADDED" : "CASE_NARRATIVE_UPDATED", "Case " + pid + (p ? " (" + p.name + ")" : "") + " · narrative " + (first ? "written" : "revised") + " by " + n.by);
      return n;
    },

    // ---- case-level review (the whole case as a unit) ----
    // Distinct from the per-lead approvals: once an analyst has built a case
    // (confirmed leads + a narrative), they submit the CASE for supervisor sign-off.
    // The supervisor reviews narrative + all constituent leads + total exposure and
    // approves or returns it. Keyed by providerId (the case's stable id).
    caseReviewFor: function (pid) { return (APP.state.caseReviews || {})[pid] || null; },
    // Analyst (or supervisor) hands the case up. Requires a narrative — you can't ask
    // for sign-off on a case whose story isn't written.
    submitCaseForReview: function (pid) {
      if (!APP.getCaseNarrative(pid)) return { error: "narrative-required" };
      var c = window.DP.getCase(pid, "retrospective") || {};
      var r = { status: "pending", submittedBy: (APP.ROLES[APP.state.role] || {}).name, submittedAt: new Date(), reviewedBy: null, reviewedAt: null, note: "" };
      (APP.state.caseReviews = APP.state.caseReviews || {})[pid] = r;
      var p = window.DP.getProvider(pid);
      APP.auditLog("CASE_SUBMITTED_FOR_REVIEW", "Case " + pid + (p ? " (" + p.name + ")" : "") + " · " + (c.leadCount || 0) + " leads · " + window.DP.usd(c.exposure || 0) + " · submitted for supervisor review by " + r.submittedBy);
      APP.updateSupBadge();
      return r;
    },
    canReviewCase: function () { return APP.isSupervisor(); },
    // Supervisor approves or returns the case. Supervisor-only — guarded here.
    caseReviewAction: function (pid, action, note) {
      if (!APP.canReviewCase()) { APP.auditLog("CASE_REVIEW_DENIED", "Case " + pid + " · case review attempted without supervisor authority"); return null; }
      var r = APP.caseReviewFor(pid); if (!r) return null;
      r.reviewedBy = (APP.ROLES[APP.state.role] || {}).name; r.reviewedAt = new Date(); r.note = note || "";
      r.status = action === "approve" ? "approved" : "returned";
      var p = window.DP.getProvider(pid);
      if (action === "approve") APP.auditLog("CASE_APPROVED", "Case " + pid + (p ? " (" + p.name + ")" : "") + " · approved by " + r.reviewedBy + " — ready for disposition");
      else APP.auditLog("CASE_RETURNED_TO_ANALYST", "Case " + pid + (p ? " (" + p.name + ")" : "") + " · returned by " + r.reviewedBy + (note ? " · " + note : ""));
      APP.updateSupBadge();
      return r;
    },
    // Cases sitting in the supervisor's court (the case queue).
    pendingCaseReviews: function () {
      var store = APP.state.caseReviews || {};
      return Object.keys(store).filter(function (pid) { return store[pid].status === "pending"; })
        .map(function (pid) { return { pid: pid, review: store[pid], caseInfo: window.DP.getCase(pid, "retrospective") }; })
        .filter(function (x) { return x.caseInfo; })
        .sort(function (a, b) { return (b.caseInfo.exposure || 0) - (a.caseInfo.exposure || 0); });
    },

    // ---- case closure & referral (supervisor authority) ----
    // Analysts work leads and may add them to cases, but closing a case or referring
    // it out is the supervisor's call. Guarded here, not just hidden in the views —
    // the UI gate is the affordance, this is the rule.
    CLOSE_REASONS: [
      { c: "CL-01", t: "Recovery completed — funds recouped" },
      { c: "CL-02", t: "Confirmed improper payment — referred for recoupment" },
      { c: "CL-03", t: "Referred to VA-OIG / law enforcement" },
      { c: "CL-04", t: "Provider education issued — no recovery pursued" },
      { c: "CL-05", t: "Unsubstantiated — no improper payment found" },
      { c: "CL-06", t: "Below the recovery threshold — not cost-effective to pursue" },
      { c: "CL-07", t: "Duplicate of another case" },
      { c: "CL-08", t: "Provider no longer active / unable to pursue" }
    ],
    closeReasonText: function (code) { var r = APP.CLOSE_REASONS.find(function (x) { return x.c === code; }); return r ? r.t : null; },
    REFERRAL_TARGETS: [
      { c: "oig", l: "VA Office of Inspector General" },
      { c: "doj", l: "Department of Justice / law enforcement" },
      { c: "recoupment", l: "Recoupment / debt management" },
      { c: "program-integrity", l: "Program Integrity review board" }
    ],
    referralLabel: function (c) { var t = APP.REFERRAL_TARGETS.find(function (x) { return x.c === c; }); return t ? t.l : c; },
    canCloseCase: function () { return APP.isSupervisor(); },
    canReferCase: function () { return APP.isSupervisor(); },

    isCaseClosed: function (pid) { return !!(APP.state.closedCases && APP.state.closedCases[pid]); },
    closeCase: function (pid, reason, narrative) {
      if (!APP.canCloseCase()) { APP.auditLog("CASE_CLOSE_DENIED", "Case " + pid + " · close attempted without supervisor authority"); return null; }
      var c = {
        reason: reason || "CL-01", reasonText: APP.closeReasonText(reason) || "Resolved",
        narrative: (narrative || "").trim(), ts: new Date(), by: (APP.ROLES[APP.state.role] || {}).name
      };
      (APP.state.closedCases = APP.state.closedCases || {})[pid] = c;
      var p = window.DP.getProvider(pid);
      APP.auditLog("CASE_CLOSED", "Case " + pid + (p ? " (" + p.name + ")" : "") + " · " + c.reason + " · " + c.reasonText + " · closed by " + c.by + (c.narrative ? " · closing narrative recorded" : ""));
      return c;
    },
    reopenCase: function (pid) {
      if (!APP.canCloseCase()) { APP.auditLog("CASE_REOPEN_DENIED", "Case " + pid + " · reopen attempted without supervisor authority"); return null; }
      if (APP.state.closedCases) delete APP.state.closedCases[pid];
      APP.auditLog("CASE_REOPENED", "Case " + pid + " reopened by " + (APP.ROLES[APP.state.role] || {}).name);
    },
    // Referral out of PIVOT — the terminal path beyond recovery. Supervisor-only.
    referralFor: function (pid) { return (APP.state.referrals || {})[pid] || null; },
    referCase: function (pid, target, note) {
      if (!APP.canReferCase()) { APP.auditLog("CASE_REFER_DENIED", "Case " + pid + " · referral attempted without supervisor authority"); return null; }
      var r = { target: target, label: APP.referralLabel(target), note: (note || "").trim(), ts: new Date(), by: (APP.ROLES[APP.state.role] || {}).name };
      (APP.state.referrals = APP.state.referrals || {})[pid] = r;
      var p = window.DP.getProvider(pid);
      APP.auditLog("CASE_REFERRED", "Case " + pid + (p ? " (" + p.name + ")" : "") + " · referred to " + r.label + " by " + r.by + (r.note ? " · " + r.note : ""));
      return r;
    },
    openTeam: function (sel) { APP.state.teamSel = sel; APP.nav("team"); },
    openBusiness: function (id) { (APP.state.hist = APP.state.hist || []).push(APP.snapshot()); APP.state.businessId = id; APP.nav("business", { id: id }); },

    // Flag/unflag a business entity (holding company / billing entity) for oversight.
    isBusinessWatched: function (id) { return !!APP.state.businessWatchlist[id]; },
    toggleBusinessWatch: function (id) {
      var b = window.DP.getBusiness(id); if (!b) return false;
      var on = !APP.state.businessWatchlist[id];
      if (on) APP.state.businessWatchlist[id] = true; else delete APP.state.businessWatchlist[id];
      APP.auditLog(on ? "BUSINESS_FLAGGED" : "BUSINESS_UNFLAGGED", b.name + " (" + b.providerCount + " providers)" + (on ? " added to the business watchlist" : " removed from the business watchlist"));
      return on;
    },

    // Flag/unflag a provider for future reference (repeat-offender watchlist).
    isProviderWatched: function (id) { return !!APP.state.watchlist[id]; },
    toggleProviderWatch: function (id) {
      var p = window.DP.getProvider(id); if (!p) return false;
      var on = !APP.state.watchlist[id];
      if (on) APP.state.watchlist[id] = true; else delete APP.state.watchlist[id];
      APP.auditLog(on ? "PROVIDER_FLAGGED" : "PROVIDER_UNFLAGGED", p.name + " (NPI " + (p.npi || "—") + ")" + (on ? " added to watchlist for future reference" : " removed from watchlist"));
      return on;
    },

    // ---- per-lead history ----
    // Every action taken on one lead, newest first: the audit entries that name it
    // plus its notes. Audit details are written as "… #<id> · …", so match the id
    // on a boundary — "#2048" must not match lead 20481.
    historyFor: function (id) {
      var re = new RegExp("#" + String(id) + "(\\D|$)");
      var rows = (APP.state.audit || [])
        // notes come in via getComments with their full text; the truncated
        // NOTE_ADDED audit line would just duplicate them.
        .filter(function (e) { return e.action !== "NOTE_ADDED" && re.test(e.detail || ""); })
        .map(function (e) { return { ts: e.ts, kind: "audit", action: e.action, text: e.detail, user: e.user }; });
      APP.getComments(id).forEach(function (c) {
        rows.push({ ts: c.ts, kind: "note", action: "NOTE_ADDED", text: c.text, user: c.user, role: c.role });
      });
      // the lead's own origin — it exists before anything is logged against it
      var a = window.DP.getAllegation(id);
      if (a && a.createdDate) {
        rows.push({
          ts: new Date(a.createdDate + "T08:00:00"), kind: "origin", action: "LEAD_CREATED",
          text: "Lead #" + id + " created · " + (window.DP.sourceOf(a) || a.source) + (a.fwaType ? " · " + a.fwaType : ""),
          user: a.createdBy || (a.manual ? "Analyst" : "PIVOT detection")
        });
      }
      return rows.sort(function (x, y) { return y.ts - x.ts; });
    },
    lastActionFor: function (id) { return APP.historyFor(id)[0] || null; },

    // ---- case notes / annotations (analyst "color commentary" on a lead/case) ----
    // Keyed by lead id; every note is written to the audit trail.
    getComments: function (id) { return APP.state.comments[id] || []; },
    addComment: function (id, text) {
      text = (text || "").trim(); if (!text) return null;
      var c = { ts: new Date(), user: (APP.ROLES[APP.state.role] || {}).name || "Dana Whitmore", role: (APP.ROLES[APP.state.role] || {}).title || "Analyst", text: text };
      (APP.state.comments[id] = APP.state.comments[id] || []).push(c);
      APP.auditLog("NOTE_ADDED", "Lead #" + id + " · " + (APP.ROLES[APP.state.role] || {}).title + " note: " + (text.length > 60 ? text.slice(0, 57) + "…" : text));
      return c;
    },

    // ---- document uploads (demo: fake-attach, files are not stored) ----
    getUploads: function (id) { return APP.state.uploads[id] || []; },
    addUpload: function (id, name, size) {
      var u = { name: name || "document", size: size || 0, ts: new Date(), by: (APP.ROLES[APP.state.role] || {}).name || "Dana Whitmore" };
      (APP.state.uploads[id] = APP.state.uploads[id] || []).push(u);
      APP.auditLog("DOCUMENT_UPLOADED", "Lead #" + id + " · attached “" + u.name + "”" + (size ? " (" + Math.max(1, Math.round(size / 1024)) + " KB)" : ""));
      return u;
    },

    // ---- medical-records requests ----
    // A records request is a real workflow artifact: it goes out on a channel, to a
    // named recipient, and a response clock starts. The investigator can't adjudicate
    // documentation they never asked for, so the request and its status are evidence.
    // Lifecycle: requested → sent → awaiting → received.
    RECORDS_CHANNELS: [
      { c: "fax", l: "Fax", icon: "printer", sub: "transmits to the provider's fax on file", verb: "transmitted by fax" },
      { c: "email", l: "Secure email", icon: "mail", sub: "encrypted message to the billing contact", verb: "delivered by secure email" },
      { c: "portal", l: "Provider portal invite", icon: "cloud-upload", sub: "provider uploads records directly", verb: "portal invite issued" }
    ],
    recordsChannel: function (c) { return APP.RECORDS_CHANNELS.find(function (x) { return x.c === c; }) || APP.RECORDS_CHANNELS[0]; },
    RECORDS_STEPS: [
      { c: "requested", l: "Requested" }, { c: "sent", l: "Sent" },
      { c: "awaiting", l: "Awaiting response" }, { c: "received", l: "Received" }
    ],
    RECORDS_DUE_DAYS: 14,
    recordsRequestFor: function (id) { return (APP.state.recordsRequests || {})[id] || null; },
    // Days until (or past) the response due date. Negative = overdue.
    recordsDaysLeft: function (r) {
      if (!r || !r.dueAt) return null;
      return Math.ceil((r.dueAt - new Date()) / 86400000);
    },
    // Send the request out. Stamps the transmission receipt the channel would produce.
    requestRecords: function (id, o) {
      o = o || {};
      var a = window.DP.getAllegation(id); if (!a) return null;
      var ch = APP.recordsChannel(o.channel);
      var contact = window.DP.getProviderContact(a.providerId) || {};
      var recipient = ch.c === "fax" ? contact.fax : ch.c === "email" ? contact.email : contact.portal;
      var now = new Date();
      var r = {
        leadId: id, channel: ch.c, recipient: recipient, items: (o.items || "").trim(),
        status: "sent", by: (APP.ROLES[APP.state.role] || {}).name || "Dana Whitmore",
        requestedAt: now, sentAt: now, dueAt: new Date(now.getTime() + APP.RECORDS_DUE_DAYS * 86400000),
        // the receipt a real channel hands back — what an investigator would file
        confirmation: ch.c === "fax" ? "FAX-" + id + "-" + String(now.getMinutes()).padStart(2, "0") + String(now.getSeconds()).padStart(2, "0")
          : ch.c === "email" ? "MSG-" + id + "-" + String(now.getMinutes()).padStart(2, "0") + String(now.getSeconds()).padStart(2, "0")
            : "INV-" + id,
        pages: ch.c === "fax" ? 2 : null,
        receivedAt: null, receivedFile: null
      };
      (APP.state.recordsRequests = APP.state.recordsRequests || {})[id] = r;
      APP.auditLog("RECORDS_REQUESTED", "Lead #" + id + " · records requested from " + (a.provider ? a.provider.name : a.providerId) + " · " + ch.l + " → " + recipient + " · " + (r.items || "supporting documentation"));
      APP.auditLog("RECORDS_SENT", "Lead #" + id + " · " + ch.verb + " to " + recipient + " · confirmation " + r.confirmation + " · response due " + APP.fmtDate(r.dueAt));
      return r;
    },
    // The transmission landed; the response clock is now running.
    markRecordsAwaiting: function (id) {
      var r = APP.recordsRequestFor(id); if (!r || r.status !== "sent") return null;
      r.status = "awaiting";
      APP.auditLog("RECORDS_AWAITING", "Lead #" + id + " · awaiting provider response · due " + APP.fmtDate(r.dueAt));
      return r;
    },
    // Records came back — from the provider portal, or logged by hand for fax/email.
    receiveRecords: function (id, file) {
      var r = APP.recordsRequestFor(id); if (!r || r.status === "received") return null;
      file = file || {};
      r.status = "received"; r.receivedAt = new Date();
      r.receivedFile = { name: file.name || "provider-records.pdf", size: file.size || 0, via: file.via || r.channel };
      APP.auditLog("RECORDS_RECEIVED", "Lead #" + id + " · records received from the provider via " + APP.recordsChannel(r.receivedFile.via).l + " · “" + r.receivedFile.name + "”");
      // the records themselves become evidence on the lead
      APP.addUpload(id, r.receivedFile.name, r.receivedFile.size);
      return r;
    },
    cancelRecordsRequest: function (id) {
      var r = APP.recordsRequestFor(id); if (!r) return;
      delete APP.state.recordsRequests[id];
      APP.auditLog("RECORDS_REQUEST_CANCELLED", "Lead #" + id + " · records request withdrawn");
    },
    // Provider portal — the simulated provider-facing upload screen. Real
    // implementation lives in views/portal.js (task 13); this is the entry point.
    openPortal: function (id) {
      if (window.Views && window.Views.portal) { APP.state.portalLeadId = id; APP.nav("portal", { id: id }); return; }
      // fallback until the portal view ships: log the upload directly
      APP.receiveRecords(id, { name: "provider-records_Lead-" + id + ".pdf", size: 348000, via: "portal" });
    },
    // Logo toggle: jump into the provider portal (upload docs), or back out to the
    // view you were on. Opens the portal against the lead you're looking at, else a
    // sensible default, seeding a portal records-request so it has context.
    togglePortal: function () {
      if (APP.state.view === "portal") {
        APP.state._portalStaged = [];
        var snap = APP.state._prePortalSnap;
        APP.state._prePortalSnap = null;
        if (snap && snap.view && snap.view !== "portal") {
          APP.state.allegationId = snap.allegationId; APP.state.providerId = snap.providerId; APP.state.businessId = snap.businessId;
          APP.nav(snap.view, { id: snap.allegationId || snap.businessId });
        } else { APP.openArea("home"); }
        return;
      }
      var id = APP.state.allegationId || "20481";
      APP.state._prePortalSnap = APP.snapshot();
      if (APP.recordsRequestFor && !APP.recordsRequestFor(id)) APP.requestRecords(id, { channel: "portal", items: "Progress notes and E/M documentation supporting the level billed." });
      APP.openPortal(id);
    },

    // ---- generated artifacts (AI justification memos attached to a lead) ----
    // Unlike uploads (name + size only), an artifact carries its body, so it can be
    // reopened, printed into the case export, and shown on appeal.
    getArtifacts: function (id) { return APP.state.artifacts[id] || []; },
    addArtifact: function (id, art) {
      art = art || {};
      var a = {
        name: art.name || "Justification.txt", kind: art.kind || "ai-justification",
        body: art.body || "", ts: new Date(), by: (APP.ROLES[APP.state.role] || {}).name || "Dana Whitmore"
      };
      (APP.state.artifacts[id] = APP.state.artifacts[id] || []).push(a);
      APP.auditLog("AI_JUSTIFICATION_ATTACHED", "Lead #" + id + " · attached “" + a.name + "” · AI-drafted, adopted by " + a.by);
      return a;
    },

    // ---- case working record (investigator's editable overlay on the claim of record) ----
    // Values live separately from the immutable claim of record; every edit is audit-logged.
    getWorking: function (id) { return APP.state.workingRecord[id] || {}; },
    setWorking: function (id, field, label, value, recordVal) {
      (APP.state.workingRecord[id] = APP.state.workingRecord[id] || {})[field] = { value: value, recordVal: recordVal, ts: new Date() };
      var r = (recordVal === "" || recordVal == null) ? "(blank)" : recordVal;
      APP.auditLog("RECORD_EDITED", "Lead #" + id + " · " + label + ": " + r + " → " + (value === "" ? "(blank)" : value) + " (working record; claim of record unchanged)");
    },
    clearWorking: function (id, field) { var w = APP.state.workingRecord[id]; if (w && field in w) { delete w[field]; if (!Object.keys(w).length) delete APP.state.workingRecord[id]; } },
    resetWorking: function (id) { if (APP.state.workingRecord[id]) { delete APP.state.workingRecord[id]; APP.auditLog("RECORD_REVERTED", "Lead #" + id + " · working record reverted to the claim of record"); } },

    // ---- analyst-created leads (some leads are manual, not data-driven) ----
    LEAD_SEQ: 0,
    createLead: function (data) {
      data = data || {};
      var p = window.DP.getProvider(data.providerId); if (!p) return null;
      var id = "M" + String(2001 + (APP.LEAD_SEQ++));
      var src = data.sourceType || "Hotline / tip";
      var lead = {
        id: id, providerId: data.providerId, claimId: null,
        fwaType: data.fwaType || "Other / manual",
        riskScore: typeof data.riskScore === "number" ? data.riskScore : 60,
        confidence: 100, source: src, sourceType: src,
        status: "New", mode: "retrospective",
        exposurePost: data.exposure || 0, exposurePre: 0,
        createdDate: new Date().toISOString().slice(0, 10),
        assignee: null, manual: true, createdBy: (APP.ROLES[APP.state.role] || {}).name || "Dana Whitmore",
        xai: { summary: data.rationale ? data.rationale : "Analyst-created lead sourced from " + src + ". Pending evidence linkage and validation." }
      };
      window.DP.raw.allegations.push(lead);
      APP.auditLog("LEAD_CREATED", "Lead #" + id + " · " + p.name + " · source: " + src + (data.fwaType ? " · " + data.fwaType : ""));
      return lead;
    },
    // Pre-adjudicated leads so some CASES exist at load (a case forms only once a
    // lead is reviewed & confirmed/escalated). PR204 gets 2 confirmed + others open
    // to show "multiple leads feeding one case". Idempotent across boots.
    seedCases: function () {
      [
        { pid: "PR204", n: 2, outcome: "confirm" },   // Big Bend — 2 confirmed into one case; remaining leads feed in
        { pid: "PR001", n: 1, outcome: "escalate" },  // Alamo — ring, escalated
        { pid: "PR002", n: 1, outcome: "confirm" },   // Rio Grande — ring
        { pid: "PR300", n: 1, outcome: "escalate" },  // Sonoran — chain
        { pid: "PR200", n: 1, outcome: "confirm" }    // Gulf Coast
      ].forEach(function (pl) {
        var leads = window.DP.listAllegationsByProvider(pl.pid, "retrospective").slice().sort(function (a, b) { return b.riskScore - a.riskScore; });
        var done = 0;
        leads.forEach(function (a) {
          if (done >= pl.n) return;
          if (["Confirmed", "Escalated", "Dismissed", "Pending review"].indexOf(a.status) >= 0) return;
          if (pl.outcome === "escalate") { a.status = "Escalated"; APP.state.decisions[a.id] = { outcome: "escalate", rationale: "Reviewed and escalated — coordinated behavior; opened a provider case.", ts: new Date(), status: "Escalated", reviewState: "approved" }; }
          else { a.status = "Pending review"; APP.state.decisions[a.id] = { outcome: "confirm", rationale: "Reviewed and confirmed improper payment — added to the provider case; recovery pending supervisor approval.", ts: new Date(), status: "Pending review", reviewState: "pending" }; }
          done++;
        });
      });
    },
    // One case sitting in the supervisor's court out of the box, so the Case reviews
    // queue isn't empty when a supervisor opens it cold.
    seedCaseReviews: function () {
      var pid = "PR204"; // Big Bend — 2 confirmed leads seeded into a case
      var c = window.DP.getCase(pid, "retrospective");
      if (!c || !c.leadCount) return;
      if (!APP.getCaseNarrative(pid)) {
        APP.state.caseNarratives[pid] = {
          text: "This case consolidates " + c.leadCount + " confirmed leads against " + (c.name || pid) + " carrying " + window.DP.usd(c.exposure || 0) + " in confirmed exposure. The leads share a single billing pattern rather than being isolated claim errors; documentation requested on the highest-risk lead did not support the services billed. Recommend recovery of the confirmed exposure and a targeted review of this provider's remaining claims.",
          ts: new Date(), by: "Dana Whitmore"
        };
      }
      APP.state.caseReviews[pid] = { status: "pending", submittedBy: "Dana Whitmore", submittedAt: new Date(), reviewedBy: null, reviewedAt: null, note: "" };
    },
    // A few manual-origin leads so the "not everything is data-driven" story shows out of the box.
    seedManualLeads: function () {
      [
        { id: "M0007", providerId: "PR205", fwaType: "Phantom billing", src: "Hotline / tip", risk: 74, exp: 8400, by: "OIG Hotline intake", note: "Whistleblower tip: a home-health aide reports visits billed for a veteran who was hospitalized on the service dates. Manual lead — pending records pull." },
        { id: "M0008", providerId: "PR003", fwaType: "Upcoding", src: "Email", risk: 63, exp: 5200, by: "VISN clinical reviewer", note: "Emailed in by a VISN clinical reviewer who noticed consistent level-5 E/M on routine follow-ups. Adjudicator entered it manually — not model-flagged." },
        { id: "M0009", providerId: "PR002", fwaType: "Kickback / self-referral", src: "OIG", risk: 81, exp: 12600, by: "VA-OIG", note: "OIG case referral tied to the shared-TIN ring; potential inducement arrangement. Data mining did not surface this — an investigative referral." },
        { id: "M0010", providerId: "PR206", fwaType: "Duplicate billing", src: "Phone / call", risk: 58, exp: 3900, by: "Provider-relations call line", note: "Phoned in by a beneficiary who was balance-billed for a service the VA already paid. Adjudicator took the call and entered the lead manually." }
      ].forEach(function (s) {
        if (!window.DP.getProvider(s.providerId)) return;
        if (window.DP.raw.allegations.some(function (x) { return x.id === s.id; })) return;
        window.DP.raw.allegations.push({ id: s.id, providerId: s.providerId, claimId: null, fwaType: s.fwaType, riskScore: s.risk, confidence: 100, source: s.src, sourceType: s.src, status: "New", mode: "retrospective", exposurePost: s.exp, exposurePre: 0, createdDate: "2026-07-07", assignee: null, manual: true, createdBy: s.by, xai: { summary: s.note } });
      });
    },

    // ---- prepay vs retrospective (global mode / lens) ----
    // Retrospective = post-payment review & recoupment (the default "pay and report"
    // world). Prepay = pending claims scored BEFORE payment; analyst decides Pay/Hold/Deny.
    mode: function () { return APP.state.mode || "retrospective"; },
    isPrepay: function () { return APP.mode() === "prepay"; },
    setMode: function (m) {
      if (APP.mode() === m) return;
      APP.state.mode = m;
      APP.setModeHeader();
      APP.auditLog("MODE_SWITCH", m === "prepay" ? "Switched to Prepay — pre-payment triage" : "Switched to Retrospective — post-payment review");
      // land on a surface that makes sense for the mode
      var v = APP.state.view;
      if (["queue", "home", "claim", "approvals", "analytics", "provider"].indexOf(v) < 0) v = "home";
      if (APP.isPrepay() && (v === "approvals")) v = "queue";
      APP.nav(v, { id: APP.state.allegationId });
    },
    setModeHeader: function () {
      document.querySelectorAll(".modebtn").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-mode") === APP.mode()); });
      document.body.setAttribute("data-mode", APP.mode());
    },
    prepayDecisionFor: function (id) { return APP.state.prepayDecisions[id] || null; },
    // Analyst triages a pending claim before it is paid.
    prepayDecide: function (id, action, reason, justification) {
      var a = window.DP.raw.allegations.find(function (x) { return x.id === id; });
      if (!a) return;
      var claim = a.claimId ? window.DP.getClaim(a.claimId) : null;
      a.status = { pay: "Cleared to pay", hold: "On hold", deny: "Denied" }[action];
      if (claim) claim.claimStatus = { pay: "Approved for payment", hold: "On hold — records requested", deny: "Denied" }[action];
      APP.state.prepayDecisions[id] = { action: action, reason: reason || null, justification: justification || "", ts: new Date(), atRisk: a.exposurePre || 0 };
      APP.auditLog("PREPAY_" + action.toUpperCase(), "Pending claim #" + id + " · " + { pay: "cleared to pay", hold: "held for records", deny: "denied — payment prevented" }[action] + " · " + window.DP.usd(a.exposurePre || 0) + (reason ? " · reason " + APP.reasonLabel(action, reason) : "") + (justification ? " · justification recorded" : ""));
    },
    prepayStats: function () {
      var rows = window.DP.listAllegations({ mode: "prepay" }), dec = APP.state.prepayDecisions;
      var s = { total: rows.length, atRisk: 0, prevented: 0, released: 0, held: 0, pending: 0 };
      rows.forEach(function (r) {
        s.atRisk += r.exposurePre || 0;
        var d = dec[r.id];
        if (!d) s.pending++;
        else if (d.action === "deny") s.prevented += r.exposurePre || 0;
        else if (d.action === "pay") s.released += r.exposurePre || 0;
        else s.held += r.exposurePre || 0;
      });
      return s;
    },

    // ---- information architecture: 4 areas, each with sub-views ----
    SUBS: {
      home: [],
      casework: [{ v: "queue", l: "Leads", role: "analyst" }, { v: "approvals", l: "Approvals", role: "supervisor" }, { v: "casereviews", l: "Case reviews", role: "supervisor" }, { v: "team", l: "Team", role: "supervisor" }, { v: "investigations", l: "Cases" }],
      insights: [{ v: "analytics", l: "Overview" }, { v: "network", l: "Network" }, { v: "businesses", l: "Businesses" }, { v: "heatmap", l: "Heatmap" }],
      library: [{ v: "rules", l: "Rules" }, { v: "releases", l: "Releases" }, { v: "audit", l: "Audit" }]
    },
    // portal maps to its own area (no nav item / no subnav) — it is a takeover
    // screen simulating the provider's world, not part of the analyst IA.
    VIEW_AREA: { home: "home", queue: "casework", claim: "casework", investigations: "casework", approvals: "casework", casereviews: "casework", team: "casework", provider: "insights", analytics: "insights", network: "insights", businesses: "insights", business: "insights", heatmap: "insights", rules: "library", releases: "library", audit: "library", portal: "portal" },
    subsFor: function (area) { return (APP.SUBS[area] || []).filter(function (s) { return !s.role || s.role === APP.state.role; }); },
    areaOf: function (view) { return APP.VIEW_AREA[view] || "casework"; },
    openArea: function (area) {
      APP.state.hist = []; // top-level navigation starts a fresh trail
      if (area === "home") return APP.nav("home");
      if (area === "casework") return APP.nav(APP.isSupervisor() ? "approvals" : "queue");
      var subs = APP.subsFor(area);
      APP.nav(subs.length ? subs[0].v : area);
    },
    // ---- drill-down history for smart back / breadcrumb ----
    snapshot: function () { return { view: APP.state.view, allegationId: APP.state.allegationId, providerId: APP.state.providerId, businessId: APP.state.businessId }; },
    labelForSnap: function (s) {
      if (!s) return "Work queue";
      if (s.view === "claim") return "Lead #" + s.allegationId;
      if (s.view === "provider") { var p = window.DP.getProvider(s.providerId); return p ? p.name : "Provider"; }
      if (s.view === "business") { var b = window.DP.getBusiness(s.businessId); return b ? b.name : "Business"; }
      var map = { queue: "Leads", home: "Home", investigations: "Cases", approvals: "Approvals", casereviews: "Case reviews", analytics: "Analytics", network: "Network", businesses: "Businesses", heatmap: "Heatmap", rules: "Rules", releases: "Releases", audit: "Audit" };
      return map[s.view] || "Back";
    },
    backLabel: function () { return APP.state.hist && APP.state.hist.length ? APP.labelForSnap(APP.state.hist[APP.state.hist.length - 1]) : "Leads"; },
    goBack: function () {
      var t = (APP.state.hist || []).pop();
      if (!t) return APP.nav(APP.isSupervisor() ? "approvals" : "queue");
      APP.state.allegationId = t.allegationId; APP.state.providerId = t.providerId; APP.state.businessId = t.businessId;
      APP.nav(t.view, { id: t.allegationId || t.businessId });
    },

    nav: function (view, params) {
      APP.state.view = view;
      var area = APP.areaOf(view);
      document.querySelectorAll(".navitem").forEach(function (n) {
        n.classList.toggle("active", n.getAttribute("data-area") === area);
      });
      APP.renderSubnav(area, view);
      window.scrollTo(0, 0);
      var V = window.Views[view];
      if (V) V.render(mount, params || {});
    },
    renderSubnav: function (area, view) {
      var el = document.getElementById("subnav"); if (!el) return;
      var subs = APP.subsFor(area);
      if (area === "home" || subs.length < 1) { el.style.display = "none"; return; }
      var wsLabel = APP.isSupervisor() && area === "casework" ? '<span style="font-size:11px;color:var(--accent-d);font-weight:500;margin-right:14px"><i class="ti ti-user-shield"></i> Supervisor workspace</span>' : "";
      el.style.display = "block";
      el.innerHTML = '<div style="max-width:var(--page-max);margin:0 auto;padding:0 24px;display:flex;align-items:center;gap:2px">' + wsLabel +
        subs.map(function (s) {
          var active = s.v === view || (view === "claim" && s.v === "queue") || (view === "provider" && s.v === "analytics") || (view === "business" && s.v === "businesses");
          return '<button class="subtab' + (active ? " active" : "") + '" data-view="' + s.v + '">' + s.l + (s.v === "approvals" ? ' <span id="sub-appr-badge"></span>' : s.v === "casereviews" ? ' <span id="sub-casereview-badge"></span>' : "") + '</button>';
        }).join("") + '</div>';
      el.querySelectorAll(".subtab").forEach(function (b) { b.addEventListener("click", function () { APP.nav(b.getAttribute("data-view")); }); });
      APP.updateSupBadge();
    },

    openAllegation: function (id) { (APP.state.hist = APP.state.hist || []).push(APP.snapshot()); APP.state.allegationId = id; APP.nav("claim", { id: id }); },
    openProvider: function (id) { (APP.state.hist = APP.state.hist || []).push(APP.snapshot()); APP.state.providerId = id; APP.nav("provider", { id: id }); },

    boot: function () {
      mount = document.getElementById("view");
      document.getElementById("disclaimer").textContent = window.DP.disclaimer;
      document.querySelectorAll(".navitem").forEach(function (n) {
        n.addEventListener("click", function () { APP.openArea(n.getAttribute("data-area")); });
      });
      var brand = document.querySelector(".brand");
      if (brand) { brand.style.cursor = "pointer"; brand.title = "Provider portal — upload records (click again to return)"; brand.addEventListener("click", function () { APP.togglePortal(); }); }
      var rs = document.getElementById("role-switch");
      if (rs) rs.addEventListener("click", APP.toggleRole);
      var rd = document.getElementById("reset-demo");
      if (rd) rd.addEventListener("click", function () { if (window.confirm("Reset the demo to its initial data? This clears all decisions, case assignments, closures, notes and the audit trail.")) APP.resetDemo(); });
      document.querySelectorAll(".modebtn").forEach(function (b) { b.addEventListener("click", function () { APP.setMode(b.getAttribute("data-mode")); }); });
      APP.setModeHeader();
      APP.setRoleHeader();
      APP.auditLog("SESSION_START", APP.ROLES[APP.state.role].name + " signed in · " + (window.SB && window.SB.enabled ? "authenticated" : "PIV authenticated"));
      if (window.DP.seedSubjects) window.DP.seedSubjects();
      APP.seedManualLeads();
      APP.seedCases();
      APP.seedCaseReviews();
      APP.seedComments();
      APP.nav("home");
      APP.ready = true;
    },
    // A little prior "color commentary" so the thread isn't empty in the demo.
    seedComments: function () {
      var mk = function (mins, name, role, text) { return { ts: new Date(Date.now() - mins * 60000), user: name, role: role, text: text }; };
      APP.state.comments["20481"] = [
        mk(1440, "Maria Delgado", "Analyst", "Pulled the 99215 trend — the 90% level-5 share holds across all 11 months, not a one-quarter blip. Looks systemic."),
        mk(320, "Karen Boyd", "Supervisor", "Agree it's systemic. Before we recover, confirm the linked-diagnosis complexity is genuinely low — attach the med-record excerpt to the case.")
      ];
      APP.state.comments["20544"] = [
        mk(210, "Devon Carter", "Analyst", "Same 7 veterans cycle AZ→CA→NV in <30-day stays. This is the holding-company chain, not a one-off — flag the business too.")
      ];
    }
  };
  window.APP = APP;

  // helpers shared by views
  window.UI = {
    riskChip: function (r) {
      var b = window.DP.band(r), cls = b === "high" ? "rh" : b === "med" ? "rm" : "rl",
        lbl = b === "high" ? "High" : b === "med" ? "Medium" : "Low";
      return '<span class="chip ' + cls + '"><span class="s">' + r + '</span> ' + lbl + '</span>';
    },
    statusPill: function (s) {
      var m = { "New": "p-new", "Assigned": "p-asg", "Under review": "p-rev", "Recommended close": "p-rec", "Confirmed": "p-conf", "Dismissed": "p-dis", "Escalated": "p-esc", "Pending review": "p-pend", "Returned": "p-ret", "Pending": "p-new", "Cleared to pay": "p-dis", "On hold": "p-esc", "Denied": "p-conf", "Pending Case": "p-pend", "Closed": "p-dis" };
      return '<span class="pill ' + (m[s] || "p-asg") + '">' + s + '</span>';
    },
    // A lead's shown status: once it's reviewed & confirmed/escalated it has fed a
    // case, so it reads "Pending Case" (the lead's terminal state) in the queues.
    leadStatus: function (a) { return (window.DP && window.DP.isCaseLead && window.DP.isCaseLead(a)) ? "Pending Case" : a.status; },
    srcTag: function (s) { var lbl = s === "Pattern Recognition" ? "ML/AI" : s === "Rules Engine" ? "Rules" : s === "Both" ? "ML/AI + Rules" : s; return '<span class="muted" style="font-size:10.5px">' + window.APP.esc(lbl) + '</span>'; },
    // Subject-of-investigation badge (Provider / Beneficiary / Pharmacy).
    subjectBadge: function (aOrType, opts) {
      opts = opts || {};
      var t = typeof aOrType === "string" ? aOrType : (window.DP.subjectTypeOf ? window.DP.subjectTypeOf(aOrType) : "Provider");
      var def = (window.DP.SUBJECT_TYPES && window.DP.SUBJECT_TYPES[t]) || { label: t, icon: "user", tone: "asg", desc: "" };
      return '<span class="pill p-' + def.tone + '"' + (def.desc ? ' title="Subject of investigation — ' + window.APP.esc(def.desc) + '"' : '') + ' style="font-size:' + (opts.small ? "10px" : "10.5px") + '">' +
        '<i class="ti ti-' + def.icon + '" style="font-size:11px"></i> ' + (opts.prefix ? "Subject: " : "") + window.APP.esc(def.label) + '</span>';
    }
  };

  // Boot is orchestrated by supabase.js (auth gate in Supabase mode, or immediate in local mode).
})();
