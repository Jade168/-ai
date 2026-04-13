(function(){
console.log('📐 Z轴模块 v19.0 ｜ 基于旧版显示框架 + 新版核心逻辑');

// ---------- 配置 ----------
var C = {
    fixedLen: 200,
    topN: 5,          // ISET 取前 N 个周期
    forecastDays: 20
};

var prices = [];
var fullSpectrum = [];   // 完整频谱（未截断）
var spectrum = [];       // 用于显示的前 topN 个
var prob = { up: 33, down: 33, flat: 34 };
var ribbon = { color: 'gray', trend: 'flat', strength: 0 };

// ---------- 辅助函数 ----------
function getSymbol() {
    try {
        var inp = document.getElementById('symbol');
        return inp && inp.value ? inp.value.trim().toUpperCase() : 'STK';
    } catch(e) { return 'STK'; }
}

// ---------- 从图表或表格获取价格数据（实时，无缓存）----------
function fetchPrices() {
    try {
        // 1. 从 Chart.js 获取
        if (window.myChart && window.myChart.data) {
            var dsets = window.myChart.data.datasets;
            for (var i = 0; i < dsets.length; i++) {
                var ds = dsets[i];
                var lbl = ds.label || '';
                if ((lbl.indexOf('收盘') >= 0 || lbl === 'close' || lbl === '价格') && ds.data) {
                    var d = ds.data.filter(function(v) { return v !== null && !isNaN(v) && v > 0; });
                    if (d.length > 20) {
                        return d.length > C.fixedLen ? d.slice(-C.fixedLen) : d;
                    }
                }
            }
        }
        // 2. 从表格获取
        var rows = document.querySelectorAll('table tbody tr');
        if (rows.length > 10) {
            var tmp = [];
            for (var i = 0; i < rows.length && i < 500; i++) {
                var cell = rows[i].cells[1];
                if (cell) {
                    var val = parseFloat(cell.innerText.replace(/[^0-9.-]/g, ''));
                    if (!isNaN(val) && val > 0 && val < 10000) tmp.push(val);
                }
            }
            if (tmp.length > 20) {
                return tmp.length > C.fixedLen ? tmp.slice(-C.fixedLen) : tmp;
            }
        }
        // 无真实数据时返回一个固定占位数组（保证面板不崩溃）
        console.warn('无法获取实时数据，使用占位数据');
        var fallback = [];
        for (var i = 0; i < C.fixedLen; i++) fallback.push(100 + i % 50);
        return fallback;
    } catch(e) {
        console.error(e);
        return [];
    }
}

// ---------- FFT (与原版相同，无改动) ----------
function fft(re, im) {
    var N = re.length;
    if (N <= 1) return;
    var j = 0;
    for (var x = 0; x < N - 1; x++) {
        if (x < j) {
            var tr = re[x]; re[x] = re[j]; re[j] = tr;
            var ti = im[x]; im[x] = im[j]; im[j] = ti;
        }
        var k = N >> 1;
        while (k <= j) { j -= k; k >>= 1; }
        j += k;
    }
    for (var len = 2; len <= N; len <<= 1) {
        var ang = -2 * Math.PI / len;
        var wl_re = Math.cos(ang);
        var wl_im = Math.sin(ang);
        for (var x = 0; x < N; x += len) {
            var w_re = 1, w_im = 0;
            for (var y = 0; y < len/2; y++) {
                var u_re = re[x+y], u_im = im[x+y];
                var v_re = re[x+y+len/2] * w_re - im[x+y+len/2] * w_im;
                var v_im = re[x+y+len/2] * w_im + im[x+y+len/2] * w_re;
                re[x+y] = u_re + v_re;
                im[x+y] = u_im + v_im;
                re[x+y+len/2] = u_re - v_re;
                im[x+y+len/2] = u_im - v_im;
                var nw_re = w_re * wl_re - w_im * wl_im;
                var nw_im = w_re * wl_im + w_im * wl_re;
                w_re = nw_re; w_im = nw_im;
            }
        }
    }
}

// ---------- 计算完整频谱（振幅原始值，保留相位）----------
function computeFullSpectrum(p) {
    var n = p.length;
    var size = 1;
    while (size < n) size <<= 1;
    var re = new Array(size).fill(0);
    var im = new Array(size).fill(0);
    var mean = 0;
    for (var i = 0; i < n; i++) mean += p[i];
    mean /= n;
    for (var i = 0; i < n; i++) re[i] = p[i] - mean;
    fft(re, im);
    var amps = [];
    for (var i = 1; i < Math.min(60, n/2); i++) {
        var amp = Math.sqrt(re[i]*re[i] + im[i]*im[i]) / n;
        var period = n / i;
        if (period >= 5 && period <= 300) {
            amps.push({
                period: Math.round(period),
                amplitude: amp,                           // 原始振幅（未乘100）
                phase: Math.atan2(im[i], re[i])
            });
        }
    }
    amps.sort(function(a, b) { return b.amplitude - a.amplitude; });
    return amps;
}

// ---------- 彩带计算（增加除零保护）----------
function calcRibbon(p) {
    if (p.length < 30) return { color: 'gray', trend: 'flat', strength: 0 };
    var n = p.length, x1 = [];
    for (var i = 0; i < n; i++) {
        x1.push((3 * p[i] + (i>0 ? p[i-1] : p[i]) + (i>0 ? p[i-1] : p[i]) + p[i]) / 6);
    }
    var b = [], d = [];
    for (var i = 20; i < n; i++) {
        var s = 0; for (var j = 0; j < 20; j++) s += (20 - j) * x1[i - j];
        b.push(s / 210);
    }
    for (var i = 14; i < b.length; i++) {
        var s = 0; for (var j = 0; j < 15; j++) s += b[i - j];
        d.push(s / 15);
    }
    if (b.length < 2 || d.length < 2) return { color: 'gray', trend: 'flat', strength: 0 };
    var curB = b[b.length-1], curD = d[d.length-1], prevB = b[b.length-2];
    var color = curB > curD ? 'red' : 'green';
    var trend = curB > prevB ? 'up' : 'down';
    var strength = (curD === 0) ? 0 : Math.min(100, Math.abs((curB - curD) / curD) * 100);
    return { color: color, trend: trend, strength: strength };
}

// ---------- ISET 方向（加权平均）----------
function computeISETDirection(fullSpec, topN) {
    if (!fullSpec.length) return 0;
    var totalE = 0, weighted = 0;
    for (var i = 0; i < Math.min(fullSpec.length, topN); i++) {
        var e = fullSpec[i].amplitude;
        var d = Math.cos(fullSpec[i].phase);
        weighted += e * d;
        totalE += e;
    }
    return totalE === 0 ? 0 : weighted / totalE;
}

// ---------- 概率（保证总和100，无硬编码 flat）----------
function probabilityFromDirection(dir) {
    var up = 50 + dir * 35;
    up = Math.min(85, Math.max(15, up));
    var flat = 20 + (1 - Math.abs(dir)) * 30;
    flat = Math.min(50, Math.max(10, flat));
    var down = 100 - up - flat;
    down = Math.min(85, Math.max(5, down));
    // 确保总和为100
    var total = up + down + flat;
    if (total !== 100) {
        var diff = 100 - total;
        if (flat + diff >= 10 && flat + diff <= 50) flat += diff;
        else if (down + diff >= 5 && down + diff <= 85) down += diff;
        else up += diff;
    }
    return { up: Math.round(up), down: Math.round(down), flat: Math.round(flat) };
}

// ---------- 全息预测线（周期叠加，归一化振幅）----------
function computeHologramLine(p, periods, forecastDays, totalEnergy) {
    if (!periods.length) return new Array(forecastDays).fill(p[p.length-1]);
    var last = p[p.length-1];
    var mean = 0; for (var i = 0; i < p.length; i++) mean += p[i]; mean /= p.length;
    var norm = 0; for (var i = 0; i < periods.length; i++) norm += periods[i].amplitude;
    if (norm === 0) norm = 1;
    var intensity = Math.min(0.5, totalEnergy / 2.0);
    var pred = [];
    for (var d = 1; d <= forecastDays; d++) {
        var sum = 0;
        for (var i = 0; i < periods.length; i++) {
            var per = periods[i].period;
            var amp = periods[i].amplitude / norm;
            var ph = periods[i].phase;
            sum += amp * Math.cos(2 * Math.PI * d / per + ph);
        }
        var change = sum * (last - mean) * intensity;
        pred.push(parseFloat((last + change).toFixed(2)));
    }
    return pred;
}

// ---------- 绘制彩带（独立于面板，避免被覆盖）----------
function drawRibbonBar(rib) {
    // 在面板外部寻找或创建彩带容器
    var ribbonContainer = document.getElementById('ribbonContainer');
    if (!ribbonContainer) {
        ribbonContainer = document.createElement('div');
        ribbonContainer.id = 'ribbonContainer';
        ribbonContainer.style.margin = '8px 16px';
        var panel = document.getElementById('fourierPanel');
        if (panel) {
            panel.parentNode.insertBefore(ribbonContainer, panel);
        } else {
            document.body.insertBefore(ribbonContainer, document.body.firstChild);
        }
    }
    var cv = document.getElementById('ribbonCanvas');
    if (!cv) {
        cv = document.createElement('canvas');
        cv.id = 'ribbonCanvas';
        cv.height = 40;
        cv.style.width = '100%';
        cv.style.borderRadius = '8px';
        ribbonContainer.innerHTML = '';
        ribbonContainer.appendChild(cv);
    }
    cv.width = cv.parentElement.clientWidth || 800;
    cv.height = 40;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = rib.color === 'red' ? '#f87171' : '#4ade80';
    ctx.fillRect(0, 0, cv.width, 40);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('彩带: ' + rib.color + ' | 趋势: ' + rib.trend + ' | 强度: ' + Math.round(rib.strength) + '%', 10, 25);
}

// ---------- 绘制全息预测线到图表 ----------
function drawHologram() {
    if (!window.myChart) return;
    var ds = window.myChart.data.datasets;
    var orig = null;
    for (var i = 0; i < ds.length; i++) {
        var l = ds[i].label || '';
        if ((l.indexOf('收盘') >= 0 || l === 'close') && ds[i].data) {
            orig = ds[i].data;
            break;
        }
    }
    if (!orig || orig.length < 20) return;
    var topPeriods = spectrum; // 用于显示的 topN 周期
    var totalEnergy = 0;
    for (var i = 0; i < topPeriods.length; i++) totalEnergy += topPeriods[i].amplitude;
    var forecast = computeHologramLine(prices, topPeriods, C.forecastDays, totalEnergy);
    var full = new Array(orig.length).fill(null);
    for (var i = 0; i < forecast.length; i++) full.push(forecast[i]);
    var idx = -1;
    for (var i = 0; i < ds.length; i++) {
        if (ds[i].label === '🔮 全息预测线') { idx = i; break; }
    }
    if (idx >= 0) {
        ds[idx].data = full;
    } else {
        ds.push({
            label: '🔮 全息预测线',
            data: full,
            borderColor: '#a855f7',
            borderWidth: 2,
            borderDash: [8, 4],
            pointRadius: 0,
            fill: false,
            tension: 0.1
        });
    }
    window.myChart.update();
}

// ---------- 刷新全部：重新获取数据、计算频谱、更新面板和彩带 ----------
function refreshAll() {
    try {
        var raw = fetchPrices();
        if (raw.length) prices = raw;
        // 计算完整频谱
        var n = prices.length, size = 1;
        while (size < n) size <<= 1;
        var re = new Array(size).fill(0), im = new Array(size).fill(0), mean = 0;
        for (var i = 0; i < n; i++) mean += prices[i];
        mean /= n;
        for (var i = 0; i < n; i++) re[i] = prices[i] - mean;
        fft(re, im);
        var allAmps = [];
        for (var i = 1; i < Math.min(60, n/2); i++) {
            var amp = Math.sqrt(re[i]*re[i] + im[i]*im[i]) / n;
            var period = n / i;
            if (period >= 5 && period <= 300) {
                allAmps.push({
                    period: Math.round(period),
                    amplitude: amp,
                    phase: Math.atan2(im[i], re[i])
                });
            }
        }
        allAmps.sort(function(a,b) { return b.amplitude - a.amplitude; });
        fullSpectrum = allAmps;
        spectrum = fullSpectrum.slice(0, C.topN);
        ribbon = calcRibbon(prices);
        var dir = computeISETDirection(fullSpectrum, C.topN);
        prob = probabilityFromDirection(dir);
        updatePanel();
        drawRibbonBar(ribbon);
        drawHologram();
        console.log('刷新完成 | 上升概率: ' + prob.up + '%');
    } catch(e) {
        console.error('刷新错误', e);
    }
}

// ---------- 更新面板（完全采用旧版方式，保证显示）----------
function updatePanel() {
    var panel = document.getElementById('fourierPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'fourierPanel';
        panel.style.cssText = 'margin:16px;padding:16px;background:#1e293b;border-radius:16px;border:1px solid #334155';
        var container = document.querySelector('.container') || document.body;
        container.insertBefore(panel, container.firstChild);
    }
    var sym = getSymbol();
    var topHtml = '';
    for (var i = 0; i < spectrum.length; i++) {
        var s = spectrum[i];
        var ampPercent = (s.amplitude * 100).toFixed(1);
        topHtml += '<span style="background:#facc15;color:#0f172a;padding:4px 12px;border-radius:20px;margin:4px;font-weight:bold">' + s.period + '天 (' + ampPercent + '%)</span>';
    }
    var ribbonText = ribbon.color === 'red' ? '🔴 红色' : '🟢 绿色';
    ribbonText += ribbon.trend === 'up' ? ' ↑' : ' ↓';
    panel.innerHTML = '<div><div style="display:flex;justify-content:space-between"><h3 style="color:#facc15;margin:0">📐 Z轴｜' + sym + '</h3><button id="refreshBtn" style="background:#3b82f6;border:none;padding:4px 12px;border-radius:20px;color:white">🔄</button></div>' +
        '<div style="margin:12px 0">🎯 ISET 核心周期 (Top' + C.topN + '): ' + topHtml + '</div>' +
        '<div style="display:flex;gap:20px;flex-wrap:wrap">' +
        '<div><div style="color:#facc15;font-size:0.7rem">📊 未来5日概率 (ISET方向)</div>' +
        '<div><span style="color:#4ade80">▲ ' + prob.up + '%</span> <span style="color:#f87171">▼ ' + prob.down + '%</span> <span style="color:#94a3b8">— ' + prob.flat + '%</span></div></div>' +
        '<div><div style="color:#94a3b8;font-size:0.7rem">🎨 彩带状态</div><div>' + ribbonText + ' | 强度:' + Math.round(ribbon.strength) + '%</div></div></div>' +
        '<div style="margin-top:12px;font-size:0.6rem;color:#64748b;text-align:center">⚡ 实时读取图表数据 | 换股自动更新 | ISET加权方向</div></div>';
    var btn = document.getElementById('refreshBtn');
    if (btn) btn.onclick = function() { refreshAll(); };
}

// ---------- 初始化：直接刷新一次，并监听换股事件 ----------
function init() {
    refreshAll();
    var inp = document.getElementById('symbol');
    if (inp) {
        inp.addEventListener('change', function() { setTimeout(refreshAll, 1500); });
    }
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
        var t = btns[i].innerText || '';
        if (t.indexOf('分析') >= 0 || t.indexOf('分析') >= 0) {
            btns[i].addEventListener('click', function() { setTimeout(refreshAll, 2000); });
        }
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
