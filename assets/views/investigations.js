/* Cases — provider-level case list. A case exists for a provider once ≥1 of its
   leads is reviewed & confirmed (or escalated); it aggregates that provider's
   confirmed leads, and the provider's still-open leads "feed in" until confirmed.
   Cases are a post-payment / confirmed concept, so this view is always
   retrospective. Row → provider Case detail. View key stays "investigations". */
(function () {
  window.Views = window.Views || {};
  window.Views.investigations = {
    render: function (mount) {
      var cases = window.DP.listCases({ mode: "retrospective" });
      var openCases = cases.filter(function (c) { return !c.closed; });
      var closedN = cases.length - openCases.length;
      var caseLeads = cases.reduce(function (s, c) { return s + c.leadCount; }, 0);
      var feeding = cases.reduce(function (s, c) { return s + c.openCount; }, 0);
      var exposure = cases.reduce(function (s, c) { return s + (c.exposure || 0); }, 0);
      var showActions = window.APP.isSupervisor();

      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Cases</div>' +
        '<div class="page-sub">A case opens when a lead is reviewed &amp; confirmed. Usually one provider per case; providers sharing a TIN or business registration roll into one multi-provider case. Multiple confirmed leads roll in; still-open leads feed in until confirmed.</div></div></div>' +
        '<div class="kpis" style="margin-bottom:12px">' +
        '<div class="kpi"><div class="l">Open cases</div><div class="v">' + openCases.length + '</div></div>' +
        '<div class="kpi"><div class="l">Closed cases</div><div class="v">' + closedN + '</div></div>' +
        '<div class="kpi"><div class="l">Confirmed leads</div><div class="v">' + caseLeads + '</div></div>' +
        '<div class="kpi"><div class="l">Open leads feeding in</div><div class="v">' + feeding + '</div></div>' +
        '<div class="kpi"><div class="l">Confirmed exposure</div><div class="v">' + window.DP.usdShort(exposure) + '</div></div></div>' +
        (cases.length ?
          '<div class="card" style="padding:0;overflow:hidden"><table><thead><tr>' +
          '<th>Risk</th><th>Provider (case)</th><th>Case status</th><th class="right">Confirmed leads</th><th class="right">Open feeding in</th><th>Type</th><th>Assignee</th><th class="right">Exposure</th>' + (showActions ? '<th></th>' : '') + '</tr></thead><tbody>' +
          cases.map(function (c) {
            var p = c.provider;
            var caseCls = c.closed ? "p-dis" : c.status === "Under investigation" ? "p-esc" : "p-new";
            var types = c.fwaTypes.slice(0, 2).map(function (t) { return '<span class="tag fwa">' + window.APP.esc(t) + '</span>'; }).join(" ") + (c.fwaTypes.length > 2 ? ' <span class="muted" style="font-size:10px">+' + (c.fwaTypes.length - 2) + '</span>' : "");
            var multi = c.multiProvider ? ' <span class="tag" style="background:var(--med-bg);color:var(--med-tx)"><i class="ti ti-affiliate"></i> ' + c.providerCount + ' providers</span>' : "";
            return '<tr class="row" data-pid="' + c.providerId + '"><td>' + window.UI.riskChip(c.riskScore) + '</td>' +
              '<td><div style="font-weight:500;display:flex;gap:6px;align-items:center;flex-wrap:wrap">' + window.APP.esc(c.name) + ' ' + window.UI.subjectBadge(c.subjectType, { small: true }) + multi + '</div><div class="mono" style="font-size:10.5px;color:var(--text3)">CASE-' + c.providerId + ' · NPI ' + (p.npi || "—") + ' · ' + window.APP.esc(p.state || "") + '</div></td>' +
              '<td><span class="pill ' + caseCls + '">' + c.status + '</span></td>' +
              '<td class="right" style="font-weight:600">' + c.leadCount + '</td>' +
              '<td class="right">' + (c.openCount ? '<span class="muted">+' + c.openCount + '</span>' : '<span class="muted" style="color:var(--text3)">—</span>') + '</td>' +
              '<td>' + (types || '<span class="muted">—</span>') + '</td>' +
              '<td style="color:' + (c.assignee ? "var(--ink)" : "var(--text3)") + ';font-size:11.5px">' + window.APP.esc(c.assignee || "Unassigned") + '</td>' +
              '<td class="right" style="font-weight:500">' + window.DP.usd(c.exposure || 0) + '</td>' +
              (showActions ? '<td class="right">' + (c.closed ? '<button class="btn case-reopen" data-pid="' + c.providerId + '" style="font-size:11px;padding:3px 8px"><i class="ti ti-rotate"></i> Reopen</button>' : '<button class="btn case-close" data-pid="' + c.providerId + '" style="font-size:11px;padding:3px 8px"><i class="ti ti-checkbox"></i> Review &amp; close</button>') + '</td>' : '') +
              '</tr>';
          }).join("") + '</tbody></table></div>'
          : '<div class="card" style="text-align:center;padding:32px"><i class="ti ti-folder-open" style="font-size:28px;color:var(--text3)"></i><div style="font-size:13px;color:var(--text2);margin-top:8px">No cases yet.</div><div style="font-size:11.5px;color:var(--text3);margin-top:3px">Confirm or escalate a lead in the work queue to open a provider case.</div></div>') +
        '</div>';
      var reRender = function () { window.Views.investigations.render(mount); };
      // Closing needs a reason and a narrative, so it happens on the case page with
      // the case in front of you — not blind from a list row.
      mount.querySelectorAll(".case-close").forEach(function (b) {
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          window.APP.state.caseCloseIntent = b.getAttribute("data-pid");
          window.APP.openProvider(b.getAttribute("data-pid"));
        });
      });
      mount.querySelectorAll(".case-reopen").forEach(function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); window.APP.reopenCase(b.getAttribute("data-pid")); reRender(); }); });
      mount.querySelectorAll("tr.row").forEach(function (tr) { tr.addEventListener("click", function () { window.APP.openProvider(tr.getAttribute("data-pid")); }); });
    }
  };
})();
