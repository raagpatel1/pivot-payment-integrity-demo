/* Claim detail + decision view — restructured into tabs:
   Overview · Evidence · Analysis · Network · Decision. Decision is mode-aware
   (retrospective: Confirm/Dismiss/Escalate · prepay: Pay/Hold/Deny). */
(function () {
  window.Views = window.Views || {};
  var curTab = "overview", lastId = null, ctx = null, claimView = "summary";

  function sharesTin(prov) {
    return window.DP.listProviders().filter(function (p) { return p.tin === prov.tin; }).length > 1;
  }

  // ---------- exposure ----------
  // "Exposure amount" is the money at issue. Which money that is depends on the
  // exposure type: pre-pay = the allowed amount still at risk (nothing has been
  // paid yet), post-pay = what already went out the door and is recoverable.
  function exposureType(a) { return a.mode === "prepay" ? "Pre-pay" : "Post-pay"; }
  function exposureOf(a) { return (a.mode === "prepay" ? a.exposurePre : a.exposurePost) || 0; }
  // Per claim line: pre-pay lines have paid === 0, so the at-risk figure is the allowed amount.
  function lineExposure(l, prepay) { return prepay ? (l.allowed || 0) : (l.paid || 0); }
  function exposureTypePill(a) {
    var pre = a.mode === "prepay";
    return '<span class="pill ' + (pre ? "p-esc" : "p-asg") + '" title="' + (pre ? "Pre-payment — the claim is pending; this money has not been paid yet" : "Post-payment — this money has already been paid and is recoverable if confirmed") + '">' +
      '<i class="ti ti-' + (pre ? "shield-half" : "receipt-2") + '" style="font-size:11px"></i> ' + exposureType(a) + '</span>';
  }

  window.Views.claim = {
    render: function (mount, params) {
      var id = params.id || window.APP.state.allegationId;
      var a = window.DP.getAllegation(id);
      if (!a) { mount.innerHTML = '<div class="page"><p>Lead not found.</p></div>'; return; }
      var p = a.provider || {}, cl = a.claim, ve = a.veteran;
      var prepay = (a.mode === "prepay");
      var dec = prepay ? window.APP.prepayDecisionFor(id) : window.APP.decisionFor(id);
      var ring = p.tin && sharesTin(p);
      if (id !== lastId) { curTab = "overview"; claimView = "summary"; lastId = id; }
      ctx = { id: id, a: a, cl: cl, p: p, prepay: prepay };

      // evidence documents (shared by the left-rail index and the Evidence tab)
      var docsHtml = evidenceDocs(a, cl).map(function (d) { return docRowHtml(d, "doc-row"); }).join("");

      var kind = prepay ? "Pending claim" : "Lead";
      var undecided = !dec;
      // Descriptive header: "Lead #20481 · Alamo Internal Medicine — Upcoding"
      var headText = kind + " #" + id + (p.name ? " · " + p.name : "") + (a.fwaType ? " — " + a.fwaType : "");

      mount.innerHTML =
        '<div class="page">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">' +
        '<span class="btn" id="c-back" style="padding:5px 9px"><i class="ti ti-arrow-left"></i> ' + window.APP.esc(window.APP.backLabel()) + '</span>' +
        '<span class="page-title">' + window.APP.esc(headText) + '</span><span id="c-status">' + window.UI.statusPill(prepay ? a.status : window.UI.leadStatus(a)) + '</span>' +
        window.UI.subjectBadge(a) +
        exposureTypePill(a) +
        '<span style="font-size:11px;color:var(--text2);display:inline-flex;align-items:center;gap:4px"><i class="ti ti-lock"></i> Locked to you</span>' +
        '<span style="flex:1"></span>' + window.EXPORT.group("c") + '<button class="btn primary" id="c-summarize" style="font-size:12px"><i class="ti ti-file-analytics"></i> Summarize for adjudication</button></div>' +
        '<div class="split" style="display:flex;gap:12px;align-items:flex-start">' +
        // ---- left rail (identity + evidence) ----
        '<div class="rail" style="width:200px;flex:none;display:flex;flex-direction:column;gap:10px">' +
        '<div class="card"><div class="l" style="font-size:10.5px;color:var(--text2);margin-bottom:6px">Provider</div>' +
        '<div id="c-prov" style="font-weight:600;font-size:13px;color:var(--accent-d);cursor:pointer">' + window.APP.esc(p.name) + ' <i class="ti ti-external-link" style="font-size:11px"></i></div><div style="font-size:11px;color:var(--text2);margin-bottom:7px">' + window.APP.esc(p.taxonomyLabel || "") + ' · ' + (p.taxonomyCode || "") + '</div>' +
        '<div class="mono" style="font-size:11px;line-height:1.6">NPI ' + p.npi + '<br>TIN ' + (ring ? '<span style="background:var(--high-bg);color:var(--high-tx);padding:0 3px;border-radius:3px">' + p.tin + '</span>' : p.tin) + '</div>' +
        (ring ? '<div style="font-size:11px;color:var(--high);margin-top:5px;display:flex;align-items:center;gap:4px"><i class="ti ti-affiliate"></i>Shared TIN — provider ring</div>' : '') +
        '<div style="font-size:11px;color:var(--text2);margin-top:6px">' + window.APP.esc(p.city || "") + ', ' + (p.state || "") + ' · ' + (p.claimCount || 0) + ' claims · ' + (p.openAllegations || 0) + ' open</div>' +
        '<div style="font-size:11.5px;color:var(--accent-d);margin-top:7px;cursor:pointer;display:flex;align-items:center;gap:4px" id="c-net"><i class="ti ti-share-3"></i>View in network</div></div>' +
        (window.APP.isSupervisor() ? '<div class="card"><div class="l" style="font-size:10.5px;color:var(--text2);margin-bottom:6px">Assignment</div><div style="font-size:11.5px;color:var(--text2);margin-bottom:6px">Currently: <span style="color:var(--ink);font-weight:500">' + (a.assignee || "Unassigned") + '</span></div><select id="c-assign" class="input" style="font-size:12px">' + assignOptions(a.assignee) + '</select></div>' : '') +
        (ve ? '<div class="card"><div class="l" style="font-size:10.5px;color:var(--text2);margin-bottom:6px">Veteran</div><div style="font-weight:500;font-size:12.5px">' + window.APP.esc(ve.name) + '</div><div class="mono" style="font-size:11px;color:var(--text2);line-height:1.6">DOB ' + ve.dob + ' · ' + ve.sex + '<br>' + ve.memberId + '</div></div>' : '') +
        '<div class="card"><div class="l" style="font-size:10.5px;color:var(--text2);margin-bottom:7px">Evidence on file</div>' +
        '<div id="c-docs" style="display:flex;flex-direction:column;gap:5px">' + docsHtml + '</div>' +
        '<div id="c-doc" style="margin-top:8px"></div>' +
        '<div id="c-support" style="margin-top:8px">' + recordsPanelHtml(id, a) + '</div></div>' +
        '</div>' +
        // ---- main column: tabs ----
        '<div style="flex:1;min-width:0">' +
        milestoneHtml(a, dec, prepay) +
        tabBar(curTab, undecided) +
        '<div id="c-tabpanel"></div>' +
        notesCardHtml(id) +
        '</div>' +
        '</div></div>';

      document.getElementById("c-back").addEventListener("click", function () { window.APP.goBack(); });
      document.getElementById("c-net").addEventListener("click", function () { window.APP.nav("network"); });
      var asg = document.getElementById("c-assign");
      if (asg) asg.addEventListener("change", function () { window.APP.assignCase(id, this.value === "__unassigned__" ? null : this.value); rerender(id); });
      document.getElementById("c-prov").addEventListener("click", function () { window.APP.openProvider(p.id); });
      mount.querySelectorAll(".doc-row").forEach(function (row) {
        row.addEventListener("click", function () {
          var key = row.getAttribute("data-doc");
          document.getElementById("c-doc").innerHTML = docContent(key, id, a, cl);
          window.APP.auditLog(key === "mr" ? "MEDICAL_RECORD_VIEWED" : "EVIDENCE_VIEWED", kind + " #" + id + (key === "mr" ? "" : " · " + key));
        });
      });
      wireRecords(id, a);
      var sumBtn = document.getElementById("c-summarize");
      if (sumBtn) sumBtn.addEventListener("click", function () { if (window.COPILOT) window.COPILOT.summarize(id); });
      var msHist = document.getElementById("c-ms-hist");
      if (msHist) msHist.addEventListener("click", function () { showTab("history"); });
      wireExport(id, a, cl, p, prepay, kind);
      mount.querySelectorAll(".ctab").forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });

      showTab(curTab);
      wireNotes(id);
      renderStickyBar(id, a, dec, prepay);
    },

    // called by the copilot's adjudication brief to jump straight to the decision
    gotoDecision: function (action) {
      showTab("decision");
      setTimeout(function () {
        if (action === "request-records") { var rq = document.getElementById("c-req"); if (rq) { rq.scrollIntoView({ behavior: "smooth", block: "center" }); rq.click(); } return; }
        // accept both action names (from the AI brief) and raw seg codes (from the sticky bar)
        var map = { confirm: "c", "confirm-escalate": "c", dismiss: "d", escalate: "e", pay: "pay", hold: "hold", deny: "deny", c: "c", d: "d", e: "e" };
        var seg = document.querySelector('.seg[data-d="' + (map[action] || action) + '"]');
        if (seg) seg.click();
        var dc = document.getElementById("c-decision"); if (dc) dc.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 70);
    }
  };

  // ---------- milestone bar ----------
  // Where this lead sits in its lifecycle, plus what happened last. A lead that
  // is confirmed/escalated ends at "Pending Case"; a dismissed one is terminal at
  // the decision; a returned one is sent back to the analyst.
  function milestoneModel(a, dec, prepay) {
    if (prepay) {
      var pd = window.APP.prepayDecisionFor(a.id);
      var out = pd ? { pay: "Cleared to pay", hold: "On hold", deny: "Denied" }[pd.action] : "Payment outcome";
      return { steps: ["Flagged", "Assigned", "Under review", "Triage decision", out], cur: pd ? 5 : (a.assignee ? 2 : 1), note: null };
    }
    var steps = ["Flagged", "Assigned", "Under review", "Decision", "Supervisor review", "Pending Case"];
    if (!dec) return { steps: steps, cur: a.assignee ? 2 : 1, note: null };
    // returned: the analyst owns it again, so Decision is the live step
    if (dec.reviewState === "returned") return { steps: steps, cur: 4, note: "Returned by the supervisor — revise and resubmit." };
    if (dec.outcome === "dismiss") return { steps: ["Flagged", "Assigned", "Under review", "Decision", "Dismissed"], cur: 5, note: "Dismissed as a false positive — analyst-final, no supervisor review." };
    // pending: the decision is made and the supervisor is the live step
    if (dec.reviewState === "pending") return { steps: steps, cur: 5, note: "Awaiting supervisor review (Karen Boyd)." };
    return { steps: steps, cur: 6, note: dec.outcome === "escalate" ? "Escalated into a case." : "Confirmed — recovery submitted; the lead now feeds its case." };
  }
  function milestoneHtml(a, dec, prepay) {
    var m = milestoneModel(a, dec, prepay);
    var last = window.APP.lastActionFor(a.id);
    var dots = m.steps.map(function (label, i) {
      var done = i < m.cur - 1, cur = i === m.cur - 1;
      var bg = done ? "var(--accent)" : cur ? "#fff" : "var(--border2)";
      var bd = done ? "var(--accent)" : cur ? "var(--accent)" : "var(--border)";
      var inner = done ? '<i class="ti ti-check" style="color:#fff;font-size:10px"></i>' : cur ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--accent);display:block"></span>' : '';
      return '<div style="display:flex;align-items:center;flex:' + (i === m.steps.length - 1 ? "none" : "1") + ';min-width:0">' +
        '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:none">' +
        '<div style="width:16px;height:16px;border-radius:50%;background:' + bg + ';border:1.5px solid ' + bd + ';display:flex;align-items:center;justify-content:center">' + inner + '</div>' +
        '<span style="font-size:10px;white-space:nowrap;color:' + (done || cur ? "var(--ink)" : "var(--text3)") + ';font-weight:' + (cur ? "600" : "400") + '">' + window.APP.esc(label) + '</span></div>' +
        (i === m.steps.length - 1 ? '' : '<div style="flex:1;height:1.5px;background:' + (done ? "var(--accent)" : "var(--border2)") + ';margin:0 6px;margin-bottom:15px"></div>') +
        '</div>';
    }).join("");
    var lastHtml = last
      ? '<i class="ti ti-' + ((HIST_ICON[last.action] || ["point"])[0]) + '" style="color:var(--accent-d)"></i> <span style="color:var(--text2)">Last action:</span> <span style="font-weight:500">' + window.APP.esc(histLabel(last.action)) + '</span> <span style="color:var(--text2)">· ' + window.APP.esc(last.user || "—") + ' · ' + window.APP.fmtTs(last.ts) + '</span> <span id="c-ms-hist" style="color:var(--accent-d);cursor:pointer;margin-left:4px">View history →</span>'
      : '<span style="color:var(--text2)">No activity recorded yet.</span>';
    return '<div class="card" style="padding:10px 14px 8px;margin-bottom:12px">' +
      '<div style="display:flex;align-items:flex-start;padding:0 2px 4px">' + dots + '</div>' +
      '<div style="border-top:0.5px solid var(--border2);margin-top:6px;padding-top:6px;font-size:11.5px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' + lastHtml + '</div>' +
      (m.note ? '<div style="font-size:11px;color:var(--text2);padding-top:4px"><i class="ti ti-info-circle"></i> ' + window.APP.esc(m.note) + '</div>' : '') +
      '</div>';
  }

  // ---------- tabs ----------
  function tabBar(active, undecided) {
    var tabs = [["overview", "Overview"], ["claim", "Claim"], ["evidence", "Evidence"], ["coding", "Coding"], ["pricing", "Pricing"], ["utilization", "Utilization"], ["analysis", "Analysis"], ["network", "Network"], ["similar", "Similar cases"], ["history", "History"], ["decision", "Decision"]];
    return '<div style="display:flex;flex-wrap:wrap;gap:2px;border-bottom:0.5px solid var(--border);margin-bottom:10px">' +
      tabs.map(function (t) { return '<button class="ctab' + (t[0] === active ? " active" : "") + '" data-tab="' + t[0] + '">' + t[1] + (t[0] === "decision" && undecided ? ' <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);vertical-align:middle;margin-left:2px"></span>' : "") + '</button>'; }).join("") +
      '</div>';
  }

  // ---------- case notes / annotations (audit-logged "color commentary") ----------
  function notesCardHtml(id) {
    var notes = window.APP.getComments(id);
    return '<div class="card" id="c-notes" style="margin-top:12px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;gap:10px;flex-wrap:wrap">' +
      '<div style="font-weight:500;font-size:13px"><i class="ti ti-messages" style="color:var(--accent-d)"></i> Case notes &amp; annotations <span class="muted" style="font-weight:400;font-size:11px">· running commentary on this lead — every note is logged to the audit trail</span></div>' +
      '<span class="muted" style="font-size:11px" id="c-notes-count">' + notes.length + ' note' + (notes.length === 1 ? '' : 's') + '</span></div>' +
      '<div id="c-notes-list">' + notesListHtml(notes) + '</div>' +
      '<div style="display:flex;gap:8px;align-items:flex-start;margin-top:10px">' +
      '<textarea id="c-note-input" class="input" placeholder="Add a note or annotation… (⌘/Ctrl+Enter)" style="flex:1;min-height:40px"></textarea>' +
      '<button class="btn primary" id="c-note-add" style="white-space:nowrap"><i class="ti ti-send"></i> Add note</button></div>' +
      '</div>';
  }
  function notesListHtml(notes) {
    if (!notes.length) return '<div class="muted" style="font-size:12px;padding:6px 0">No notes yet — add the first annotation below.</div>';
    return notes.map(function (c) {
      var initials = String(c.user || "?").split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
      return '<div style="display:flex;gap:9px;padding:8px 0;border-top:0.5px solid var(--border2)">' +
        '<div class="avatar" style="width:26px;height:26px;flex:none;font-size:10px">' + initials + '</div>' +
        '<div style="flex:1;min-width:0"><div style="font-size:12px"><span style="font-weight:600">' + window.APP.esc(c.user) + '</span> <span class="muted" style="font-size:10.5px">· ' + window.APP.esc(c.role || "") + ' · ' + window.APP.fmtTs(c.ts) + '</span></div>' +
        '<div style="font-size:12.5px;color:var(--text);margin-top:2px;line-height:1.5">' + window.APP.esc(c.text) + '</div></div></div>';
    }).join("");
  }
  function wireNotes(id) {
    var add = document.getElementById("c-note-add"), input = document.getElementById("c-note-input");
    if (!add || !input) return;
    var submit = function () {
      if (!input.value.trim()) return;
      window.APP.addComment(id, input.value); input.value = "";
      var notes = window.APP.getComments(id);
      document.getElementById("c-notes-list").innerHTML = notesListHtml(notes);
      var cnt = document.getElementById("c-notes-count"); if (cnt) cnt.textContent = notes.length + " note" + (notes.length === 1 ? "" : "s");
    };
    add.addEventListener("click", submit);
    input.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); });
  }

  function showTab(name) {
    curTab = name;
    var panel = document.getElementById("c-tabpanel"); if (!panel || !ctx) return;
    document.querySelectorAll(".ctab").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-tab") === name); });
    if (name === "overview") { panel.innerHTML = overviewHtml(ctx.a, ctx.prepay); var ovd = document.getElementById("c-ov-decide"); if (ovd) ovd.onclick = function () { showTab("decision"); }; wireWorkingRecord(ctx.id); wirePeerStats(ctx.a); }
    else if (name === "claim") { panel.innerHTML = claimTabHtml(ctx.a, ctx.cl); wireClaimTab(panel); }
    else if (name === "evidence") { panel.innerHTML = evidenceHtml(ctx.a, ctx.cl); wireEvidenceUploads(ctx.id); wireEvidenceDocs(ctx.id, ctx.a, ctx.cl); wireClaimLines(panel); wireArtifacts(panel); }
    else if (name === "coding") { panel.innerHTML = xwalkHtml(ctx.a, ctx.cl); }
    else if (name === "pricing") { panel.innerHTML = pricingHtml(ctx.a, ctx.cl); wirePricingVersions(panel); }
    else if (name === "utilization") { panel.innerHTML = umHtml(ctx.a, ctx.cl); }
    else if (name === "analysis") { panel.innerHTML = analysisHtml(ctx.a); var rc = document.getElementById("c-openrc"); if (rc) rc.onclick = function () { window.APP.openProvider(ctx.p.id); }; }
    else if (name === "network") { panel.innerHTML = networkHtml(); renderCollusion(ctx.p, ctx.id); }
    else if (name === "similar") { panel.innerHTML = similarHtml(ctx.a); wirePrecedents(ctx.id); }
    else if (name === "history") { panel.innerHTML = historyHtml(ctx.id); }
    else if (name === "decision") {
      panel.innerHTML = decisionHtml(ctx.id, ctx.a, ctx.cl);
      if (ctx.prepay) renderPrepayDecision(ctx.id, ctx.a);
      else renderDecision(ctx.id, ctx.a, window.APP.decisionFor(ctx.id));
      var gs = document.getElementById("c-gosim"); if (gs) gs.onclick = function () { showTab("similar"); };
    }
  }

  // ---------- Overview ----------
  function overviewHtml(a, prepay) {
    var factors = (a.xai && a.xai.factors || []).map(function (f) {
      return '<div class="fact"><div class="l">' + window.APP.esc(f.label) + '</div><div class="v">' + window.APP.esc(f.value) +
        (f.benchmark ? ' <span style="color:var(--high-tx)">vs ' + window.APP.esc(f.benchmark) + '</span>' : '') + '</div></div>';
    }).join("");
    var recTx = { pay: "var(--low-tx)", hold: "var(--med-tx)", deny: "var(--high-tx)" };
    var recBanner = prepay && a.recommendedAction ?
      '<div style="display:flex;align-items:center;gap:8px;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;padding:9px 11px"><i class="ti ti-sparkles" style="color:var(--accent-d)"></i><div style="font-size:12px">Model recommends <span style="font-weight:600;color:' + recTx[a.recommendedAction] + '">' + ({ pay: "Pay", hold: "Hold for records", deny: "Deny" })[a.recommendedAction] + '</span> · ' + window.DP.usd(a.exposurePre || 0) + ' at risk. <span id="c-ov-decide" style="color:var(--accent-d);cursor:pointer;font-weight:500">Go to decision →</span></div></div>' : '';
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">' +
      stat("Risk", '<span style="color:' + bandColor(a.riskScore) + '">' + a.riskScore + ' <span style="font-size:10px;font-weight:500">' + bandLabel(a.riskScore) + '</span></span>') +
      stat("Confidence", a.confidence + "%") +
      stat("Exposure amount", window.DP.usd(exposureOf(a)) + ' <span style="font-size:10px;font-weight:500;color:var(--text2)">' + exposureType(a) + '</span>') +
      stat("Source", '<span style="font-size:12.5px">' + window.APP.esc(a.source === "Both" ? "ML/AI + Rules" : window.DP.sourceOf(a)) + '</span>' + (a.manual ? ' <span class="tag" style="background:var(--med-bg);color:var(--med-tx)">manual</span>' : '')) +
      stat("FWA type", '<span style="font-size:12.5px">' + a.fwaType + '</span>') +
      '</div>' +
      (a.xai ? '<div class="xai"><div class="xai-h"><i class="ti ti-sparkles" style="color:var(--accent-d)"></i><span class="t">Why this was flagged</span><span style="font-size:10.5px;color:#5f8a80;margin-left:auto">Explainable AI</span></div>' +
        '<div style="padding:11px 12px"><div style="font-size:12.5px;line-height:1.6;margin-bottom:' + (factors ? "9px" : "0") + '">' + window.APP.esc(a.xai.summary) + '</div>' +
        (factors ? '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:7px">' + factors + '</div>' : '') + '</div></div>' : '') +
      peerStatsHtml(a) +
      recBanner +
      workingRecordCard(a, prepay) +
      '<div style="font-size:11.5px;color:var(--text2)"><i class="ti ti-info-circle"></i> Use the tabs above for the claim & rules (Evidence), decision-supporting graphs (Analysis), the collusion network (Network), and to record a decision.</div>' +
      '</div>';
  }

  // Peer statistics — a spider chart with the peer-average region shaded so the
  // reviewer sees, across every FAMS composite, where this provider lies vs the norm.
  // Click a spoke to drill into that composite's detail (score vs peer + attributes).
  function peerStatsHtml(a) {
    var p = a.provider || {};
    var card = window.DP.getReportCard(p.id);
    if (!card || !(card.groups || []).length) return "";
    var groups = card.groups;
    var top = groups.slice().sort(function (x, y) { return (y.outlier - x.outlier) || (y.score - x.score); })[0];
    var sel = top ? top.group : null;
    return '<div class="card" id="c-peer" style="padding:0;overflow:hidden;border:0.5px solid #cfe7e3">' +
      '<div style="background:var(--accent-l);padding:8px 12px;font-weight:500;font-size:12.5px;color:var(--accent-d)"><i class="ti ti-chart-dots-3"></i> Peer statistics <span style="font-weight:400;font-size:11px;color:var(--text2)">· how this provider compares to its specialty peer group · click a spoke for detail</span></div>' +
      '<div style="padding:11px 12px;display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start">' +
      '<div style="flex:none">' + peerRadar(groups, sel) +
      '<div style="display:flex;gap:12px;justify-content:center;font-size:10px;color:var(--text2);margin-top:2px"><span><span style="display:inline-block;width:9px;height:9px;background:rgba(23,179,166,0.3);border:1px solid #17b3a6;vertical-align:middle"></span> This provider</span><span><span style="display:inline-block;width:9px;height:9px;background:rgba(120,140,165,0.25);border:1px dashed #98a4b3;vertical-align:middle"></span> Peer average</span></div></div>' +
      '<div style="flex:1;min-width:230px" id="c-peer-drill">' + peerDrill(a, card, sel) + '</div>' +
      '</div></div>';
  }
  function peerRadar(groups, sel) {
    var n = groups.length; if (!n) return "";
    var cx = 118, cy = 116, R = 82;
    var pt = function (i, v) { var ang = -Math.PI / 2 + i * 2 * Math.PI / n; var r = (Math.max(0, Math.min(100, v)) / 100) * R; return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]; };
    var ring = [25, 50, 75, 100].map(function (lvl) { var pts = groups.map(function (_, i) { return pt(i, lvl).join(","); }).join(" "); return '<polygon points="' + pts + '" fill="none" stroke="#e3e8ee" stroke-width="1"></polygon>'; }).join("");
    var axes = groups.map(function (_, i) { var e = pt(i, 100); return '<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '" stroke="#e3e8ee" stroke-width="1"></line>'; }).join("");
    var peerPts = groups.map(function (g, i) { return pt(i, g.peer).join(","); }).join(" ");
    var provPts = groups.map(function (g, i) { return pt(i, g.score).join(","); }).join(" ");
    var peerPoly = '<polygon points="' + peerPts + '" fill="rgba(120,140,165,0.18)" stroke="#98a4b3" stroke-width="1.2" stroke-dasharray="4,3"></polygon>';
    var provPoly = '<polygon points="' + provPts + '" fill="rgba(23,179,166,0.14)" stroke="#17b3a6" stroke-width="2"></polygon>';
    var dots = groups.map(function (g, i) { var c = pt(i, g.score); return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + (g.outlier ? 4 : 2.6) + '" fill="' + (g.outlier ? "#c6362f" : "#17b3a6") + '"></circle>'; }).join("");
    var labels = groups.map(function (g, i) {
      var l = pt(i, 116); var anchor = Math.abs(l[0] - cx) < 12 ? "middle" : (l[0] < cx ? "end" : "start");
      var nm = g.group === "Charge & Payment" ? "Charge/Pay" : g.group === "Diagnostic Testing" ? "Diagnostic" : g.group === "Distance / Travel" ? "Distance" : g.group;
      var isSel = g.group === sel;
      return '<g class="c-spoke" data-group="' + window.APP.esc(g.group) + '" style="cursor:pointer"><text x="' + l[0] + '" y="' + (l[1] + 3) + '" text-anchor="' + anchor + '" font-size="9.5" font-family="IBM Plex Sans,sans-serif" font-weight="' + (isSel ? "700" : "500") + '" fill="' + (g.outlier ? "#8b1a13" : "#10243b") + '"' + (isSel ? ' text-decoration="underline"' : '') + '>' + nm + (g.outlier ? " ▲" : "") + '</text></g>';
    }).join("");
    return '<svg viewBox="-42 -6 320 244" width="264" height="200" style="display:block">' + ring + axes + peerPoly + provPoly + dots + labels + '</svg>';
  }
  function peerDrill(a, card, group) {
    if (!group) return '';
    var gs = (card.groups || []).find(function (g) { return g.group === group; }) || {};
    var attrs = (card.attributes || {})[group] || [];
    var barMax = Math.max(gs.score || 0, gs.peer || 0, 100);
    var bar = function (label, val, color) { var w = Math.round((val / barMax) * 100); return '<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span>' + label + '</span><span style="font-weight:600">' + val + '</span></div><div style="height:9px;background:var(--border2);border-radius:5px;overflow:hidden"><div style="height:100%;width:' + w + '%;background:' + color + '"></div></div></div>'; };
    var attrRows = attrs.length ? attrs.map(function (at) { return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:0.5px solid var(--border2);font-size:11px"><span' + (at.outlier ? ' style="color:var(--high-tx);font-weight:500"' : '') + '>' + window.APP.esc(at.label) + (at.outlier ? ' ▲' : '') + '</span><span class="mono">' + window.APP.esc(at.value) + (at.peer ? ' <span style="color:var(--text3)">vs ' + window.APP.esc(at.peer) + '</span>' : '') + '</span></div>'; }).join("") : '';
    return '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:7px"><div style="font-weight:600;font-size:12.5px">' + window.APP.esc(group) + '</div><span class="chip ' + (gs.outlier ? "rh" : "rl") + '"><span class="s">' + gs.score + '</span> ' + (gs.outlier ? "outlier" : "in range") + '</span></div>' +
      bar("This provider", gs.score || 0, gs.outlier ? "var(--high)" : "var(--accent)") +
      bar("Peer average", gs.peer || 0, "#98a4b3") +
      (attrRows ? '<div style="margin-top:7px">' + attrRows + '</div>' : '') +
      '<div style="font-size:11px;color:var(--accent-d);cursor:pointer;margin-top:7px" id="c-peer-openrc"><i class="ti ti-external-link"></i> Open full report card</div>';
  }
  function wirePeerStats(a) {
    var host = document.getElementById("c-peer"); if (!host) return;
    var card = window.DP.getReportCard((a.provider || {}).id); if (!card) return;
    function bindOpenRc() { var rc = document.getElementById("c-peer-openrc"); if (rc) rc.onclick = function () { window.APP.openProvider((a.provider || {}).id); }; }
    function bindSpokes() { host.querySelectorAll(".c-spoke").forEach(function (el) { el.addEventListener("click", function () { select(el.getAttribute("data-group")); }); }); }
    function select(group) {
      document.getElementById("c-peer-drill").innerHTML = peerDrill(a, card, group);
      var svg = host.querySelector("svg"); if (svg) svg.outerHTML = peerRadar(card.groups, group);
      bindSpokes(); bindOpenRc();
    }
    bindSpokes(); bindOpenRc();
  }

  // ---------- case working record (editable overlay, audit-logged) ----------
  function workingRecordCard(a, prepay) {
    var p = a.provider || {}, cl = a.claim, ve = a.veteran, id = a.id;
    var fields = [
      { f: "tin", label: "TIN", rec: p.tin || "", type: "text" },
      { f: "exposure", label: "Exposure amount", rec: exposureOf(a), type: "money" }
    ];
    if (cl) {
      fields.push({ f: "billed", label: "Billed", rec: cl.billedAmount || 0, type: "money" });
      fields.push({ f: "allowed", label: "Allowed", rec: cl.allowedAmount || 0, type: "money" });
      fields.push({ f: "paid", label: prepay ? "Claim exposure (at risk)" : "Claim exposure (paid)", rec: prepay ? (cl.allowedAmount || 0) : (cl.paidAmount || 0), type: "money" });
      fields.push({ f: "claimNumber", label: "Claim #", rec: cl.claimNumber || "", type: "text" });
    }
    fields.push({ f: "providerName", label: "Provider", rec: p.name || "", type: "text" });
    if (ve) fields.push({ f: "veteranName", label: "Veteran", rec: ve.name || "", type: "text" });

    var w = window.APP.getWorking(id);
    var editCount = Object.keys(w).length;
    var grid = "display:grid;grid-template-columns:130px 1fr 1fr;gap:10px;align-items:center";
    var rows = fields.map(function (fl) {
      var edited = fl.f in w;
      var val = edited ? w[fl.f].value : fl.rec;
      var recDisp = fl.rec === "" ? "—" : (fl.type === "money" ? window.DP.usd(fl.rec) : window.APP.esc(String(fl.rec)));
      return '<div style="' + grid + ';padding:6px 0;border-top:0.5px solid var(--border2)">' +
        '<div style="font-size:11.5px;color:var(--text2)">' + fl.label + (edited ? ' <span class="tag" style="background:var(--med-bg);color:var(--med-tx)">edited</span>' : '') + '</div>' +
        '<div class="mono" style="font-size:11.5px;color:var(--text3)" title="claim of record — immutable">' + recDisp + '</div>' +
        '<input class="input wr-input" data-f="' + fl.f + '" data-label="' + window.APP.esc(fl.label) + '" data-rec="' + window.APP.esc(String(fl.rec)) + '" data-type="' + fl.type + '" type="' + (fl.type === "money" ? "number" : "text") + '" value="' + window.APP.esc(String(val)) + '" style="font-size:12px' + (edited ? ";border-color:var(--med);background:var(--med-bg)" : "") + '">' +
        '</div>';
    }).join("");
    return '<div class="card" id="c-working">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:10px;flex-wrap:wrap">' +
      '<div style="font-weight:500;font-size:13px"><i class="ti ti-edit" style="color:var(--accent-d)"></i> Case working record <span class="muted" style="font-weight:400;font-size:11px">· investigator\'s editable copy — the claim of record is unchanged; every edit is logged</span></div>' +
      '<span class="muted" style="font-size:11px" id="c-wr-count">' + (editCount ? editCount + " field" + (editCount === 1 ? "" : "s") + " edited" : "no edits") + '</span></div>' +
      '<div style="' + grid + ';font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em"><div>Field</div><div>Claim of record</div><div>Working value</div></div>' +
      rows +
      (editCount ? '<div style="margin-top:9px"><button class="btn" id="c-wr-reset" style="font-size:11px"><i class="ti ti-arrow-back-up"></i> Revert to claim of record</button></div>' : '') +
      '</div>';
  }
  function rerenderWorking(id) {
    var host = document.getElementById("c-working"); if (!host || !ctx) return;
    host.outerHTML = workingRecordCard(ctx.a, ctx.prepay);
    wireWorkingRecord(id);
  }
  function wireWorkingRecord(id) {
    document.querySelectorAll("#c-working .wr-input").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var f = inp.getAttribute("data-f"), label = inp.getAttribute("data-label"), type = inp.getAttribute("data-type"), recRaw = inp.getAttribute("data-rec");
        var val = type === "money" ? (+inp.value || 0) : inp.value;
        var rec = type === "money" ? (+recRaw || 0) : recRaw;
        if (String(val) === String(rec)) window.APP.clearWorking(id, f);
        else window.APP.setWorking(id, f, label, val, rec);
        rerenderWorking(id);
      });
    });
    var rb = document.getElementById("c-wr-reset");
    if (rb) rb.addEventListener("click", function () { window.APP.resetWorking(id); rerenderWorking(id); });
  }

  // ---------- Evidence ----------
  function evidenceHtml(a, cl) {
    var ruleIx = {}; (window.DP.getRules() || []).forEach(function (r) { ruleIx[r.id] = r; });
    // Every claim line is shown — flagged AND clean — and each expands for detail.
    // (The whole claim is held while the lead is open, regardless of which lines fired.)
    var prepay = a.mode === "prepay";
    var lines = cl ? cl.lines.map(function (l, i) {
      var flagged = (l.violatesRuleIds || []).length > 0;
      var main = '<tr class="cl-line' + (flagged ? ' flag-row' : '') + '" data-i="' + i + '" style="cursor:pointer">' +
        '<td class="mono">' + l.cpt + '</td><td>' + window.APP.esc(l.description) + '</td>' +
        '<td>' + (l.modifiers.length ? '<span class="mono" style="background:var(--high-bg);color:var(--high-tx);padding:1px 5px;border-radius:4px">' + l.modifiers.join(",") + '</span>' : '—') + '</td>' +
        '<td class="right">' + l.units + '</td><td class="right">$' + l.billed + '</td><td class="right">$' + lineExposure(l, prepay) + '</td>' +
        '<td style="font-size:10.5px;white-space:nowrap">' + (flagged ? '<span style="color:var(--high-tx)"><i class="ti ti-flag"></i> flagged</span>' : '<span style="color:var(--text3)">clean</span>') + ' <i class="ti ti-chevron-down cl-caret" style="color:var(--text3);font-size:13px;vertical-align:middle"></i></td></tr>';
      var ruleNames = (l.violatesRuleIds || []).map(function (rid) { var r = ruleIx[rid]; return r ? r.name + " (" + r.code + ")" : rid; });
      var detail = '<tr class="cl-detail" data-i="' + i + '" style="display:none"><td colspan="7" style="background:var(--surface);padding:9px 12px">' +
        '<div style="font-size:11.5px;color:var(--text2);line-height:1.7">' +
        '<b>Line ' + (i + 1) + '</b> · CPT <span class="mono">' + l.cpt + '</span> — ' + window.APP.esc(l.description) + '<br>' +
        'Billed ' + window.DP.usd(l.billed) + ' · Allowed ' + window.DP.usd(l.allowed || 0) + ' · Exposure ' + window.DP.usd(lineExposure(l, prepay)) + ' (' + exposureType(a).toLowerCase() + ') · Units ' + l.units +
        (l.modifiers && l.modifiers.length ? ' · Modifiers ' + l.modifiers.join(", ") : '') + '<br>' +
        (flagged
          ? '<span style="color:var(--high-tx)"><i class="ti ti-flag"></i> Flagged by: ' + window.APP.esc(ruleNames.join("; ") || (a.model ? a.model.name : "the ML/AI models")) + '</span>'
          : '<span style="color:var(--low-tx)"><i class="ti ti-check"></i> No rule violation on this line — shown for full claim context.</span>') +
        '</div></td></tr>';
      return main + detail;
    }).join("") : "";
    var rulesHtml = (a.rules || []).map(function (r) {
      return '<div style="display:flex;gap:9px;align-items:flex-start"><i class="ti ti-gavel" style="color:var(--high);margin-top:2px"></i><div><div style="font-size:12px;font-weight:500">' + window.APP.esc(r.name) + ' <span class="mono" style="font-weight:400;color:var(--text2)">' + window.APP.esc(r.code) + '</span> <span class="tag">' + window.APP.esc(r.source) + '</span></div><div style="font-size:11.5px;color:var(--text2)">' + window.APP.esc(r.description) + '</div></div></div>';
    }).join("");
    if (a.model) rulesHtml += '<div style="display:flex;gap:9px;align-items:center;padding-top:2px"><i class="ti ti-brain" style="color:var(--accent-d)"></i><div style="font-size:11.5px;color:var(--text2)">ML/AI model: <span style="color:var(--ink);font-weight:500">' + window.APP.esc(a.model.name) + '</span> (' + window.APP.esc(a.model.type) + ')</div></div>';
    if (!rulesHtml) rulesHtml = a.manual
      ? '<div style="font-size:11.5px;color:var(--text2)"><i class="ti ti-user-edit" style="color:var(--med)"></i> Analyst-created lead from <b>' + window.APP.esc(window.DP.sourceOf(a)) + '</b>' + (a.createdBy ? ' (' + window.APP.esc(a.createdBy) + ')' : '') + ' — no automated rule or model fired. Attach records on this tab to build the evidence.</div>'
      : '<div style="font-size:11.5px;color:var(--text2)">No rules fired — behavioral anomaly flagged by ' + (a.model ? window.APP.esc(a.model.name) : "the ML/AI models") + '.</div>';
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      (cl ? '<div class="card" style="padding:0;overflow:hidden"><div style="padding:9px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:0.5px solid var(--border2)"><span style="font-weight:500;font-size:13px">Claim <span class="mono" style="font-weight:400;color:var(--text2)">' + cl.claimNumber + '</span></span><span style="font-size:11px;color:var(--text2)">' + cl.type + ' · DOS ' + cl.dateOfService + ' · Dx ' + (cl.diagnosisCodes.join(",") || "—") + ' · ' + cl.claimStatus + ' / ' + cl.paymentType + '</span></div>' +
        '<table><thead><tr><th>CPT</th><th>Description</th><th>Mod</th><th class="right">Units</th><th class="right">Billed</th><th class="right">Exposure</th><th>Status</th></tr></thead><tbody>' + lines + '</tbody></table>' +
        '<div style="padding:7px 12px;font-size:10.5px;color:var(--text3);border-top:0.5px solid var(--border2)"><i class="ti ti-info-circle"></i> Exposure is ' + (prepay ? "the allowed amount still at risk — this claim is pre-payment, nothing has been paid" : "what was already paid on each line — post-payment, recoverable if confirmed") + '. All ' + cl.lines.length + ' claim lines shown — flagged and clean. Click any line to expand its detail; the whole claim is held while the lead is open.</div></div>' : '') +
      '<div class="card"><div style="font-weight:500;font-size:13px;margin-bottom:8px">Rule engine outcomes</div><div style="display:flex;flex-direction:column;gap:7px">' + rulesHtml + '</div></div>' +
      '<div class="card"><div style="font-weight:500;font-size:13px;margin-bottom:8px"><i class="ti ti-folder-open" style="color:var(--accent-d)"></i> Evidence on file <span class="muted" style="font-weight:400;font-size:11px">· click a record to review it</span></div>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' + evidenceDocs(a, cl).map(function (d) { return docRowHtml(d, "ev-doc-row"); }).join("") + '</div>' +
      '<div id="c-ev-doc" style="margin-top:9px"></div></div>' +
      '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:10px;flex-wrap:wrap">' +
      '<div style="font-weight:500;font-size:13px"><i class="ti ti-paperclip" style="color:var(--accent-d)"></i> Attached documents <span class="muted" style="font-weight:400;font-size:11px">· upload supporting records to the case (demo — files are not stored)</span></div>' +
      '<div><input type="file" id="c-upload-input" style="display:none"><button class="btn primary" id="c-upload-btn" style="font-size:12px"><i class="ti ti-upload"></i> Attach document</button></div></div>' +
      '<div id="c-uploads-list">' + uploadsListHtml(a.id) + '</div></div>' +
      '<div class="card" style="display:flex;align-items:center;gap:9px;padding:9px 11px;font-size:11.5px;color:var(--text2)"><i class="ti ti-file-invoice" style="color:var(--accent-d)"></i> The full claim record — diagnoses, procedures, line-level adjudication, remittance (CARC/RARC) and the X12 837 / HL7 FHIR representations — lives on the <b style="color:var(--ink)">Claim</b> tab.</div>' +
      '</div>';
  }

  // ================= Claim tab — the consolidated reviewer-grade claim record =================
  // "Click a claim, see all of it." Three representations of the same record behind a
  // toggle: a plain-language Summary, the X12 837 EDI it arrived on, and the HL7 FHIR
  // ExplanationOfBenefit it maps to. All three read from DP.getClaimDetail / getClaimFhir,
  // whose remittance reconciles to the claim's existing paid amount.
  function claimTabHtml(a, cl) {
    if (!cl) return noClaimCard("the claim record");
    var d = window.DP.getClaimDetail(cl.id); if (!d) return noClaimCard("the claim record");
    var seg = function (key, icon, label, sub) {
      var on = claimView === key;
      return '<button class="cv-seg' + (on ? " on" : "") + '" data-cv="' + key + '" style="flex:1;border:0.5px solid ' + (on ? "var(--accent)" : "var(--border)") + ';background:' + (on ? "var(--accent-l)" : "#fff") + ';color:' + (on ? "var(--accent-d)" : "var(--ink)") + ';border-radius:var(--r,8px);padding:8px 6px;cursor:pointer;text-align:center;font-weight:' + (on ? "600" : "400") + '"><i class="ti ti-' + icon + '"></i> ' + label + '<div style="font-size:10px;color:var(--text2);font-weight:400">' + sub + '</div></button>';
    };
    var pharm = !!d.pharmacy;
    var body = claimClaimBody(claimView, d, cl, pharm);
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:flex;gap:6px">' +
      seg("summary", "file-description", "Summary", "reviewer view") +
      (pharm ? seg("837", "prescription", "NCPDP D.0", "as transmitted") : seg("837", "file-code", "X12 837 EDI", "as submitted")) +
      seg("fhir", "brand-nodejs", "HL7 FHIR", "ExplanationOfBenefit") +
      '</div>' +
      '<div id="c-claimbody">' + body + '</div></div>';
  }
  // Route the three representations, pharmacy-aware (NCPDP vs 837).
  function claimClaimBody(view, d, cl, pharm) {
    if (view === "837") return pharm ? claimNcpdpHtml(cl) : claim837Html(d, cl);
    if (view === "fhir") return claimFhirHtml(cl);
    return pharm ? claimPharmacySummaryHtml(d, cl) : claimSummaryHtml(d, cl);
  }

  function kvRow(k, v, mono) {
    return '<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:11.5px;border-top:0.5px solid var(--border2)"><span style="color:var(--text2)">' + k + '</span><span' + (mono ? ' class="mono"' : '') + ' style="text-align:right;color:var(--ink)">' + window.APP.esc(String(v == null ? "—" : v)) + '</span></div>';
  }

  function claimSummaryHtml(d, cl) {
    var h = d.header, m = window.DP.usd, inst = h.type === "837I";
    // ---- header card (two columns of key/values) ----
    var left = kvRow("Claim control #", h.controlNumber, true) + kvRow("Claim form", h.formName) + kvRow("Place of service", h.placeOfService) +
      (inst ? kvRow("Bill type", h.billType) : "") +
      kvRow(inst ? "Statement dates" : "Date of service", h.statementDates) +
      (inst ? kvRow("Length of stay", h.lengthOfStay + " days") : "");
    var right = kvRow("Payer", h.payer) + kvRow("Status", h.claimStatus + " · " + h.paymentType) +
      (inst ? kvRow("DRG", h.drg) + kvRow("Discharge status", h.dischargeStatus) + kvRow("Attending", h.attending.name + " · NPI " + h.attending.npi) : kvRow("Rendering provider", h.rendering.name + " · NPI " + h.rendering.npi)) +
      kvRow("Subscriber", h.subscriber.name + " · " + h.subscriber.memberId, false);
    var headerCard = '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px">' +
      '<div style="font-weight:600;font-size:13.5px"><i class="ti ti-file-invoice" style="color:var(--accent-d)"></i> Claim <span class="mono" style="font-weight:400">' + h.controlNumber + '</span></div>' +
      '<span class="tag">' + h.type + ' · ' + window.APP.esc(inst ? "institutional" : "professional") + '</span></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px">' + left + right + '</div></div>';

    // ---- diagnoses ----
    var dxRows = d.diagnoses.map(function (x) {
      return '<tr' + (x.type === "principal" ? ' style="font-weight:500"' : '') + '><td class="right" style="color:var(--text3)">' + x.seq + '</td><td class="mono">' + x.code + '</td><td>' + window.APP.esc(x.description) + '</td>' +
        '<td>' + (x.type === "principal" ? '<span class="tag" style="background:var(--accent-l);color:var(--accent-d)">principal</span>' : '<span style="color:var(--text2);font-size:11px">secondary</span>') + '</td>' +
        (inst ? '<td class="mono" title="Present on admission">' + (x.poa || "—") + '</td>' : '') + '</tr>';
    }).join("");
    var dxCard = '<div class="card" style="padding:0;overflow:hidden"><div style="padding:9px 12px;font-weight:500;font-size:13px;border-bottom:0.5px solid var(--border2)"><i class="ti ti-clipboard-list" style="color:var(--accent-d)"></i> Diagnoses <span class="muted" style="font-weight:400;font-size:11px">· ICD-10-CM' + (inst ? ' · POA = present on admission' : '') + '</span></div>' +
      '<table><thead><tr><th class="right">#</th><th>Code</th><th>Description</th><th>Type</th>' + (inst ? '<th>POA</th>' : '') + '</tr></thead><tbody>' + dxRows + '</tbody></table></div>';

    // ---- procedures (institutional) ----
    var procCard = "";
    if (inst && d.procedures.length) {
      var prRows = d.procedures.map(function (pr) { return '<tr><td class="right" style="color:var(--text3)">' + pr.seq + '</td><td class="mono">' + pr.code + '</td><td>' + window.APP.esc(pr.description) + '</td><td class="mono">' + pr.date + '</td></tr>'; }).join("");
      procCard = '<div class="card" style="padding:0;overflow:hidden"><div style="padding:9px 12px;font-weight:500;font-size:13px;border-bottom:0.5px solid var(--border2)"><i class="ti ti-stethoscope" style="color:var(--accent-d)"></i> Procedures <span class="muted" style="font-weight:400;font-size:11px">· ICD-10-PCS</span></div>' +
        '<table><thead><tr><th class="right">#</th><th>Code</th><th>Description</th><th>Date</th></tr></thead><tbody>' + prRows + '</tbody></table></div>';
    }

    // ---- service lines with adjudication ----
    var slRows = d.serviceLines.map(function (l) {
      var carc = l.carc.map(function (c) { return c.group + "-" + c.code; }).join(", ") + (l.remark && l.remark.carc && l.carc.map(function (c) { return c.code; }).indexOf(l.remark.carc) < 0 ? (l.carc.length ? ", " : "") + "CO-" + l.remark.carc : "");
      return '<tr' + (l.flagged ? ' class="flag-row"' : '') + '>' +
        '<td class="right" style="color:var(--text3)">' + l.lineNo + '</td>' +
        '<td class="mono">' + l.cpt + (l.modifiers.length ? '<span style="color:var(--high-tx)">-' + l.modifiers.join(",") + '</span>' : '') + (l.revenueCode ? '<div style="font-size:10px;color:var(--text3)">rev ' + l.revenueCode + '</div>' : '') + '</td>' +
        '<td>' + window.APP.esc(l.description) + '</td><td class="right">' + l.units + '</td>' +
        '<td class="right">' + m(l.submitted) + '</td><td class="right" style="color:var(--text2)">−' + m(l.contractual) + '</td><td class="right">' + m(l.allowed) + '</td>' +
        '<td class="right">' + m(l.patientResp) + '</td><td class="right" style="font-weight:500">' + m(l.paid) + '</td>' +
        '<td class="mono" style="font-size:10.5px">' + (carc || "—") + '</td></tr>';
    }).join("");
    var t = d.remittance.totals;
    var slCard = '<div class="card" style="padding:0;overflow:hidden"><div style="padding:9px 12px;font-weight:500;font-size:13px;border-bottom:0.5px solid var(--border2)"><i class="ti ti-list-details" style="color:var(--accent-d)"></i> Service lines &amp; adjudication <span class="muted" style="font-weight:400;font-size:11px">· submitted → contractual → allowed → patient → paid</span></div>' +
      '<div style="overflow-x:auto"><table><thead><tr><th class="right">#</th><th>Code</th><th>Description</th><th class="right">Units</th><th class="right">Submitted</th><th class="right">CO-45</th><th class="right">Allowed</th><th class="right">Patient</th><th class="right">Paid</th><th>CARC</th></tr></thead><tbody>' + slRows +
      '<tr style="font-weight:600;border-top:1px solid var(--border)"><td colspan="4">Claim total</td><td class="right">' + m(t.submitted) + '</td><td class="right" style="color:var(--text2)">−' + m(t.contractual) + '</td><td class="right">' + m(t.allowed) + '</td><td class="right">' + m(t.patientResp) + '</td><td class="right">' + m(t.paid) + '</td><td></td></tr>' +
      '</tbody></table></div></div>';

    return '<div style="display:flex;flex-direction:column;gap:10px">' + headerCard + dxCard + procCard + slCard + remittanceCardHtml(d) + '</div>';
  }

  // Shared 835 remittance + reconciliation card (837 and pharmacy summaries both use it).
  function remittanceCardHtml(d) {
    var m = window.DP.usd, t = d.remittance.totals, pharm = !!d.pharmacy;
    var flow = function (label, val, strong) { return '<div style="text-align:center;flex:none"><div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.03em">' + label + '</div><div style="font-size:14px;font-weight:' + (strong ? "700" : "600") + ';color:' + (strong ? "var(--accent-d)" : "var(--ink)") + '">' + m(val) + '</div></div>'; };
    var arrow = '<div style="color:var(--text3);align-self:center"><i class="ti ti-arrow-right"></i></div>';
    return '<div class="card"><div style="font-weight:500;font-size:13px;margin-bottom:9px"><i class="ti ti-receipt" style="color:var(--accent-d)"></i> Remittance &amp; reconciliation <span class="muted" style="font-weight:400;font-size:11px">· 835 electronic remittance advice</span></div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;justify-content:center;padding:8px 4px;background:var(--surface);border-radius:8px">' +
      flow("Submitted", t.submitted) + arrow + flow("− Contractual (CO-45)", t.contractual) + arrow + flow("= Allowed", t.allowed) + arrow + flow("− Patient", t.patientResp) + arrow + flow(pharm ? "= Plan paid" : "= Payer paid", t.paid, true) + '</div>' +
      '<div style="font-size:11px;color:var(--text2);margin-top:9px;line-height:1.6"><i class="ti ti-info-circle"></i> ' + window.APP.esc(d.reconciliation) + ' Veteran cost-share is <b>$0</b> under VA Community Care.</div>' +
      (d.remittance.recoverable > 0 ? '<div style="background:var(--high-bg);border:0.5px solid #f3c9c9;border-radius:7px;padding:9px 11px;font-size:11.5px;color:var(--high-tx);margin-top:9px"><i class="ti ti-flag"></i> <b>' + m(d.remittance.recoverable) + '</b> exposure on flagged lines — post-payment recovery basis is carried in the line remarks below.</div>' : '') +
      remarksHtml(d) + codeLegendHtml(d) + '</div>';
  }

  // ---------- Pharmacy (NCPDP/NDC) summary ----------
  function claimPharmacySummaryHtml(d, cl) {
    var h = d.header, m = window.DP.usd;
    var left = kvRow("Claim control #", h.controlNumber, true) + kvRow("Claim form", h.formName) + kvRow("Place of service", h.placeOfService) +
      kvRow("Rx service reference #", h.rxNumber, true) + kvRow("Date of service", h.dateOfService);
    var right = kvRow("Payer", h.payer) + kvRow("Status", h.claimStatus + " · " + h.paymentType) +
      kvRow("Pharmacy", h.pharmacyName + " · NCPDP " + h.ncpdpId) + kvRow("BIN / PCN", h.binPcn, true) +
      kvRow("Prescriber", h.prescriber.name + " · NPI " + h.prescriber.npi) + kvRow("Member", h.subscriber.name + " · " + h.subscriber.memberId, false);
    var headerCard = '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px">' +
      '<div style="font-weight:600;font-size:13.5px"><i class="ti ti-prescription" style="color:var(--accent-d)"></i> Pharmacy claim <span class="mono" style="font-weight:400">' + h.controlNumber + '</span></div>' +
      '<span class="tag">NCPDP D.0 · pharmacy</span></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 20px">' + left + right + '</div></div>';

    var dxCard = d.diagnoses.length ? '<div class="card" style="padding:0;overflow:hidden"><div style="padding:9px 12px;font-weight:500;font-size:13px;border-bottom:0.5px solid var(--border2)"><i class="ti ti-clipboard-list" style="color:var(--accent-d)"></i> Diagnosis <span class="muted" style="font-weight:400;font-size:11px">· ICD-10-CM · drug indication</span></div>' +
      '<table><thead><tr><th class="right">#</th><th>Code</th><th>Description</th></tr></thead><tbody>' +
      d.diagnoses.map(function (x) { return '<tr><td class="right" style="color:var(--text3)">' + x.seq + '</td><td class="mono">' + x.code + '</td><td>' + window.APP.esc(x.description) + '</td></tr>'; }).join("") + '</tbody></table></div>' : "";

    var rows = d.serviceLines.map(function (l) {
      var carc = l.carc.map(function (c) { return c.group + "-" + c.code; }).join(", ") + (l.remark && l.remark.carc && l.carc.map(function (c) { return c.code; }).indexOf(l.remark.carc) < 0 ? (l.carc.length ? ", " : "") + "CO-" + l.remark.carc : "");
      return '<tr' + (l.flagged ? ' class="flag-row"' : '') + '>' +
        '<td class="mono">' + l.ndc + '</td><td>' + window.APP.esc(l.drugName) + '</td>' +
        '<td class="right">' + window.APP.esc(String(l.qtyDispensed)) + '</td><td class="right">' + (l.daysSupply || "—") + '</td>' +
        '<td class="mono" style="font-size:10.5px">' + window.APP.esc(String(l.daw).split(" — ")[0]) + '</td>' +
        '<td class="right">' + m(l.submitted) + '</td><td class="right" style="color:var(--text2)">−' + m(l.contractual) + '</td><td class="right">' + m(l.allowed) + '</td>' +
        '<td class="right" style="font-weight:500">' + m(l.paid) + '</td><td class="mono" style="font-size:10.5px">' + (carc || "—") + '</td></tr>';
    }).join("");
    var t = d.remittance.totals;
    var slCard = '<div class="card" style="padding:0;overflow:hidden"><div style="padding:9px 12px;font-weight:500;font-size:13px;border-bottom:0.5px solid var(--border2)"><i class="ti ti-pill" style="color:var(--accent-d)"></i> Drug lines &amp; adjudication <span class="muted" style="font-weight:400;font-size:11px">· NDC · quantity · days supply · DAW</span></div>' +
      '<div style="overflow-x:auto"><table><thead><tr><th>NDC</th><th>Drug</th><th class="right">Qty</th><th class="right">Days</th><th>DAW</th><th class="right">Submitted</th><th class="right">CO-45</th><th class="right">Allowed</th><th class="right">Paid</th><th>CARC</th></tr></thead><tbody>' + rows +
      '<tr style="font-weight:600;border-top:1px solid var(--border)"><td colspan="5">Claim total</td><td class="right">' + m(t.submitted) + '</td><td class="right" style="color:var(--text2)">−' + m(t.contractual) + '</td><td class="right">' + m(t.allowed) + '</td><td class="right">' + m(t.paid) + '</td><td></td></tr>' +
      '</tbody></table></div><div style="padding:7px 12px;font-size:10.5px;color:var(--text3);border-top:0.5px solid var(--border2)"><i class="ti ti-info-circle"></i> DAW = Dispense As Written. NDCs use the reserved <span class="mono">00000</span> labeler — synthetic by construction.</div></div>';

    return '<div style="display:flex;flex-direction:column;gap:10px">' + headerCard + dxCard + slCard + remittanceCardHtml(d) + '</div>';
  }

  // ---------- NCPDP D.0 telecommunication view (pharmacy analog of the 837) ----------
  function claimNcpdpHtml(cl) {
    var d = window.DP.getNcpdp(cl.id); if (!d) return noClaimCard("the NCPDP transaction");
    var kv = function (k, v) { return '<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:11.5px;border-top:0.5px solid var(--border2)"><span style="color:var(--text2)">' + k + '</span><span class="mono" style="text-align:right">' + window.APP.esc(String(v == null ? "—" : v)) + '</span></div>'; };
    var sect = function (title, seg, rows) { return '<div style="margin-bottom:8px;break-inside:avoid"><div style="font-size:11px;font-weight:600;color:var(--accent-d)">' + title + ' <span class="mono" style="font-weight:400;color:var(--text3);font-size:10px">' + seg + '</span></div>' + rows + '</div>'; };
    var t = d.transaction, ph = d.pharmacy, pt = d.patient, pr = d.prescriber, c = d.claim;
    var drugRows = d.drugs.map(function (g) {
      return '<div style="padding:5px 0;border-top:0.5px solid var(--border2)' + (g.flagged ? ';background:var(--high-bg)' : '') + '"><div style="font-size:11.5px;font-weight:500">Rx ' + g.line + ' · <span class="mono">NDC ' + window.APP.esc(g.ndc) + '</span> ' + (g.flagged ? '<i class="ti ti-flag" style="color:var(--high-tx)"></i>' : '') + '</div>' +
        '<div style="font-size:11px;color:var(--text2)">' + window.APP.esc(g.name) + '</div>' +
        '<div style="font-size:10.5px;color:var(--text2)" class="mono">' + g.productQualifier + ' · qty ' + window.APP.esc(String(g.qtyDispensed)) + ' · days ' + (g.daysSupply || "—") + ' · DAW ' + window.APP.esc(String(g.daw).split(" — ")[0]) + ' · refill ' + g.refill + ' · ingredient $' + g.ingredientCost + ' · disp fee $' + g.dispensingFee.toFixed(2) + ' · plan paid $' + g.planPaid + '</div></div>';
    }).join("");
    var body =
      sect("Transaction header", "B1 · D.0", kv("Standard", t.standard) + kv("Transaction", t.type) + kv("BIN", t.bin) + kv("PCN", t.pcn) + kv("Software / vendor", t.softwareVendor)) +
      sect("Pharmacy", "Svc provider", kv("ID qualifier", ph.qualifier) + kv("NPI", ph.npi) + kv("NCPDP ID", ph.ncpdp) + kv("Name", ph.name) + kv("Service type", ph.serviceProvider)) +
      sect("Patient", "Cardholder", kv("Member ID", pt.memberId) + kv("Name", pt.name) + kv("DOB / sex", pt.dob + " · " + pt.gender) + kv("Relationship", pt.relationship)) +
      sect("Prescriber", "01 · NPI", kv("ID qualifier", pr.qualifier) + kv("NPI", pr.npi) + kv("Name", pr.name)) +
      sect("Claim", "Rx billing", kv("Rx service ref #", c.rxServiceRef) + kv("Ref qualifier", c.rxQualifier) + kv("Date of service", c.dateOfService) + kv("Payer", c.payer)) +
      sect("Drugs", "Claim / Pricing", drugRows);
    return '<div class="card"><div style="font-weight:500;font-size:13px;margin-bottom:2px"><i class="ti ti-prescription" style="color:var(--accent-d)"></i> NCPDP D.0 <span class="muted" style="font-weight:400;font-size:11px">· this prescription claim as an NCPDP Telecommunication D.0 billing transaction</span></div>' +
      '<div style="margin-top:9px;display:grid;grid-template-columns:1fr 1fr;gap:0 18px">' + body + '</div></div>';
  }

  // Post-payment integrity remarks (RARC) attached to the flagged lines.
  function remarksHtml(d) {
    var flagged = d.serviceLines.filter(function (l) { return l.remark; });
    if (!flagged.length) return "";
    var rows = flagged.map(function (l) {
      var rec = l.remark.recover;
      return '<div style="display:flex;gap:9px;align-items:flex-start;padding:7px 0;border-top:0.5px solid var(--border2)">' +
        '<i class="ti ti-' + (rec ? "flag" : "circle-check") + '" style="color:' + (rec ? "var(--high-tx)" : "var(--low-tx)") + ';margin-top:2px"></i>' +
        '<div style="flex:1"><div style="font-size:11.5px;font-weight:500">Line ' + l.lineNo + ' · <span class="mono">' + l.cpt + '</span> <span class="mono muted" style="font-weight:400;font-size:10.5px">RARC ' + l.remark.rarc + (l.remark.carc ? ' · CARC CO-' + l.remark.carc : '') + '</span></div>' +
        '<div style="font-size:11.5px;color:var(--text2);line-height:1.5">' + window.APP.esc(l.remark.text) + '</div></div></div>';
    }).join("");
    return '<div style="margin-top:10px"><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px">Post-payment integrity remarks</div>' + rows + '</div>';
  }

  // Legend for the CARC/RARC codes appearing on this remittance.
  function codeLegendHtml(d) {
    var carc = d.remittance.carc.map(function (c) { return '<div style="font-size:11px;padding:3px 0"><span class="mono" style="color:var(--accent-d)">' + c.group + '-' + c.code + '</span> <span style="color:var(--text2)">' + window.APP.esc(c.label) + ' · ' + window.APP.esc(c.kind) + '</span></div>'; }).join("");
    var rarc = d.remittance.rarc.map(function (r) { return '<div style="font-size:11px;padding:3px 0"><span class="mono" style="color:var(--accent-d)">' + r.code + '</span> <span style="color:var(--text2)">' + window.APP.esc(r.label) + '</span></div>'; }).join("");
    if (!carc && !rarc) return "";
    return '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;color:var(--accent-d);list-style:none"><i class="ti ti-book-2"></i> Remittance code reference (CARC / RARC)</summary><div style="margin-top:6px;border-top:0.5px solid var(--border2);padding-top:6px">' +
      (carc ? '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em">CARC — claim adjustment reason codes</div>' + carc : '') +
      (rarc ? '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-top:5px">RARC — remittance advice remark codes</div>' + rarc : '') +
      '</div></details>';
  }

  // ---------- X12 837 EDI view (claim mapped to loops/segments) ----------
  // Reuses DP.get837 for the loop/segment framing, but overlays the enriched
  // diagnosis list and (institutional) ICD-10-PCS procedures from getClaimDetail so
  // all three representations show the same clinical detail.
  function claim837Html(detail, cl) {
    var d = window.DP.get837(cl.id); if (!d) return noClaimCard("the 837");
    var kv = function (k, v) { return '<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:11.5px;border-top:0.5px solid var(--border2)"><span style="color:var(--text2)">' + k + '</span><span class="mono" style="text-align:right">' + window.APP.esc(String(v == null ? "—" : v)) + '</span></div>'; };
    var sect = function (title, loop, rows) { return '<div style="margin-bottom:8px;break-inside:avoid"><div style="font-size:11px;font-weight:600;color:var(--accent-d)">' + title + ' <span class="mono" style="font-weight:400;color:var(--text3);font-size:10px">' + loop + '</span></div>' + rows + '</div>'; };
    var b = d.billingProvider, s = d.subscriber, py = d.payer, c = d.claim, t = d.transaction;
    // enriched diagnoses (principal + secondaries) from getClaimDetail
    var dxRows = detail.diagnoses.map(function (x) { return kv("Dx " + x.seq + " · " + (x.type === "principal" ? "ABK Principal" : "ABF Other") + (x.poa ? " · POA " + x.poa : ""), x.code); }).join("");
    var procRows = detail.procedures.length ? detail.procedures.map(function (pr) { return kv("Proc " + pr.seq + " · BBR (ICD-10-PCS)", pr.code); }).join("") : "";
    var lineRows = d.serviceLines.map(function (l) {
      return '<div style="padding:5px 0;border-top:0.5px solid var(--border2)' + (l.flagged ? ';background:var(--high-bg)' : '') + '"><div style="font-size:11.5px;font-weight:500">Line ' + l.lineNumber + ' · <span class="mono">' + window.APP.esc(l.procedure) + '</span> ' + (l.flagged ? '<i class="ti ti-flag" style="color:var(--high-tx)"></i>' : '') + '</div><div style="font-size:10.5px;color:var(--text2)" class="mono">' + l.segment + ' · chg $' + l.chargeAmount + ' · ' + l.unitBasis + ' ' + l.units + (l.revenueCode ? ' · rev ' + l.revenueCode : '') + ' · POS ' + l.placeOfService + ' · dx ptr ' + l.diagnosisPointers + ' · DTP ' + l.serviceDate + '</div></div>';
    }).join("");
    var body =
      sect("Transaction", "ST · 837", kv("Set / IG", t.setId + " · " + t.implementationGuide) + kv("Purpose", t.purpose) + kv("Submitter", d.submitter.name) + kv("Receiver", d.receiver.name)) +
      sect("Billing provider", b.loop, kv("NPI", b.npi) + kv("Name", b.name) + kv("Tax ID (" + b.taxIdType + ")", b.taxId) + kv("Taxonomy", b.taxonomy) + kv("Address", b.address)) +
      sect("Rendering / referring", "2310", kv("Rendering NPI", d.renderingProvider.npi) + kv("Referring", d.referringProvider.name + " · " + d.referringProvider.npi)) +
      sect("Subscriber", s.loop, kv("Member ID", s.memberId) + kv("Name", s.name) + kv("DOB / sex", s.dob + " · " + s.gender) + kv("Relationship", s.relationship)) +
      sect("Payer", py.loop, kv("Payer", py.name + " (" + py.id + ")") + kv("Claim control #", py.claimControlNumber)) +
      sect("Claim", c.loop, kv("Patient control # · CLM01", c.patientControlNumber) + kv("Total charge · CLM02", "$" + c.totalClaimCharge) + kv("Place of service · CLM05-1", c.placeOfService) + kv("Frequency · CLM05-3", c.frequencyCode) + (c.billType ? kv("Bill type", c.billType) : "") + (c.admissionType ? kv("Admission type", c.admissionType) : "") + (c.statementDates ? kv("Statement dates", c.statementDates) : "") + kv("Benefit assignment", c.benefitAssignment) + dxRows + procRows) +
      sect("Service lines", "2400 · " + (d.serviceLines[0] ? d.serviceLines[0].segment : "SV"), lineRows);
    return '<div class="card"><div style="font-weight:500;font-size:13px;margin-bottom:2px"><i class="ti ti-file-code" style="color:var(--accent-d)"></i> X12 837 EDI <span class="muted" style="font-weight:400;font-size:11px">· this claim mapped to X12 837 loops &amp; segments (' + window.APP.esc(t.implementationGuide) + ')</span></div>' +
      '<div style="margin-top:9px;display:grid;grid-template-columns:1fr 1fr;gap:0 18px">' + body + '</div></div>';
  }

  // ---------- HL7 FHIR view (ExplanationOfBenefit JSON) ----------
  function claimFhirHtml(cl) {
    var eob = window.DP.getClaimFhir(cl.id); if (!eob) return noClaimCard("the FHIR resource");
    var json = window.APP.esc(JSON.stringify(eob, null, 2));
    return '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
      '<div style="font-weight:500;font-size:13px"><i class="ti ti-brand-nodejs" style="color:var(--accent-d)"></i> HL7 FHIR R4 <span class="muted" style="font-weight:400;font-size:11px">· ExplanationOfBenefit — CARIN Blue Button aligned</span></div>' +
      '<span class="tag" style="background:var(--surface)"><i class="ti ti-plug-connected"></i> application/fhir+json</span></div>' +
      '<pre class="mono" style="margin:0;background:#0f2033;color:#cfe8e2;border-radius:8px;padding:12px 14px;font-size:11px;line-height:1.55;overflow-x:auto;max-height:560px;overflow-y:auto">' + json + '</pre>' +
      '<div style="font-size:11px;color:var(--text2);margin-top:8px"><i class="ti ti-info-circle"></i> The same claim served as a FHIR resource for interoperability — diagnoses (ICD-10-CM), items (CPT / NDC), and per-line <span class="mono">adjudication</span> slices (submitted / eligible / benefit) with CARC reasons.</div></div>';
  }

  function wireClaimTab(root) {
    (root || document).querySelectorAll(".cv-seg").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = btn.getAttribute("data-cv"); if (v === claimView) return;
        claimView = v;
        var det = window.DP.getClaimDetail(ctx.cl.id), pharm = !!(det && det.pharmacy);
        window.APP.auditLog("CLAIM_VIEW", ctx.id ? ("Lead #" + ctx.id + " · " + (v === "837" ? (pharm ? "NCPDP D.0" : "X12 837") : v === "fhir" ? "HL7 FHIR" : "Summary")) : v);
        var body = document.getElementById("c-claimbody");
        if (body && ctx) body.innerHTML = claimClaimBody(v, det, ctx.cl, pharm);
        (root || document).querySelectorAll(".cv-seg").forEach(function (b2) {
          var on = b2.getAttribute("data-cv") === v;
          b2.classList.toggle("on", on);
          b2.style.borderColor = on ? "var(--accent)" : "var(--border)";
          b2.style.background = on ? "var(--accent-l)" : "#fff";
          b2.style.color = on ? "var(--accent-d)" : "var(--ink)";
          b2.style.fontWeight = on ? "600" : "400";
        });
      });
    });
  }

  // ---------- CMS pricing (Zellis) — submitted charge vs CMS-allowed ----------
  function noClaimCard(what) { return '<div class="card" style="text-align:center;padding:28px"><i class="ti ti-file-off" style="font-size:26px;color:var(--text3)"></i><div style="font-size:12.5px;color:var(--text2);margin-top:8px">No itemized claim on this lead — ' + what + ' is unavailable.</div><div style="font-size:11px;color:var(--text3);margin-top:3px">Manual / referral leads have no 837 claim until records are attached.</div></div>'; }
  // Pharmacy (NCPDP) claims don't run through the professional-claim engines.
  function pharmacyNaCard(what) { return '<div class="card" style="text-align:center;padding:28px"><i class="ti ti-prescription" style="font-size:26px;color:var(--text3)"></i><div style="font-size:12.5px;color:var(--text2);margin-top:8px">' + what + ' does not apply to a pharmacy (NCPDP) claim.</div><div style="font-size:11px;color:var(--text3);margin-top:3px">See the <b>Claim</b> tab for the NDC-level detail, DAW screening and pharmacy adjudication.</div></div>'; }
  function pricingHtml(a, cl) {
    if (!cl) return noClaimCard("CMS pricing");
    if (cl.type === "NCPDP") return pharmacyNaCard("CMS reference pricing (MPFS/OPPS)");
    var d = window.DP.getCmsPricing(cl.id); if (!d) return noClaimCard("CMS pricing");
    var m = window.DP.usd;
    var rows = d.lines.map(function (l) {
      var vpos = l.variance > 0;
      return '<tr' + (l.flagged ? ' class="flag-row"' : '') + '><td class="mono">' + l.cpt + ((l.modifiers || []).length ? '-' + l.modifiers.join(",") : '') + '</td>' +
        '<td>' + window.APP.esc(l.description) + '</td><td class="right">' + m(l.submittedCharge) + '</td><td class="right">' + m(l.cmsAllowed) + '</td><td class="right">' + m(l.paid) + '</td>' +
        '<td class="right" style="color:' + (vpos ? "var(--high-tx)" : "var(--text2)") + ';font-weight:500">' + (vpos ? "+" : "") + m(l.variance) + ' <span style="font-size:10px">(' + l.variancePct + '%)</span></td>' +
        '<td style="font-size:11px">' + window.APP.esc(l.methodology) + (l.overPaid ? ' <span class="tag" style="background:var(--high-bg);color:var(--high-tx)">over CMS</span>' : '') + '</td></tr>';
    }).join("");
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:500;font-size:13px"><i class="ti ti-currency-dollar" style="color:var(--accent-d)"></i> CMS pricing comparison <span class="muted" style="font-weight:400;font-size:11px">· submitted charge vs CMS-allowed</span></div>' +
      '<span class="tag" style="background:var(--surface)"><i class="ti ti-plug-connected"></i> ' + window.APP.esc(d.source) + '</span></div><div style="font-size:11px;color:var(--text2);margin-top:4px">' + d.asOf + ' · ' + window.APP.esc(d.locality) + '</div></div>' +
      '<div class="card" style="padding:0;overflow:hidden"><table><thead><tr><th>CPT</th><th>Description</th><th class="right">Submitted</th><th class="right">CMS allowed</th><th class="right">Exposure</th><th class="right">Variance</th><th>Methodology</th></tr></thead><tbody>' + rows +
      '<tr style="font-weight:600;border-top:1px solid var(--border)"><td colspan="2">Claim total</td><td class="right">' + m(d.totals.submitted) + '</td><td class="right">' + m(d.totals.cmsAllowed) + '</td><td class="right">' + m(d.totals.paid) + '</td><td class="right" style="color:var(--high-tx)">+' + m(d.totals.variance) + '</td><td></td></tr></tbody></table></div>' +
      (d.totals.overpayment > 0 ? '<div style="background:var(--high-bg);border:0.5px solid #f3c9c9;border-radius:7px;padding:9px 11px;font-size:11.5px;color:var(--high-tx)"><b>' + m(d.totals.overpayment) + '</b> exposure above the CMS-allowed amount — recoverable per CMS reference pricing.</div>' : '') +
      (a.mode === "prepay" ? '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:7px;padding:9px 11px;font-size:11.5px;color:var(--text2)"><i class="ti ti-info-circle"></i> This claim is <b>pre-payment</b> — exposure is $0 per line because nothing has been paid yet. Compare the submitted charge against the CMS-allowed amount to price it before releasing payment.</div>' : '') +
      pricingVersionsHtml(d.ruleVersions) +
      '</div>';
  }
  // Pricing rules with version history — each rule shows the version in force plus
  // its prior versions (effective date + value + what changed), expandable.
  function pricingVersionsHtml(vers) {
    if (!vers || !vers.length) return "";
    var rows = vers.map(function (r, i) {
      var hist = (r.history || []).map(function (h) {
        return '<div style="display:flex;gap:8px;align-items:baseline;padding:5px 0 5px 22px;border-top:0.5px solid var(--border2)">' +
          '<span class="mono" style="font-size:10.5px;color:var(--text3);white-space:nowrap;min-width:56px">' + window.APP.esc(h.version) + '</span>' +
          '<span class="mono" style="font-size:10.5px;color:var(--text3);white-space:nowrap">' + window.APP.esc(h.effective) + '</span>' +
          '<span style="font-size:11px;flex:1"><span style="color:var(--text)">' + window.APP.esc(h.value) + '</span>' + (h.change ? ' <span style="color:var(--text2)">· ' + window.APP.esc(h.change) + '</span>' : '') + '</span></div>';
      }).join("");
      return '<div style="border-top:0.5px solid var(--border2)">' +
        '<div class="pv-rule" data-i="' + i + '" style="display:flex;gap:9px;align-items:center;padding:8px 0;cursor:pointer">' +
        '<i class="ti ti-chevron-right pv-rule-caret" style="color:var(--text3);font-size:14px;transition:transform .12s"></i>' +
        '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500">' + window.APP.esc(r.name) + ' <span class="muted" style="font-weight:400;font-size:10.5px">· ' + window.APP.esc(r.authority) + '</span></div>' +
        '<div style="font-size:10.5px;color:var(--text2)">' + window.APP.esc(r.note) + '</div></div>' +
        '<div style="text-align:right;white-space:nowrap"><div class="mono" style="font-size:11px;font-weight:500">' + window.APP.esc(r.current.version) + '</div>' +
        '<div style="font-size:11px;color:var(--text)">' + window.APP.esc(r.current.value) + '</div>' +
        '<div class="mono" style="font-size:10px;color:var(--text3)">eff. ' + window.APP.esc(r.current.effective) + '</div></div></div>' +
        '<div class="pv-hist" data-i="' + i + '" style="display:none;padding-bottom:6px">' +
        '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;padding:2px 0 3px 22px">Prior versions</div>' + (hist || '<div style="font-size:11px;color:var(--text3);padding-left:22px">No prior versions on file.</div>') + '</div>';
    }).join("");
    return '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:2px">' +
      '<div style="font-weight:500;font-size:12.5px"><i class="ti ti-history" style="color:var(--accent-d)"></i> Pricing rules &amp; version history <span class="muted" style="font-weight:400;font-size:11px">· the version in force priced this claim; click a rule for prior versions</span></div></div>' +
      rows + '</div>';
  }
  function wirePricingVersions(root) {
    (root || document).querySelectorAll(".pv-rule").forEach(function (row) {
      row.addEventListener("click", function () {
        var i = row.getAttribute("data-i");
        var hist = (root || document).querySelector('.pv-hist[data-i="' + i + '"]'); if (!hist) return;
        var open = hist.style.display !== "none";
        hist.style.display = open ? "none" : "block";
        var c = row.querySelector(".pv-rule-caret"); if (c) c.style.transform = open ? "" : "rotate(90deg)";
      });
    });
  }

  // ---------- CPT crosswalk (Coding) ----------
  // "This procedure code billed with this modifier" — per-line NCCI PTP, MUE and
  // modifier-validity checks, so the reviewer can see WHY a pairing is improper.
  function xwalkHtml(a, cl) {
    if (!cl) return noClaimCard("the CPT crosswalk");
    if (cl.type === "NCPDP") return pharmacyNaCard("NCCI / CPT coding validation");
    var d = window.DP.getCptCrosswalk(cl.id); if (!d) return noClaimCard("the CPT crosswalk");
    var V = {
      pass: ["circle-check", "var(--low-tx)", "var(--low-bg)", "Passes"],
      review: ["alert-triangle", "var(--med-tx)", "var(--med-bg)", "Review"],
      fail: ["circle-x", "var(--high-tx)", "var(--high-bg)", "Fails"]
    };
    var rows = d.lines.map(function (l) {
      var v = V[l.verdict];
      var codeChip = '<span class="mono" style="font-size:12px;font-weight:600">' + l.cpt + '</span>' +
        (l.modifiers.length ? l.modifiers.map(function (m) {
          var chk = l.modChecks.find(function (c) { return c.mod === m; }) || {};
          var bad = chk.valid === false;
          return ' <span class="mono" style="font-size:11px;padding:1px 5px;border-radius:4px;background:' + (bad ? "var(--high-bg)" : "var(--surface)") + ';color:' + (bad ? "var(--high-tx)" : "var(--text2)") + ';border:0.5px solid ' + (bad ? "#f3c9c9" : "var(--border)") + '">-' + m + '</span>';
        }).join("") : ' <span class="muted" style="font-size:10.5px">no modifier</span>');

      var detail = [];
      if (l.ptp) {
        var pv = V[l.ptp.status];
        detail.push('<div style="display:flex;gap:7px;align-items:flex-start"><i class="ti ti-' + pv[0] + '" style="color:' + pv[1] + ';margin-top:1px;font-size:13px"></i><div>' +
          '<span style="font-weight:500">NCCI PTP edit</span> <span class="mono" style="font-size:10.5px;color:var(--text2)">' + l.ptp.column1 + ' → ' + l.ptp.column2 + ' · indicator ' + l.ptp.indicator + '</span>' +
          '<div style="color:var(--text2)">' + window.APP.esc(l.ptp.note) + '</div></div></div>');
      }
      if (l.mue) {
        var mv = l.mue.exceeded ? V.fail : V.pass;
        detail.push('<div style="display:flex;gap:7px;align-items:flex-start"><i class="ti ti-' + mv[0] + '" style="color:' + mv[1] + ';margin-top:1px;font-size:13px"></i><div>' +
          '<span style="font-weight:500">MUE</span> <span class="mono" style="font-size:10.5px;color:var(--text2)">' + l.mue.billed + ' of ' + l.mue.limit + ' units/day</span>' +
          '<div style="color:var(--text2)">' + window.APP.esc(l.mue.note || "Units billed are within the medically-unlikely-edit limit.") + '</div></div></div>');
      }
      l.modChecks.forEach(function (c) {
        var cv = c.valid ? V.pass : V.fail;
        detail.push('<div style="display:flex;gap:7px;align-items:flex-start"><i class="ti ti-' + cv[0] + '" style="color:' + cv[1] + ';margin-top:1px;font-size:13px"></i><div>' +
          '<span style="font-weight:500">Modifier ' + c.mod + '</span> <span style="color:var(--text2)">— ' + window.APP.esc(c.name) + '</span>' +
          '<div style="color:var(--text2)">' + window.APP.esc(c.note) + '</div></div></div>');
      });
      if (!detail.length) detail.push('<div style="color:var(--text2)"><i class="ti ti-circle-check" style="color:var(--low-tx)"></i> No coding edits apply to this line.</div>');

      return '<div style="border-top:0.5px solid var(--border2);padding:10px 0">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:0">' + codeChip + ' <span style="font-size:12px;color:var(--text2)">' + window.APP.esc(l.description) + '</span></div>' +
        '<span class="tag" style="background:' + v[2] + ';color:' + v[1] + '"><i class="ti ti-' + v[0] + '"></i> ' + v[3] + '</span></div>' +
        '<div style="font-size:11.5px;line-height:1.6;margin-top:6px;display:flex;flex-direction:column;gap:5px;padding-left:2px">' + detail.join("") + '</div>' +
        '</div>';
    }).join("");

    var tone = d.fails ? V.fail : d.reviews ? V.review : V.pass;
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
      '<div style="font-weight:500;font-size:13px"><i class="ti ti-arrows-left-right" style="color:var(--accent-d)"></i> CPT crosswalk <span class="muted" style="font-weight:400;font-size:11px">· is this code payable billed with this modifier?</span></div>' +
      '<span class="tag" style="background:var(--surface)"><i class="ti ti-plug-connected"></i> ' + window.APP.esc(d.source) + '</span></div>' +
      '<div style="font-size:11px;color:var(--text2);margin-top:4px">' + window.APP.esc(d.asOf) + '</div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">' +
      stat("Lines failing", '<span style="color:' + (d.fails ? "var(--high-tx)" : "var(--text)") + '">' + d.fails + '</span>') +
      stat("Needing review", '<span style="color:' + (d.reviews ? "var(--med-tx)" : "var(--text)") + '">' + d.reviews + '</span>') +
      stat("Clean", d.clean) + '</div>' +
      '<div style="background:' + tone[2] + ';border:0.5px solid ' + (d.fails ? "#f3c9c9" : d.reviews ? "#e7c99a" : "#bfe0cd") + ';border-radius:7px;padding:9px 11px;font-size:11.5px;color:' + tone[1] + '">' +
      '<i class="ti ti-' + tone[0] + '"></i> <b>' + window.APP.esc(d.determination) + '</b></div>' +
      '<div class="card" style="padding:2px 12px 10px"><div style="font-weight:500;font-size:13px;padding:9px 0 2px">Line-by-line</div>' + rows + '</div>' +
      '<div class="card"><div style="font-weight:500;font-size:12.5px;margin-bottom:6px">Edits applied</div>' +
      d.editsApplied.map(function (r) { return '<div style="display:flex;gap:7px;font-size:11.5px;color:var(--text2);padding:2px 0"><i class="ti ti-check" style="color:var(--accent-d)"></i>' + window.APP.esc(r) + '</div>'; }).join("") + '</div>' +
      '</div>';
  }

  // ---------- Utilization management (Milliman MCG) ----------
  function umKv(k, v) { return '<div class="card" style="padding:7px 9px;box-shadow:none;background:var(--surface)"><div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.03em">' + k + '</div><div style="font-size:12px;font-weight:500;margin-top:2px">' + window.APP.esc(v) + '</div></div>'; }
  function losRow(label, val, rec, act, color) { var max = Math.max(rec, act, 1); var w = Math.round(val / max * 100); return '<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:2px"><span>' + label + '</span><span style="font-weight:600">' + val + ' days</span></div><div style="height:9px;background:var(--border2);border-radius:5px;overflow:hidden"><div style="height:100%;width:' + w + '%;background:' + color + '"></div></div></div>'; }
  // Facility capacity: patient-days billed vs what the staffed beds can physically
  // hold. Over-capacity = impossible days no coding review would catch.
  function capacityCard(a) {
    var c = window.DP.getFacilityCapacity(a.providerId); if (!c) return "";
    var over = c.overCapacity;
    var barMax = Math.max(c.capacityDays, c.patientDaysBilled, 1);
    var bar = function (label, val, color, sub) {
      var w = Math.round(val / barMax * 100);
      return '<div style="margin-bottom:7px"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:2px"><span>' + label + '</span><span style="font-weight:600">' + val.toLocaleString() + ' <span style="font-weight:400;color:var(--text2);font-size:10.5px">' + sub + '</span></span></div><div style="height:9px;background:var(--border2);border-radius:5px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, w) + '%;background:' + color + '"></div></div></div>';
    };
    var st = { bg: over ? "var(--high-bg)" : "var(--low-bg)", bd: over ? "#f3c9c9" : "#bfe0c9", tx: over ? "var(--high-tx)" : "var(--low-tx)" };
    return '<div class="card">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
      '<div style="font-weight:500;font-size:12.5px"><i class="ti ti-bed" style="color:var(--accent-d)"></i> Facility capacity <span class="muted" style="font-weight:400;font-size:11px">· beds vs patient-days billed · ' + c.periodLabel + '</span></div>' +
      '<span class="tag" style="background:' + st.bg + ';color:' + st.tx + '"><i class="ti ti-' + (over ? "alert-triangle" : "circle-check") + '"></i> ' + c.utilization + '% of capacity</span></div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:9px;font-size:11.5px">' +
      umKv("Licensed beds", c.licensedBeds) + umKv("Staffed beds", c.staffedBeds) + '</div>' +
      bar("Physical capacity (staffed beds × " + c.periodDays + " days)", c.capacityDays, "#6b7a8d", "patient-days") +
      bar("Patient-days billed", c.patientDaysBilled, over ? "var(--high)" : "var(--accent)", "patient-days") +
      '<div style="background:' + st.bg + ';border:0.5px solid ' + st.bd + ';border-radius:7px;padding:9px 11px;margin-top:4px;font-size:11.5px;color:' + st.tx + '">' +
      (over
        ? '<i class="ti ti-alert-triangle"></i> Billed <b>' + c.excessDays.toLocaleString() + ' more patient-days</b> than the staffed beds can physically hold — impossible days. Peak census <b>' + c.peakConcurrent + '</b> vs <b>' + c.staffedBeds + '</b> staffed beds (' + c.peakExcess + ' over). Independent of coding review.'
        : '<i class="ti ti-circle-check"></i> Patient-days billed are within physical bed capacity; peak census ' + c.peakConcurrent + ' vs ' + c.staffedBeds + ' staffed beds.') +
      '</div></div>';
  }
  function umHtml(a, cl) {
    if (!cl) return noClaimCard("utilization management");
    if (cl.type === "NCPDP") return pharmacyNaCard("Clinical utilization review (MCG)");
    var d = window.DP.getUtilizationMgmt(cl.id); if (!d) return noClaimCard("utilization management");
    var los = d.lengthOfStay;
    var dl = d.determination.toLowerCase();
    var meets = dl.indexOf("does not") < 0 && dl.indexOf("review") < 0;
    var critRows = d.criteria.map(function (c) { return '<div style="display:flex;gap:9px;align-items:flex-start;padding:6px 0;border-top:0.5px solid var(--border2)"><i class="ti ti-' + (c.met ? "circle-check" : "circle-x") + '" style="color:' + (c.met ? "var(--low)" : "var(--high)") + ';font-size:16px;margin-top:1px"></i><div><div style="font-size:12px' + (c.met ? "" : ";font-weight:500") + '">' + window.APP.esc(c.label) + '</div>' + (c.note ? '<div style="font-size:11px;color:var(--text2)">' + window.APP.esc(c.note) + '</div>' : '') + '</div></div>'; }).join("");
    var losBar = los ? ('<div class="card"><div style="font-weight:500;font-size:12.5px;margin-bottom:7px">Length of stay</div>' + losRow("MCG recommended", los.recommendedDays, los.recommendedDays, los.actualDays, "#98a4b3") + losRow("Actual (billed)", los.actualDays, los.recommendedDays, los.actualDays, los.actualDays > los.recommendedDays ? "var(--high)" : "var(--accent)") + '<div style="font-size:11px;color:var(--text2);margin-top:4px">' + (los.actualDays > los.recommendedDays ? ('<b style="color:var(--high-tx)">' + (los.actualDays - los.recommendedDays) + ' days</b> beyond the MCG-recommended ' + los.recommendedDays + '-day stay.') : 'Within the recommended range.') + '</div></div>') : '';
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      capacityCard(a) +
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div style="font-weight:500;font-size:13px"><i class="ti ti-clipboard-heart" style="color:var(--accent-d)"></i> Utilization management <span class="muted" style="font-weight:400;font-size:11px">· clinical criteria &amp; medical necessity</span></div>' +
      '<span class="tag" style="background:var(--surface)"><i class="ti ti-plug-connected"></i> ' + window.APP.esc(d.source) + ' · ' + d.edition + '</span></div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px">' + umKv("Guideline", d.guideline.code + " — " + d.guideline.title) + umKv("Recommended level of care", d.levelOfCare.recommended) + umKv("Billed level of care", d.levelOfCare.billed) + umKv("Prior authorization", d.priorAuth.required ? ((d.priorAuth.number || "—") + " · " + d.priorAuth.status) : d.priorAuth.status) + '</div></div>' +
      losBar +
      '<div class="card"><div style="font-weight:500;font-size:12.5px;margin-bottom:2px">MCG criteria</div>' + critRows + '</div>' +
      '<div style="background:' + (meets ? "var(--low-bg)" : "var(--high-bg)") + ';border:0.5px solid ' + (meets ? "#bfe0c9" : "#f3c9c9") + ';border-radius:7px;padding:10px 12px;font-size:12px;color:' + (meets ? "var(--low-tx)" : "var(--high-tx)") + '"><i class="ti ti-' + (meets ? "circle-check" : "alert-triangle") + '"></i> <b>Determination:</b> ' + window.APP.esc(d.determination) + '</div>' +
      '</div>';
  }
  function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : b >= 1024 ? Math.round(b / 1024) + " KB" : b + " B"; }
  // Uploaded files and generated artifacts share this list. An artifact carries its
  // body, so it expands in place; an upload is a name only.
  function uploadsListHtml(id) {
    var ups = window.APP.getUploads(id);
    var arts = window.APP.getArtifacts(id);
    if (!ups.length && !arts.length) return '<div class="muted" style="font-size:11.5px;padding:4px 0">No documents attached yet. Use “Attach document” to add supporting records, or generate an AI justification on the Decision tab — every attachment is logged to the audit trail.</div>';
    var artRows = arts.map(function (u, i) {
      return '<div style="border-top:0.5px solid var(--border2)">' +
        '<div class="art-row" data-art="' + i + '" style="display:flex;align-items:center;gap:9px;padding:7px 0;cursor:pointer"><i class="ti ti-file-text" style="color:var(--accent-d);font-size:17px"></i>' +
        '<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:500">' + window.APP.esc(u.name) + '</div>' +
        '<div class="muted" style="font-size:10.5px">' + window.APP.esc(u.by || "") + " · " + window.APP.fmtTs(u.ts) + '</div></div>' +
        '<span class="tag" style="background:var(--accent-l);color:var(--accent-d)"><i class="ti ti-sparkles"></i> AI-drafted</span>' +
        '<i class="ti ti-chevron-down art-caret" style="color:var(--text3);font-size:14px"></i></div>' +
        '<pre class="mono art-body" data-art="' + i + '" style="display:none;margin:0 0 8px;padding:9px 11px;background:var(--surface);border:0.5px solid var(--border);border-radius:6px;font-size:10.5px;line-height:1.55;max-height:240px;overflow:auto;white-space:pre-wrap">' + window.APP.esc(u.body || "") + '</pre></div>';
    }).join("");
    var upRows = ups.map(function (u) {
      return '<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-top:0.5px solid var(--border2)"><i class="ti ti-file-description" style="color:var(--accent-d);font-size:17px"></i>' +
        '<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:500">' + window.APP.esc(u.name) + '</div>' +
        '<div class="muted" style="font-size:10.5px">' + (u.size ? fmtSize(u.size) + " · " : "") + window.APP.esc(u.by || "") + " · " + window.APP.fmtTs(u.ts) + '</div></div>' +
        '<span class="tag" style="background:var(--low-bg);color:var(--low-tx)">attached</span></div>';
    }).join("");
    return artRows + upRows;
  }
  function wireArtifacts(root) {
    (root || document).querySelectorAll(".art-row").forEach(function (row) {
      row.addEventListener("click", function () {
        var i = row.getAttribute("data-art");
        var body = (root || document).querySelector('.art-body[data-art="' + i + '"]'); if (!body) return;
        var open = body.style.display !== "none";
        body.style.display = open ? "none" : "block";
        var c = row.querySelector(".art-caret"); if (c) c.style.transform = open ? "" : "rotate(180deg)";
      });
    });
  }
  function wireEvidenceDocs(id, a, cl) {
    var rows = document.querySelectorAll(".ev-doc-row");
    if (!rows.length) return;
    var kind = a.mode === "prepay" ? "Pending claim" : "Lead";
    var render = function (key) {
      var box = document.getElementById("c-ev-doc"); if (box) box.innerHTML = docContent(key, id, a, cl);
      document.querySelectorAll(".ev-doc-row").forEach(function (r) { r.style.borderColor = r.getAttribute("data-doc") === key ? "var(--accent-d)" : "var(--border)"; });
    };
    rows.forEach(function (r) {
      r.addEventListener("click", function () {
        var key = r.getAttribute("data-doc");
        render(key);
        window.APP.auditLog(key === "mr" ? "MEDICAL_RECORD_VIEWED" : "EVIDENCE_VIEWED", kind + " #" + id + (key === "mr" ? "" : " · " + key));
      });
    });
    render("mr"); // preview the medical record by default (no audit entry until the reviewer interacts)
  }
  // expand/collapse a claim line's detail row
  function wireClaimLines(root) {
    root.querySelectorAll(".cl-line").forEach(function (row) {
      row.addEventListener("click", function () {
        var i = row.getAttribute("data-i");
        var d = root.querySelector('.cl-detail[data-i="' + i + '"]'); if (!d) return;
        var open = d.style.display !== "none";
        d.style.display = open ? "none" : "table-row";
        var c = row.querySelector(".cl-caret"); if (c) c.style.transform = open ? "" : "rotate(180deg)";
      });
    });
  }
  function wireEvidenceUploads(id) {
    var btn = document.getElementById("c-upload-btn"), input = document.getElementById("c-upload-input");
    if (!btn || !input) return;
    btn.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      var f = input.files && input.files[0]; if (!f) return;
      window.APP.addUpload(id, f.name, f.size); input.value = "";
      var list = document.getElementById("c-uploads-list");
      list.innerHTML = uploadsListHtml(id);
      wireArtifacts(list);
    });
  }
  function defaultRecordsRequest(a) {
    var m = {
      "Upcoding": "Itemized progress notes and E/M documentation supporting the level billed.",
      "Unbundling": "Operative report and documentation of a distinct procedural service for the modifier-59 lines.",
      "Phantom billing": "Attendance logs, appointment records and proof of service for the billed dates.",
      "Residential length-of-stay abuse": "Admission/discharge records and medical-necessity documentation for the full length of stay.",
      "Deceased patient": "Date-of-death verification and service records for the dates billed.",
      "Kickback / self-referral": "Referral agreements, financial arrangements and ownership disclosures between the linked entities."
    };
    return m[a.fwaType] || "Itemized medical records and documentation supporting the billed services.";
  }

  // ---------- medical-records request (channel + status lifecycle) ----------
  // Left-rail panel. Three states: no request → the compose form; sent/awaiting →
  // the tracking card with the response clock; received → the closed-out receipt.
  function recordsPanelHtml(id, a) {
    var r = window.APP.recordsRequestFor(id);
    if (!r) {
      return '<button class="btn" id="c-req" style="width:100%;font-size:11px"><i class="ti ti-plus"></i> Request additional records</button>' +
        '<div id="c-req-form"></div>';
    }
    return recordsTrackHtml(id, r);
  }
  function recordsComposeHtml(id, a) {
    var contact = window.DP.getProviderContact(a.providerId) || {};
    var def = (window.APP.state.recordsRequestText || {})[id] || defaultRecordsRequest(a);
    var chans = window.APP.RECORDS_CHANNELS.map(function (ch, i) {
      return '<label class="c-rq-ch" style="display:flex;gap:7px;align-items:flex-start;padding:6px 7px;border:0.5px solid ' + (i === 0 ? "var(--accent)" : "var(--border)") + ';border-radius:6px;margin-bottom:4px;cursor:pointer;background:' + (i === 0 ? "var(--accent-l)" : "#fff") + '">' +
        '<input type="radio" name="c-rq-ch" value="' + ch.c + '"' + (i === 0 ? " checked" : "") + ' style="margin-top:1px">' +
        '<div style="min-width:0"><div style="font-size:11.5px;font-weight:500"><i class="ti ti-' + ch.icon + '" style="color:var(--accent-d)"></i> ' + ch.l + '</div>' +
        '<div style="font-size:10px;color:var(--text2)">' + ch.sub + '</div></div></label>';
    }).join("");
    return '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:7px;padding:8px 9px;margin-top:6px">' +
      '<div style="font-size:10.5px;color:var(--text2);margin-bottom:4px">Channel</div>' + chans +
      '<div id="c-rq-to" style="font-size:10px;color:var(--text2);margin:2px 0 6px"></div>' +
      '<div style="font-size:10.5px;color:var(--text2);margin-bottom:4px">Records to request <span style="color:var(--text3)">(editable)</span></div>' +
      '<textarea id="c-req-text" class="input" style="min-height:52px;font-size:11.5px">' + window.APP.esc(def) + '</textarea>' +
      '<div style="display:flex;gap:6px;margin-top:6px"><button class="btn" id="c-req-cancel" style="flex:none;font-size:11px">Cancel</button>' +
      '<button class="btn primary" id="c-req-send" style="flex:1;font-size:11px"><i class="ti ti-send"></i> Send request</button></div></div>';
  }
  function recordsStepper(status) {
    var cur = window.APP.RECORDS_STEPS.findIndex(function (s) { return s.c === status; });
    return '<div style="display:flex;align-items:center;margin:2px 0 8px">' + window.APP.RECORDS_STEPS.map(function (s, i) {
      var done = i < cur, at = i === cur;
      var bg = done ? "var(--accent)" : at ? "#fff" : "var(--border2)";
      var bd = done || at ? "var(--accent)" : "var(--border)";
      var dot = '<div style="width:12px;height:12px;border-radius:50%;flex:none;background:' + bg + ';border:1.5px solid ' + bd + ';display:flex;align-items:center;justify-content:center">' + (done ? '<i class="ti ti-check" style="color:#fff;font-size:8px"></i>' : at ? '<span style="width:4px;height:4px;border-radius:50%;background:var(--accent);display:block"></span>' : '') + '</div>';
      var line = i < window.APP.RECORDS_STEPS.length - 1 ? '<div style="flex:1;height:1.5px;background:' + (done ? "var(--accent)" : "var(--border2)") + '"></div>' : '';
      return dot + line;
    }).join("") + '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:8.5px;color:var(--text3);margin-bottom:8px">' +
      window.APP.RECORDS_STEPS.map(function (s) { return '<span>' + s.l.split(" ")[0] + '</span>'; }).join("") + '</div>';
  }
  function recordsTrackHtml(id, r) {
    var ch = window.APP.recordsChannel(r.channel);
    var received = r.status === "received";
    var daysLeft = window.APP.recordsDaysLeft(r);
    var overdue = daysLeft != null && daysLeft < 0;
    var clock = received
      ? '<div style="font-size:10.5px;color:var(--low-tx)"><i class="ti ti-circle-check"></i> Received ' + window.APP.fmtDate(r.receivedAt) + ' · “' + window.APP.esc(r.receivedFile.name) + '” filed to evidence</div>'
      : '<div style="font-size:10.5px;color:' + (overdue ? "var(--high-tx)" : "var(--text2)") + '"><i class="ti ti-clock"></i> Response due ' + window.APP.fmtDate(r.dueAt) + (daysLeft != null ? ' · ' + (overdue ? Math.abs(daysLeft) + "d overdue" : daysLeft + "d left") : "") + '</div>';
    var actions = received ? ''
      : '<div style="display:flex;gap:5px;margin-top:7px">' +
        (r.channel === "portal"
          ? '<button class="btn primary" id="c-req-portal" style="flex:1;font-size:11px"><i class="ti ti-external-link"></i> Open provider portal</button>'
          : '<button class="btn primary" id="c-req-receive" style="flex:1;font-size:11px"><i class="ti ti-mail-check"></i> Log records received</button>') +
        '<button class="btn" id="c-req-cancel2" style="flex:none;font-size:11px" title="Withdraw request"><i class="ti ti-x"></i></button></div>';
    return '<div style="background:var(--surface);border:0.5px solid ' + (received ? "#bfe0c9" : overdue ? "#f3c9c9" : "var(--border)") + ';border-radius:7px;padding:9px 10px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><i class="ti ti-' + ch.icon + '" style="color:var(--accent-d)"></i>' +
      '<span style="font-size:11.5px;font-weight:500">Records request</span>' +
      '<span class="tag" style="margin-left:auto;background:' + (received ? "var(--low-bg)" : "var(--med-bg)") + ';color:' + (received ? "var(--low-tx)" : "var(--med-tx)") + '">' + (received ? "Received" : r.status === "sent" ? "Sent" : "Awaiting") + '</span></div>' +
      recordsStepper(r.status) +
      '<div style="font-size:10.5px;color:var(--text2);line-height:1.55">' + ch.l + ' → <span class="mono">' + window.APP.esc(r.recipient) + '</span><br>' +
      'Conf. <span class="mono">' + window.APP.esc(r.confirmation) + '</span>' + (r.pages ? ' · ' + r.pages + ' pp' : '') + ' · sent ' + window.APP.fmtDate(r.sentAt) + '</div>' +
      '<div style="font-size:10.5px;color:var(--text2);margin-top:4px">' + window.APP.esc(r.items || "Supporting documentation") + '</div>' +
      '<div style="margin-top:6px">' + clock + '</div>' + actions + '</div>';
  }
  function wireRecords(id, a) {
    var openBtn = document.getElementById("c-req");
    if (openBtn) openBtn.addEventListener("click", function () {
      document.getElementById("c-req-form").innerHTML = recordsComposeHtml(id, a);
      openBtn.style.display = "none";
      wireRecordsCompose(id, a);
    });
    wireRecordsTrack(id, a);
  }
  function wireRecordsCompose(id, a) {
    var contact = window.DP.getProviderContact(a.providerId) || {};
    var toLine = function () {
      var ch = (document.querySelector('input[name="c-rq-ch"]:checked') || {}).value || "fax";
      var to = ch === "fax" ? contact.fax : ch === "email" ? contact.email : contact.portal;
      document.getElementById("c-rq-to").innerHTML = '<i class="ti ti-arrow-narrow-right"></i> ' + window.APP.esc(to) + ' · Attn: ' + window.APP.esc(contact.attention || "HIM");
    };
    document.querySelectorAll('.c-rq-ch').forEach(function (lab) {
      lab.querySelector("input").addEventListener("change", function () {
        document.querySelectorAll('.c-rq-ch').forEach(function (l) { var on = l.querySelector("input").checked; l.style.borderColor = on ? "var(--accent)" : "var(--border)"; l.style.background = on ? "var(--accent-l)" : "#fff"; });
        toLine();
      });
    });
    toLine();
    document.getElementById("c-req-cancel").addEventListener("click", function () { rerender(id); });
    document.getElementById("c-req-send").addEventListener("click", function () {
      var ch = (document.querySelector('input[name="c-rq-ch"]:checked') || {}).value || "fax";
      var txt = document.getElementById("c-req-text").value.trim();
      (window.APP.state.recordsRequestText = window.APP.state.recordsRequestText || {})[id] = txt || defaultRecordsRequest(a);
      window.APP.requestRecords(id, { channel: ch, items: txt || defaultRecordsRequest(a) });
      rerender(id);
    });
  }
  function wireRecordsTrack(id, a) {
    var recv = document.getElementById("c-req-receive");
    if (recv) recv.addEventListener("click", function () { window.APP.receiveRecords(id, { name: "provider-records_Lead-" + id + ".pdf", size: 348000, via: (window.APP.recordsRequestFor(id) || {}).channel }); rerender(id); });
    var portal = document.getElementById("c-req-portal");
    if (portal) portal.addEventListener("click", function () { window.APP.openPortal(id); });
    var cancel = document.getElementById("c-req-cancel2");
    if (cancel) cancel.addEventListener("click", function () { window.APP.cancelRecordsRequest(id); rerender(id); });
  }

  // ---------- Analysis (decision-supporting graphs) ----------
  function card(title, body) { return '<div class="card"><div style="font-weight:500;font-size:13px;margin-bottom:8px">' + title + '</div>' + body + '</div>'; }
  function analysisHtml(a) {
    var p = a.provider;
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      exposureBreakdown(a) + emMix(p) + volumeChart(p, a) + '</div>';
  }
  function exposureBreakdown(a) {
    var cl = a.claim, prepay = a.mode === "prepay";
    var billed = cl ? cl.billedAmount : 0, allowed = cl ? cl.allowedAmount : 0, paid = cl ? cl.paidAmount : 0;
    var max = Math.max(billed, allowed, paid, prepay ? allowed : 0, 1);
    var bar = function (label, val, color) { var w = Math.round(val / max * 100); return '<div style="margin-bottom:7px"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:2px"><span>' + label + '</span><span style="font-weight:600">' + window.DP.usd(val) + '</span></div><div style="height:9px;background:var(--border2);border-radius:5px;overflow:hidden"><div style="height:100%;width:' + w + '%;background:' + color + '"></div></div></div>'; };
    var bars = bar("Billed (this claim)", billed, "#98a4b3") + bar("Allowed", allowed, "#6b7a8d") +
      (prepay ? bar("Exposure — at risk (pre-pay)", allowed, "var(--high)") : bar("Exposure — paid (post-pay)", paid, "var(--ink)"));
    var callout = prepay
      ? '<div style="background:var(--high-bg);border:0.5px solid #f3c9c9;border-radius:7px;padding:8px 10px;margin-top:6px;font-size:11.5px;color:var(--high-tx)"><b>' + window.DP.usd(a.exposurePre || allowed) + '</b> at risk — nothing is paid yet. Denying or holding this claim keeps that money from leaving.</div>'
      : '<div style="background:var(--high-bg);border:0.5px solid #f3c9c9;border-radius:7px;padding:8px 10px;margin-top:6px;font-size:11.5px;color:var(--high-tx)"><b>' + window.DP.usd(a.exposurePost || 0) + '</b> estimated improper across this provider’s flagged pattern (not just this one claim) — recoverable if confirmed.</div>';
    return card("Exposure breakdown <span class=\"muted\" style=\"font-weight:400;font-size:11px\">· exposure type: " + exposureType(a) + "</span>", bars + callout);
  }
  function emMix(p) {
    var share = p.em99215ShareComputed; if (share == null) return "";
    var peer = (window.DP.getPeerBenchmark("internal_medicine_em") || {}).median99215Share || 0.14;
    var bar = function (label, val, color) { var w = Math.round(val * 100); return '<div style="margin-bottom:7px"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:2px"><span>' + label + '</span><span style="font-weight:600">' + w + '%</span></div><div style="height:9px;background:var(--border2);border-radius:5px;overflow:hidden"><div style="height:100%;width:' + w + '%;background:' + color + '"></div></div></div>'; };
    return card("E/M level mix vs peers", bar("This provider · 99215 share", share, "var(--high)") + bar("Specialty peer median", peer, "#6b7a8d") + '<div style="font-size:11px;color:var(--text2)">Share of established-patient visits billed at the highest level (99215). A large gap above the peer median is the upcoding signal.</div>');
  }
  function volumeChart(p, a) {
    var h = p.history || []; if (!h.length) return "";
    var max = Math.max.apply(null, h.map(function (m) { return m.claims; }).concat([1]));
    var W = 380, H = 92, bw = W / h.length;
    var bars = h.map(function (m, i) { var bh = Math.round(m.claims / max * (H - 20)); var x = i * bw; var flg = m.flagged > 0; return '<rect x="' + (x + 2) + '" y="' + (H - 16 - bh) + '" width="' + (bw - 4) + '" height="' + Math.max(bh, 1) + '" fill="' + (flg ? "var(--high)" : "#c2cad4") + '" rx="1.5"></rect>'; }).join("");
    var labels = h.map(function (m, i) { return (i % 3 === 0) ? '<text x="' + (i * bw + bw / 2) + '" y="' + (H - 3) + '" font-size="8" text-anchor="middle" fill="#8a95a3" font-family="IBM Plex Mono,monospace">' + m.month.slice(2) + '</text>' : ""; }).join("");
    var caption = a.fwaType === "Frequency / over-utilization" ? "Claim volume by month. The frequency flag is a single-patient spike, not a broad volume increase — open the medical record before recovering." : "Claim volume by month; red bars = months with flagged claims.";
    return card("Claim volume over time", '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" style="max-width:' + W + 'px;display:block">' + bars + labels + '</svg><div style="font-size:11px;color:var(--text2)">' + caption + '</div>');
  }
  function reportCardSnippet(p) {
    var gs = p.groupScores || []; if (!gs.length) return "";
    var rows = gs.map(function (g) {
      var w = Math.round(g.score / 100 * 100), pw = Math.round(g.peer / 100 * 100);
      return '<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px"><span' + (g.outlier ? ' style="color:var(--high-tx);font-weight:500"' : '') + '>' + g.group + (g.outlier ? ' ▲' : '') + '</span><span class="mono" style="font-size:10.5px;color:var(--text3)">' + g.score + ' vs ' + g.peer + '</span></div><div style="height:7px;background:var(--border2);border-radius:4px;position:relative;overflow:hidden"><div style="position:absolute;left:' + pw + '%;top:0;bottom:0;width:1px;background:#98a4b3"></div><div style="height:100%;width:' + w + '%;background:' + (g.outlier ? "var(--high)" : "#c2cad4") + '"></div></div></div>';
    }).join("");
    return card("Provider report card", rows + '<div style="font-size:11px;color:var(--accent-d);cursor:pointer;margin-top:2px" id="c-openrc"><i class="ti ti-external-link"></i> Open full report card</div>');
  }

  // ---------- Network ----------
  function networkHtml() {
    return '<div class="card" id="c-collusion-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px"><div style="font-weight:500;font-size:13px"><i class="ti ti-affiliate" style="color:var(--high)"></i> Provider collusion network</div>' +
      '<span style="display:flex;gap:12px;align-items:center"><span class="muted" style="font-size:11px">claim → provider → network</span><span id="c-net-full" style="font-size:11.5px;color:var(--accent-d);cursor:pointer"><i class="ti ti-arrows-maximize"></i> Open full network</span></span></div>' +
      '<div id="c-collusion-narr" style="margin-bottom:9px"></div>' +
      '<div id="c-collusion-graph" style="background:var(--surface);border:0.5px solid var(--border);border-radius:8px;overflow:hidden"></div>' +
      '<div id="c-collusion-legend" class="legend" style="margin:8px 2px 0"></div></div>';
  }
  function renderCollusion(p, id) {
    var cardEl = document.getElementById("c-collusion-card");
    if (!cardEl || !window.Collusion || !p.id) { if (cardEl) cardEl.style.display = "none"; return; }
    var s = window.Collusion.analyze(p.id);
    document.getElementById("c-collusion-narr").innerHTML = window.Collusion.narrativeHtml(s);
    var graph = document.getElementById("c-collusion-graph"), legend = document.getElementById("c-collusion-legend");
    if (s && s.isRing) {
      window.Collusion.render(graph, p.id, { height: 300 });
      legend.innerHTML = collusionLegend(s);
    } else { graph.style.display = "none"; legend.style.display = "none"; }
    var full = document.getElementById("c-net-full");
    if (full) full.addEventListener("click", function () { window.APP.auditLog("NETWORK_VIEWED", "Claim #" + id + " · " + p.name); window.APP.nav("network"); });
  }
  function collusionLegend(s) {
    var out = [lgDot("#10243b", "Business entity"), lgDot("#0f6e56", "Provider in this case"), lgDot(s.kind === "chain" ? "#c6362f" : "#c77d11", "Linked provider"), lgDot("#378add", "Cross-billed veteran")];
    if (s.sharedTin) out.push(lgLine("#c6362f", 3, "Shared TIN"));
    if (s.sharedRegistration) out.push(lgLine("#b5730e", 2, "Same registration"));
    if (s.sharedOfficer) out.push(lgLine("#7a3aa0", 2, "Same officer"));
    if (s.referralCount) out.push(lgLine("#0f6e56", 2, "Referral"));
    out.push(lgLine("#8a95a3", 2, "Shared patients"));
    return out.join("");
  }
  function lgDot(color, label) { return '<span class="lg"><span class="dot" style="border-color:' + color + ';background:' + color + '26"></span>' + label + '</span>'; }
  function lgLine(color, w, label) { return '<span class="lg"><span style="width:16px;height:0;border-top:' + w + 'px solid ' + color + '"></span>' + label + '</span>'; }

  // ---------- History ----------
  // Every action on this lead, newest first — the "who did what, when" record an
  // investigator needs when a case is handed over or challenged on appeal.
  var HIST_ICON = {
    LEAD_CREATED: ["flag", "var(--text2)"], CASE_ASSIGNED: ["user-plus", "var(--accent-d)"],
    DECISION_CONFIRM: ["gavel", "var(--high)"], DECISION_DISMISS: ["circle-x", "var(--text2)"], DECISION_ESCALATE: ["arrow-up-right", "var(--med)"],
    PREPAY_PAY: ["check", "var(--low)"], PREPAY_HOLD: ["clock-hour-4", "var(--med)"], PREPAY_DENY: ["ban", "var(--high)"],
    SUBMITTED_FOR_REVIEW: ["send", "var(--accent-d)"], SUPERVISOR_APPROVED: ["circle-check", "var(--low)"], SUPERVISOR_RETURNED: ["corner-up-left", "var(--med)"],
    RECORDS_REQUESTED: ["mail-forward", "var(--accent-d)"], RECORDS_SENT: ["send", "var(--accent-d)"], RECORDS_AWAITING: ["clock-hour-4", "var(--med)"], RECORDS_RECEIVED: ["mail-check", "var(--low)"], RECORDS_REQUEST_CANCELLED: ["x", "var(--text2)"],
    MEDICAL_RECORD_VIEWED: ["eye", "var(--text3)"], EVIDENCE_VIEWED: ["eye", "var(--text3)"], PRECEDENT_VIEWED: ["history", "var(--text3)"], NETWORK_VIEWED: ["share-3", "var(--text3)"],
    DOCUMENT_UPLOADED: ["paperclip", "var(--accent-d)"], NOTE_ADDED: ["message", "var(--accent-d)"],
    AI_JUSTIFICATION_DRAFTED: ["sparkles", "var(--accent-d)"], AI_JUSTIFICATION_ATTACHED: ["file-text", "var(--accent-d)"],
    RECORD_EDITED: ["edit", "var(--med)"], RECORD_REVERTED: ["arrow-back-up", "var(--text2)"],
    CASE_OPENED: ["folder-plus", "var(--med)"], CASE_UPDATED: ["folder", "var(--accent-d)"], CASE_LINK: ["link", "var(--accent-d)"],
    RECOVERY_SUBMITTED: ["currency-dollar", "var(--high)"], CASE_CLOSED: ["archive", "var(--text2)"]
  };
  function histLabel(action) {
    return String(action || "").toLowerCase().replace(/_/g, " ")
      .replace(/^./, function (c) { return c.toUpperCase(); })
      // sentence-casing would otherwise render these acronyms as "Ai", "Cms", "Cpt"
      .replace(/\bai\b/gi, "AI").replace(/\bcms\b/gi, "CMS").replace(/\bcpt\b/gi, "CPT");
  }
  function historyHtml(id) {
    var rows = window.APP.historyFor(id);
    var counts = {};
    rows.forEach(function (r) { var k = r.action === "NOTE_ADDED" ? "notes" : /VIEWED/.test(r.action) ? "views" : "actions"; counts[k] = (counts[k] || 0) + 1; });
    var feed = rows.map(function (r) {
      var ic = HIST_ICON[r.action] || ["point", "var(--text3)"];
      var initials = String(r.user || "?").split(" ").map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
      return '<div style="display:flex;gap:10px;padding:9px 0;border-top:0.5px solid var(--border2)">' +
        '<div style="width:24px;height:24px;flex:none;border-radius:50%;background:var(--surface);border:0.5px solid var(--border);display:flex;align-items:center;justify-content:center"><i class="ti ti-' + ic[0] + '" style="color:' + ic[1] + ';font-size:13px"></i></div>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:11px;color:var(--text2)"><span style="font-weight:600;color:var(--ink)">' + histLabel(r.action) + '</span>' +
        (r.kind === "note" ? ' <span class="tag" style="background:var(--accent-l);color:var(--accent-d)">note</span>' : '') + '</div>' +
        '<div style="font-size:12.5px;color:var(--text);margin-top:2px;line-height:1.5">' + window.APP.esc(r.text) + '</div>' +
        '<div style="font-size:10.5px;color:var(--text3);margin-top:3px">' + window.APP.esc(r.user || "—") + (r.role ? " · " + window.APP.esc(r.role) : "") + ' · ' + window.APP.fmtTs(r.ts) + '</div>' +
        '</div><div class="avatar" style="width:22px;height:22px;flex:none;font-size:9px">' + initials + '</div></div>';
    }).join("");
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">' +
      stat("Actions", (counts.actions || 0) + ' <span style="font-size:10px;font-weight:500;color:var(--text2)">on this lead</span>') +
      stat("Notes", counts.notes || 0) +
      stat("Record views", counts.views || 0) +
      '</div>' +
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">' +
      '<div style="font-weight:500;font-size:13px"><i class="ti ti-timeline-event" style="color:var(--accent-d)"></i> History <span class="muted" style="font-weight:400;font-size:11px">· every action on this lead, newest first — the full chain of custody</span></div>' +
      '<span class="muted" style="font-size:11px">' + rows.length + ' event' + (rows.length === 1 ? '' : 's') + '</span></div>' +
      (feed || '<div class="muted" style="font-size:12px;padding:8px 0">No activity recorded yet.</div>') + '</div></div>';
  }

  // ---------- Similar cases ----------
  // Prior adjudicated cases of the same FWA type — the precedent an analyst leans on
  // to decide. Its own tab (SME feedback: it was buried on the Decision tab).
  function simRowHtml(s) {
    var conf = s.outcome === "Confirmed";
    return '<div class="prec-row" data-prec="' + s.id + '" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-top:0.5px solid var(--border2);cursor:pointer">' +
      '<span class="pill ' + (conf ? "p-conf" : "p-dis") + '">' + s.outcome + '</span>' +
      '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500">' + window.APP.esc(s.provider) + ' <span class="muted" style="font-weight:400">· ' + window.APP.esc(s.specialty) + '</span></div><div style="font-size:11px;color:var(--text2)">' + window.APP.esc(s.note) + '</div></div>' +
      '<div style="text-align:right;white-space:nowrap"><div style="font-size:12px;font-weight:500">' + (conf ? window.DP.usd(s.recovered) + " recovered" : "—") + '</div><div class="mono" style="font-size:10px;color:var(--text3)">#' + s.id + ' · ' + s.adjudicatedDate + '</div></div></div>';
  }
  function similarHtml(a) {
    var sims = window.DP.getSimilarAdjudicated(a.fwaType, 8);
    var confirmed = sims.filter(function (s) { return s.outcome === "Confirmed"; });
    var totalExp = sims.reduce(function (s, x) { return s + (x.exposure || 0); }, 0);
    var totalRec = confirmed.reduce(function (s, x) { return s + (x.recovered || 0); }, 0);
    var rate = sims.length ? Math.round(confirmed.length / sims.length * 100) : 0;
    if (!sims.length) {
      return '<div class="card" style="text-align:center;padding:28px"><i class="ti ti-history-off" style="font-size:26px;color:var(--text3)"></i>' +
        '<div style="font-size:12.5px;color:var(--text2);margin-top:8px">No prior adjudicated cases of type “' + window.APP.esc(a.fwaType) + '”.</div>' +
        '<div style="font-size:11px;color:var(--text3);margin-top:3px">This lead has no precedent to lean on — document your rationale carefully.</div></div>';
    }
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">' +
      stat("Prior cases", sims.length + ' <span style="font-size:10px;font-weight:500;color:var(--text2)">' + window.APP.esc(a.fwaType) + '</span>') +
      stat("Confirmed", '<span style="color:' + (rate >= 60 ? "var(--high-tx)" : "var(--text)") + '">' + confirmed.length + '/' + sims.length + ' <span style="font-size:10px;font-weight:500">' + rate + '%</span></span>') +
      stat("Exposure reviewed", window.DP.usd(totalExp)) +
      stat("Recovered", window.DP.usd(totalRec)) +
      '</div>' +
      '<div class="card" style="background:var(--accent-l);border-color:#cfe7e3"><div style="font-size:12px;color:var(--accent-d);line-height:1.6"><i class="ti ti-scale"></i> <b>' + rate + '% of prior “' + window.APP.esc(a.fwaType) + '” cases were confirmed</b>' +
      (rate >= 60 ? ' — precedent leans toward confirming. Check whether this lead’s documentation differs from the dismissed ones below.' : ' — precedent is mixed. Read the dismissed cases below before recovering.') + '</div></div>' +
      '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:500;font-size:13px"><i class="ti ti-history" style="color:var(--accent-d)"></i> Similar adjudicated cases</div><span class="muted" style="font-size:11px">click a case for the full adjudication</span></div>' +
      sims.map(simRowHtml).join("") + '<div id="c-prec"></div></div>' +
      '</div>';
  }

  // ---------- Decision (mode-aware) ----------
  function decisionHtml(id, a, cl) {
    var sims = window.DP.getSimilarAdjudicated(a.fwaType, 8);
    var confirmed = sims.filter(function (s) { return s.outcome === "Confirmed"; }).length;
    var simLink = sims.length
      ? '<div class="card" style="display:flex;align-items:center;gap:9px;padding:9px 11px"><i class="ti ti-history" style="color:var(--accent-d)"></i>' +
        '<div style="flex:1;font-size:12px;color:var(--text2)"><b style="color:var(--ink)">' + confirmed + ' of ' + sims.length + '</b> prior ' + window.APP.esc(a.fwaType) + ' cases were confirmed.</div>' +
        '<span id="c-gosim" style="font-size:11.5px;color:var(--accent-d);cursor:pointer;font-weight:500;white-space:nowrap">Similar cases →</span></div>'
      : '';
    return '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<div class="card" id="c-decision"></div>' +
      simLink +
      '<div class="card"><div style="font-weight:500;font-size:13px;margin-bottom:8px">Case timeline</div>' + timelineHtml(id, a, cl) + '</div>' +
      '</div>';
  }
  function wirePrecedents(id) {
    document.querySelectorAll(".prec-row").forEach(function (row) {
      row.addEventListener("click", function () {
        var pr = window.DP.getPrecedent(row.getAttribute("data-prec"));
        if (!pr) return;
        document.getElementById("c-prec").innerHTML = precDetail(pr);
        window.APP.auditLog("PRECEDENT_VIEWED", "Adjudicated case #" + pr.id);
      });
    });
  }

  // ---------- structured decision reason (the dropdown) ----------
  // Hidden until an outcome is picked — the reason list is outcome-specific.
  function reasonBlockHtml() {
    return '<div id="c-reasonbox" style="display:none;margin-bottom:10px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">' +
      '<span style="font-size:11px;color:var(--text2)"><span id="c-reason-label">Reason</span> <span style="color:var(--high-tx)">*</span> <span style="color:var(--text3)">· coded — drives reporting &amp; the provider notice</span></span>' +
      '<span id="c-reason-sugg" class="muted" style="font-size:10.5px"></span></div>' +
      '<select id="c-reason" class="input" style="font-size:12px"></select></div>';
  }
  // Fill the dropdown for the chosen outcome and preselect the suggested reason.
  function fillReasons(a, outcome, labelText) {
    var box = document.getElementById("c-reasonbox"), sel = document.getElementById("c-reason");
    if (!box || !sel) return;
    if (!outcome) { box.style.display = "none"; return; }
    var list = window.APP.reasonsFor(outcome), sugg = window.APP.suggestedReason(a, outcome);
    sel.innerHTML = '<option value="">— select a reason —</option>' + list.map(function (r) {
      return '<option value="' + r.c + '"' + (r.c === sugg ? " selected" : "") + '>' + r.c + ' · ' + window.APP.esc(r.t) + '</option>';
    }).join("");
    var lab = document.getElementById("c-reason-label"); if (lab) lab.textContent = labelText || "Reason";
    var sg = document.getElementById("c-reason-sugg");
    if (sg) sg.innerHTML = sugg ? '<i class="ti ti-sparkles" style="color:var(--accent-d)"></i> suggested from the evidence — override if needed' : "";
    box.style.display = "block";
  }
  // ---------- AI justification memo (generate → review → attach) ----------
  // The analyst never attaches something they haven't read: generate shows the memo,
  // attaching is a second, deliberate click.
  function aiJustBlockHtml() {
    return '<div id="c-aijust" style="margin-bottom:10px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">' +
      '<span style="font-size:11px;color:var(--text2)"><i class="ti ti-file-text" style="color:var(--accent-d)"></i> AI justification <span style="color:var(--text3)">· a formal memo for the case file, the provider notice or an appeal</span></span>' +
      '<button id="c-aigen" class="btn" style="padding:4px 9px;font-size:11px" disabled><i class="ti ti-sparkles"></i> Generate justification</button></div>' +
      '<div id="c-aijust-out"></div></div>';
  }
  function aiJustPreviewHtml(memo) {
    return '<div style="border:0.5px solid var(--border);border-radius:8px;overflow:hidden;margin-top:7px">' +
      '<div style="background:var(--surface);padding:7px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;border-bottom:0.5px solid var(--border)">' +
      '<span style="font-size:11.5px;font-weight:500"><i class="ti ti-file-text" style="color:var(--accent-d)"></i> Justification memo <span class="muted" style="font-weight:400">· review before attaching</span></span>' +
      '<span style="display:flex;gap:6px"><button class="btn" id="c-ai-insert" style="padding:3px 8px;font-size:11px"><i class="ti ti-arrow-down"></i> Use as my justification</button>' +
      '<button class="btn primary" id="c-ai-attach" style="padding:3px 8px;font-size:11px"><i class="ti ti-paperclip"></i> Attach to lead</button></span></div>' +
      '<pre class="mono" id="c-ai-memo" style="margin:0;padding:10px 12px;font-size:10.5px;line-height:1.55;max-height:220px;overflow:auto;white-space:pre-wrap;background:#fff;color:var(--text)">' + window.APP.esc(memo) + '</pre></div>';
  }
  // Wire the generate/attach flow. getCtx() supplies the live outcome+reason at click
  // time, because both change as the analyst edits the form.
  function wireAiJust(id, a, getCtx, justFieldId) {
    var gen = document.getElementById("c-aigen"); if (!gen) return;
    gen.addEventListener("click", function () {
      var c = getCtx(); if (!c.outcome) return;
      var memo = window.AI.justificationMemo(a, {
        outcome: c.outcome, reason: c.reason, reasonText: window.APP.reasonText(c.outcome, c.reason),
        justification: (document.getElementById(justFieldId) || {}).value || "",
        user: (window.APP.ROLES[window.APP.state.role] || {}).name
      });
      var out = document.getElementById("c-aijust-out");
      out.innerHTML = aiJustPreviewHtml("");
      window.APP.auditLog("AI_JUSTIFICATION_DRAFTED", "Lead #" + id + " · " + c.outcome + (c.reason ? " · " + c.reason : ""));
      // stream it in so the generation reads as live
      var pre = document.getElementById("c-ai-memo"), i = 0;
      var iv = setInterval(function () {
        i += 14; pre.textContent = memo.slice(0, i);
        if (i >= memo.length) { clearInterval(iv); pre.textContent = memo; }
      }, 12);
      document.getElementById("c-ai-insert").addEventListener("click", function () {
        clearInterval(iv); pre.textContent = memo;
        var f = document.getElementById(justFieldId); if (f) { f.value = memo; f.dispatchEvent(new Event("input")); }
      });
      document.getElementById("c-ai-attach").addEventListener("click", function () {
        clearInterval(iv); pre.textContent = memo;
        var name = "AI-justification_Lead-" + id + "_" + c.outcome + ".txt";
        window.APP.addArtifact(id, { name: name, kind: "ai-justification", body: memo });
        out.innerHTML = '<div style="background:var(--low-bg);border:0.5px solid #bfe0c9;border-radius:7px;padding:8px 10px;margin-top:7px;font-size:11.5px;color:var(--low-tx)">' +
          '<i class="ti ti-paperclip"></i> Attached to the lead as <b>' + window.APP.esc(name) + '</b> — it now appears under Evidence › Attached documents and in the History tab.</div>';
      });
    });
  }

  function reasonTag(outcome, code) {
    if (!code) return "";
    var t = window.APP.reasonText(outcome, code);
    return '<div style="margin-top:5px"><span class="tag" style="background:var(--surface);border:0.5px solid var(--border)"><span class="mono">' + code + '</span> · ' + window.APP.esc(t || "") + '</span></div>';
  }

  // prepay: Pay / Hold / Deny
  function renderPrepayDecision(id, a) {
    var box = document.getElementById("c-decision");
    var dec = window.APP.prepayDecisionFor(id);
    if (dec) {
      var m = { pay: ["Cleared to pay", "var(--low-tx)", "circle-check"], hold: ["On hold — records requested", "var(--med-tx)", "clock-hour-4"], deny: ["Denied — payment prevented", "var(--high-tx)", "ban"] }[dec.action];
      box.innerHTML = '<div style="font-weight:500;font-size:13px;margin-bottom:9px">Pre-payment decision</div><div style="display:flex;align-items:flex-start;gap:10px"><i class="ti ti-' + m[2] + '" style="color:' + m[1] + ';font-size:22px"></i><div><div style="font-weight:500;font-size:13px">' + m[0] + ' · ' + window.DP.usd(a.exposurePre || 0) + '</div>' + reasonTag(dec.action, dec.reason) + (dec.justification ? '<div style="font-size:11.5px;color:var(--text2);margin-top:4px">' + window.APP.esc(dec.justification) + '</div>' : '') + '<div style="font-size:11px;color:var(--text3);margin-top:4px">Logged to audit trail · ' + window.APP.fmtTs(dec.ts) + '</div></div></div>';
      return;
    }
    var rec = a.recommendedAction;
    var recTx = { pay: "var(--low-tx)", hold: "var(--med-tx)", deny: "var(--high-tx)" };
    box.innerHTML = '<div style="font-weight:500;font-size:13px;margin-bottom:9px">Pre-payment decision <span class="muted" style="font-weight:400;font-size:11px">· amount at risk ' + window.DP.usd(a.exposurePre || 0) + '</span></div>' +
      (rec ? '<div style="font-size:11.5px;color:var(--text2);margin-bottom:8px"><i class="ti ti-sparkles" style="color:var(--accent-d)"></i> Model recommends <span style="font-weight:600;color:' + recTx[rec] + '">' + ({ pay: "Pay", hold: "Hold for records", deny: "Deny" })[rec] + '</span>.</div>' : "") +
      '<div style="display:flex;gap:8px;margin-bottom:10px">' +
      ppseg("pay", "check", "Pay", "releases payment") + ppseg("hold", "clock-hour-4", "Hold", "request records") + ppseg("deny", "ban", "Deny", "stop payment") + '</div>' +
      '<div id="c-pphint" style="font-size:11.5px;color:var(--text2);margin-bottom:8px;min-height:16px"></div>' +
      reasonBlockHtml() +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px"><span style="font-size:11px;color:var(--text2)">Justification (logged for audit &amp; the provider notice)</span><button id="c-ppdraft" class="btn" style="padding:4px 9px;font-size:11px"><i class="ti ti-sparkles"></i>Draft with AI</button></div>' +
      '<textarea id="c-ppjust" class="input" placeholder="Document your justification…"></textarea>' +
      aiJustBlockHtml() +
      '<button id="c-ppsubmit" class="btn primary" style="margin-top:9px" disabled><i class="ti ti-send"></i> Submit decision</button>';
    var choice = null;
    var segCls = { pay: "on-d", hold: "on-e", deny: "on-c" };
    var hints = { pay: "Releases " + window.DP.usd(a.exposurePre || 0) + " for payment — clean claim.", hold: "Holds the claim and requests supporting records before paying.", deny: "Denies the claim — " + window.DP.usd(a.exposurePre || 0) + " prevented from being paid." };
    var reasonLabels = { pay: "Clearance reason", hold: "Hold reason", deny: "Deny reason" };
    var ppValid = function () { var r = document.getElementById("c-reason"); return !!(choice && r && r.value); };
    var refreshPp = function () {
      document.getElementById("c-ppsubmit").disabled = !ppValid();
      var g = document.getElementById("c-aigen"); if (g) g.disabled = !ppValid();
    };
    wireAiJust(id, a, function () { return { outcome: choice, reason: (document.getElementById("c-reason") || {}).value }; }, "c-ppjust");
    box.querySelectorAll(".seg").forEach(function (s) {
      s.addEventListener("click", function () {
        choice = s.getAttribute("data-d");
        box.querySelectorAll(".seg").forEach(function (x) { x.className = "seg"; });
        s.className = "seg " + segCls[choice];
        document.getElementById("c-pphint").textContent = hints[choice];
        fillReasons(a, choice, reasonLabels[choice]);
        var rs = document.getElementById("c-reason"); if (rs) rs.onchange = refreshPp;
        refreshPp();
      });
    });
    document.getElementById("c-ppdraft").addEventListener("click", function () {
      if (!choice) { document.getElementById("c-pphint").textContent = "Pick a decision first, then draft."; return; }
      var ta = document.getElementById("c-ppjust");
      var t = window.AI.draftRationale(a, choice), i = 0;
      ta.value = "";
      var iv = setInterval(function () { i += 3; ta.value = t.slice(0, i); if (i >= t.length) { clearInterval(iv); ta.value = t; } }, 12);
    });
    document.getElementById("c-ppsubmit").addEventListener("click", function () {
      if (!ppValid()) return;
      window.APP.prepayDecide(id, choice, document.getElementById("c-reason").value, document.getElementById("c-ppjust").value);
      rerender(id);
    });
  }
  function ppseg(d, icon, label, sub) { return '<div class="seg" data-d="' + d + '"><i class="ti ti-' + icon + '"></i> ' + label + '<div class="sub">' + sub + '</div></div>'; }

  // retrospective: Confirm / Dismiss / Escalate
  function renderDecision(id, a, dec) {
    var box = document.getElementById("c-decision");
    if (dec && dec.reviewState !== "returned") {
      var label = { confirm: "Confirm", dismiss: "Dismiss", escalate: "Escalate" }[dec.outcome];
      var icon, color, msg;
      if (dec.reviewState === "pending") { icon = "clock-hour-4"; color = "#3a5578"; msg = label + " submitted — pending supervisor review (Karen Boyd)"; }
      else if (dec.reviewState === "approved") {
        if (dec.outcome === "confirm") { icon = "circle-check"; color = "var(--low)"; msg = "Confirmed · " + window.DP.usd(a.exposurePost) + " submitted for recovery · approved by Karen Boyd"; }
        else { icon = "arrow-up-right"; color = "var(--med)"; msg = "Escalated · Case opened · approved by Karen Boyd"; }
      } else { icon = "circle-x"; color = "var(--text2)"; msg = "Dismissed · false positive logged for model retraining"; }
      var svPanel = "";
      if (dec.reviewState === "pending" && window.APP.isSupervisor()) {
        svPanel = '<div style="border-top:0.5px solid var(--border2);margin-top:10px;padding-top:10px">' +
          '<div style="font-weight:500;font-size:12.5px;margin-bottom:7px"><i class="ti ti-user-shield"></i> Supervisor review (Karen Boyd)</div>' +
          '<div style="display:flex;gap:8px;align-items:center"><input id="sv-note" class="input" placeholder="Return note (optional)…" style="flex:1">' +
          '<button class="btn" id="sv-ret"><i class="ti ti-corner-up-left"></i> Return</button>' +
          '<button class="btn primary" id="sv-appr" style="background:var(--low);border-color:var(--low)"><i class="ti ti-check"></i> Approve</button></div></div>';
      }
      box.innerHTML = '<div style="font-weight:500;font-size:13px;margin-bottom:9px">Decision</div><div style="display:flex;align-items:flex-start;gap:10px"><i class="ti ti-' + icon + '" style="color:' + color + ';font-size:22px"></i><div><div style="font-weight:500;font-size:13px">' + msg + '</div>' + reasonTag(dec.outcome, dec.reason) + (dec.rationale ? '<div style="font-size:11.5px;color:var(--text2);margin-top:4px">' + window.APP.esc(dec.rationale) + '</div>' : '') + '<div style="font-size:11px;color:var(--text3);margin-top:5px">Logged to audit trail · ' + window.APP.fmtTs(dec.ts) + '</div></div></div>' + svPanel;
      if (dec.reviewState === "pending" && window.APP.isSupervisor()) {
        document.getElementById("sv-appr").addEventListener("click", function () { window.APP.supervisorAction(id, "approve"); rerender(id); });
        document.getElementById("sv-ret").addEventListener("click", function () { window.APP.supervisorAction(id, "return", document.getElementById("sv-note").value); rerender(id); });
      }
      return;
    }
    if (window.APP.isSupervisor()) {
      box.innerHTML = '<div style="font-weight:500;font-size:13px;margin-bottom:9px">Decision</div><div class="muted" style="font-size:12px"><i class="ti ti-user-shield"></i> Awaiting analyst decision. Switch to the Analyst role to record a decision.</div>';
      return;
    }
    var returnedNote = (dec && dec.reviewState === "returned") ? (dec.returnNote || "(no note)") : null;
    // Where the lead lands (required when confirming/escalating). The engine ranks
    // the candidate cases and says WHY each is a candidate, so the analyst chooses
    // between explanations rather than reading a flat list of provider names.
    var openCases = window.DP.listCases({ mode: "retrospective" }).filter(function (c) { return !c.closed; });
    var sugg = window.APP.suggestCases(a);
    var best = sugg[0] || null;
    var others = openCases.filter(function (c) { return !sugg.some(function (s) { return s.c.caseKey === c.caseKey; }); });
    var suggRows = sugg.map(function (s, i) {
      return '<label class="c-sugg" style="display:flex;gap:8px;align-items:flex-start;padding:7px 8px;border:0.5px solid ' + (i === 0 ? "#cfe7e3" : "var(--border)") + ';border-radius:7px;margin-bottom:5px;cursor:pointer;background:' + (i === 0 ? "var(--accent-l)" : "#fff") + '">' +
        '<input type="radio" name="c-casemode" value="existing" data-key="' + s.c.caseKey + '" data-name="' + window.APP.esc(s.c.name) + '" data-link="' + s.linkType + '" style="margin-top:2px"' + (i === 0 ? " checked" : "") + '>' +
        '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500">' + window.APP.esc(s.c.name) +
        ' <span class="muted" style="font-weight:400">· CASE-' + s.c.providerId + ' · ' + s.c.leadCount + ' lead' + (s.c.leadCount === 1 ? '' : 's') + ' · ' + window.DP.usd(s.c.exposure || 0) + '</span>' +
        (i === 0 ? ' <span class="tag" style="background:var(--accent);color:#fff">suggested</span>' : '') + '</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:1px">' + window.APP.esc(s.why) + '</div>' +
        '<div style="margin-top:3px"><span class="tag" style="background:#fff;border:0.5px solid var(--border)"><i class="ti ti-link"></i> ' + window.APP.esc(window.APP.leadLinkLabel(s.linkType)) + '</span></div>' +
        '</div></label>';
    }).join("");
    var caseBlockHtml =
      '<div id="c-case" style="display:none;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;padding:9px 11px;margin-bottom:10px">' +
      '<div style="font-size:11.5px;font-weight:500;margin-bottom:2px"><i class="ti ti-folder" style="color:var(--accent-d)"></i> Convert to a case <span style="color:var(--high-tx)">*</span></div>' +
      '<div class="muted" style="font-size:11px;margin-bottom:7px">This lead does not get paid — it has to land somewhere. Add it to an existing case or open a new one.</div>' +
      suggRows +
      '<label style="display:flex;gap:8px;align-items:flex-start;padding:7px 8px;border:0.5px solid var(--border);border-radius:7px;cursor:pointer;background:#fff">' +
      '<input type="radio" name="c-casemode" value="new" style="margin-top:2px"' + (best ? "" : " checked") + '>' +
      '<div><div style="font-size:12px;font-weight:500">Open a new case for ' + window.APP.esc(a.provider ? a.provider.name : "this provider") + '</div>' +
      '<div style="font-size:11px;color:var(--text2);margin-top:1px">' + (best ? "Use this if the lead is unrelated to the cases above." : "No open case is a candidate for this lead.") + '</div></div></label>' +
      (others.length ? '<div style="margin-top:7px"><label style="display:flex;gap:8px;align-items:center;cursor:pointer;font-size:12px">' +
        '<input type="radio" name="c-casemode" value="other"> Add to another open case</label>' +
        '<select id="c-case-sel" class="input" style="margin-top:5px;font-size:12px;display:none">' +
        others.map(function (c) { return '<option value="' + c.caseKey + '" data-name="' + window.APP.esc(c.name) + '">' + window.APP.esc(c.name) + ' · CASE-' + c.providerId + ' (' + c.leadCount + ' lead' + (c.leadCount === 1 ? '' : 's') + (c.multiProvider ? ', ' + c.providerCount + ' providers' : '') + ')</option>'; }).join("") + '</select></div>' : '') +
      '</div>';
    box.innerHTML =
      '<div style="font-weight:500;font-size:13px;margin-bottom:9px">Decision</div>' +
      (returnedNote !== null ? '<div style="background:var(--med-bg);border:0.5px solid #e7c99a;border-radius:7px;padding:8px 10px;font-size:11.5px;color:var(--med-tx);margin-bottom:10px"><i class="ti ti-corner-up-left"></i> Returned by supervisor (Karen Boyd): ' + window.APP.esc(returnedNote) + ' — please revise and resubmit.</div>' : '') +
      '<div style="display:flex;gap:8px;margin-bottom:10px">' +
      '<div class="seg" data-d="c"><i class="ti ti-check"></i> Confirm<div class="sub">improper — convert to a case</div></div>' +
      '<div class="seg" data-d="d"><i class="ti ti-x"></i> Dismiss<div class="sub">clean — payment stands</div></div>' +
      '<div class="seg" data-d="e"><i class="ti ti-arrow-up-right"></i> Escalate<div class="sub">coordinated — convert to a case</div></div></div>' +
      '<div id="c-hint" style="font-size:11.5px;color:var(--text2);margin-bottom:8px;min-height:16px"></div>' +
      caseBlockHtml +
      reasonBlockHtml() +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px"><span style="font-size:11px;color:var(--text2)">Justification (logged for audit &amp; model retraining)</span><button id="c-draft" class="btn" style="padding:4px 9px;font-size:11px"><i class="ti ti-sparkles"></i>Draft with AI</button></div>' +
      '<textarea id="c-rat" class="input" placeholder="Document your justification…"></textarea>' +
      aiJustBlockHtml() +
      '<button id="c-submit" class="btn primary" style="margin-top:9px" disabled><i class="ti ti-send"></i>Submit decision</button>';
    var choice = null;
    var outMap = { c: "confirm", d: "dismiss", e: "escalate" };
    var hints = {
      c: "Confirms improper payment — " + window.DP.usd(a.exposurePost) + " moves to Submitted for recovery. The lead converts to a case below.",
      d: "The claim is clean — payment stands and nothing is recovered. Logged as a false positive so the outcome feeds model retraining; no case is opened.",
      e: "Escalates as coordinated behavior for investigation. The lead converts to a case below."
    };
    var needsCase = function () { return choice === "c" || choice === "e"; };
    var caseValid = function () {
      if (!needsCase()) return true;
      var m = box.querySelector('input[name="c-casemode"]:checked');
      if (!m) return false;
      if (m.value === "other") { var sel = document.getElementById("c-case-sel"); return !!(sel && sel.value); }
      return true;
    };
    var reasonValid = function () { var r = document.getElementById("c-reason"); return !!(r && r.value); };
    var refreshSubmit = function () {
      document.getElementById("c-submit").disabled = !(choice && caseValid() && reasonValid());
      var g = document.getElementById("c-aigen"); if (g) g.disabled = !(choice && reasonValid());
    };
    var reasonLabels = { c: "Confirmation reason", d: "Dismiss reason", e: "Escalation reason" };
    wireAiJust(id, a, function () { return { outcome: outMap[choice], reason: (document.getElementById("c-reason") || {}).value }; }, "c-rat");
    box.querySelectorAll(".seg").forEach(function (s) {
      s.addEventListener("click", function () {
        choice = s.getAttribute("data-d");
        box.querySelectorAll(".seg").forEach(function (x) { x.className = "seg"; });
        s.className = "seg on-" + choice;
        document.getElementById("c-hint").textContent = hints[choice];
        var cb = document.getElementById("c-case"); if (cb) cb.style.display = needsCase() ? "block" : "none";
        fillReasons(a, outMap[choice], reasonLabels[choice]);
        var rs = document.getElementById("c-reason"); if (rs) rs.onchange = refreshSubmit;
        refreshSubmit();
      });
    });
    box.querySelectorAll('input[name="c-casemode"]').forEach(function (r) {
      r.addEventListener("change", function () {
        var sel = document.getElementById("c-case-sel"); if (sel) sel.style.display = (this.value === "other") ? "block" : "none";
        refreshSubmit();
      });
    });
    var caseSelEl = document.getElementById("c-case-sel"); if (caseSelEl) caseSelEl.addEventListener("change", refreshSubmit);
    document.getElementById("c-draft").addEventListener("click", function () {
      if (!choice) { document.getElementById("c-hint").textContent = "Pick a decision first, then draft."; return; }
      var ta = document.getElementById("c-rat");
      var t = window.AI.draftRationale(a, outMap[choice]), i = 0;
      ta.value = "";
      var iv = setInterval(function () { i += 3; ta.value = t.slice(0, i); if (i >= t.length) { clearInterval(iv); ta.value = t; } }, 12);
    });
    document.getElementById("c-submit").addEventListener("click", function () {
      if (!choice || !caseValid() || !reasonValid()) return;
      var rationale = document.getElementById("c-rat").value;
      var reason = document.getElementById("c-reason").value;
      if (needsCase()) {
        var m = box.querySelector('input[name="c-casemode"]:checked');
        if (m && m.value === "existing") {
          // a ranked suggestion — it carries its own case key and link type
          window.APP.setLeadCase(id, { mode: "existing", caseKey: m.getAttribute("data-key"), caseName: m.getAttribute("data-name"), linkType: m.getAttribute("data-link") });
        } else if (m && m.value === "other") {
          var sel = document.getElementById("c-case-sel"), opt = sel.options[sel.selectedIndex];
          var target = window.DP.listCases({ mode: "retrospective" }).find(function (c) { return c.caseKey === sel.value; });
          window.APP.setLeadCase(id, { mode: "existing", caseKey: sel.value, caseName: opt ? opt.getAttribute("data-name") : null, linkType: window.APP.suggestLinkType(a, target) });
        } else { window.APP.setLeadCase(id, { mode: "new", linkType: "same-provider" }); }
      }
      window.APP.applyDecision(id, outMap[choice], rationale, reason);
      rerender(id);
    });
  }

  // A sticky quick-decision bar so the analyst never has to scroll to act.
  function renderStickyBar(id, a, dec, prepay) {
    document.querySelectorAll(".c-sticky").forEach(function (n) { n.remove() });
    if (window.APP.isSupervisor()) return;
    // prepay: hide once triaged. retro: hide once decided, EXCEPT when a supervisor
    // returned it (the analyst still needs to revise & resubmit).
    if (prepay ? !!dec : (dec && dec.reviewState !== "returned")) return;
    var bar = document.createElement("div");
    bar.className = "c-sticky";
    bar.style.cssText = "position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:150;background:var(--ink);border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,0.22);display:flex;align-items:center;gap:7px;padding:7px 12px;font-family:var(--sans)";
    var btn = function (d, label, icon, bg, col) { return '<button class="sbtn" data-d="' + d + '" style="background:' + bg + ';color:' + col + ';border:none;border-radius:7px;padding:6px 12px;font-size:12px;font-weight:500;cursor:pointer;display:flex;align-items:center;gap:5px;font-family:var(--sans)"><i class="ti ti-' + icon + '"></i>' + label + '</button>'; };
    bar.innerHTML = '<span style="color:#93a7bf;font-size:12px;margin:0 3px">Decide:</span>' +
      (prepay
        ? btn("pay", "Pay", "check", "#fff", "#1f5a3d") + btn("hold", "Hold", "clock-hour-4", "rgba(255,255,255,0.12)", "#fff") + btn("deny", "Deny", "ban", "rgba(255,255,255,0.12)", "#fff")
        : btn("c", "Confirm", "check", "#fff", "#8b1a13") + btn("d", "Dismiss", "x", "rgba(255,255,255,0.12)", "#fff") + btn("e", "Escalate", "arrow-up-right", "rgba(255,255,255,0.12)", "#fff"));
    document.getElementById("view").appendChild(bar);
    bar.querySelectorAll(".sbtn").forEach(function (b) { b.onclick = function () { window.Views.claim.gotoDecision(b.getAttribute("data-d")); }; });
  }

  // ---------- export (CSV / Excel / PDF of the case) ----------
  function wireExport(id, a, cl, p, prepay, kind) {
    var clHead = ["CPT", "Description", "Modifiers", "Units", "Billed", "Allowed", "Exposure (" + exposureType(a).toLowerCase() + ")", "Flagged"];
    var clRows = cl ? cl.lines.map(function (l) { return [l.cpt, l.description, (l.modifiers || []).join(" "), l.units, l.billed, l.allowed, lineExposure(l, prepay), (l.violatesRuleIds || []).length ? "Yes" : "No"]; }) : [];
    window.EXPORT.wire("c", {
      csv: function () { window.EXPORT.csv("claim-" + id, clHead, clRows); },
      xls: function () { window.EXPORT.xls("claim-" + id, "Claim " + id, clHead, clRows); },
      pdf: function () {
        var ve = a.veteran, s = window.Collusion ? window.Collusion.analyze(p.id) : null;
        var body = window.EXPORT.kvHtml([
          ["Claim", cl ? cl.claimNumber : "—"], ["Provider", p.name], ["NPI", p.npi], ["Veteran", ve ? ve.name : "—"],
          ["Risk", a.riskScore + "/100"], ["Confidence", a.confidence + "%"], [prepay ? "At risk" : "Exposure", window.DP.usd((prepay ? a.exposurePre : a.exposurePost) || 0)],
          ["FWA type", a.fwaType], ["Status", a.status], ["Source", a.source === "Pattern Recognition" ? "ML/AI" : a.source === "Both" ? "ML/AI + Rules" : "Rules"]
        ]) +
          (a.xai ? "<h2>Why flagged (Explainable AI)</h2><div class='card'>" + window.EXPORT.htmlEsc(a.xai.summary) + "</div>" : "") +
          (cl ? "<h2>Claim line items</h2>" + window.EXPORT.tableHtml(clHead, clRows) : "") +
          ((a.rules && a.rules.length) ? "<h2>Rules fired</h2>" + window.EXPORT.tableHtml(["Code", "Rule", "Source"], a.rules.map(function (r) { return [r.code, r.name, r.source]; })) : "") +
          (s && s.isRing ? "<h2>Collusion network</h2><div class='card'>" + window.EXPORT.htmlEsc((s.kind === "chain" ? "Residential chain — " : "Provider ring — ") + s.providerCount + " providers, " + s.sharedPct + "% shared veterans" + (s.sharedTin ? ", shared TIN " + s.tin : s.sharedRegistration ? ", shared registration " + (s.registration || "") : "") + ".") + "</div>" : "");
        window.EXPORT.pdf(kind + " #" + id + " — " + a.fwaType, body);
      }
    });
  }

  function rerender(id) { window.Views.claim.render(document.getElementById("view"), { id: id }); }
  function assignOptions(cur) { return '<option value="__unassigned__"' + (!cur ? " selected" : "") + '>Unassigned</option>' + window.APP.ANALYSTS.map(function (n) { return '<option value="' + n + '"' + (cur === n ? " selected" : "") + '>' + n + '</option>'; }).join(""); }
  function stat(l, v) { return '<div class="card" style="padding:8px 9px"><div class="l" style="font-size:10.5px;color:var(--text2)">' + l + '</div><div style="font-size:16px;font-weight:600;margin-top:2px">' + v + '</div></div>'; }
  function bandColor(r) { return r >= 80 ? "var(--high-tx)" : r >= 50 ? "var(--med-tx)" : "var(--low-tx)"; }
  function bandLabel(r) { return r >= 80 ? "High" : r >= 50 ? "Medium" : "Low"; }

  function precDetail(pr) {
    var conf = pr.outcome === "Confirmed";
    return '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:7px;padding:10px 12px;margin-top:8px">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px"><span class="pill ' + (conf ? "p-conf" : "p-dis") + '">' + pr.outcome + '</span><span style="font-weight:500;font-size:12.5px">' + window.APP.esc(pr.provider) + '</span><span class="mono" style="font-size:10.5px;color:var(--text3)">#' + pr.id + '</span></div>' +
      '<div style="font-size:11.5px;color:var(--text2);line-height:1.55">' + window.APP.esc(pr.note) + '</div>' +
      '<div style="display:flex;gap:16px;font-size:11px;color:var(--text2);margin-top:7px"><span>Specialty: <span style="color:var(--ink)">' + window.APP.esc(pr.specialty) + '</span></span><span>Exposure: <span style="color:var(--ink)">' + window.DP.usd(pr.exposure) + '</span></span>' + (conf ? '<span>Recovered: <span style="color:var(--low-tx);font-weight:500">' + window.DP.usd(pr.recovered) + '</span></span>' : '') + '</div>' +
      '<div class="mono" style="font-size:10.5px;color:var(--text3);margin-top:5px">Adjudicated ' + pr.adjudicatedDate + ' · ' + window.APP.esc(pr.analyst) + '</div></div>';
  }

  function timelineHtml(id, a, cl) {
    var ev = [];
    if (cl) ev.push({ d: cl.dateOfService, t: "Claim submitted", s: cl.claimNumber + " · " + cl.type + (a.mode === "prepay" ? " · pending payment" : " · paid " + window.DP.usd(cl.paidAmount)), ic: "file-invoice", c: "var(--text2)" });
    ev.push({ d: a.createdDate, t: "Flagged — " + a.fwaType, s: "by " + (a.model ? a.model.name : a.source) + " · risk " + a.riskScore + " · confidence " + a.confidence + "%", ic: "flag", c: "var(--high)" });
    if (a.assignee) ev.push({ d: a.createdDate, t: "Assigned", s: "to " + a.assignee, ic: "user", c: "var(--text2)" });
    window.APP.state.audit.slice().reverse().forEach(function (e) {
      if (e.detail.indexOf("#" + id) >= 0 && e.action.indexOf("SESSION") < 0) ev.push({ d: window.APP.fmtTs(e.ts), t: labelize(e.action), s: e.detail.replace(/(Flagged|Pending) claim #/, "").replace("#" + id, "").replace(/^ · /, ""), ic: iconFor(e.action), c: "var(--accent-d)" });
    });
    ev.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    return '<div style="position:relative;padding-left:6px">' + ev.map(function (e, i) {
      return '<div style="display:flex;gap:10px;align-items:flex-start;padding-bottom:' + (i === ev.length - 1 ? "0" : "10px") + '">' +
        '<div style="display:flex;flex-direction:column;align-items:center"><i class="ti ti-' + e.ic + '" style="color:' + e.c + ';font-size:15px"></i>' + (i === ev.length - 1 ? "" : '<div style="width:1px;flex:1;background:var(--border);min-height:14px;margin-top:2px"></div>') + '</div>' +
        '<div style="flex:1"><div style="font-size:12px;font-weight:500">' + window.APP.esc(e.t) + '</div><div style="font-size:11px;color:var(--text2)">' + window.APP.esc(e.s) + '</div></div>' +
        '<div class="mono" style="font-size:10px;color:var(--text3);white-space:nowrap">' + e.d + '</div></div>';
    }).join("") + '</div>';
  }
  function labelize(a) { return a.replace(/_/g, " ").toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }); }
  function iconFor(a) {
    if (a.indexOf("CONFIRM") >= 0 || a.indexOf("APPROVED") >= 0 || a.indexOf("PREPAY_PAY") >= 0) return "circle-check";
    if (a.indexOf("DISMISS") >= 0 || a.indexOf("PREPAY_DENY") >= 0) return "circle-x";
    if (a.indexOf("ESCALATE") >= 0 || a.indexOf("INVESTIGATION") >= 0) return "arrow-up-right";
    if (a.indexOf("RETURN") >= 0 || a.indexOf("PREPAY_HOLD") >= 0) return "corner-up-left";
    if (a.indexOf("RECOVERY") >= 0) return "cash";
    if (a.indexOf("REVIEW") >= 0) return "clock-hour-4";
    if (a.indexOf("RECORD") >= 0 || a.indexOf("EVIDENCE") >= 0) return "file-text";
    if (a.indexOf("SUMMARY") >= 0) return "file-analytics";
    if (a.indexOf("NETWORK") >= 0) return "affiliate";
    return "point";
  }

  function docBox(title, body, tone) {
    var map = {
      good: ["var(--low-bg)", "#bfe0c9", "var(--low-tx)", "circle-check"],
      bad: ["var(--high-bg)", "#e3b4b0", "var(--high-tx)", "alert-triangle"],
      warn: ["var(--med-bg)", "#e7c99a", "var(--med-tx)", "alert-circle"]
    };
    var c = map[tone] || ["var(--surface)", "var(--border)", "var(--text2)", "file-description"];
    return '<div style="background:' + c[0] + ';border:0.5px solid ' + c[1] + ';border-radius:7px;padding:9px 11px"><div style="font-weight:500;font-size:11.5px;color:' + c[2] + ';margin-bottom:4px"><i class="ti ti-' + c[3] + '"></i> ' + title + '</div><div style="font-size:11px;color:var(--text2);line-height:1.55">' + body + '</div></div>';
  }
  // the evidence records on file for a lead (shared by the rail index + Evidence tab)
  function evidenceDocs(a, cl) {
    var prepay = a.mode === "prepay";
    var docs = [{ key: "mr", label: "Medical record", icon: "file-text", meta: "on file" }];
    if (cl) {
      docs.push({ key: "claim", label: "Claim (" + cl.type + ")", icon: "file-invoice", meta: cl.claimNumber });
      if (!prepay) docs.push({ key: "ra", label: "Remittance (835)", icon: "receipt", meta: window.DP.usd(cl.paidAmount) });
    }
    docs.push({ key: "auth", label: "Authorization / referral", icon: "clipboard-check", meta: "on file" });
    return docs;
  }
  function docRowHtml(d, cls) {
    return '<div class="' + cls + '" data-doc="' + d.key + '" style="display:flex;align-items:center;gap:7px;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;cursor:pointer;font-size:11.5px"><i class="ti ti-' + d.icon + '" style="color:var(--accent-d)"></i><span style="flex:1">' + d.label + '</span><span class="muted" style="font-size:10px">' + window.APP.esc(d.meta) + '</span><i class="ti ti-chevron-right" style="color:var(--text3);font-size:14px"></i></div>';
  }
  function docContent(key, id, a, cl) {
    if (key === "mr") {
      if (id === "20463") return docBox("Nephrology progress note", "Dx <span class='mono'>N18.6</span> end-stage renal disease. Standing order: in-center hemodialysis 3×/week (Mon/Wed/Fri). Vascular access: AV fistula, functioning. The billed <span class='mono'>90935</span> frequency is consistent with the documented dialysis regimen.", "good");
      var MR = {
        "Upcoding": ["Clinical note", "Established-patient visit for a stable chronic condition. History and exam are focused; medical decision-making is straightforward. Documentation does <b>not</b> support the high-complexity level (<span class='mono'>99215</span>) billed — a mid-level code is the most it substantiates.", "bad"],
        "Unbundling": ["Operative note", "A single diagnostic EGD is documented — one scope, one session, one anatomic site. Nothing in the note describes the separate, distinct procedural service that reporting the component code with <span class='mono'>modifier&nbsp;59</span> asserts. The two lines reflect one procedure.", "bad"],
        "Modifier misuse": ["Clinical note", "The documentation does not establish the distinct service, laterality or circumstance the appended modifier claims. No separate note, time or site supports it — removing the modifier changes the line's payable status.", "bad"],
        "Residential length-of-stay abuse": ["Admission H&P + discharge summary", "A 28-day residential stay is documented, then discharge and re-admission at an out-of-state affiliated facility days later — a chain of back-to-back sub-30-day stays. Continuous medical necessity across the transfers is <b>not</b> documented; the pattern reads as resetting the per-diem clock, not clinical need.", "bad"],
        "Deceased patient": ["Enrollment / eligibility record", "The VA enrollment record and SSA Death Master File both list the beneficiary's date of death <b>before</b> the billed date(s) of service. No encounter could have occurred — services billed after death cannot be substantiated.", "bad"],
        "Authorization mismatch": ["Referral / authorization review", "The encounter documents a service outside the scope of the Community Care referral on file. The authorized procedure and the rendered/billed procedure do not match, and no amended authorization is documented.", "bad"],
        "Duplicate claim": ["Encounter note + remittance history", "The same service, same date of service, same veteran was already adjudicated and paid on a prior claim. Only one encounter is documented — this submission duplicates a paid claim.", "bad"],
        "Frequency / over-utilization": ["Clinical note", "The service is billed at a frequency above the clinically expected range for the documented diagnosis, without notes justifying the added units or visits. Pull the full treatment plan before recovering — some regimens legitimately run high.", "warn"],
        "Phantom billing": ["Records request — nothing on file", "No encounter note, appointment record or provider documentation exists for the billed date(s) of service, and the facility's attendance/visit logs do not corroborate that the service was rendered. The claim is unsupported.", "bad"],
        "Billing outside specialty": ["Credentialing / scope review", "The rendering provider's taxonomy and credentialing do not include the specialty required for the billed procedure, and no supervision or appropriate-scope arrangement is documented.", "warn"],
        "Routine — no anomaly": ["Clinical note", "Encounter documentation is complete and consistent with the codes billed — history, exam and medical decision-making support the service. No discrepancy identified on review.", "good"]
      };
      var e = MR[a.fwaType];
      if (e) return docBox(e[0], e[1], e[2]);
      return docBox("Clinical note", "Encounter documentation on file for the billed date of service. Content is being reviewed against the billed codes.");
    }
    if (key === "claim" && cl) return docBox("Claim " + cl.claimNumber, cl.type + " · DOS " + cl.dateOfService + " · Dx " + (cl.diagnosisCodes.join(",") || "—") + ". Line items: " + cl.lines.map(function (l) { return l.cpt + (l.modifiers.length ? "-" + l.modifiers.join(",") : "") + " ($" + l.paid + ")"; }).join(", ") + ". Billed " + window.DP.usd(cl.billedAmount) + (a.mode === "prepay" ? " · pending payment." : " · paid " + window.DP.usd(cl.paidAmount) + "."));
    if (key === "ra" && cl) return docBox("Remittance advice (835)", "Payment of " + window.DP.usd(cl.paidAmount) + " on " + cl.dateOfService + ". Status: paid in full, no prior adjustments. This is a post-payment review — funds have already been disbursed.");
    if (key === "auth") {
      var AU = {
        "Authorization mismatch": ["Community Care referral on file authorizes a <b>different</b> procedure than the one billed — the rendered service falls outside the authorized scope, and no amended authorization is documented.", "bad"],
        "Residential length-of-stay abuse": ["Referral authorized a single episode of residential treatment. The billing instead spans multiple affiliated facilities under separate authorizations — exceeding the approved scope for a continuous stay.", "warn"],
        "Deceased patient": ["The referral on file predates the beneficiary's recorded date of death; no service could be authorized or rendered after that date.", "bad"],
        "Billing outside specialty": ["No authorization on file establishes the rendering provider's scope for the billed specialty procedure.", "warn"]
      };
      var au = AU[a.fwaType];
      if (au) return docBox("Authorization / referral", au[0], au[1]);
      return docBox("Authorization / referral", "Community Care referral on file for the billed service, valid through 2025. Authorized scope is being validated against the billed procedure(s).");
    }
    return docBox("Document", "No preview available.");
  }
})();
