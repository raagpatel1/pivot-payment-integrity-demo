/* Releases — CI/CD & release management. Simulated app build+deploy pipeline and
   rule-promotion history through the controlled environments (dev → test → pre-prod
   → prod). Read-only; all data is synthetic/deterministic (DP.getReleasePipeline). */
(function () {
  window.Views = window.Views || {};

  // status → [background, text] color pair
  var STAT = {
    passed: ["var(--low-bg)", "var(--low-tx)"], Succeeded: ["var(--low-bg)", "var(--low-tx)"], live: ["var(--accent-l)", "var(--accent-d)"], promoted: ["var(--low-bg)", "var(--low-tx)"],
    running: ["var(--med-bg)", "var(--med-tx)"], Running: ["var(--med-bg)", "var(--med-tx)"], pending: ["var(--med-bg)", "var(--med-tx)"],
    failed: ["var(--high-bg)", "var(--high-tx)"], Failed: ["var(--high-bg)", "var(--high-tx)"],
    skipped: ["var(--surface)", "var(--text3)"], blocked: ["var(--surface)", "var(--text3)"]
  };
  function statPill(s, label) { var c = STAT[s] || ["var(--surface)", "var(--text2)"]; return '<span class="pill" style="background:' + c[0] + ';color:' + c[1] + ';font-size:10px">' + window.APP.esc(label || s) + '</span>'; }
  var STAT_ICON = { passed: "check", Succeeded: "check", live: "player-play", promoted: "check", running: "loader", Running: "loader", pending: "clock", failed: "x", Failed: "x", skipped: "minus", blocked: "lock" };
  function statIcon(s) { var c = STAT[s] || ["", "var(--text3)"]; return '<i class="ti ti-' + (STAT_ICON[s] || "point") + '" style="color:' + c[1] + '"></i>'; }

  window.Views.releases = {
    render: function (mount) {
      var p = window.DP.getReleasePipeline();

      // ---- environments strip: dev → test → pre-prod → prod ----
      var envCards = p.environments.map(function (e, i) {
        return (i ? '<div style="align-self:center;color:var(--text3);flex:none"><i class="ti ti-chevron-right"></i></div>' : '') +
          '<div class="card" style="flex:1;min-width:0;margin:0">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><span style="font-weight:600;font-size:12px">' + window.APP.esc(e.label) + '</span>' +
          '<span style="width:8px;height:8px;border-radius:50%;background:var(--low)" title="' + window.APP.esc(e.health) + '"></span></div>' +
          '<div class="mono" style="font-size:13px;font-weight:600;margin-top:4px">' + window.APP.esc(e.appVersion) + '</div>' +
          '<div class="mono" style="font-size:10.5px;color:var(--text2)">ruleset ' + window.APP.esc(e.ruleSet) + '</div>' +
          '<div style="font-size:10px;color:var(--text3);margin-top:5px"><i class="ti ti-clock"></i> ' + window.APP.esc(e.deployedAt) + '</div>' +
          '<div style="font-size:10px;color:var(--text2);margin-top:3px"><i class="ti ti-shield-check"></i> ' + window.APP.esc(e.gate) + '</div></div>';
      }).join("");

      // ---- app release pipeline (builds) ----
      var buildRows = p.builds.map(function (b) {
        var stages = b.stages.map(function (s) {
          var c = STAT[s.status] || ["var(--surface)", "var(--text3)"];
          return '<span title="' + window.APP.esc(s.name + " · " + s.status + (s.duration ? " · " + s.duration : "")) + '" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:' + c[1] + ';background:' + c[0] + ';border-radius:5px;padding:2px 6px">' + statIcon(s.status) + ' ' + window.APP.esc(s.name) + '</span>';
        }).join(" ");
        var logLines = b.log.map(function (l) { return window.APP.esc(l); }).join("\n");
        return '<div style="border-top:0.5px solid var(--border2)">' +
          '<div class="bld-row" data-b="' + b.id + '" style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;cursor:pointer">' +
          '<i class="ti ti-chevron-right bld-caret" style="color:var(--text3);font-size:15px;margin-top:1px;flex:none;transition:transform .12s"></i>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="mono" style="font-weight:600;font-size:12.5px">' + b.id + '</span>' +
          '<span class="tag">' + window.APP.esc(b.version) + '</span>' + statPill(b.status) +
          '<span class="muted" style="font-size:10.5px">' + window.APP.esc(b.trigger) + ' · deploy → ' + window.APP.esc(b.target) + '</span></div>' +
          '<div class="mono" style="font-size:10.5px;color:var(--text3);margin:3px 0 6px"><i class="ti ti-git-branch"></i> ' + window.APP.esc(b.branch) + ' @ ' + window.APP.esc(b.commit) + ' · ' + window.APP.esc(b.startedAt) + ' · ' + window.APP.esc(b.duration) + '</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px">' + stages + '</div></div></div>' +
          '<div class="bld-log" data-b="' + b.id + '" style="display:none;padding:0 0 10px 25px">' +
          '<pre class="mono" style="margin:0;background:#0f2033;color:#cfe8e2;border-radius:6px;padding:10px 12px;font-size:10.5px;line-height:1.6;overflow-x:auto;white-space:pre-wrap">' + logLines + '</pre></div>' +
          '</div>';
      }).join("");

      // ---- rule promotion history ----
      var ENV_LABEL = { dev: "dev", test: "test", preprod: "pre-prod", prod: "prod" };
      var promoRows = p.rulePromotions.map(function (r) {
        var steps = r.steps.map(function (s, i) {
          var c = STAT[s.status] || ["var(--surface)", "var(--text3)"];
          return (i ? '<div style="flex:none;align-self:flex-start;margin-top:9px;color:var(--text3)"><i class="ti ti-chevron-right" style="font-size:12px"></i></div>' : '') +
            '<div style="flex:1;min-width:0;text-align:center">' +
            '<div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text3)">' + ENV_LABEL[s.env] + '</div>' +
            '<div style="display:inline-flex;align-items:center;gap:3px;font-size:10.5px;color:' + c[1] + ';background:' + c[0] + ';border-radius:5px;padding:2px 7px;margin:2px 0">' + statIcon(s.status) + ' ' + window.APP.esc(s.version) + '</div>' +
            '<div style="font-size:9.5px;color:var(--text2);line-height:1.4">' + window.APP.esc(s.approver) + '</div>' +
            '<div class="mono" style="font-size:9px;color:var(--text3)">' + window.APP.esc(s.at) + '</div></div>';
        }).join("");
        return '<div style="padding:9px 0;border-top:0.5px solid var(--border2)">' +
          '<div style="font-weight:500;font-size:12.5px;margin-bottom:5px">' + window.APP.esc(r.name) + ' <span class="mono" style="font-weight:400;font-size:10.5px;color:var(--text3)">' + window.APP.esc(r.code) + ' · ' + window.APP.esc(r.version) + '</span></div>' +
          '<div style="display:flex;gap:4px;align-items:flex-start">' + steps + '</div></div>';
      }).join("");

      mount.innerHTML =
        '<div class="page">' +
        '<div class="page-head"><div><div class="page-title">Releases</div><div class="page-sub">CI/CD pipeline and rule-promotion history — every change flows through controlled environments with automated gates and VA approval before production.</div></div>' +
        '<span class="tag"><i class="ti ti-git-branch"></i> dev → test → pre-prod → production</span></div>' +

        '<div style="display:flex;gap:6px;margin-bottom:10px">' + envCards + '</div>' +

        '<div class="card" style="margin-bottom:10px"><div style="font-weight:500;font-size:13px;margin-bottom:2px"><i class="ti ti-rocket" style="color:var(--accent-d)"></i> Application release pipeline <span class="muted" style="font-weight:400;font-size:11px">· build → test → scan → deploy · click a build for its log</span></div>' +
        buildRows + '</div>' +

        '<div class="card" style="margin-bottom:10px"><div style="font-weight:500;font-size:13px;margin-bottom:2px"><i class="ti ti-versions" style="color:var(--accent-d)"></i> Rule promotion history <span class="muted" style="font-weight:400;font-size:11px">· each rule version promoted through the environments with sign-off</span></div>' +
        promoRows + '</div>' +

        '<div style="font-size:11px;color:var(--text2)"><i class="ti ti-info-circle"></i> Simulated pipeline for the demo. Rules and the app are version-controlled with rollback; production activation requires VA Change Advisory Board approval. Read-only view.</div>' +
        '</div>';

      // expand build logs
      mount.querySelectorAll(".bld-row").forEach(function (row) {
        row.addEventListener("click", function () {
          var id = row.getAttribute("data-b");
          var log = mount.querySelector('.bld-log[data-b="' + id + '"]'); if (!log) return;
          var open = log.style.display !== "none";
          log.style.display = open ? "none" : "block";
          var c = row.querySelector(".bld-caret"); if (c) c.style.transform = open ? "" : "rotate(90deg)";
          if (!open) window.APP.auditLog("RELEASE_LOG_VIEWED", "Build " + id);
        });
      });
    }
  };
})();
