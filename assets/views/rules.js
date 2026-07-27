/* Rules Library — read-only rules catalog + pattern models. Rules are classified
   along five dimensions (regulatory source, entity type, fraud type, detection
   level, severity) and can be grouped by any of them. */
(function () {
  window.Views = window.Views || {};
  var groupBy = "fraudType"; // default grouping

  var SEV = {
    Critical: ["var(--high-bg)", "var(--high-tx)"], High: ["#fbe6cf", "#9a5b12"],
    Medium: ["var(--med-bg)", "var(--med-tx)"], Low: ["var(--low-bg)", "var(--low-tx)"]
  };
  function sevPill(s) { var c = SEV[s] || ["var(--surface)", "var(--text2)"]; return '<span class="tag" style="background:' + c[0] + ';color:' + c[1] + '">' + window.APP.esc(s) + '</span>'; }
  function dimTag(icon, val) { return '<span class="tag" style="background:var(--surface)"><i class="ti ti-' + icon + '"></i> ' + window.APP.esc(val) + '</span>'; }

  // Drill-down: a rule's decision logic, the data it reads, and what it emits.
  function ruleDetailHtml(d) {
    if (!d) return '<div class="muted" style="font-size:11.5px;padding:6px 0">No drill-down available for this rule.</div>';
    var esc = window.APP.esc;
    var block = function (icon, title, sub, inner) {
      return '<div class="card" style="margin:0 0 8px;background:var(--surface)"><div style="font-weight:600;font-size:12px;margin-bottom:6px"><i class="ti ti-' + icon + '" style="color:var(--accent-d)"></i> ' + title + (sub ? ' <span class="muted" style="font-weight:400;font-size:10.5px">· ' + sub + '</span>' : '') + '</div>' + inner + '</div>';
    };
    // 1) logic
    var crit = (d.logic.criteria || []).map(function (c) {
      return '<div style="display:flex;gap:8px;padding:4px 0;border-top:0.5px solid var(--border2);font-size:11.5px">' +
        '<span style="flex:none;color:var(--accent-d);font-weight:600;min-width:34px">IF</span><span style="flex:1">' + esc(c.when) + '</span>' +
        '<span style="flex:none;color:var(--high-tx);font-weight:600;min-width:38px">THEN</span><span style="flex:1;color:var(--text2)">' + esc(c.then) + '</span></div>';
    }).join("");
    var logicInner = '<div style="font-size:11.5px;color:var(--text);line-height:1.6;margin-bottom:4px">' + esc(d.logic.summary) + '</div>' + crit +
      (d.logic.pseudocode ? '<pre class="mono" style="margin:8px 0 0;background:#0f2033;color:#cfe8e2;border-radius:6px;padding:9px 11px;font-size:10.5px;line-height:1.5;overflow-x:auto;white-space:pre">' + esc(d.logic.pseudocode) + '</pre>' : '');
    // 2) inputs
    var inRows = (d.inputs || []).map(function (i) {
      return '<tr><td style="font-weight:500">' + esc(i.field) + '</td><td class="mono" style="font-size:10.5px;color:var(--accent-d)">' + esc(i.source) + '</td><td class="mono" style="font-size:10.5px;color:var(--text3)">' + esc(i.example) + '</td></tr>';
    }).join("");
    var inputsInner = '<div style="overflow-x:auto"><table style="width:100%"><thead><tr><th>Field</th><th>Source segment / reference</th><th>Example</th></tr></thead><tbody>' + inRows + '</tbody></table></div>';
    // 3) output
    var o = d.output, kv = function (k, v) { return '<div style="display:flex;gap:8px;padding:3px 0;font-size:11.5px;border-top:0.5px solid var(--border2)"><span style="color:var(--text2);min-width:96px;flex:none">' + k + '</span><span style="flex:1">' + v + '</span></div>'; };
    var outputInner = kv("Signal", '<span class="tag" style="background:var(--accent-l);color:var(--accent-d)">' + esc(o.signal) + '</span>') +
      kv("Emits", '<span class="mono" style="color:var(--high-tx)">' + esc(o.emits) + '</span>') +
      kv("Disposition", esc(o.disposition)) +
      kv("Feeds", '<span style="color:var(--text2)">' + esc(o.downstream) + '</span>');
    return '<div style="display:grid;grid-template-columns:1fr;gap:0">' +
      block("binary-tree", "Decision logic", "criteria the rule evaluates", logicInner) +
      block("database-import", "Required data inputs", "claim fields → 837 / NCPDP segments + external references", inputsInner) +
      block("logout", "Output structure", "what the rule emits and where it goes", outputInner) +
      '<div style="font-size:10.5px;color:var(--text3);padding:2px 2px 0"><i class="ti ti-info-circle"></i> Synthetic decision logic for the demo — production rules drop in behind this same logic / inputs / output shape.</div>' +
      '</div>';
  }

  window.Views.rules = {
    render: function (mount) {
      var rules = window.DP.getRuleCatalog(), models = window.DP.getModels();
      var dims = window.DP.RULE_DIMENSIONS;
      var dim = dims.find(function (d) { return d.key === groupBy; }) || dims[0];

      // group the rules by the active dimension, in the dimension's declared order
      var groups = {};
      rules.forEach(function (r) { var k = r[groupBy] || "—"; (groups[k] = groups[k] || []).push(r); });
      var order = dim.values.filter(function (v) { return groups[v]; }).concat(Object.keys(groups).filter(function (k) { return dim.values.indexOf(k) < 0; }));

      var ruleRow = function (r) {
        return '<div style="border-top:0.5px solid var(--border2)">' +
          '<div class="rule-row" data-rule="' + r.id + '" style="display:flex;gap:10px;align-items:flex-start;padding:9px 0;cursor:pointer">' +
          '<i class="ti ti-chevron-right rule-caret" style="color:var(--text3);font-size:15px;margin-top:1px;transition:transform .12s;flex:none"></i>' +
          '<div style="flex:1;min-width:0"><div style="font-weight:500;font-size:12.5px">' + window.APP.esc(r.name) + ' <span class="mono" style="font-weight:400;font-size:10.5px;color:var(--text3)">' + window.APP.esc(r.code) + '</span></div>' +
          '<div style="font-size:11px;color:var(--text2);margin:2px 0 5px">' + window.APP.esc(r.description) + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px">' +
          (groupBy !== "regulatorySource" ? dimTag("book", r.regulatorySource) : "") +
          (groupBy !== "entityType" ? dimTag("user", r.entityType) : "") +
          (groupBy !== "fraudType" ? dimTag("alert-triangle", r.fraudType) : "") +
          (groupBy !== "detectionLevel" ? dimTag("stack-2", r.detectionLevel) : "") +
          (groupBy !== "severity" ? sevPill(r.severity) : "") +
          '<span class="muted" style="font-size:10px;align-self:center"><i class="ti ti-binary-tree"></i> logic · inputs · output</span>' +
          '</div></div>' +
          '<div style="text-align:right;white-space:nowrap;flex:none">' +
          '<div class="mono" style="font-size:11px">v' + window.APP.esc(r.version || "1.0") + '</div>' +
          '<div class="mono" style="font-size:10px;color:var(--text3)">' + window.APP.esc(r.effectiveDate || "—") + '</div>' +
          '<div style="margin-top:3px"><span class="pill" style="background:var(--low-bg);color:var(--low-tx);font-size:10px">' + window.APP.esc(r.environment || "Production") + '</span></div></div>' +
          '</div>' +
          '<div class="rule-drill" data-rule="' + r.id + '" style="display:none;padding:0 0 10px 25px"></div>' +
          '</div>';
      };

      var sections = order.map(function (k) {
        var list = groups[k];
        var head = groupBy === "severity" ? sevPill(k) : '<span style="font-weight:600;font-size:12.5px">' + window.APP.esc(k) + '</span>';
        return '<div class="card" style="margin-bottom:8px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">' + head +
          '<span class="muted" style="font-size:11px">' + list.length + ' rule' + (list.length === 1 ? '' : 's') + '</span></div>' +
          list.map(ruleRow).join("") + '</div>';
      }).join("");

      // per-dimension coverage summary (counts by value of the active dimension)
      var chips = dim.values.filter(function (v) { return groups[v]; }).map(function (v) {
        return '<span class="tag" style="background:var(--surface)">' + window.APP.esc(v) + ' <b>' + groups[v].length + '</b></span>';
      }).join(" ");

      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Rules library</div><div class="page-sub">VA-approved compliance rules, pricing logic and ML / AI models — classified by regulatory source, entity type, fraud type, detection level and severity.</div></div>' +
        '<span class="tag"><i class="ti ti-git-branch"></i> dev → test → pre-prod → production</span></div>' +

        '<div class="card" style="margin-bottom:10px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
        '<span style="font-size:11.5px;color:var(--text2)">Group by</span>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
        dims.map(function (d) { return '<button class="btn r-grp' + (d.key === groupBy ? ' primary' : '') + '" data-dim="' + d.key + '" style="font-size:11px;padding:4px 9px">' + d.label + '</button>'; }).join("") +
        '</div><span style="flex:1"></span><span class="muted" style="font-size:11px">' + rules.length + ' rules</span></div>' +
        '<div style="margin-top:9px;display:flex;flex-wrap:wrap;gap:5px">' + chips + '</div></div>' +

        sections +

        '<div class="card" style="margin-top:10px"><div style="font-weight:500;font-size:13px;margin-bottom:3px">ML / AI models</div><div style="font-size:11px;color:var(--text2);margin-bottom:9px">Composite anomaly models — behavioral detection that complements the hard rule edits above.</div>' +
        models.map(function (m) {
          return '<div style="display:flex;gap:9px;align-items:flex-start;padding:7px 0;border-top:0.5px solid var(--border2)"><i class="ti ti-brain" style="color:var(--accent-d);margin-top:2px"></i>' +
            '<div style="flex:1"><div style="font-size:12.5px;font-weight:500">' + window.APP.esc(m.name) + ' <span class="tag">' + window.APP.esc(m.type) + '</span></div>' +
            '<div style="font-size:11.5px;color:var(--text2)">' + window.APP.esc(m.description) + '</div></div></div>';
        }).join("") + '</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-top:8px">All rules are version-controlled with rollback, and promoted through controlled environments with VA approval before production activation. Read-only view.</div>' +
        '</div>';

      mount.querySelectorAll(".r-grp").forEach(function (b) {
        b.addEventListener("click", function () { groupBy = b.getAttribute("data-dim"); window.Views.rules.render(mount); });
      });

      // rule drill-down: expand logic / inputs / output on click (lazy-rendered)
      mount.querySelectorAll(".rule-row").forEach(function (row) {
        row.addEventListener("click", function () {
          var id = row.getAttribute("data-rule");
          var drill = mount.querySelector('.rule-drill[data-rule="' + id + '"]'); if (!drill) return;
          var open = drill.style.display !== "none";
          if (open) { drill.style.display = "none"; }
          else {
            if (!drill.getAttribute("data-filled")) { drill.innerHTML = ruleDetailHtml(window.DP.getRuleDetail(id)); drill.setAttribute("data-filled", "1"); window.APP.auditLog("RULE_DRILLDOWN", "Rule " + id); }
            drill.style.display = "block";
          }
          var c = row.querySelector(".rule-caret"); if (c) c.style.transform = open ? "" : "rotate(90deg)";
        });
      });
    }
  };
})();
