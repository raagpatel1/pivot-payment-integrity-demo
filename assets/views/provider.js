/* Provider Report Card — 360 profile + FAMS composite-group radar, spoke
   drill-down, outlier comparison, repeat-offender watchlist, and
   adjudicate-from-provider (provider → its flagged claims). */
(function () {
  window.Views = window.Views || {};
  // Leads that are done and cannot feed a case (mirrors DP's CLOSED_STATUS).
  var CLOSED_LEAD = { "Dismissed": 1, "Cleared to pay": 1, "Denied": 1 };
  var selGroup = null; // currently drilled-into radar spoke

  window.Views.provider = {
    render: function (mount, params) {
      var id = params.id || window.APP.state.providerId;
      var p = window.DP.getProvider(id);
      if (!p) { mount.innerHTML = '<div class="page"><p>Provider not found.</p></div>'; return; }
      var allegs = window.DP.listAllegationsByProvider(id);
      var caseInfo = window.DP.getCase(id, "retrospective") || { caseLeads: [], openLeads: [], leadCount: 0, openCount: 0 };
      var hasCase = caseInfo.leadCount > 0;
      // Case-level state (narrative, related-case links, close/refer) belongs to the
      // whole case, so it is keyed by the case's canonical primary provider — NOT the
      // page you happen to be on. A multi-provider case (ring / chain) has a provider
      // page for each member; keying by the viewed id would fragment the narrative and
      // desync the closed state across those pages.
      var casePid = caseInfo.providerId || id;
      var claims = window.DP.listClaimsByProvider(id);
      var card = window.DP.getReportCard(id) || { groups: [], attributes: {} };
      var groups = card.groups;
      // default the drill-down to the highest-scoring outlier spoke
      if (!selGroup || !groups.find(function (g) { return g.group === selGroup; })) {
        var top = groups.slice().sort(function (a, b) { return (b.outlier - a.outlier) || (b.score - a.score); })[0];
        selGroup = top ? top.group : null;
      }
      var exposure = allegs.reduce(function (s, a) { return s + (a.exposurePost || 0); }, 0);
      var flaggedVisits = claims.filter(function (c) { return (c.lines || []).some(function (l) { return (l.violatesRuleIds || []).length; }); }).length;
      var ring = window.DP.listProviders().filter(function (x) { return x.tin === p.tin; }).length > 1;
      var chain = p.role === "chain";
      var bizId = p.registrationId || (ring ? p.tin : null);
      var hasBiz = bizId && window.DP.getBusiness(bizId);
      var repeatOffender = allegs.length >= 2 || chain;
      var watched = window.APP.isProviderWatched(id);
      var outlierCount = groups.filter(function (g) { return g.outlier; }).length;
      // Once a case exists, list the CASE's leads. A multi-provider case (shared TIN
      // or business registration) pulls in leads from its other providers, and
      // listing only this provider's leads would hide them.
      var caseRows = hasCase ? caseInfo.caseLeads.concat(caseInfo.openLeads) : allegs;
      // Name each lead's provider whenever the rows actually span more than one.
      // caseInfo.multiProvider only counts CONFIRMED leads, so a chain case whose
      // other providers are still feeding in would otherwise render their leads as
      // if they were this provider's.
      var spansProviders = caseRows.map(function (a) { return a.providerId; })
        .filter(function (v, i, arr) { return arr.indexOf(v) === i; }).length > 1;
      // Open leads that can be linked into this case in bulk ("10 leads from the
      // same provider → add them to the same case").
      var bulkable = caseRows.filter(function (a) { return !window.DP.isCaseLead(a) && !CLOSED_LEAD[a.status]; });
      var colspan = 7 + (hasCase && bulkable.length ? 1 : 0) + (spansProviders ? 1 : 0);

      mount.innerHTML =
        '<div class="page">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap"><span class="btn" id="pv-back" style="padding:5px 9px"><i class="ti ti-arrow-left"></i> ' + window.APP.esc(window.APP.backLabel()) + '</span>' +
        '<span class="page-title">' + window.APP.esc(p.name) + '</span>' + window.UI.riskChip(p.riskScore || 0) +
        (hasCase ? '<span class="pill ' + (caseInfo.status === "Under investigation" ? "p-esc" : "p-new") + '"><i class="ti ti-folder"></i> Case · ' + caseInfo.leadCount + ' confirmed' + (caseInfo.openCount ? ' · +' + caseInfo.openCount + ' open' : '') + '</span>'
          : (allegs.length ? '<span class="pill p-asg"><i class="ti ti-flag"></i> ' + allegs.length + ' open lead' + (allegs.length === 1 ? '' : 's') + ' · no case yet</span>' : '')) +
        (repeatOffender ? '<span class="pill" style="background:var(--high-bg);color:var(--high-tx)"><i class="ti ti-alert-triangle"></i> Repeat offender</span>' : '') +
        (window.DP.isExcluded(id) ? '<span class="pill" style="background:var(--high-bg);color:var(--high-tx)"><i class="ti ti-ban"></i> OIG excluded</span>' : '') +
        (watched ? '<span class="pill" style="background:var(--med-bg);color:var(--med-tx)"><i class="ti ti-bookmark"></i> On watchlist</span>' : '') +
        '<span style="flex:1"></span>' + window.EXPORT.group("pv") +
        '<button class="btn' + (watched ? ' on' : '') + '" id="pv-flag">' + (watched ? '<i class="ti ti-bookmark-off"></i> Remove from watchlist' : '<i class="ti ti-bookmark"></i> Flag for future reference') + '</button></div>' +

        '<div class="split" style="display:flex;gap:12px;align-items:flex-start">' +
        // ---- left rail: identity ----
        '<div class="rail" style="width:220px;flex:none;display:flex;flex-direction:column;gap:10px">' +
        '<div class="card"><div class="l" style="font-size:10.5px;color:var(--text2);margin-bottom:6px">Provider</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-bottom:7px">' + window.APP.esc(p.taxonomyLabel || "") + ' · ' + (p.taxonomyCode || "") + '</div>' +
        '<div class="mono" style="font-size:11px;line-height:1.7">NPI ' + p.npi + '<br>TIN ' + (ring ? '<span style="background:var(--high-bg);color:var(--high-tx);padding:0 3px;border-radius:3px">' + p.tin + '</span>' : p.tin) + '</div>' +
        (ring ? '<div style="font-size:11px;color:var(--high);margin-top:5px"><i class="ti ti-affiliate"></i> Shared TIN — provider ring</div>' : '') +
        (chain ? '<div style="font-size:11px;color:var(--high);margin-top:5px;line-height:1.5"><i class="ti ti-building-community"></i> ' + window.APP.esc(p.registration) + '<br><span style="color:var(--text2)">Officer ' + window.APP.esc(p.officer) + ' · ' + window.APP.esc(p.registrationId) + '</span></div>' : '') +
        '<div style="font-size:11px;color:var(--text2);margin-top:6px">' + window.APP.esc(p.city || "") + ', ' + (p.state || "") + '</div>' +
        (hasBiz ? '<div style="font-size:11.5px;color:var(--accent-d);margin-top:8px;cursor:pointer" id="pv-biz"><i class="ti ti-building-community"></i> View business entity</div>' : '') +
        '<div style="font-size:11.5px;color:var(--accent-d);margin-top:8px;cursor:pointer" id="pv-net"><i class="ti ti-share-3"></i> View in network</div></div>' +
        '</div>' +

        // ---- main ----
        '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px">' +
        (hasCase ? caseMilestoneHtml(casePid) : '') +
        '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">' +
        kpi("Claims", p.claimCount || claims.length) + kpi("Anomalous visits", flaggedVisits) +
        kpi(hasCase ? "Confirmed · open" : "Open leads", hasCase ? (caseInfo.leadCount + " · " + caseInfo.openCount) : allegs.length) + kpi("Lead exposure", window.DP.usdShort(exposure)) +
        kpi("Total paid", window.DP.usdShort(p.totalPaid || 0)) + '</div>' +

        // entity context — business, network & licensure in one place
        entityContextCard(id) +

        // report card: radar + drill-down
        '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><div style="font-weight:500;font-size:13px">Provider report card</div>' +
        '<span class="muted" style="font-size:11px">' + outlierCount + ' of ' + groups.length + ' groups are outliers · click a spoke to drill in</span></div>' +
        '<div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">' +
        '<div style="flex:none">' + radarSvg(groups, selGroup) + '<div style="display:flex;gap:14px;justify-content:center;font-size:10.5px;color:var(--text2);margin-top:2px"><span><span style="display:inline-block;width:9px;height:9px;background:var(--accent);border-radius:2px;vertical-align:middle"></span> This provider</span><span><span style="display:inline-block;width:10px;height:0;border-top:2px dashed #98a4b3;vertical-align:middle"></span> Peer norm</span></div></div>' +
        '<div style="flex:1;min-width:220px" id="pv-drill">' + drillHtml(p, card, selGroup) + '</div>' +
        '</div></div>' +

        // outlier comparison across providers on the selected group
        '<div class="card" id="pv-compare">' + compareHtml(id, selGroup) + '</div>' +

        // licensure & credentials (OIG LEIE exclusion, DEA, PECOS, board cert)
        licensureCard(id) +

        // TrackLight-style external profile / secondary scoring
        secondaryPanel(id) +

        // case story + relationships + disposition
        (hasCase ? caseNarrativeCard(casePid, caseInfo) : '') +
        (hasCase ? relatedCasesCard(casePid) : '') +
        (hasCase ? caseReviewCard(casePid, caseInfo) : '') +
        (hasCase ? caseAuthorityCard(casePid, caseInfo) : '') +

        // flagged claims — adjudicate from provider
        '<div class="card" style="padding:0;overflow:hidden"><div style="padding:11px 13px 6px;font-weight:500;font-size:13px">' + (hasCase ? 'Leads — case (' + caseInfo.leadCount + ' confirmed · ' + caseInfo.openCount + ' open feeding in)' : 'Leads (' + allegs.length + ' open · no case yet)') + ' <span class="muted" style="font-weight:400;font-size:11px">· confirm a lead to add it to the case' + (hasCase ? '; select open leads to link them to this case now' : '') + '</span></div>' +
        (hasCase && bulkable.length ? '<div id="pv-bulkbar" style="display:none;padding:8px 13px;background:var(--accent-l);border-top:0.5px solid #cfe7e3;border-bottom:0.5px solid #cfe7e3;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<span style="font-size:11.5px;font-weight:500" id="pv-bulkcount">0 selected</span>' +
          '<span style="font-size:11px;color:var(--text2)">link as</span>' +
          '<select id="pv-bulktype" class="input" style="font-size:11.5px;width:auto;flex:none">' +
          window.APP.LEAD_LINK_TYPES.map(function (t) { return '<option value="' + t.c + '" title="' + window.APP.esc(t.d) + '">' + t.l + '</option>'; }).join("") + '</select>' +
          '<button class="btn primary" id="pv-bulkgo" style="font-size:11px"><i class="ti ti-link"></i> Link to this case</button>' +
          '<span class="muted" style="font-size:10.5px">they join the case as each is confirmed</span></div>' : '') +
        '<table><thead><tr>' + (hasCase && bulkable.length ? '<th style="width:26px"><input type="checkbox" id="pv-bulkall" title="Select all open leads"></th>' : '') + '<th style="width:22px"></th><th>Risk</th><th>FWA type</th>' + (spansProviders ? '<th>Provider</th>' : '') + '<th>Status</th><th>Link</th><th class="right">Exposure</th><th></th></tr></thead><tbody>' +
        (caseRows.length ? caseRows.slice().sort(function (a, b) { return b.riskScore - a.riskScore; }).map(function (a, i) {
          var cl = a.claimId ? window.DP.getClaim(a.claimId) : null;
          var linked = window.DP.isCaseLead(a);
          var selectable = hasCase && !linked && !CLOSED_LEAD[a.status];
          var lt = window.APP.linkTypeFor(a.id) || (linked || (window.APP.state.caseLinks || {})[a.id] ? window.APP.suggestLinkType(a, caseInfo) : null);
          var linkCell = lt
            ? '<span class="tag" style="background:var(--accent-l);color:var(--accent-d)" title="' + window.APP.esc((window.APP.LEAD_LINK_TYPES.find(function (t) { return t.c === lt; }) || {}).d || "") + '"><i class="ti ti-link"></i> ' + window.APP.esc(window.APP.leadLinkLabel(lt)) + '</span>'
            : '<span class="muted" style="font-size:10.5px">—</span>';
          var lp = window.DP.getProvider(a.providerId) || {};
          var main = '<tr class="pv-lead" data-i="' + i + '" data-id="' + a.id + '" style="cursor:pointer">' +
            (hasCase && bulkable.length ? '<td style="width:26px">' + (selectable ? '<input type="checkbox" class="pv-bulkchk" data-id="' + a.id + '">' : '') + '</td>' : '') +
            '<td style="width:22px"><i class="ti ti-chevron-down pv-lcaret" style="color:var(--text3);font-size:13px"></i></td><td>' + window.UI.riskChip(a.riskScore) + '</td><td><span class="tag fwa">' + a.fwaType + '</span> <span class="mono" style="font-size:10.5px;color:var(--text3)">#' + a.id + '</span></td>' +
            (spansProviders ? '<td style="font-size:11.5px' + (a.providerId === id ? ';font-weight:500' : ';color:var(--text2)') + '">' + window.APP.esc(lp.name || a.providerId) + '</td>' : '') +
            '<td>' + window.UI.statusPill(window.UI.leadStatus(a)) + '</td><td>' + linkCell + '</td><td class="right" style="font-weight:500">' + window.DP.usd(a.exposurePost || 0) + '</td><td class="right"><span class="pv-review" data-id="' + a.id + '" style="font-size:11px;color:var(--accent-d);cursor:pointer">Review <i class="ti ti-chevron-right"></i></span></td></tr>';
          var detail = '<tr class="pv-ldetail" data-i="' + i + '" style="display:none"><td colspan="' + colspan + '" style="background:var(--surface);padding:10px 13px">' + leadLinesHtml(a, cl) + '</td></tr>';
          return main + detail;
        }).join("") : '<tr><td colspan="' + colspan + '" class="muted" style="padding:12px">No leads.</td></tr>') +
        '</tbody></table></div>' +

        // historical claims
        '<div class="card" style="padding:0;overflow:hidden"><div style="padding:11px 13px 6px;font-weight:500;font-size:13px">Historical claims <span class="muted" style="font-weight:400;font-size:11px">· showing ' + Math.min(claims.length, 10) + ' of ' + claims.length + '</span></div>' +
        '<table><thead><tr><th>Claim</th><th>Type</th><th>DOS</th><th>CPT</th><th class="right">Paid</th></tr></thead><tbody>' +
        claims.slice(0, 10).map(function (c) {
          var flagged = (c.lines || []).some(function (l) { return (l.violatesRuleIds || []).length; });
          return '<tr' + (flagged ? ' style="background:#fdf6f6"' : '') + '><td class="mono" style="font-size:11px">' + c.claimNumber + '</td><td>' + c.type + '</td><td class="mono" style="font-size:11px">' + c.dateOfService + '</td><td class="mono" style="font-size:11px">' + (c.lines || []).map(function (l) { return l.cpt; }).join(", ") + (flagged ? ' <i class="ti ti-flag" style="color:var(--high-tx)"></i>' : '') + '</td><td class="right">' + window.DP.usd(c.paidAmount) + '</td></tr>';
        }).join("") +
        '</tbody></table></div>' +
        '</div></div></div>';

      // ---- wiring ----
      document.getElementById("pv-back").addEventListener("click", function () { window.APP.goBack(); });
      document.getElementById("pv-net").addEventListener("click", function () { window.APP.nav("network"); });
      var pvBiz = document.getElementById("pv-biz"); if (pvBiz) pvBiz.addEventListener("click", function () { window.APP.openBusiness(bizId); });
      document.getElementById("pv-flag").addEventListener("click", function () { window.APP.toggleProviderWatch(id); rerender(id); });
      mount.querySelectorAll("tr.row").forEach(function (tr) { tr.addEventListener("click", function () { window.APP.openAllegation(tr.getAttribute("data-id")); }); });
      // expandable leads: click a lead row to reveal its full claim line items
      mount.querySelectorAll(".pv-lead").forEach(function (tr) {
        tr.addEventListener("click", function () {
          var i = tr.getAttribute("data-i");
          var d = mount.querySelector('.pv-ldetail[data-i="' + i + '"]'); if (!d) return;
          var open = d.style.display !== "none";
          d.style.display = open ? "none" : "table-row";
          var c = tr.querySelector(".pv-lcaret"); if (c) c.style.transform = open ? "" : "rotate(180deg)";
        });
      });
      mount.querySelectorAll(".pv-review").forEach(function (el) { el.addEventListener("click", function (e) { e.stopPropagation(); window.APP.openAllegation(el.getAttribute("data-id")); }); });
      wireRadar(mount, id);
      wireEntityContext(id);
      if (hasCase) { wireCaseNarrative(casePid, caseInfo, id); wireRelatedCases(casePid, id); wireCaseReview(casePid, caseInfo, id); wireCaseAuthority(casePid, caseInfo, id); wireBulkLink(mount, casePid, caseInfo, id); }

      // ---- report-card export ----
      var gHead = ["Group", "Score", "Peer norm", "Outlier"];
      var gRows = groups.map(function (g) { return [g.group, g.score, g.peer, g.outlier ? "Yes" : "No"]; });
      var aHead = ["Lead", "FWA Type", "Risk", "Status", "Exposure"];
      var aRows = allegs.slice().sort(function (a, b) { return b.riskScore - a.riskScore; }).map(function (a) { return ["#" + a.id, a.fwaType, a.riskScore, a.status, a.exposurePost || 0]; });
      var slug = "report-card-" + (p.name || "provider").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      window.EXPORT.wire("pv", {
        csv: function () { window.EXPORT.csv(slug, gHead, gRows); },
        xls: function () { window.EXPORT.xls(slug, "Report card", gHead, gRows); },
        pdf: function () {
          var body = window.EXPORT.kvHtml([
            ["Provider", p.name], ["NPI", p.npi], ["TIN", p.tin], ["Specialty", p.taxonomyLabel || ""], ["Location", (p.city || "") + ", " + (p.state || "")],
            ["Risk", (p.riskScore || 0) + "/100"], ["Claims", p.claimCount || 0], ["Open flagged", allegs.length]
          ]) +
            (chain ? "<div class='card'><b>Collusion chain:</b> " + window.EXPORT.htmlEsc(p.registration) + " · officer " + window.EXPORT.htmlEsc(p.officer) + " · " + window.EXPORT.htmlEsc(p.registrationId) + "</div>" : "") +
            "<h2>Report card — composite group scores</h2>" + window.EXPORT.tableHtml(gHead, gRows) +
            "<h2>Leads (" + aRows.length + ")</h2>" + window.EXPORT.tableHtml(aHead, aRows.map(function (r) { return r.slice(0, 4).concat([window.DP.usd(r[4])]); }));
          window.EXPORT.pdf("Provider report card — " + p.name, body);
        }
      });
    }
  };

  function rerender(id) { window.Views.provider.render(document.getElementById("view"), { id: id }); }

  // clicking a spoke label re-renders the drill-down + comparison in place
  function wireRadar(mount, id) {
    mount.querySelectorAll("[data-group]").forEach(function (el) {
      el.style.cursor = "pointer";
      el.addEventListener("click", function () {
        selGroup = el.getAttribute("data-group");
        var p = window.DP.getProvider(id), card = window.DP.getReportCard(id);
        document.getElementById("pv-drill").innerHTML = drillHtml(p, card, selGroup);
        document.getElementById("pv-compare").innerHTML = compareHtml(id, selGroup);
        // repaint radar highlight
        var holder = mount.querySelector(".pv-radar-holder");
        if (holder) holder.outerHTML = radarSvg(card.groups, selGroup);
        wireRadar(mount, id);
      });
    });
  }

  // ---- radar / spider SVG ----
  function radarSvg(groups, sel) {
    var n = groups.length; if (!n) return "";
    var W = 300, cx = 150, cy = 150, R = 104;
    var pt = function (i, v) { var ang = -Math.PI / 2 + i * 2 * Math.PI / n; var r = (v / 100) * R; return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)]; };
    var grid = [25, 50, 75, 100].map(function (lvl) {
      var pts = groups.map(function (_, i) { return pt(i, lvl).join(","); }).join(" ");
      return '<polygon points="' + pts + '" fill="none" stroke="#e3e8ee" stroke-width="1"></polygon>';
    }).join("");
    var axes = groups.map(function (_, i) { var e = pt(i, 100); return '<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0] + '" y2="' + e[1] + '" stroke="#e3e8ee" stroke-width="1"></line>'; }).join("");
    var peerPts = groups.map(function (g, i) { return pt(i, g.peer).join(","); }).join(" ");
    var provPts = groups.map(function (g, i) { return pt(i, g.score).join(","); }).join(" ");
    var peerPoly = '<polygon points="' + peerPts + '" fill="none" stroke="#98a4b3" stroke-width="1.5" stroke-dasharray="4,3"></polygon>';
    var provPoly = '<polygon points="' + provPts + '" fill="rgba(23,179,166,0.18)" stroke="#17b3a6" stroke-width="2"></polygon>';
    var dots = groups.map(function (g, i) { var c = pt(i, g.score); return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + (g.outlier ? 4.5 : 3) + '" fill="' + (g.outlier ? "#c6362f" : "#17b3a6") + '"></circle>'; }).join("");
    var labels = groups.map(function (g, i) {
      var l = pt(i, 128); var anchor = Math.abs(l[0] - cx) < 12 ? "middle" : (l[0] < cx ? "end" : "start");
      var isSel = g.group === sel;
      var short = g.group.replace(" & ", " &\n").split("\n");
      var nm = g.group === "Charge & Payment" ? "Charge/Pay" : g.group === "Diagnostic Testing" ? "Diagnostic" : g.group === "Distance / Travel" ? "Distance" : g.group;
      return '<g data-group="' + window.APP.esc(g.group) + '"><rect x="' + (anchor === "end" ? l[0] - 64 : anchor === "middle" ? l[0] - 32 : l[0]) + '" y="' + (l[1] - 15) + '" width="64" height="28" fill="' + (isSel ? "rgba(23,179,166,0.12)" : "transparent") + '" rx="4"></rect>' +
        '<text x="' + l[0] + '" y="' + (l[1] - 2) + '" text-anchor="' + anchor + '" font-size="10" font-family="IBM Plex Sans,sans-serif" font-weight="' + (isSel ? "600" : "500") + '" fill="' + (g.outlier ? "#8b1a13" : "#10243b") + '">' + nm + (g.outlier ? " ▲" : "") + '</text>' +
        '<text x="' + l[0] + '" y="' + (l[1] + 10) + '" text-anchor="' + anchor + '" font-size="9.5" font-family="IBM Plex Mono,monospace" fill="#5f6b7a">' + g.score + ' vs ' + g.peer + '</text></g>';
    }).join("");
    return '<div class="pv-radar-holder"><svg viewBox="-56 0 412 300" width="330" height="240" style="display:block">' + grid + axes + peerPoly + provPoly + dots + labels + '</svg></div>';
  }

  // ---- spoke drill-down (attribute values for the selected group) ----
  function drillHtml(p, card, group) {
    if (!group) return '';
    var gs = (card.groups || []).find(function (g) { return g.group === group; }) || {};
    var attrs = (card.attributes || {})[group] || [];
    return '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px"><div style="font-weight:600;font-size:13px">' + window.APP.esc(group) + '</div>' +
      '<span class="chip ' + (gs.outlier ? "rh" : "rl") + '"><span class="s">' + gs.score + '</span> ' + (gs.outlier ? "outlier" : "in range") + '</span>' +
      '<span class="muted" style="font-size:11px">peer norm ' + gs.peer + '</span></div>' +
      '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">' + (gs.outlier ? 'This provider sits well above the peer group on this composite — the attributes below drive the score.' : 'This provider is within the normal peer range on this composite.') + '</div>' +
      (attrs.length ? attrs.map(function (a) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:0.5px solid var(--border2)"><div style="font-size:11.5px' + (a.outlier ? ';color:var(--high-tx);font-weight:500' : '') + '">' + window.APP.esc(a.label) + (a.outlier ? ' <i class="ti ti-flag" style="font-size:11px"></i>' : '') + '</div><div style="text-align:right"><span class="mono" style="font-size:12px;font-weight:500">' + window.APP.esc(a.value) + '</span>' + (a.peer ? ' <span class="mono" style="font-size:10.5px;color:var(--text3)">vs ' + window.APP.esc(a.peer) + '</span>' : '') + '</div></div>';
      }).join("") : '<div class="muted" style="font-size:11.5px">No attribute detail for this group.</div>');
  }

  // ---- outlier comparison: rank providers on the selected group ----
  function compareHtml(id, group) {
    if (!group) return '';
    var rows = window.DP.rankByGroup(group);
    var peer = rows.length ? rows[0].peer : 0;
    var max = rows.length ? rows[0].score : 100;
    var top = rows.slice(0, 8);
    if (!top.find(function (r) { return r.id === id; })) { var me = rows.find(function (r) { return r.id === id; }); if (me) top.push(me); }
    var peerPct = Math.round(peer / Math.max(max, 1) * 100);
    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:500;font-size:13px">Outlier comparison — ' + window.APP.esc(group) + '</div><span class="muted" style="font-size:11px">how providers differ · peer norm ' + peer + '</span></div>' +
      // peer-norm reference marker labelled above the bars
      '<div style="position:relative;height:15px;margin-bottom:3px"><div style="position:absolute;left:' + peerPct + '%;transform:translateX(-50%);white-space:nowrap;font-size:9.5px;font-weight:600;color:var(--ink)"><i class="ti ti-caret-down-filled" style="font-size:11px;vertical-align:middle"></i> peer norm ' + peer + '</div></div>' +
      top.map(function (r) {
        var self = r.id === id;
        var w = Math.round(r.score / Math.max(max, 1) * 100);
        return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:3px"><span' + (self ? ' style="font-weight:600;color:var(--accent-d)"' : '') + '>' + window.APP.esc(r.name) + (self ? ' ◀ this provider' : '') + ' <span class="muted" style="font-weight:400">· ' + window.APP.esc(r.specialty || "") + '</span></span><span style="font-weight:500' + (r.outlier ? ';color:var(--high-tx)' : '') + '">' + r.score + '</span></div>' +
          '<div style="height:10px;background:var(--border2);border-radius:4px;position:relative"><div style="height:100%;width:' + w + '%;background:' + (self ? "var(--accent)" : r.outlier ? "var(--high)" : "#c2cad4") + ';border-radius:4px 0 0 4px"></div><div style="position:absolute;left:' + peerPct + '%;top:-2px;bottom:-2px;width:2px;background:var(--ink);border-radius:1px"></div></div></div>';
      }).join("") +
      '<div style="font-size:10.5px;color:var(--text3);margin-top:4px"><i class="ti ti-caret-down-filled" style="color:var(--ink)"></i> Dark line = peer norm (' + peer + '). Red bars = outlier providers; teal = the provider in view.</div>';
  }

  function kpi(l, v) { return '<div class="kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div></div>'; }

  // ---------- case lifecycle tracker ----------
  // Stage labels live here so Josh can rename them without touching the logic.
  var CASE_STAGES = ["Case opened", "Case development", "Supervisor review", "Disposition", "Closed"];

  // Derive the current stage index (1-based) and an optional note from existing
  // state — no new state, no new actions.
  function caseMilestoneModel(pid) {
    var closed  = window.APP.isCaseClosed(pid);
    var ref     = window.APP.referralFor(pid);
    var review  = window.APP.caseReviewFor(pid);

    if (closed)
      return { cur: 5, note: null };

    if (review && review.status === "approved")
      return { cur: 4, note: ref ? "Referred to " + window.APP.esc(ref.label) + "." : null };

    if (review && review.status === "pending")
      return { cur: 3, note: "Submitted by " + window.APP.esc(review.submittedBy) + " — awaiting supervisor review (Karen Boyd)." };

    if (review && review.status === "returned")
      return { cur: 2, note: "Returned by " + window.APP.esc(review.reviewedBy || "supervisor") + (review.note ? ": " + window.APP.esc(review.note) : "") + " — revise and resubmit." };

    // No review record, not closed: case development
    return { cur: 2, note: null };
  }

  function caseMilestoneHtml(pid) {
    var m = caseMilestoneModel(pid);
    var dots = CASE_STAGES.map(function (label, i) {
      var done = i < m.cur - 1, cur = i === m.cur - 1;
      var bg = done ? "var(--accent)" : cur ? "#fff" : "var(--border2)";
      var bd = done ? "var(--accent)" : cur ? "var(--accent)" : "var(--border)";
      var inner = done
        ? '<i class="ti ti-check" style="color:#fff;font-size:10px"></i>'
        : cur ? '<span style="width:6px;height:6px;border-radius:50%;background:var(--accent);display:block"></span>' : '';
      var isLast = i === CASE_STAGES.length - 1;
      return '<div style="display:flex;align-items:center;flex:' + (isLast ? "none" : "1") + ';min-width:0">' +
        '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:none">' +
        '<div style="width:16px;height:16px;border-radius:50%;background:' + bg + ';border:1.5px solid ' + bd + ';display:flex;align-items:center;justify-content:center">' + inner + '</div>' +
        '<span style="font-size:10px;white-space:nowrap;color:' + (done || cur ? "var(--ink)" : "var(--text3)") + ';font-weight:' + (cur ? "600" : "400") + '">' + window.APP.esc(label) + '</span></div>' +
        (isLast ? '' : '<div style="flex:1;height:1.5px;background:' + (done ? "var(--accent)" : "var(--border2)") + ';margin:0 6px;margin-bottom:15px"></div>') +
        '</div>';
    }).join("");
    return '<div class="card" style="padding:10px 14px 8px;margin-bottom:0">' +
      '<div style="display:flex;align-items:flex-start;padding:0 2px 4px">' + dots + '</div>' +
      (m.note ? '<div style="border-top:0.5px solid var(--border2);margin-top:6px;padding-top:6px;font-size:11px;color:var(--text2)"><i class="ti ti-info-circle"></i> ' + m.note + '</div>' : '') +
      '</div>';
  }

  // ---------- case narrative ----------
  // The story spanning a case's leads. A lead's justification explains one claim;
  // this explains why these leads are one case.
  function caseNarrativeCard(pid, caseInfo) {
    var n = window.APP.getCaseNarrative(pid);
    return '<div class="card" id="pv-narr">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:7px">' +
      '<div style="font-weight:500;font-size:13px"><i class="ti ti-notes" style="color:var(--accent-d)"></i> Case narrative <span class="muted" style="font-weight:400;font-size:11px">· why these ' + (caseInfo.leadCount + caseInfo.openCount) + ' leads are one case — travels with the case to review, referral and appeal</span></div>' +
      (n ? '<span class="muted" style="font-size:10.5px">' + window.APP.esc(n.by) + ' · ' + window.APP.fmtTs(n.ts) + '</span>' : '') + '</div>' +
      (n ? '<div id="pv-narr-view" style="font-size:12.5px;line-height:1.6;color:var(--text);background:var(--surface);border:0.5px solid var(--border);border-radius:7px;padding:9px 11px">' + window.APP.esc(n.text) + '</div>' +
        '<div style="margin-top:7px"><button class="btn" id="pv-narr-edit" style="font-size:11px"><i class="ti ti-edit"></i> Revise narrative</button></div>'
        : '<div class="muted" style="font-size:11.5px;padding:2px 0 7px">No narrative yet — write the case story, or draft it from the leads and edit.</div>') +
      '<div id="pv-narr-edit-box" style="display:' + (n ? "none" : "block") + ';margin-top:' + (n ? "7px" : "0") + '">' +
      '<textarea id="pv-narr-text" class="input" style="min-height:88px;font-size:12.5px;line-height:1.6" placeholder="Describe the case across its leads…">' + window.APP.esc(n ? n.text : "") + '</textarea>' +
      '<div style="display:flex;gap:6px;margin-top:7px;flex-wrap:wrap">' +
      '<button class="btn primary" id="pv-narr-save" style="font-size:11px"><i class="ti ti-check"></i> Save narrative</button>' +
      '<button class="btn" id="pv-narr-draft" style="font-size:11px"><i class="ti ti-sparkles"></i> Draft with AI</button>' +
      (n ? '<button class="btn" id="pv-narr-cancel" style="font-size:11px">Cancel</button>' : '') + '</div></div>' +
      '</div>';
  }
  // pid = the case's canonical primary provider (state key); viewId = the provider
  // page actually being viewed (re-render target, so a save keeps you in place).
  function wireCaseNarrative(pid, caseInfo, viewId) {
    var box = document.getElementById("pv-narr-edit-box"); if (!box) return;
    var ed = document.getElementById("pv-narr-edit");
    if (ed) ed.addEventListener("click", function () { box.style.display = "block"; ed.style.display = "none"; });
    var cancel = document.getElementById("pv-narr-cancel");
    if (cancel) cancel.addEventListener("click", function () { box.style.display = "none"; if (ed) ed.style.display = ""; });
    document.getElementById("pv-narr-save").addEventListener("click", function () {
      window.APP.setCaseNarrative(pid, document.getElementById("pv-narr-text").value);
      rerender(viewId);
    });
    document.getElementById("pv-narr-draft").addEventListener("click", function () {
      var ta = document.getElementById("pv-narr-text");
      var t = window.AI.caseNarrative(caseInfo), i = 0;
      ta.value = "";
      var iv = setInterval(function () { i += 4; ta.value = t.slice(0, i); if (i >= t.length) { clearInterval(iv); ta.value = t; } }, 12);
    });
  }

  // ---------- related cases (typed case ↔ case links) ----------
  function relatedCasesCard(pid) {
    var rels = window.APP.caseRelations(pid);
    var others = window.DP.listCases({ mode: "retrospective" }).filter(function (c) { return c.providerId !== pid; });
    var rows = rels.map(function (r) {
      var op = window.DP.getProvider(r.otherPid) || {};
      // "supersedes" reads backwards from the other side — say so plainly
      var verb = r.outbound ? window.APP.caseLinkLabel(r.type)
        : (r.type === "supersedes" ? "Superseded by" : r.type === "duplicate" ? "Duplicate of" : "Related to");
      return '<div style="display:flex;gap:9px;align-items:center;padding:7px 0;border-top:0.5px solid var(--border2)">' +
        '<span class="tag" style="background:var(--accent-l);color:var(--accent-d)"><i class="ti ti-link"></i> ' + window.APP.esc(verb) + '</span>' +
        '<div style="flex:1;min-width:0"><div class="pv-relopen" data-pid="' + r.otherPid + '" style="font-size:12.5px;font-weight:500;color:var(--accent-d);cursor:pointer">' + window.APP.esc(op.name || r.otherPid) + ' <i class="ti ti-external-link" style="font-size:10px"></i></div>' +
        '<div class="muted" style="font-size:10.5px">CASE-' + r.otherPid + (r.note ? ' · ' + window.APP.esc(r.note) : '') + ' · ' + window.APP.esc(r.by || "") + '</div></div>' +
        '<span class="pv-relrm" data-pid="' + r.otherPid + '" data-type="' + r.type + '" style="color:var(--text3);cursor:pointer;font-size:13px" title="Remove link"><i class="ti ti-x"></i></span></div>';
    }).join("");
    return '<div class="card" id="pv-rel">' +
      '<div style="font-weight:500;font-size:13px;margin-bottom:2px"><i class="ti ti-link" style="color:var(--accent-d)"></i> Related cases <span class="muted" style="font-weight:400;font-size:11px">· typed links to other cases</span></div>' +
      (rows || '<div class="muted" style="font-size:11.5px;padding:5px 0">No linked cases.</div>') +
      (others.length ? '<div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap;align-items:center">' +
        '<select id="pv-rel-type" class="input" style="font-size:11.5px;width:auto;flex:none">' +
        window.APP.CASE_LINK_TYPES.map(function (t) { return '<option value="' + t.c + '" title="' + window.APP.esc(t.d) + '">' + t.l + '</option>'; }).join("") + '</select>' +
        '<select id="pv-rel-case" class="input" style="font-size:11.5px;flex:1;min-width:180px">' +
        others.map(function (c) { return '<option value="' + c.providerId + '">' + window.APP.esc(c.name) + ' · CASE-' + c.providerId + ' (' + c.leadCount + ' lead' + (c.leadCount === 1 ? '' : 's') + ')</option>'; }).join("") + '</select>' +
        '<button class="btn" id="pv-rel-add" style="font-size:11px;flex:none"><i class="ti ti-plus"></i> Link</button></div>' : '') +
      '</div>';
  }
  function wireRelatedCases(pid, viewId) {
    var add = document.getElementById("pv-rel-add");
    if (add) add.addEventListener("click", function () {
      window.APP.addCaseRelation(pid, document.getElementById("pv-rel-case").value, document.getElementById("pv-rel-type").value);
      rerender(viewId);
    });
    document.querySelectorAll(".pv-relrm").forEach(function (el) {
      el.addEventListener("click", function () { window.APP.removeCaseRelation(pid, el.getAttribute("data-pid"), el.getAttribute("data-type")); rerender(viewId); });
    });
    document.querySelectorAll(".pv-relopen").forEach(function (el) {
      el.addEventListener("click", function () { window.APP.openProvider(el.getAttribute("data-pid")); });
    });
  }

  // ---------- bulk link leads → this case ----------
  // "See 10 leads from the same provider — add to the same case." Linking sets each
  // lead's destination; the lead actually joins the case when it is confirmed.
  function wireBulkLink(mount, pid, caseInfo, viewId) {
    var bar = document.getElementById("pv-bulkbar"); if (!bar) return;
    var boxes = function () { return [].slice.call(mount.querySelectorAll(".pv-bulkchk")); };
    var picked = function () { return boxes().filter(function (b) { return b.checked; }); };
    var refresh = function () {
      var n = picked().length;
      bar.style.display = n ? "flex" : "none";
      document.getElementById("pv-bulkcount").textContent = n + " lead" + (n === 1 ? "" : "s") + " selected";
    };
    boxes().forEach(function (b) {
      // the row itself expands on click — don't let the checkbox trigger that
      b.addEventListener("click", function (e) { e.stopPropagation(); refresh(); });
    });
    var all = document.getElementById("pv-bulkall");
    if (all) all.addEventListener("click", function (e) {
      e.stopPropagation();
      boxes().forEach(function (b) { b.checked = all.checked; });
      refresh();
    });
    var go = document.getElementById("pv-bulkgo");
    if (go) go.addEventListener("click", function () {
      var type = document.getElementById("pv-bulktype").value;
      var ids = picked().map(function (b) { return b.getAttribute("data-id"); });
      if (!ids.length) return;
      ids.forEach(function (lid) {
        var lead = window.DP.getAllegation(lid);
        window.APP.setLeadCase(lid, { mode: "existing", caseKey: caseInfo.caseKey, caseName: caseInfo.name, linkType: type || window.APP.suggestLinkType(lead, caseInfo) });
      });
      window.APP.auditLog("CASE_LEADS_LINKED", "Case " + pid + " (" + caseInfo.name + ") · " + ids.length + " lead" + (ids.length === 1 ? "" : "s") + " linked as “" + window.APP.leadLinkLabel(type) + "” · " + ids.map(function (i) { return "#" + i; }).join(", "));
      rerender(viewId);
    });
    refresh();
  }

  // ---------- case-level review (submit → approve / return) ----------
  // Distinct from per-lead approvals: the analyst hands the whole case up, the
  // supervisor reviews narrative + all leads + total exposure and signs off.
  function caseReviewCard(pid, caseInfo) {
    var r = window.APP.caseReviewFor(pid);
    var sup = window.APP.isSupervisor();
    var hasNarr = !!window.APP.getCaseNarrative(pid);
    var summary = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0">' +
      miniKpi("Confirmed leads", caseInfo.leadCount) + miniKpi("Open feeding in", caseInfo.openCount) + miniKpi("Total exposure", window.DP.usd(caseInfo.exposure || 0)) + '</div>';

    // approved
    if (r && r.status === "approved") {
      return '<div class="card" id="pv-review" style="border-color:#bfe0c9">' +
        '<div style="display:flex;align-items:center;gap:8px"><i class="ti ti-checks" style="color:var(--low);font-size:20px"></i>' +
        '<div><div style="font-weight:500;font-size:13px">Case approved</div>' +
        '<div class="muted" style="font-size:11px">Approved by ' + window.APP.esc(r.reviewedBy) + ' · ' + window.APP.fmtTs(r.reviewedAt) + ' — ready for disposition below.</div></div></div></div>';
    }
    // pending — supervisor acts; analyst waits
    if (r && r.status === "pending") {
      if (sup) {
        return '<div class="card" id="pv-review" style="border-color:#cfe7e3">' +
          '<div style="font-weight:500;font-size:13px;margin-bottom:2px"><i class="ti ti-user-shield" style="color:var(--accent-d)"></i> Case review <span class="muted" style="font-weight:400;font-size:11px">· supervisor · submitted by ' + window.APP.esc(r.submittedBy) + ' · ' + window.APP.fmtTs(r.submittedAt) + '</span></div>' +
          '<div class="muted" style="font-size:11px">Review the narrative, the leads and the total exposure, then approve the case or return it to the analyst.</div>' +
          summary +
          '<div style="display:flex;gap:8px;align-items:flex-start"><input id="pv-review-note" class="input" placeholder="Return note (required to return)…" style="flex:1;font-size:12px">' +
          '<button class="btn" id="pv-review-return" style="font-size:11px"><i class="ti ti-corner-up-left"></i> Return</button>' +
          '<button class="btn primary" id="pv-review-approve" style="font-size:11px;background:var(--low);border-color:var(--low)"><i class="ti ti-check"></i> Approve case</button></div></div>';
      }
      return '<div class="card" id="pv-review">' +
        '<div style="display:flex;align-items:center;gap:8px"><i class="ti ti-clock-hour-4" style="color:var(--med);font-size:20px"></i>' +
        '<div><div style="font-weight:500;font-size:13px">Pending supervisor review</div>' +
        '<div class="muted" style="font-size:11px">Submitted ' + window.APP.fmtTs(r.submittedAt) + '. Karen Boyd will approve the case or return it.</div></div></div>' + summary + '</div>';
    }
    // returned — analyst revises & resubmits
    if (r && r.status === "returned") {
      return '<div class="card" id="pv-review" style="border-color:#e7c99a">' +
        '<div style="font-weight:500;font-size:13px;margin-bottom:6px"><i class="ti ti-corner-up-left" style="color:var(--med-tx)"></i> Returned by the supervisor</div>' +
        '<div style="background:var(--med-bg);border:0.5px solid #e7c99a;border-radius:7px;padding:8px 10px;font-size:11.5px;color:var(--med-tx)">' + window.APP.esc(r.reviewedBy) + ': ' + window.APP.esc(r.note || "(no note)") + '</div>' +
        (sup ? '' : '<div style="margin-top:8px"><button class="btn primary" id="pv-review-submit" style="font-size:11px"' + (hasNarr ? "" : " disabled") + '><i class="ti ti-send"></i> Revise &amp; resubmit for review</button></div>') +
        '</div>';
    }
    // not yet submitted — analyst (or supervisor) submits
    return '<div class="card" id="pv-review">' +
      '<div style="font-weight:500;font-size:13px;margin-bottom:2px"><i class="ti ti-clipboard-check" style="color:var(--accent-d)"></i> Case review <span class="muted" style="font-weight:400;font-size:11px">· hand the case up for supervisor sign-off</span></div>' +
      '<div class="muted" style="font-size:11px">Once the case story is written and its leads are confirmed, submit the whole case for supervisor review.</div>' + summary +
      '<button class="btn primary" id="pv-review-submit" style="font-size:11px"' + (hasNarr ? "" : " disabled") + '><i class="ti ti-send"></i> Submit case for review</button>' +
      (hasNarr ? '' : '<div class="muted" style="font-size:10.5px;margin-top:5px"><i class="ti ti-info-circle"></i> Write the case narrative above before submitting.</div>') +
      '</div>';
  }
  function miniKpi(l, v) { return '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:7px;padding:7px 9px"><div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.03em">' + l + '</div><div style="font-size:14px;font-weight:600;margin-top:1px">' + window.APP.esc(v) + '</div></div>'; }
  function wireCaseReview(pid, caseInfo, viewId) {
    var submit = document.getElementById("pv-review-submit");
    if (submit) submit.addEventListener("click", function () {
      var res = window.APP.submitCaseForReview(pid);
      if (res && res.error === "narrative-required") { window.alert("Write the case narrative before submitting for review."); return; }
      rerender(viewId);
    });
    var appr = document.getElementById("pv-review-approve");
    if (appr) appr.addEventListener("click", function () { window.APP.caseReviewAction(pid, "approve"); rerender(viewId); });
    var ret = document.getElementById("pv-review-return");
    if (ret) ret.addEventListener("click", function () {
      var note = document.getElementById("pv-review-note").value.trim();
      if (!note) { document.getElementById("pv-review-note").focus(); return; }
      window.APP.caseReviewAction(pid, "return", note); rerender(viewId);
    });
  }

  // ---------- case authority: close & refer (supervisor only) ----------
  // Analysts work leads and add them to cases; closing a case or referring it out
  // is the supervisor's call.
  function caseAuthorityCard(pid, caseInfo) {
    var closed = window.APP.isCaseClosed(pid), ref = window.APP.referralFor(pid);
    var c = closed ? window.APP.state.closedCases[pid] : null;
    var sup = window.APP.isSupervisor();
    var refBox = ref
      ? '<div style="background:var(--med-bg);border:0.5px solid #e7c99a;border-radius:7px;padding:8px 10px;font-size:11.5px;color:var(--med-tx)"><i class="ti ti-send"></i> <b>Referred to ' + window.APP.esc(ref.label) + '</b> by ' + window.APP.esc(ref.by) + ' · ' + window.APP.fmtTs(ref.ts) + (ref.note ? '<div style="margin-top:3px">' + window.APP.esc(ref.note) + '</div>' : '') + '</div>'
      : '';
    if (closed) {
      return '<div class="card" id="pv-auth">' +
        '<div style="font-weight:500;font-size:13px;margin-bottom:7px"><i class="ti ti-archive" style="color:var(--text2)"></i> Case closed</div>' +
        refBox + (refBox ? '<div style="height:7px"></div>' : '') +
        '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:7px;padding:9px 11px">' +
        '<div style="font-size:12px;font-weight:500">' + window.APP.esc(c.reason || "") + ' · ' + window.APP.esc(c.reasonText || "") + '</div>' +
        (c.narrative ? '<div style="font-size:12px;color:var(--text2);margin-top:5px;line-height:1.6">' + window.APP.esc(c.narrative) + '</div>' : '') +
        '<div class="muted" style="font-size:10.5px;margin-top:5px">Closed by ' + window.APP.esc(c.by || "") + ' · ' + window.APP.fmtTs(c.ts) + '</div></div>' +
        (sup ? '<div style="margin-top:8px"><button class="btn" id="pv-reopen" style="font-size:11px"><i class="ti ti-rotate"></i> Reopen case</button></div>'
          : '<div class="muted" style="font-size:11px;margin-top:7px"><i class="ti ti-lock"></i> Only a supervisor can reopen a closed case.</div>') +
        '</div>';
    }
    if (!sup) {
      return '<div class="card" id="pv-auth">' +
        '<div style="font-weight:500;font-size:13px;margin-bottom:6px"><i class="ti ti-user-shield" style="color:var(--text2)"></i> Case disposition</div>' +
        refBox + (refBox ? '<div style="height:7px"></div>' : '') +
        '<div class="muted" style="font-size:11.5px;line-height:1.6"><i class="ti ti-lock"></i> Closing this case or referring it out is a supervisor action. You can keep working its leads, add leads to it, and write the case narrative — then hand it to Karen Boyd for disposition.</div></div>';
    }
    return '<div class="card" id="pv-auth" style="border-color:#cfe7e3">' +
      '<div style="font-weight:500;font-size:13px;margin-bottom:7px"><i class="ti ti-user-shield" style="color:var(--accent-d)"></i> Case disposition <span class="muted" style="font-weight:400;font-size:11px">· supervisor</span></div>' +
      refBox + (refBox ? '<div style="height:8px"></div>' : '') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<button class="btn" id="pv-refer-btn" style="font-size:11px"><i class="ti ti-send"></i> ' + (ref ? "Re-refer" : "Refer out") + '</button>' +
      '<button class="btn primary" id="pv-close-btn" style="font-size:11px"><i class="ti ti-checkbox"></i> Close case</button></div>' +
      // refer
      '<div id="pv-refer-box" style="display:none;margin-top:9px;background:var(--surface);border:0.5px solid var(--border);border-radius:7px;padding:9px 11px">' +
      '<div style="font-size:11px;color:var(--text2);margin-bottom:5px">Refer to</div>' +
      '<select id="pv-refer-target" class="input" style="font-size:12px">' + window.APP.REFERRAL_TARGETS.map(function (t) { return '<option value="' + t.c + '">' + t.l + '</option>'; }).join("") + '</select>' +
      '<textarea id="pv-refer-note" class="input" style="margin-top:6px;min-height:44px;font-size:12px" placeholder="Referral note (what you are asking them to do)…"></textarea>' +
      '<button class="btn primary" id="pv-refer-go" style="margin-top:6px;font-size:11px"><i class="ti ti-send"></i> Send referral</button></div>' +
      // close
      '<div id="pv-close-box" style="display:none;margin-top:9px;background:var(--surface);border:0.5px solid var(--border);border-radius:7px;padding:9px 11px">' +
      '<div style="font-size:11px;color:var(--text2);margin-bottom:5px">Close reason <span style="color:var(--high-tx)">*</span></div>' +
      '<select id="pv-close-reason" class="input" style="font-size:12px">' +
      window.APP.CLOSE_REASONS.map(function (r) { return '<option value="' + r.c + '">' + r.c + ' · ' + window.APP.esc(r.t) + '</option>'; }).join("") + '</select>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin:7px 0 4px">' +
      '<span style="font-size:11px;color:var(--text2)">Closing narrative <span style="color:var(--high-tx)">*</span></span>' +
      '<button class="btn" id="pv-close-draft" style="padding:3px 8px;font-size:11px"><i class="ti ti-sparkles"></i> Draft with AI</button></div>' +
      '<textarea id="pv-close-narr" class="input" style="min-height:64px;font-size:12px" placeholder="How this case was resolved…"></textarea>' +
      '<button class="btn primary" id="pv-close-go" style="margin-top:7px;font-size:11px" disabled><i class="ti ti-checkbox"></i> Close case</button>' +
      '<div class="muted" style="font-size:10.5px;margin-top:5px">A closed case keeps its narrative and reason on the record.</div></div>' +
      '</div>';
  }
  function wireCaseAuthority(pid, caseInfo, viewId) {
    var ro = document.getElementById("pv-reopen");
    if (ro) ro.addEventListener("click", function () { window.APP.reopenCase(pid); rerender(viewId); });
    var cb = document.getElementById("pv-close-btn"), closeBox = document.getElementById("pv-close-box");
    var rb = document.getElementById("pv-refer-btn"), referBox = document.getElementById("pv-refer-box");
    if (rb) rb.addEventListener("click", function () { referBox.style.display = referBox.style.display === "none" ? "block" : "none"; });
    var rg = document.getElementById("pv-refer-go");
    if (rg) rg.addEventListener("click", function () {
      window.APP.referCase(pid, document.getElementById("pv-refer-target").value, document.getElementById("pv-refer-note").value);
      rerender(viewId);
    });
    if (!cb) return;
    cb.addEventListener("click", function () { closeBox.style.display = closeBox.style.display === "none" ? "block" : "none"; });
    var narr = document.getElementById("pv-close-narr"), go = document.getElementById("pv-close-go");
    var refresh = function () { go.disabled = !narr.value.trim(); };
    narr.addEventListener("input", refresh);
    document.getElementById("pv-close-draft").addEventListener("click", function () {
      var reason = document.getElementById("pv-close-reason");
      var t = "Closing as " + (window.APP.closeReasonText(reason.value) || "").toLowerCase() + ". " + window.AI.caseNarrative(caseInfo), i = 0;
      narr.value = "";
      var iv = setInterval(function () { i += 4; narr.value = t.slice(0, i); refresh(); if (i >= t.length) { clearInterval(iv); narr.value = t; refresh(); } }, 12);
    });
    go.addEventListener("click", function () {
      window.APP.closeCase(pid, document.getElementById("pv-close-reason").value, narr.value);
      rerender(viewId);
    });
    refresh();
    // deep-linked from the Cases list "Review & close" button
    if (window.APP.state.caseCloseIntent === pid) {
      window.APP.state.caseCloseIntent = null;
      closeBox.style.display = "block";
      document.getElementById("pv-auth").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // full claim line-item detail for an expanded lead on the case page
  function leadLinesHtml(a, cl) {
    if (!cl || !(cl.lines || []).length) return '<div style="font-size:11.5px;color:var(--text2)"><i class="ti ti-info-circle"></i> Manual / referral lead — no itemized claim on file yet. Open the lead to attach supporting records.</div>';
    var prepay = a.mode === "prepay";
    var lineExp = function (l) { return prepay ? (l.allowed || 0) : (l.paid || 0); };
    var head = '<div style="font-size:11px;color:var(--text2);margin-bottom:6px"><span class="mono">' + cl.claimNumber + '</span> · ' + cl.type + ' · DOS ' + cl.dateOfService + ' · Dx ' + ((cl.diagnosisCodes || []).join(",") || "—") + ' · billed ' + window.DP.usd(cl.billedAmount) + ' · exposure ' + window.DP.usd(prepay ? cl.allowedAmount : cl.paidAmount) + ' (' + (prepay ? "pre-pay" : "post-pay") + ')</div>';
    var rows = cl.lines.map(function (l) {
      var fl = (l.violatesRuleIds || []).length > 0;
      return '<tr' + (fl ? ' style="background:var(--high-bg)"' : '') + '><td class="mono">' + l.cpt + '</td><td>' + window.APP.esc(l.description) + '</td><td>' + ((l.modifiers || []).length ? '<span class="mono" style="background:var(--high-bg);color:var(--high-tx);padding:1px 5px;border-radius:4px">' + l.modifiers.join(",") + '</span>' : "—") + '</td><td class="right">' + l.units + '</td><td class="right">$' + l.billed + '</td><td class="right">$' + lineExp(l) + '</td><td style="font-size:10.5px;white-space:nowrap">' + (fl ? '<span style="color:var(--high-tx)"><i class="ti ti-flag"></i> flagged</span>' : '<span style="color:var(--text3)">clean</span>') + '</td></tr>';
    }).join("");
    return head + '<table style="width:100%"><thead><tr><th>CPT</th><th>Description</th><th>Mod</th><th class="right">Units</th><th class="right">Billed</th><th class="right">Exposure</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // ---- TrackLight-style external profile / secondary scoring ----
  function secondaryPanel(id) {
    var s = window.DP.getSecondaryProfile(id); if (!s) return "";
    var b = s.business, o = s.officer;
    var band = s.score >= 75 ? "rh" : s.score >= 50 ? "rm" : "rl";
    var metric = function (label, val, flag) { return '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-top:0.5px solid var(--border2);font-size:11.5px"><span style="color:var(--text2)">' + label + '</span><span style="font-weight:500' + (flag ? ";color:var(--high-tx)" : "") + '">' + val + '</span></div>'; };
    var osintList = function (arr) {
      return arr.map(function (t) {
        var adverse = !/^No adverse|^No SSA Death/i.test(t);
        return '<div style="display:flex;gap:6px;font-size:11px;color:' + (adverse ? "var(--high-tx)" : "var(--low-tx)") + ';padding:2px 0"><i class="ti ti-' + (adverse ? "alert-triangle" : "circle-check") + '" style="margin-top:1px"></i><span>' + window.APP.esc(t) + '</span></div>';
      }).join("");
    };
    return '<div class="card">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:10px;flex-wrap:wrap">' +
      '<div style="font-weight:500;font-size:13px"><i class="ti ti-world-search" style="color:var(--accent-d)"></i> External profile &amp; secondary scoring <span class="muted" style="font-weight:400;font-size:11px">· TrackLight-style corroboration from outside the claims data (synthetic)</span></div>' +
      '<span class="chip ' + band + '"><span class="s">' + s.score + '</span> secondary risk</span></div>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:250px">' +
      '<div style="font-size:11.5px;font-weight:600;margin-bottom:1px"><i class="ti ti-building"></i> Business — ' + window.APP.esc(b.name) + '</div>' +
      '<div class="muted" style="font-size:10.5px;margin-bottom:3px">State registry · OpenCorporates · liens / judgments / bankruptcies · court dockets</div>' +
      metric("Registry status", b.registryStatus + " · " + b.state, b.registryStatus !== "Active") +
      metric("Incorporated · entity #", b.incorporated + " · " + b.entityNo) +
      metric("Related registrations (OpenCorporates)", b.openCorporatesRelated, b.openCorporatesRelated >= 2) +
      metric("Liens", b.liens + (b.liens ? " · " + window.DP.usd(b.lienAmount) : ""), b.liens > 0) +
      metric("Judgments", b.judgments + (b.judgments ? " · " + window.DP.usd(b.judgmentAmount) : ""), b.judgments > 0) +
      metric("Bankruptcies", b.bankruptcies, b.bankruptcies > 0) +
      metric("Court dockets", b.courtDockets, b.courtDockets > 0) +
      '<div style="margin-top:6px">' + osintList(b.osint) + '</div>' +
      '</div>' +
      '<div style="flex:1;min-width:250px">' +
      (o ? '<div style="font-size:11.5px;font-weight:600;margin-bottom:1px"><i class="ti ti-user-search"></i> Individual — ' + window.APP.esc(o.name) + '</div>' +
        '<div class="muted" style="font-size:10.5px;margin-bottom:3px">LexisNexis · Enformion · public records · death-index OSINT</div>' +
        metric("LexisNexis identity confidence", o.lexisConfidence + "%") +
        metric("Associated addresses", o.addresses) +
        metric("Associated businesses (Enformion)", o.enformionBusinesses, o.enformionBusinesses >= 3) +
        metric("Relatives / associates", o.relatives) +
        metric("Professional license", o.licenseStatus) +
        metric("SSA Death Master File", o.ssdiMatch ? "MATCH" : "No match", o.ssdiMatch) +
        '<div style="margin-top:6px">' + osintList(o.osint) + '</div>'
        : '<div style="font-size:11.5px;font-weight:600;margin-bottom:1px"><i class="ti ti-user-search"></i> Individual / officer</div><div class="muted" style="font-size:11px;padding:8px 0">No named officer on the business registration — individual OSINT enrichment not applicable.</div>') +
      '</div></div>' +
      '<div style="font-size:10.5px;color:var(--text3);margin-top:8px"><i class="ti ti-info-circle"></i> Synthetic external data for the demo. Secondary scoring corroborates the claims-based flag with registry, litigation and OSINT signals — the DataProvider seam accepts a real TrackLight / LexisNexis feed.</div>' +
      '</div>';
  }

  // ---------- entity context (business + network + licensure in one place) ----------
  // The SME ask: from a case, reach the business entity, the network, and the
  // licences together. This consolidates the three "who is this entity, really"
  // lenses into one orienting panel with a drill-down each.
  function entityTile(icon, label, statusHtml, lines, actionId, actionLabel, actionOn) {
    return '<div style="flex:1;min-width:190px;border:0.5px solid var(--border);border-radius:8px;padding:10px 11px;background:#fff">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px"><i class="ti ti-' + icon + '" style="color:var(--accent-d)"></i><span style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.03em">' + label + '</span><span style="margin-left:auto">' + statusHtml + '</span></div>' +
      '<div style="font-size:11.5px;line-height:1.5;color:var(--text);min-height:44px">' + lines + '</div>' +
      (actionOn ? '<div style="font-size:11.5px;color:var(--accent-d);cursor:pointer;margin-top:6px" id="' + actionId + '">' + actionLabel + ' <i class="ti ti-chevron-right" style="font-size:12px"></i></div>' : '<div class="muted" style="font-size:11px;margin-top:6px">' + actionLabel + '</div>') +
      '</div>';
  }
  function entityContextCard(id) {
    var p = window.DP.getProvider(id) || {};
    var ring = window.DP.listProviders().filter(function (x) { return x.tin === p.tin; }).length > 1;
    var bizId = p.registrationId || (ring ? p.tin : null);
    var hasBiz = bizId && window.DP.getBusiness(bizId);
    var s = window.Collusion ? window.Collusion.analyze(id) : null;
    var L = window.DP.getLicensure(id);
    var sec = window.DP.getSecondaryProfile(id);

    // business tile
    var bizStatus = sec && sec.business && sec.business.registryStatus !== "Active"
      ? '<span class="tag" style="background:var(--med-bg);color:var(--med-tx)">' + window.APP.esc(sec.business.registryStatus) + '</span>' : '';
    var bizLines = sec && sec.business
      ? '<b>' + window.APP.esc(sec.business.name) + '</b><br>' + (p.officer ? 'Officer ' + window.APP.esc(p.officer) + ' · ' : '') + (sec.business.openCorporatesRelated ? sec.business.openCorporatesRelated + ' related registration' + (sec.business.openCorporatesRelated === 1 ? '' : 's') : 'no related registrations')
      : 'Billing entity · TIN ' + window.APP.esc(p.tin || "—");

    // network tile
    var netStatus = s && s.isRing ? '<span class="tag" style="background:var(--high-bg);color:var(--high-tx)">' + (s.kind === "chain" ? "Chain" : "Ring") + '</span>' : '<span class="tag" style="background:var(--low-bg);color:var(--low-tx)">None</span>';
    var netLines = s && s.isRing
      ? '<b>' + s.providerCount + ' linked providers</b><br>' + (s.sharedTin ? 'shared TIN ' + window.APP.esc(s.tin || "") : s.sharedRegistration ? 'same registration' : 'commonly controlled') + (s.referralCount ? ' · ' + s.referralCount + ' cross-referrals' : '')
      : 'No coordinated network detected around this provider.';

    // licensure tile
    var licColors = { "Excluded": ["var(--high-bg)", "var(--high-tx)"], "Action needed": ["var(--med-bg)", "var(--med-tx)"], "Clear": ["var(--low-bg)", "var(--low-tx)"] }[L.status];
    var licStatus = '<span class="tag" style="background:' + licColors[0] + ';color:' + licColors[1] + '">' + L.status + '</span>';
    var topAlert = L.alerts[0];
    var licLines = L.excluded
      ? '<b style="color:var(--high-tx)">OIG LEIE excluded</b><br>excluded from federal programs — claims recoverable in full'
      : (topAlert ? window.APP.esc(topAlert.text.slice(0, 68)) : 'All credentials active; no exclusion.');

    return '<div class="card" id="pv-ec">' +
      '<div style="font-weight:500;font-size:13px;margin-bottom:9px"><i class="ti ti-affiliate" style="color:var(--accent-d)"></i> Entity context <span class="muted" style="font-weight:400;font-size:11px">· business, network &amp; licensure for this case</span></div>' +
      '<div style="display:flex;gap:9px;flex-wrap:wrap">' +
      entityTile("building-community", "Business entity", bizStatus, bizLines, "pv-ec-biz", hasBiz ? "View entity" : "No registered entity", !!hasBiz) +
      entityTile("share-3", "Network", netStatus, netLines, "pv-ec-net", s && s.isRing ? "View network" : "Open network", true) +
      entityTile("license", "Licensure", licStatus, licLines, "pv-ec-lic", "View licences", true) +
      '</div></div>';
  }
  function wireEntityContext(id) {
    var p = window.DP.getProvider(id) || {};
    var ring = window.DP.listProviders().filter(function (x) { return x.tin === p.tin; }).length > 1;
    var bizId = p.registrationId || (ring ? p.tin : null);
    var biz = document.getElementById("pv-ec-biz");
    if (biz) biz.addEventListener("click", function () { if (bizId && window.DP.getBusiness(bizId)) window.APP.openBusiness(bizId); });
    var net = document.getElementById("pv-ec-net");
    if (net) net.addEventListener("click", function () { window.APP.auditLog("NETWORK_VIEWED", "Case " + id + " · " + (p.name || "")); window.APP.nav("network"); });
    var lic = document.getElementById("pv-ec-lic");
    if (lic) lic.addEventListener("click", function () { var el = document.getElementById("pv-lic"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); });
  }

  // ---------- licensure & credentials (incl. OIG LEIE exclusion) ----------
  function licensureCard(id) {
    var L = window.DP.getLicensure(id); if (!L) return "";
    var st = { "Excluded": ["circle-x", "var(--high-tx)", "var(--high-bg)", "#f3c9c9"], "Action needed": ["alert-triangle", "var(--med-tx)", "var(--med-bg)", "#e7c99a"], "Clear": ["circle-check", "var(--low-tx)", "var(--low-bg)", "#bfe0c9"] }[L.status];
    var credBad = function (s) { return /Suspended|Lapsed|Expired|Deactivated|Retired|Not certified|Under review|Revalidation/.test(s); };
    var credChip = function (s) {
      var warn = credBad(s), red = /Suspended|Deactivated|Not certified|Retired/.test(s);
      return '<span class="tag" style="background:' + (red ? "var(--high-bg)" : warn ? "var(--med-bg)" : "var(--low-bg)") + ';color:' + (red ? "var(--high-tx)" : warn ? "var(--med-tx)" : "var(--low-tx)") + '">' + window.APP.esc(s) + '</span>';
    };
    var rows = L.credentials.map(function (c) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:0.5px solid var(--border2)">' +
        '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500">' + window.APP.esc(c.type) + '</div>' +
        '<div class="mono" style="font-size:10.5px;color:var(--text3)">' + window.APP.esc(c.authority) + ' · ' + window.APP.esc(c.number) + ' · exp ' + window.APP.esc(c.expires) + '</div></div>' +
        credChip(c.status) + '</div>';
    }).join("");
    var exclBanner = L.exclusion
      ? '<div style="background:var(--high-bg);border:0.5px solid #f3c9c9;border-radius:7px;padding:10px 12px;margin-bottom:9px">' +
        '<div style="font-weight:600;font-size:12.5px;color:var(--high-tx)"><i class="ti ti-ban"></i> OIG LEIE exclusion — provider is excluded from federal health-care programs</div>' +
        '<div style="font-size:11.5px;color:var(--high-tx);margin-top:4px;line-height:1.55">Basis <b>' + window.APP.esc(L.exclusion.basis) + '</b> · ' + window.APP.esc(L.exclusion.reason) + '. Excluded since ' + window.APP.esc(L.exclusion.since) + (L.exclusion.reinstatement ? '; earliest reinstatement ' + window.APP.esc(L.exclusion.reinstatement) : '; no reinstatement date') + '.</div>' +
        '<div style="font-size:11.5px;color:var(--high-tx);margin-top:5px"><i class="ti ti-alert-triangle"></i> <b>Any claim paid during the exclusion period is an improper payment recoverable in full</b> — this is an automatic finding independent of coding review.</div></div>'
      : "";
    var otherAlerts = L.alerts.filter(function (x) { return x.sev !== "high"; });
    return '<div class="card" id="pv-lic">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">' +
      '<div style="font-weight:500;font-size:13px"><i class="ti ti-license" style="color:var(--accent-d)"></i> Licensure &amp; credentials <span class="muted" style="font-weight:400;font-size:11px">· ' + window.APP.esc(L.entityType) + ' · verified against OIG LEIE, CMS/PECOS &amp; state boards (synthetic)</span></div>' +
      '<span class="tag" style="background:' + st[2] + ';color:' + st[1] + '"><i class="ti ti-' + st[0] + '"></i> ' + L.status + '</span></div>' +
      exclBanner + rows +
      (otherAlerts.length ? '<div style="margin-top:9px;display:flex;flex-direction:column;gap:4px">' + otherAlerts.map(function (al) {
        return '<div style="display:flex;gap:6px;font-size:11px;color:' + (al.sev === "med" ? "var(--med-tx)" : "var(--text2)") + '"><i class="ti ti-' + (al.sev === "med" ? "alert-triangle" : "info-circle") + '" style="margin-top:1px"></i><span>' + window.APP.esc(al.text) + '</span></div>';
      }).join("") + '</div>' : "") +
      '</div>';
  }
})();
