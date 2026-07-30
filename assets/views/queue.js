/* Work queue view — the analyst's daily triage surface */
(function () {
  window.Views = window.Views || {};
  var OPEN = ["New", "Assigned", "Under review", "Returned", "Pending review", "Recommended close"];
  var STATUSES = ["New", "Assigned", "Under review", "Returned", "Pending review", "Confirmed", "Dismissed", "Escalated"];

  window.Views.queue = {
    render: function (mount) {
      if (window.APP.isPrepay()) return renderPrepay(mount);
      var st = window.APP.state.qfilters || (window.APP.state.qfilters = { scope: "all", status: "", fwa: "", assignee: "", source: "", sort: "risk", minRisk: 0, query: "" });
      var meName = window.APP.ROLES[window.APP.state.role].name;
      var all = window.DP.listAllegations();
      var openCount = all.filter(function (r) { return OPEN.indexOf(r.status) >= 0; }).length;
      var openExp = all.filter(function (r) { return OPEN.indexOf(r.status) >= 0; }).reduce(function (s, r) { return s + r.exposurePost; }, 0);
      var k = window.APP.kpis();
      var fwaTypes = Object.keys(window.DP.getAnomalyBreakdown()).sort();
      var assignees = all.map(function (r) { return r.assignee; }).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; }).sort();

      function seg(v, l) { return '<button class="qscope' + (st.scope === v ? " active" : "") + '" data-scope="' + v + '">' + l + '</button>'; }
      function opt(val, label, sel) { return '<option value="' + val + '"' + (sel === val ? " selected" : "") + '>' + label + '</option>'; }

      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Leads</div><div class="page-sub">Flagged claims routed for post-payment review — each is one lead</div></div>' +
        '<div style="display:flex;gap:10px;align-items:center"><div style="display:flex;gap:2px;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;padding:2px">' + seg("all", "All open") + seg("my", "My leads") + seg("unassigned", "Unassigned") + '</div><button class="btn primary" id="q-newlead" style="font-size:12px"><i class="ti ti-plus"></i> Create lead</button>' + window.EXPORT.group("q") + '</div></div>' +
        '<div class="kpis">' +
        kpi("Open leads", openCount) + kpi("Exposure (open queue)", window.DP.usd(openExp)) +
        kpi("Submitted for recovery", window.DP.usdShort(k.submittedForRecovery)) + kpi("Verified recoupment", window.DP.usdShort(k.verifiedRecoupment)) +
        '</div>' +
        '<div class="filters">' +
        '<div class="searchbox"><i class="ti ti-search"></i><input id="q-search" class="input" placeholder="Search provider, type, NPI…" value="' + window.APP.esc(st.query) + '"></div>' +
        '<select id="q-status" class="input" style="width:auto"><option value="">Open (default)</option>' + STATUSES.map(function (s) { return opt(s, s, st.status); }).join("") + '</select>' +
        '<select id="q-fwa" class="input" style="width:auto"><option value="">All FWA types</option>' + fwaTypes.map(function (f) { return opt(f, f, st.fwa); }).join("") + '</select>' +
        '<select id="q-source" class="input" style="width:auto"><option value="">Any source</option>' + window.DP.SOURCES.map(function (s) { return opt(s, s, st.source); }).join("") + '</select>' +
        '<select id="q-assignee" class="input" style="width:auto"><option value="">Any assignee</option>' + opt("__none__", "Unassigned", st.assignee) + assignees.map(function (a) { return opt(a, a, st.assignee); }).join("") + '</select>' +
        '<select id="q-sort" class="input" style="width:auto"><option value="risk"' + (st.sort === "risk" ? " selected" : "") + '>Sort: Risk</option><option value="exposure"' + (st.sort === "exposure" ? " selected" : "") + '>Sort: Exposure</option><option value="newest"' + (st.sort === "newest" ? " selected" : "") + '>Sort: Newest</option></select>' +
        '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;color:var(--text2)">Min risk</span><input id="q-thr" type="range" min="0" max="100" value="' + st.minRisk + '" step="1" style="width:100px"><span id="q-thrv" class="mono" style="font-size:12.5px;font-weight:500;min-width:22px">' + st.minRisk + '</span></div>' +
        '<button class="btn" id="q-clear" style="font-size:11.5px"><i class="ti ti-x"></i> Clear</button>' +
        '</div>' +
        '<div class="card" style="padding:0;overflow:hidden"><table><thead><tr><th>Risk</th><th>Lead</th><th>Provider</th><th class="right">Exposure</th><th>Status</th><th>Assignee</th></tr></thead><tbody id="q-body"></tbody></table></div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:10px;font-size:12px;color:var(--text2)"><span id="q-count"></span><span>Teal bar = one of the 3 demo scenarios</span></div>' +
        '</div>';

      function draw() {
        var rows = window.DP.listAllegations();
        if (st.status) rows = rows.filter(function (r) { return r.status === st.status; });
        else rows = rows.filter(function (r) { return OPEN.indexOf(r.status) >= 0; });
        if (st.scope === "my") rows = rows.filter(function (r) { return r.assignee === meName; });
        if (st.scope === "unassigned") rows = rows.filter(function (r) { return !r.assignee; });
        if (st.assignee === "__none__") rows = rows.filter(function (r) { return !r.assignee; });
        else if (st.assignee) rows = rows.filter(function (r) { return r.assignee === st.assignee; });
        if (st.fwa) rows = rows.filter(function (r) { return r.fwaType === st.fwa; });
        if (st.source) rows = rows.filter(function (r) { return r.sourceType === st.source; });
        if (st.minRisk) rows = rows.filter(function (r) { return r.riskScore >= st.minRisk; });
        if (st.query) { var q = st.query.toLowerCase(); rows = rows.filter(function (r) { return [r.providerName, r.fwaType, r.providerNpi, r.id].join(" ").toLowerCase().indexOf(q) >= 0; }); }
        rows.sort(function (a, b) { return st.sort === "exposure" ? b.exposurePost - a.exposurePost : st.sort === "newest" ? (a.createdDate < b.createdDate ? 1 : -1) : b.riskScore - a.riskScore; });

        document.getElementById("q-body").innerHTML = rows.map(function (r) {
          return '<tr class="row" data-id="' + r.id + '"' + (r.hero ? ' data-hero="1"' : '') + '>' +
            '<td>' + window.UI.riskChip(r.riskScore) + '</td>' +
            '<td><div style="display:flex;gap:6px;align-items:center"><span class="mono" style="font-weight:500">#' + r.id + '</span>' + window.UI.subjectBadge(r.subjectType, { small: true }) + (r.claimType ? '<span class="tag">' + r.claimType + '</span>' : '') + '</div>' +
            '<div style="margin-top:3px;display:flex;gap:6px;align-items:center"><span class="tag fwa">' + r.fwaType + '</span>' + window.UI.srcTag(r.source) + (r.manual ? '<span class="tag" style="background:var(--med-bg);color:var(--med-tx)">manual</span>' : '') + '</div></td>' +
            '<td><div style="font-weight:500">' + window.APP.esc(r.providerName) + '</div><div class="mono" style="font-size:10.5px;color:var(--text3)">NPI ' + r.providerNpi + ' · ' + r.providerState + '</div></td>' +
            '<td class="right" style="font-weight:500">' + window.DP.usd(r.exposurePost) + '</td>' +
            '<td>' + window.UI.statusPill(r.status) + '</td>' +
            '<td style="color:' + (r.assignee ? "var(--ink)" : "var(--text3)") + '">' + (r.assignee || "Unassigned") + '</td></tr>';
        }).join("") || '<tr><td colspan="6" class="muted" style="padding:16px;text-align:center">No leads match these filters.</td></tr>';
        document.getElementById("q-count").textContent = "Showing " + rows.length + (st.status ? "" : " open") + " of " + all.length;
        document.getElementById("q-body").querySelectorAll("tr.row").forEach(function (tr) { tr.addEventListener("click", function () { window.APP.openAllegation(tr.getAttribute("data-id")); }); });
      }

      mount.querySelectorAll(".qscope").forEach(function (b) { b.addEventListener("click", function () { st.scope = b.getAttribute("data-scope"); mount.querySelectorAll(".qscope").forEach(function (x) { x.classList.toggle("active", x === b); }); draw(); }); });
      document.getElementById("q-thr").addEventListener("input", function () { st.minRisk = +this.value; document.getElementById("q-thrv").textContent = this.value; draw(); });
      document.getElementById("q-search").addEventListener("input", function () { st.query = this.value; draw(); });
      document.getElementById("q-status").addEventListener("change", function () { st.status = this.value; draw(); });
      document.getElementById("q-fwa").addEventListener("change", function () { st.fwa = this.value; draw(); });
      document.getElementById("q-source").addEventListener("change", function () { st.source = this.value; draw(); });
      document.getElementById("q-assignee").addEventListener("change", function () { st.assignee = this.value; draw(); });
      document.getElementById("q-sort").addEventListener("change", function () { st.sort = this.value; draw(); });
      document.getElementById("q-clear").addEventListener("click", function () { window.APP.state.qfilters = { scope: "all", status: "", fwa: "", assignee: "", source: "", sort: "risk", minRisk: 0, query: "" }; window.APP.nav("queue"); });
      document.getElementById("q-newlead").addEventListener("click", function () { openCreateLead(fwaTypes); });
      var qHead = ["Lead", "Risk", "FWA Type", "Source", "Provider", "NPI", "State", "Exposure", "Status", "Assignee"];
      var qRows = function () { return window.DP.listAllegations().filter(function (r) { return OPEN.indexOf(r.status) >= 0; }).sort(function (a, b) { return b.riskScore - a.riskScore; }).map(function (r) { return ["#" + r.id, r.riskScore, r.fwaType, r.source, r.providerName, r.providerNpi, r.providerState, r.exposurePost, r.status, r.assignee || "Unassigned"]; }); };
      window.EXPORT.wire("q", {
        csv: function () { window.EXPORT.csv("pivot-work-queue", qHead, qRows()); },
        xls: function () { window.EXPORT.xls("pivot-work-queue", "Work queue", qHead, qRows()); },
        pdf: function () { var rows = qRows(); window.EXPORT.pdf("Work queue — open leads", "<div class='sub'>" + rows.length + " open leads · total exposure " + window.DP.usd(rows.reduce(function (s, r) { return s + r[7]; }, 0)) + "</div>" + window.EXPORT.tableHtml(qHead, rows.map(function (r) { return r.slice(0, 7).concat([window.DP.usd(r[7]), r[8], r[9]]); }))); }
      });
      draw();
    }
  };
  function kpi(l, v) { return '<div class="kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div></div>'; }

  // ---------- create-a-lead (analyst-authored; not all leads are data-driven) ----------
  function clField(label, control) { return '<div><div style="font-size:11px;color:var(--text2);margin-bottom:3px">' + label + '</div>' + control + '</div>'; }
  function openCreateLead(fwaTypes) {
    var provs = window.DP.listProviders().filter(function (p) { return p.role !== "peer"; });
    if (!provs.length) provs = window.DP.listProviders();
    provs = provs.slice().sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
    var o = function (v, l) { return '<option value="' + window.APP.esc(v) + '">' + window.APP.esc(l) + '</option>'; };
    var ov = document.createElement("div");
    ov.id = "cl-ov";
    ov.style.cssText = "position:fixed;inset:0;background:rgba(16,36,59,0.45);z-index:100;display:flex;align-items:flex-start;justify-content:center;padding-top:56px";
    ov.innerHTML = '<div class="card" style="width:540px;max-width:94vw;padding:0;overflow:hidden">' +
      '<div style="padding:12px 16px;border-bottom:0.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">' +
      '<div style="font-weight:600;font-size:14px"><i class="ti ti-plus" style="color:var(--accent-d)"></i> Create a lead</div>' +
      '<i class="ti ti-x" id="cl-x" style="cursor:pointer;color:var(--text2);font-size:18px"></i></div>' +
      '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:11px">' +
      '<div style="font-size:11.5px;color:var(--text2)">Analyst-authored lead. Not every lead is data-driven — adjudicators often get them by <b>email or phone</b>, or as hotline tips, referrals and OIG cases, and enter them manually here. Logged to the audit trail.</div>' +
      clField("Provider", '<select id="cl-prov" class="input">' + provs.map(function (p) { return o(p.id, p.name + " · " + (p.state || "")); }).join("") + '</select>') +
      '<div style="display:flex;gap:10px"><div style="flex:1">' + clField("Source", '<select id="cl-src" class="input">' + window.DP.SOURCES.map(function (s) { return o(s, s); }).join("") + '</select>') + '</div>' +
      '<div style="flex:1">' + clField("FWA type", '<select id="cl-fwa" class="input"><option value="Other / manual">Other / manual</option>' + fwaTypes.map(function (f) { return o(f, f); }).join("") + '</select>') + '</div></div>' +
      '<div style="display:flex;gap:10px"><div style="flex:1">' + clField("Estimated exposure ($)", '<input id="cl-exp" class="input" type="number" min="0" step="100" value="0">') + '</div>' +
      '<div style="flex:1">' + clField("Risk (0–100)", '<input id="cl-risk" class="input" type="number" min="0" max="100" value="60">') + '</div></div>' +
      clField("Rationale / narrative", '<textarea id="cl-note" class="input" placeholder="What prompted this lead? (source detail, what to check)"></textarea>') +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:2px"><button class="btn" id="cl-cancel">Cancel</button><button class="btn primary" id="cl-save"><i class="ti ti-plus"></i> Create lead</button></div>' +
      '</div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.getElementById("cl-x").addEventListener("click", close);
    document.getElementById("cl-cancel").addEventListener("click", close);
    document.getElementById("cl-save").addEventListener("click", function () {
      var lead = window.APP.createLead({
        providerId: document.getElementById("cl-prov").value,
        sourceType: document.getElementById("cl-src").value,
        fwaType: document.getElementById("cl-fwa").value,
        exposure: +document.getElementById("cl-exp").value || 0,
        riskScore: Math.max(0, Math.min(100, +document.getElementById("cl-risk").value || 60)),
        rationale: document.getElementById("cl-note").value
      });
      close();
      if (lead) window.APP.openAllegation(lead.id);
    });
  }

  // ---------- prepay (pre-payment triage) ----------
  function renderPrepay(mount) {
    var st = window.APP.state.ppfilters || (window.APP.state.ppfilters = { rec: "", sort: "risk" });
    var stats = window.APP.prepayStats();
    function ppSeg(v, l) { return '<button class="qscope ppseg' + (st.rec === v ? " active" : "") + '" data-rec="' + v + '">' + l + '</button>'; }
    mount.innerHTML =
      '<div class="page">' +
      '<div class="page-head"><div><div class="page-title">Pre-payment triage</div><div class="page-sub">Claims scored <b>before</b> payment — decide Pay · Hold · Deny to stop improper payments before the money leaves</div></div>' +
      '<div style="display:flex;gap:10px;align-items:center"><div style="display:flex;gap:2px;background:var(--surface);border:0.5px solid var(--border);border-radius:8px;padding:2px">' + ppSeg("", "All") + ppSeg("deny", "Deny") + ppSeg("hold", "Hold") + ppSeg("pay", "Pay") + '</div>' + window.EXPORT.group("pp") + '</div></div>' +
      '<div class="kpis">' +
      kpi("Pending to triage", stats.pending + " / " + stats.total) +
      kpi("Amount at risk", window.DP.usd(stats.atRisk)) +
      kpi("Payment prevented", '<span style="color:var(--low-tx)">' + window.DP.usd(stats.prevented) + '</span>') +
      kpi("Cleared to pay", window.DP.usd(stats.released)) +
      '</div>' +
      '<div class="card" style="padding:0;overflow:hidden"><table><thead><tr><th>Risk</th><th>Pending claim</th><th>Provider</th><th class="right">Amount at risk</th><th>Model recommends</th><th style="width:206px">Decision</th></tr></thead><tbody id="pp-body"></tbody></table></div>' +
      '<div style="margin-top:10px;font-size:12px;color:var(--text2)"><i class="ti ti-shield-check" style="color:var(--accent-d)"></i> Denying or holding here stops the payment up front. Clean claims flow straight through — most of the queue is low-touch.</div>' +
      '</div>';
    drawPrepay();
    mount.querySelectorAll(".ppseg").forEach(function (b) { b.addEventListener("click", function () { st.rec = b.getAttribute("data-rec"); window.APP.nav("queue"); }); });
    var ppHead = ["Pending claim", "Risk", "FWA Type", "Provider", "NPI", "Amount at risk", "Model recommends", "Decision"];
    var ppRows = function () {
      return window.DP.listAllegations({ mode: "prepay" }).sort(function (a, b) { return b.riskScore - a.riskScore; }).map(function (r) {
        var d = window.APP.prepayDecisionFor(r.id);
        return ["#" + r.id, r.riskScore, r.fwaType, r.providerName, r.providerNpi, r.exposurePre || 0, (r.recommendedAction || "").toUpperCase(), d ? { pay: "Cleared to pay", hold: "On hold", deny: "Denied" }[d.action] : "Pending"];
      });
    };
    window.EXPORT.wire("pp", {
      csv: function () { window.EXPORT.csv("pivot-prepay-triage", ppHead, ppRows()); },
      xls: function () { window.EXPORT.xls("pivot-prepay-triage", "Prepay triage", ppHead, ppRows()); },
      pdf: function () { var rows = ppRows(); window.EXPORT.pdf("Pre-payment triage queue", "<div class='sub'>" + rows.length + " pending claims · " + window.DP.usd(stats.atRisk) + " at risk · " + window.DP.usd(stats.prevented) + " payment prevented</div>" + window.EXPORT.tableHtml(ppHead, rows.map(function (r) { return r.slice(0, 5).concat([window.DP.usd(r[5]), r[6], r[7]]); }))); }
    });
  }

  function drawPrepay() {
    var st = window.APP.state.ppfilters;
    var rows = window.DP.listAllegations({ mode: "prepay" });
    if (st.rec) rows = rows.filter(function (r) { return r.recommendedAction === st.rec; });
    rows.sort(function (a, b) { return b.riskScore - a.riskScore; });
    document.getElementById("pp-body").innerHTML = rows.map(function (r) {
      var dec = window.APP.prepayDecisionFor(r.id);
      return '<tr class="pprow" data-id="' + r.id + '">' +
        '<td>' + window.UI.riskChip(r.riskScore) + '</td>' +
        '<td><div style="display:flex;gap:6px;align-items:center"><span class="mono" style="font-weight:500">#' + r.id + '</span><span class="tag">' + r.claimType + '</span></div>' +
        '<div style="margin-top:3px"><span class="tag fwa">' + r.fwaType + '</span> ' + window.UI.srcTag(r.source) + '</div></td>' +
        '<td><div style="font-weight:500">' + window.APP.esc(r.providerName) + '</div><div class="mono" style="font-size:10.5px;color:var(--text3)">NPI ' + r.providerNpi + ' · ' + r.providerState + '</div></td>' +
        '<td class="right" style="font-weight:600">' + window.DP.usd(r.exposurePre || 0) + '</td>' +
        '<td>' + recPill(r.recommendedAction) + '</td>' +
        '<td>' + (dec ? decidedPill(dec.action) : triageBtns(r.id)) + '</td></tr>';
    }).join("") || '<tr><td colspan="6" class="muted" style="padding:16px;text-align:center">No pending claims match this filter.</td></tr>';
    wirePrepay();
  }

  function wirePrepay() {
    var body = document.getElementById("pp-body");
    body.querySelectorAll(".ppbtn").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); window.APP.prepayDecide(b.getAttribute("data-id"), b.getAttribute("data-act")); window.APP.nav("queue"); });
    });
    body.querySelectorAll(".pprow").forEach(function (tr) { tr.addEventListener("click", function () { window.APP.openAllegation(tr.getAttribute("data-id")); }); });
  }

  function triageBtns(id) {
    return '<div style="display:flex;gap:4px">' + ppBtn(id, "pay", "Pay", "check", "var(--low)") + ppBtn(id, "hold", "Hold", "clock-hour-4", "var(--med)") + ppBtn(id, "deny", "Deny", "ban", "var(--high)") + '</div>';
  }
  function ppBtn(id, act, label, icon, color) { return '<button class="ppbtn" data-id="' + id + '" data-act="' + act + '" style="border:0.5px solid ' + color + ';color:' + color + ';background:#fff;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;font-family:var(--sans)"><i class="ti ti-' + icon + '"></i>' + label + '</button>'; }
  function recPill(action) { if (!action) return '<span class="muted">—</span>'; var m = { pay: ["Pay", "var(--low-tx)"], hold: ["Hold", "var(--med-tx)"], deny: ["Deny", "var(--high-tx)"] }[action]; return '<span style="font-size:11.5px;font-weight:500;color:' + m[1] + '"><i class="ti ti-sparkles"></i> ' + m[0] + '</span>'; }
  function decidedPill(action) { var m = { pay: ["Cleared to pay", "var(--low-tx)", "var(--low-bg)", "check"], hold: ["On hold", "var(--med-tx)", "var(--med-bg)", "clock-hour-4"], deny: ["Denied", "var(--high-tx)", "var(--high-bg)", "ban"] }[action]; return '<span class="pill" style="background:' + m[2] + ';color:' + m[1] + '"><i class="ti ti-' + m[3] + '"></i> ' + m[0] + '</span>'; }
})();
