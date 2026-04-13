(function(){
console.log('📐 Z轴模块 v14.0 ｜ 强制读图表数据｜无固定模拟｜换股必变');

var C = { fixedLen: 200, topN: 5, forecastDays: 20 };
var prices = [], spectrum = [], ribbon = { color: 'gray', trend: 'flat', strength: 0 };
var forecastLine = [], isetDir = 0;
var currentSymbol = '';

// ---------- 辅助 ----------
function getSymbol() {
    try { var inp = document.getElementById('symbol'); return inp && inp.value ? inp.value.trim().toUpperCase() : 'STK'; }
    catch(e) { return 'STK'; }
}

// ---------- 从图表或表格实时读取价格（不缓存，每次调用都重新读取）----------
function fetchCurrentPrices() {
    try {
        // 1. 从 Chart.js 获取
        if (window.myChart && window.myChart.data) {
            var dsets = window.myChart.data.datasets;
            for (var i = 0; i < dsets.length; i++) {
                var ds = dsets[i], lbl = ds.label || '';
                if ((lbl.indexOf('收盘') >= 0 || lbl === 'close' || lbl === '价格') && ds.data) {
                    var d = ds.data.filter(v => v !== null && !isNaN(v) && v > 0);
                    if (d.length > 20) return d.length > C.fixedLen ? d.slice(-C.fixedLen) : d;
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
            if (tmp.length > 20) return tmp.length > C.fixedLen ? tmp.slice(-C.fixedLen) : tmp;
        }
        // 无真实数据时抛出错误，不使用模拟数据（避免结果假固定）
        throw new Error('无法获取实时数据，请确保图表已加载');
    } catch(e) {
        console.error(e);
        return null;
    }
}

// ---------- 强制刷新数据（换股时调用）----------
function reloadData() {
    var newPrices = fetchCurrentPrices();
    if (newPrices && newPrices.length > 20) {
        prices = newPrices;
        spectrum = computeSpectrum(prices);
        ribbon = computeRibbon(prices);
        refreshUI();
        console.log('数据已更新，股票:', getSymbol(), '价格长度:', prices.length);
        return true;
    } else {
        console.warn('无法获取新股票数据，保留原数据');
        return false;
    }
}

// ---------- 创建面板（固定结构，不覆盖）----------
function ensurePanel() {
    var panel = document.getElementById('fourierPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'fourierPanel';
        panel.style.cssText = 'margin:16px;padding:16px;background:#1e293b;border-radius:16px;border:1px solid #334155';
        var container = document.querySelector('.container') || document.body;
        container.insertBefore(panel, container.firstChild);
        var ribbonDiv = document.createElement('div');
        ribbonDiv.id = 'ribbonContainer';
        ribbonDiv.style.margin = '8px 0';
        ribbonDiv.innerHTML = '<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px; border-radius:8px"></canvas>';
        panel.appendChild(ribbonDiv);
        var contentDiv = document.createElement('div');
        contentDiv.id = 'fourierContent';
        panel.appendChild(contentDiv);
    }
    return document.getElementById('fourierContent');
}

// ---------- FFT (不变) ----------
function fft(re, im) {
    var N = re.length; if (N <= 1) return;
    var j = 0;
    for (var x = 0; x < N - 1; x++) {
        if (x < j) { var tr = re[x]; re[x] = re[j]; re[j] = tr; var ti = im[x]; im[x] = im[j]; im[j] = ti; }
        var k = N >> 1; while (k <= j) { j -= k; k >>= 1; } j += k;
    }
    for (var len = 2; len <= N; len <<= 1) {
        var ang = -2 * Math.PI / len, wl_re = Math.cos(ang), wl_im = Math.sin(ang);
        for (var x = 0; x < N; x += len) {
            var w_re = 1, w_im = 0;
            for (var y = 0; y < len/2; y++) {
                var u_re = re[x+y], u_im = im[x+y];
                var v_re = re[x+y+len/2] * w_re - im[x+y+len/2] * w_im;
                var v_im = re[x+y+len/2] * w_im + im[x+y+len/2] * w_re;
                re[x+y] = u_re + v_re; im[x+y] = u_im + v_im;
                re[x+y+len/2] = u_re - v_re; im[x+y+len/2] = u_im - v_im;
                var nw_re = w_re * wl_re - w_im * wl_im, nw_im = w_re * wl_im + w_im * wl_re;
                w_re = nw_re; w_im = nw_im;
            }
        }
    }
}

function computeSpectrum(p) {
    var n = p.length, size = 1; while (size < n) size <<= 1;
    var re = Array(size).fill(0), im = Array(size).fill(0), mean = 0;
    for (var i = 0; i < n; i++) mean += p[i]; mean /= n;
    for (var i = 0; i < n; i++) re[i] = p[i] - mean;
    fft(re, im);
    var amps = [];
    for (var i = 1; i < Math.min(60, n/2); i++) {
        var amp = Math.sqrt(re[i]*re[i] + im[i]*im[i]) / n;
        var period = n / i;
        if (period >= 5 && period <= 300) amps.push({ period: Math.round(period), amplitude: amp, phase: Math.atan2(im[i], re[i]) });
    }
    amps.sort((a,b) => b.amplitude - a.amplitude);
    return amps;
}

function computeRibbon(p) {
    if (p.length < 30) return { color: 'gray', trend: 'flat', strength: 0 };
    var n = p.length, x1 = [];
    for (var i = 0; i < n; i++) x1.push((3 * p[i] + (i>0 ? p[i-1] : p[i]) + (i>0 ? p[i-1] : p[i]) + p[i]) / 6);
    var b = [], d = [];
    for (var i = 20; i < n; i++) { var s = 0; for (var j = 0; j < 20; j++) s += (20 - j) * x1[i - j]; b.push(s / 210); }
    for (var i = 14; i < b.length; i++) { var s = 0; for (var j = 0; j < 15; j++) s += b[i - j]; d.push(s / 15); }
    if (b.length < 2 || d.length < 2) return { color: 'gray', trend: 'flat', strength: 0 };
    var curB = b[b.length-1], curD = d[d.length-1], prevB = b[b.length-2];
    var color = curB > curD ? 'red' : 'green';
    var trend = curB > prevB ? 'up' : 'down';
    var strength = Math.min(100, Math.abs((curB - curD) / curD) * 100);
    return { color: color, trend: trend, strength: strength };
}

function computeISETDirection(fullSpectrum, topN) {
    if (!fullSpectrum.length) return 0;
    var totalE = 0, weighted = 0;
    for (var i = 0; i < Math.min(fullSpectrum.length, topN); i++) {
        var e = fullSpectrum[i].amplitude;
        var d = Math.cos(fullSpectrum[i].phase);
        weighted += e * d; totalE += e;
    }
    return totalE === 0 ? 0 : weighted / totalE;
}

function probabilityFromDirection(dir) {
    var up = 50 + dir * 35; up = Math.min(85, Math.max(15, up));
    var flat = 20 + (1 - Math.abs(dir)) * 30; flat = Math.min(50, Math.max(10, flat));
    var down = 100 - up - flat; down = Math.max(5, Math.min(85, down));
    var total = up + down + flat;
    if (total !== 100) up = Math.min(85, Math.max(15, up + (100 - total))); // 安全补正
    return { up: Math.round(up), down: Math.round(down), flat: Math.round(flat) };
}

function computeHologramLine(p, periods, forecastDays, totalEnergy) {
    if (!periods.length) return new Array(forecastDays).fill(p[p.length-1]);
    var last = p[p.length-1], mean = 0; for (var i = 0; i < p.length; i++) mean += p[i]; mean /= p.length;
    var norm = periods.reduce((s, a) => s + a.amplitude, 0); if (norm === 0) norm = 1;
    var intensity = Math.min(0.5, totalEnergy / 2.0);
    var pred = [];
    for (var d = 1; d <= forecastDays; d++) {
        var sum = 0;
        for (var i = 0; i < periods.length; i++) {
            var per = periods[i].period, amp = periods[i].amplitude / norm, phase = periods[i].phase;
            sum += amp * Math.cos(2 * Math.PI * d / per + phase);
        }
        var change = sum * (last - mean) * intensity;
        pred.push(parseFloat((last + change).toFixed(2)));
    }
    return pred;
}

function drawRibbonBar(rib) {
    var cv = document.getElementById('ribbonCanvas');
    if (!cv) return;
    cv.width = cv.parentElement.clientWidth || 800;
    cv.height = 40;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = rib.color === 'red' ? '#f87171' : '#4ade80';
    ctx.fillRect(0, 0, cv.width, 40);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('彩带: ' + rib.color + ' | 趋势: ' + rib.trend + ' | 强度: ' + Math.round(rib.strength) + '%', 10, 25);
}

function drawHologramOnChart(forecast) {
    if (!window.myChart) return;
    var ds = window.myChart.data.datasets;
    var orig = null;
    for (var i = 0; i < ds.length; i++) {
        var l = ds[i].label || '';
        if ((l.indexOf('收盘') >= 0 || l === 'close') && ds[i].data) { orig = ds[i].data; break; }
    }
    if (!orig) return;
    var full = new Array(orig.length).fill(null);
    for (var i = 0; i < forecast.length; i++) full.push(forecast[i]);
    var idx = ds.findIndex(d => d.label === '🔮 全息预测线');
    if (idx >= 0) ds[idx].data = full;
    else ds.push({ label: '🔮 全息预测线', data: full, borderColor: '#a855f7', borderWidth: 2, borderDash: [8,4], pointRadius: 0, fill: false, tension: 0.1 });
    window.myChart.update();
}

function refreshUI() {
    if (!spectrum.length) return;
    isetDir = computeISETDirection(spectrum, C.topN);
    var prob = probabilityFromDirection(isetDir);
    var topPeriods = spectrum.slice(0, C.topN);
    var totalEnergy = topPeriods.reduce((s, p) => s + p.amplitude, 0);
    var forecast = computeHologramLine(prices, topPeriods, C.forecastDays, totalEnergy);
    forecastLine = forecast;
    var contentDiv = document.getElementById('fourierContent');
    if (contentDiv) {
        var sym = getSymbol();
        var topHtml = '';
        for (var i = 0; i < topPeriods.length; i++) {
            var ampPercent = (topPeriods[i].amplitude * 100).toFixed(1);
            topHtml += `<span style="background:#facc15;color:#0f172a;padding:4px 12px;border-radius:20px;margin:4px;font-weight:bold">${topPeriods[i].period}天 (${ampPercent}%)</span>`;
        }
        var ribbonText = ribbon.color === 'red' ? '🔴 红色' : '🟢 绿色';
        ribbonText += ribbon.trend === 'up' ? ' ↑' : ' ↓';
        contentDiv.innerHTML = `<div style="display:flex;justify-content:space-between"><h3 style="color:#facc15;margin:0">📐 Z轴｜${sym}</h3><button id="refreshBtn" style="background:#3b82f6;border:none;padding:4px 12px;border-radius:20px;color:white">🔄</button></div>
            <div style="margin:12px 0">🎯 ISET 核心周期 (Top${C.topN}): ${topHtml}</div>
            <div style="display:flex;gap:20px;flex-wrap:wrap">
                <div><div style="color:#facc15;font-size:0.7rem">📊 未来5日概率 (ISET方向)</div>
                <div><span style="color:#4ade80">▲ ${prob.up}%</span> <span style="color:#f87171">▼ ${prob.down}%</span> <span style="color:#94a3b8">— ${prob.flat}%</span></div></div>
                <div><div style="color:#94a3b8;font-size:0.7rem">🎨 彩带状态</div><div>${ribbonText} | 强度:${Math.round(ribbon.strength)}%</div></div>
            </div>
            <div style="margin-top:12px;font-size:0.6rem;color:#64748b;text-align:center">⚡ FFT缓存 | 归一化振幅 | flat基于方向不确定性 | 预测线强度来自ISET能量</div>`;
        var btn = document.getElementById('refreshBtn');
        if (btn) btn.onclick = function() { reloadData(); };
    }
    drawRibbonBar(ribbon);
    drawHologramOnChart(forecast);
    console.log('UI刷新 | ISET方向:', isetDir.toFixed(3), '上升概率:', prob.up);
}

// ---------- 初始化：创建面板，首次加载数据，监听换股 ----------
function init() {
    ensurePanel();
    // 首次加载数据
    var initialData = fetchCurrentPrices();
    if (initialData && initialData.length > 20) {
        prices = initialData;
        spectrum = computeSpectrum(prices);
        ribbon = computeRibbon(prices);
        refreshUI();
    } else {
        console.warn('无初始数据');
    }
    // 监听股票代码变化
    var symInput = document.getElementById('symbol');
    if (symInput) {
        symInput.addEventListener('change', function() {
            setTimeout(reloadData, 800); // 等待图表更新
        });
    }
    // 监听分析按钮
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
        if ((btns[i].innerText || '').indexOf('分析') >= 0) {
            btns[i].addEventListener('click', function() { setTimeout(reloadData, 1200); });
        }
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
