/* ============================================================
 * skin-amber.js  —  P5B 琥珀终端风 仪表盘
 * 在 header 之后注入 #amber-dash 条形图仪表盘（只读 api_status.json）
 * 保留原面板交互 card；本脚本不 touch static/，仅加一层可视数据。
 * 条形图数据字段：
 *   - SYSTEM-BAL: 全舰队 bots 健康/注意/离线 占比  ← work.state + process.state_label
 *   - HOST-BAL  : 每 host 健康/注意/离线 占比      ← 同上按 host 分组
 *   - USAGE     : 每 bot input/output/cache_read   ← bot.tokens.totals 聚合
 *   - AGENTS    : 每 bot normal vs failed          ← agents_completed_buckets 求和
 *   - SYS-LOAD  : 全舰队代理完成率（normal 占比）   ← agents_completed_buckets.normal
 * 安全：仅 createElement/textContent，无注入。
 * ============================================================ */
(function () {
  'use strict';
  if (document.body.classList.contains('px-amber') === false) return;

  var DASH_ID = 'amber-dash';

  /* ---------- 数据纯函数 ---------- */

  // 叠加 bucket 结构某键（4h/4-24h/24h-7d/unknown 各桶求和）
  function sumBuckets(buckets, key) {
    var total = 0;
    if (!buckets) return total;
    Object.keys(buckets).forEach(function (bk) {
      var b = buckets[bk];
      if (b && typeof b[key] === 'number') total += b[key];
    });
    return total;
  }

  // 聚合每 bot token 用量（tokens.totals 各模型行累加）
  function tokenTotals(bot) {
    var inT = 0, out = 0, cache = 0;
    var rows = (bot && bot.tokens && bot.tokens.totals) || [];
    rows.forEach(function (r) {
      inT += typeof r.input === 'number' ? r.input : 0;
      out += typeof r.output === 'number' ? r.output : 0;
      var c = r.cache_read != null ? r.cache_read : r.cache;
      cache += typeof c === 'number' ? c : 0;
    });
    return { input: inT, output: out, cache: cache, total: inT + out + cache };
  }

  // 健康分类：green(琥珀)/yellow(橙)/red(红)
  // online 由 process.state_label；长闲置 → 注意
  function botHealth(bot) {
    var online = !!(bot.process && bot.process.state_label === 'online');
    if (!online) return 'red';
    var work = bot.work || {};
    var st = work.state || '';
    var age = typeof work.progress_age_s === 'number' ? work.progress_age_s : Infinity;
    if (/空闲/.test(st) && age > 3600 * 12) return 'yellow';
    return 'green';
  }

  // hub 状态行字段
  function statusParts(snap) {
    var g = snap.generated_at;
    var d = g ? new Date(g) : new Date();
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var hh = d.getHours() < 10 ? '0' : '';
    var mm = d.getMinutes() < 10 ? '0' : '';
    var ss = d.getSeconds() < 10 ? '0' : '';
    var time = hh + d.getHours() + ':' + mm + d.getMinutes() + ':' + ss + d.getSeconds();
    var collect = (snap.collect_interval_s || 2) + 's';
    return { day: days[d.getDay()], time: time, every: collect,
             up: snapUp(snap, d), collector: snap.collector ? snap.collector.pid : '—' };
  }
  function snapUp(snap, now) {
    // up 语义 = 首位 host 首个 bot 的进程运行时长（进程 start_at），才是 "up 59d 3h" 那种常驻时长
    var hosts = snap.hosts || [];
    var startAt = null;
    if (hosts.length && (hosts[0].bots || []).length && hosts[0].bots[0].process) {
      startAt = hosts[0].bots[0].process.start_at;
    }
    if (!startAt) return '—';
    var t = now - Date.parse(startAt);
    if (!isFinite(t) || t < 0) return '—';
    var days = Math.floor(t / 86400000);
    var hours = Math.floor(t / 3600000) % 24;
    return days + 'd ' + hours + 'h';
  }

  /* ---------- DOM 助手（防注入） ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function fmtNum(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'K';
    return String(Math.round(n));
  }
  function fmtPct(part, total) {
    if (!total || !isFinite(total) || total <= 0) return '0%';
    return Math.round(part / total * 100) + '%';
  }

  // section 包头：标题（大写）--- 细虚线 --- 右侧数值
  function secHead(title, valTxt, valCls) {
    var h = el('div', 'ab-sec-head');
    h.appendChild(el('span', 'ab-sec-title', title));
    h.appendChild(el('span', 'ab-sec-rule'));
    var v = el('span', 'ab-sec-val' + (valCls ? ' ' + valCls : ''), valTxt);
    h.appendChild(v);
    return h;
  }

  // 实心色块 + 暗轨道 行
  function barRow(labelEl, segs, valTxt, valSub) {
    var row = el('div', 'ab-row');
    row.appendChild(labelEl);
    var track = el('div', 'ab-track');
    var total = 0;
    segs.forEach(function (s) { total += s.v; });
    if (total <= 0) {
      track.classList.add('ab-empty');
      track.appendChild(el('div', 'ab-fill tracktint'));
    } else {
      segs.forEach(function (s) {
        if (!s.v || s.v <= 0) return;
        var f = el('div', 'ab-fill ' + s.cls);
        f.style.flexBasis = (s.v / total * 100) + '%';
        f.style.minWidth = '2px';
        track.appendChild(f);
      });
    }
    row.appendChild(track);
    var v = el('div', 'ab-val', valTxt);
    if (valSub != null) v.appendChild(el('span', 'sub', valSub));
    row.appendChild(v);
    return row;
  }

  // bot 名标签（含 host 短标）
  function botLabel(bot) {
    var l = el('div', 'ab-label');
    l.textContent = bot.display_name || bot.profile || bot.id;
    var host = el('span', 'hosttag', (bot.hostShort || '') + ' · pid ' + (bot.process && bot.process.pid ? bot.process.pid : '—'));
    l.appendChild(host);
    return l;
  }

  /* 图例：四色语义 */
  function makeLegend() {
    var lg = el('div', 'ab-legend');
    var colors = {
      amber: 'var(--ab-amber)', orange: 'var(--ab-orange)',
      red: 'var(--ab-red)', gold: 'var(--ab-gold)'
    };
    [['amber', '健康 / 正常'], ['orange', '注意'], ['red', '危险'], ['gold', '进程 / 特殊']].forEach(function (it) {
      var s = el('span', null);
      var sw = el('span', 'sw');
      sw.style.background = colors[it[0]];
      s.appendChild(sw);
      s.appendChild(document.createTextNode(it[1]));
      lg.appendChild(s);
    });
    return lg;
  }

  /* ---------- 仪表盘组装 ---------- */
  function buildDashboard(snap) {
    var hosts = snap.hosts || [];
    var wrap = el('div', 'ab-wrap');
    wrap.appendChild(el('div', 'ab-scan'));

    // -- 终端状态行 --
    var sp = statusParts(snap);
    var status = el('div', 'ab-statusrow');
    status.appendChild(el('span', 's-host', 'hub'));
    status.appendChild(el('span', 's-time', sp.day + ' ' + sp.time));
    status.appendChild(el('span', null, 'up ' + sp.up));
    status.appendChild(el('span', null, 'every ' + sp.every));
    status.appendChild(el('span', null, 'collector pid ' + sp.collector));
    status.appendChild(el('span', 's-dot ab-blink', '● live'));
    wrap.appendChild(status);

    // 收集全部 bots（扁平 + 记 hostShort + hostId）
    var bots = [];
    hosts.forEach(function (h) {
      (h.bots || []).forEach(function (b) {
        b.hostShort = h.short;
        b.hostId = h.host_id;
        bots.push(b);
      });
    });

    // ---- SYSTEM SECTION：全舰队健康分布 + 代理完成率 ----
    var hc = { green: 0, yellow: 0, red: 0 };
    bots.forEach(function (b) { hc[botHealth(b)]++; });
    var hcT = hc.green + hc.yellow + hc.red;
    var sysSec = el('div', 'ab-sec');
    sysSec.appendChild(secHead('system', fmtPct(hc.green, hcT), ''));
    var g = 0, f = 0;
    bots.forEach(function (b) {
      g += sumBuckets(b.agents_completed_buckets, 'normal');
      f += sumBuckets(b.agents_completed_buckets, 'failed');
    });
    var fleetOk = fmtPct(g, g + f);
    var sysRow = barRow(el('div', 'ab-label', '舰队健康 · FLEET'),
      [
        { v: hc.green, cls: 'amber' },
        { v: hc.yellow, cls: 'orange' },
        { v: hc.red, cls: 'red' }
      ],
      hc.green + '/' + hcT + ' bots', '健康/总数  ' + fmtPct(hc.green, hcT));
    sysSec.appendChild(sysRow);
    var sysLoad = barRow(el('div', 'ab-label', '代理完成率 · AGENTS'),
      [{ v: g, cls: 'amber' }, { v: f, cls: 'red' }],
      fleetOk + (g + f ? ' (' + g + ' ok / ' + f + ' fail)' : ' 无'),
      'normal vs failed');
    sysSec.appendChild(sysLoad);
    wrap.appendChild(sysSec);
    wrap.appendChild(makeLegend());

    // ---- HOST SECTION：每 host 健康/注意/离线 ----
    var hostSec = el('div', 'ab-sec');
    hostSec.appendChild(secHead('hosts · 分布', hosts.length + ' node', ''));
    hosts.forEach(function (h) {
      var hb = { green: 0, yellow: 0, red: 0 };
      (h.bots || []).forEach(function (b) { hb[botHealth(b)]++; });
      var t = hb.green + hb.yellow + hb.red;
      var lab = el('div', 'ab-label');
      lab.textContent = h.host_id;
      lab.appendChild(el('span', 'hosttag', (h.transport || '') + ' · ' + (h.bots || []).length + ' bots'));
      hostSec.appendChild(barRow(lab,
        [
          { v: hb.green, cls: 'amber' },
          { v: hb.yellow, cls: 'orange' },
          { v: hb.red, cls: 'red' }
        ],
        hb.green + '/' + t, '健康/总数  ' + fmtPct(hb.green, t)));
    });
    wrap.appendChild(hostSec);

    // ---- TOKEN USAGE：每 bot input/output/cache 三段 ----
    var tokSec = el('div', 'ab-sec');
    tokSec.appendChild(secHead('token usage · 用量', bots.length + ' bots', ''));
    bots.forEach(function (b) {
      var tt = tokenTotals(b);
      tokSec.appendChild(barRow(botLabel(b),
        [
          { v: tt.input, cls: 'amber' },
          { v: tt.output, cls: 'orange' },
          { v: tt.cache, cls: 'tracktint' }
        ],
        fmtNum(tt.total), 'in ' + fmtNum(tt.input) + ' / out ' + fmtNum(tt.output) + ' / ch ' + fmtNum(tt.cache)));
    });
    wrap.appendChild(tokSec);

    // ---- AGENTS RATE：每 bot normal vs failed 二段 ----
    var agSec = el('div', 'ab-sec');
    agSec.appendChild(secHead('agents · 代理完成率', '', ''));
    bots.forEach(function (b) {
      var n = sumBuckets(b.agents_completed_buckets, 'normal');
      var fl = sumBuckets(b.agents_completed_buckets, 'failed');
      var tk = sumBuckets(b.agents_completed_buckets, 'timeout');
      agSec.appendChild(barRow(botLabel(b),
        [
          { v: n, cls: 'amber' },
          { v: fl, cls: 'red' },
          { v: tk, cls: 'orange' }
        ],
        (n + fl + tk) + ' total', fmtPct(n, n + fl + tk) + ' ok / ' + (fl + tk) + ' 异常'));
    });
    wrap.appendChild(agSec);

    return wrap;
  }

  /* ---------- 注入 + 轮询 ---------- */
  function syncDash(snap) {
    var hostEl = document.getElementById(DASH_ID);
    if (!hostEl) {
      hostEl = el('div');
      hostEl.id = DASH_ID;
      var header = document.querySelector('header');
      var mainEl = document.getElementById('main');
      if (header && header.nextSibling) {
        header.parentNode.insertBefore(hostEl, header.nextSibling);
      } else if (mainEl) {
        mainEl.parentNode.insertBefore(hostEl, mainEl);
      } else {
        document.body.appendChild(hostEl);
      }
    }
    hostEl.textContent = '';
    hostEl.appendChild(buildDashboard(snap));
  }

  var lastSnap = null;
  function tick() {
    fetch('/api/status', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { lastSnap = d; syncDash(d); })
      .catch(function () { if (lastSnap) syncDash(lastSnap); });
  }
  tick();
  setInterval(tick, 5000);
})();
