(function(){
console.log('📐 Z轴模块 v22.0 ｜ 强制实时读取，换股必更新');

var C = { fixedLen: 200, topN: 5, forecastDays: 20 };
var prices = [], fullSpectrum = [], spectrum = [], prob = { up: 33, down: 33, flat: 34 };
var ribbon = { color: 'gray', trend: 'flat', strength: 0 };

function getSymbol() {
    try { var i = document.getElementById('symbol'); return i && i.value ? i.value.trim().toUpperCase() : 'STK'; }
    catch(e) { return 'STK'; }
}

// ----- 实时从图表或表格获取价格（无缓存）-----
function fetchCurrentPrices() {
    try {
        // 1. 从 Chart.js 获取
        if (window.myChart && window.myChart.data) {
            var dsets = window.myChart.data.datasets;
            for (var i = 0; i < dsets.length; i++) {
                var ds = dsets[i], lbl = ds.label || '';
                if ((lbl.indexOf('收盘') >= 0 || lbl === 'close' || lbl === '价格') && ds.data) {
                    var d = ds.data.filter(function(v) { return v !== null && !isNaN(v) && v > 0; });
                    if (d.length > 20) {
                        var result = d.length > C.fixedLen ? d.slice(-C.fixedLen) : d;
                        console.log('从图表获取数据，长度:', result.length);
                        return result;
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
                var result = tmp.length > C.fixedLen ? tmp.slice(-C.fixedLen) : tmp;
                console.log('从表格获取数据，长度:', result.length);
                return result;
            }
        }
        // 3. 无真实数据：生成一个与当前股票相关的简单序列（保证不同股票不同）
        var sym = getSymbol();
        var seed = 0;
        for (var i = 0; i < sym.length; i++) seed += sym.charCodeAt(i);
        var base = 100 + (seed % 100);
        var arr = [];
        for (var i = 0; i < C.fixedLen; i++) {
            base += Math.sin(i * 0.1) * (seed % 5 + 1);
            arr.push(parseFloat(base.toFixed(2)));
        }
        console.warn('无法获取真实数据，使用基于股票的模拟数据，股票:', sym);
        return arr;
    } catch(e) {
        console.error(e);
        return [];
    }
}

// ----- FFT（与原版相同）-----
function fft(r, i) {
    var N = r.length; if (N <= 1) return;
    var j = 0;
    for (var x = 0; x < N - 1; x++) {
        if (x < j) { var tr = r[x]; r[x] = r[j]; r[j] = tr; var ti = i[x]; i[x] = i[j]; i[j] = ti; }
        var k = N >> 1; while (k <= j) { j -= k; k >>= 1; } j += k;
    }
    for (var len = 2; len <= N; len <<= 1) {
        var ang = -2 * Math.PI / len, wl_re = Math.cos(ang), wl_im = Math.sin(ang);
        for (var x = 0; x < N; x += len) {
            var w_re = 1, w_im = 0;
            for (var y = 0; y < len/2; y++) {
                var u_re = r[x+y], u_im = i[x+y];
                var v_re = r[x+y+len/2] * w_re - i[x+y+len/2] * w_im;
                var v_im = r[x+y+len/2] * w_im + i[x+y+len/2] * w_re;
                r[x+y] = u_re + v_re; i[x+y] = u_im + v_im;
                r[x+y+len/2] = u_re - v_re; i[x+y+len/2] = u_im - v_im;
                var nw_re = w_re * wl_re - w_im * wl_im, nw_im = w_re * wl_im + w_im * wl_re;
                w_re = nw_re; w_im = nw_im;
            }
        }
    }
}

// ----- 计算完整频谱（原始振幅，保留相位）-----
function computeFullSpectrum(p) {
    var n = p.length, size = 1; while (size < n) size <<= 1;
    var re = new Array(size).fill(0), im = new Array(size).fill(0), mean = 0;
    for (var i = 0; i < n; i++) mean += p[i]; mean /= n;
    for (var i = 0; i < n; i++) re[i] = p[i] - mean;
    fft(re, im);
    var amps = [];
    for (var i = 1; i < Math.min(60, n/2); i++) {
        var amp = Math.sqrt(re[i]*re[i] + im[i]*im[i]) / n;
        var period = n / i;
        if (period >= 5 && period <= 300) {
            amps.push({
                period: Math.round(period),
                amplitude: amp,
                phase: Math.atan2(im[i], re[i])
            });
        }
    }
    amps.sort((a,b) => b.amplitude - a.amplitude);
    return amps;
}

// ----- 彩带（增加除零保护）-----
function calcRibbon(p) {
    if (p.length < 30) return { color: 'gray', trend: 'flat', strength: 0 };
    var n = p.length, x1 = [];
    for (var i = 0; i < n; i++) x1.push((3*p[i] + (i>0?p[i-1]:p[i]) + (i>0?p[i-1]:p[i]) + p[i]) / 6);
    var b = [], d = [];
    for (var i = 20; i < n; i++) { var s = 0; for (var j = 0; j < 20; j++) s += (20 - j) * x1[i - j]; b.push(s / 210); }
    for (var i = 14; i < b.length; i++) { var s = 0; for (var j = 0; j < 15; j++) s += b[i - j]; d.push(s / 15); }
    if (b.length < 2 || d.length < 2) return { color: 'gray', trend: 'flat', strength: 0 };
    var curB = b[b.length-1], curD = d[d.length-1], prevB = b[b.length-2];
    var color = curB > curD ? 'red' : 'green';
    var trend = curB > prevB ? 'up' : 'down';
    var strength = (curD === 0) ? 0 : Math.min(100, Math.abs((curB - curD) / curD) * 100);
    return { color: color, trend: trend, strength: strength };
}

// ----- ISET 方向加权（使用前 topN 个周期）-----
function computeISETDirection(fullSpec, topN) {
    if (!fullSpec.length) return 0;
    var totalE = 0, weighted = 0;
    for (var i = 0; i < Math.min(fullSpec.length, topN); i++) {
        var e = fullSpec[i].amplitude;
        var dir = Math.cos(fullSpec[i].phase);
        weighted += e * dir;
        totalE += e;
    }
    return totalE === 0 ? 0 : weighted / totalE;
}

// ----- 概率（基于 ISET 方向，保证总和 100）-----
function probabilityFromDirection(dir) {
    var up = 50 + dir * 35;
    up = Math.min(85, Math.max(15, up));
    var flat = 20 + (1 - Math.abs(dir)) * 30;
    flat = Math.min(50, Math.max(10, flat));
    var down = 100 - up - flat;
    down = Math.min(85, Math.max(5, down));
    var total = up + down + flat;
    if (total !== 100) {
        var diff = 100 - total;
        if (flat + diff >= 10 && flat + diff <= 50) flat += diff;
        else if (down + diff >= 5 && down + diff <= 85) down += diff;
        else up += diff;
    }
    return { up: Math.round(up), down: Math.round(down), flat: Math.round(flat) };
}

// ----- 全息预测线（周期叠加，归一化）-----
function computeHologramLine(p, periods, days, totalEnergy) {
    if (!periods.length) return new Array(days).fill(p[p.length-1]);
    var last = p[p.length-1], mean = 0; for (var i=0; i<p.length; i++) mean += p[i]; mean /= p.length;
    var norm = 0; for (var i=0; i<periods.length; i++) norm += periods[i].amplitude;
    if (norm === 0) norm = 1;
    var intensity = Math.min(0.5, totalEnergy / 2.0);
    var pred = [];
    for (var d = 1; d <= days; d++) {
        var sum = 0;
        for (var i=0; i<periods.length; i++) {
            var per = periods[i].period, amp = periods[i].amplitude / norm, ph = periods[i].phase;
            sum += amp * Math.cos(2 * Math.PI * d / per + ph);
        }
        var change = sum * (last - mean) * intensity;
        pred.push(parseFloat((last + change).toFixed(2)));
    }
    return pred;
}

// ----- 绘制彩带（独立于面板）-----
function drawRibbonBar(rib) {
    var cv = document.getElementById('ribbonCanvas');
    if (!cv) {
        var can = document.querySelector('canvas');
        if (can) {
            var div = document.createElement('div'); div.style.margin = '8px 0';
            div.innerHTML = '<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px; border-radius:8px"></canvas>';
            can.parentElement.insertBefore(div, can.nextSibling);
        } else {
            var panel = document.getElementById('fourierPanel');
            if (panel) {
                var div2 = document.createElement('div'); div2.style.margin = '8px 0';
                div2.innerHTML = '<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px; border-radius:8px"></canvas>';
                panel.appendChild(div2);
            }
        }
    }
    cv = document.getElementById('ribbonCanvas');
    if (!cv) return;
    cv.width = cv.parentElement.clientWidth || 800;
    cv.height = 40;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = rib.color === 'red' ? '#f87171' : '#4ade80';
    ctx.fillRect(0, 0, cv.width, 40);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`彩带: ${rib.color} | 趋势: ${rib.trend} | 强度: ${Math.round(rib.strength)}%`, 10, 25);
}

// ----- 绘制预测线到图表-----
function drawHologram() {
    if (!window.myChart) return;
    var ds = window.myChart.data.datasets, orig = null;
    for (var i=0; i<ds.length; i++) {
        var l = ds[i].label || '';
        if ((l.indexOf('收盘') >= 0 || l === 'close') && ds[i].data) { orig = ds[i].data; break; }
    }
    if (!orig || orig.length < 20) return;
    var topPeriods = spectrum;
    var totalEnergy = topPeriods.reduce((s,p) => s + p.amplitude, 0);
    var forecast = computeHologramLine(prices, topPeriods, C.forecastDays, totalEnergy);
    var full = new Array(orig.length).fill(null);
    for (var i=0; i<forecast.length; i++) full.push(forecast[i]);
    var idx = -1;
    for (var i=0; i<ds.length; i++) if (ds[i].label === '🔮 全息预测线') { idx = i; break; }
    if (idx >= 0) ds[idx].data = full;
    else ds.push({ label: '🔮 全息预测线', data: full, borderColor: '#a855f7', borderWidth: 2, borderDash: [8,4], pointRadius: 0, fill: false, tension: 0.1 });
    window.myChart.update();
}

// ----- 刷新所有（强制实时读取）-----
function refreshAll() {
    try {
        var newPrices = fetchCurrentPrices();
        if (!newPrices || newPrices.length === 0) {
            console.error('无法获取价格数据');
            return;
        }
        prices = newPrices;
        if (prices.length > C.fixedLen) prices = prices.slice(-C.fixedLen);
        // 计算频谱
        var n = prices.length, size = 1; while (size < n) size <<= 1;
        var re = new Array(size).fill(0), im = new Array(size).fill(0), mean = 0;
        for (var i=0; i<n; i++) mean += prices[i]; mean /= n;
        for (var i=0; i<n; i++) re[i] = prices[i] - mean;
        fft(re, im);
        var allAmps = [];
        for (var i=1; i<Math.min(60, n/2); i++) {
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
        allAmps.sort((a,b) => b.amplitude - a.amplitude);
        fullSpectrum = allAmps;
        spectrum = fullSpectrum.slice(0, C.topN);
        ribbon = calcRibbon(prices);
        var dir = computeISETDirection(fullSpectrum, C.topN);
        prob = probabilityFromDirection(dir);
        updatePanel();
        drawRibbonBar(ribbon);
        drawHologram();
        console.log('刷新完成 | 股票:', getSymbol(), '上升概率:', prob.up);
    } catch(e) { console.error('刷新错误', e); }
}

// ----- 更新面板（与之前相同，显示百分比）-----
function updatePanel() {
    var panel = document.getElementById('fourierPanel');
    if (!panel) {
        panel = document.createElement('div'); panel.id = 'fourierPanel';
        panel.style.cssText = 'margin:16px;padding:16px;background:#1e293b;border-radius:16px;border:1px solid #334155';
        var c = document.querySelector('.container') || document.body;
        c.insertBefore(panel, c.firstChild);
    }
    var sym = getSymbol();
    var topHtml = '';
    for (var i=0; i<spectrum.length; i++) {
        var s = spectrum[i];
        var ampPercent = (s.amplitude * 100).toFixed(1);
        topHtml += `<span style="background:#facc15;color:#0f172a;padding:4px 12px;border-radius:20px;margin:4px;font-weight:bold">${s.period}天 (${ampPercent}%)</span>`;
    }
    var ribbonText = ribbon.color === 'red' ? '🔴 红色' : '🟢 绿色';
    ribbonText += ribbon.trend === 'up' ? ' ↑' : ' ↓';
    panel.innerHTML = `<div><div style="display:flex;justify-content:space-between"><h3 style="color:#facc15;margin:0">📐 Z轴｜${sym}</h3><button id="refreshBtn" style="background:#3b82f6;border:none;padding:4px 12px;border-radius:20px;color:white">🔄</button></div>
        <div style="margin:12px 0">🎯 ISET 核心周期 (Top${C.topN}): ${topHtml}</div>
        <div style="display:flex;gap:20px;flex-wrap:wrap">
            <div><div style="color:#facc15;font-size:0.7rem">📊 未来5日概率 (ISET方向)</div>
            <div><span style="color:#4ade80">▲ ${prob.up}%</span> <span style="color:#f87171">▼ ${prob.down}%</span> <span style="color:#94a3b8">— ${prob.flat}%</span></div></div>
            <div><div style="color:#94a3b8;font-size:0.7rem">🎨 彩带状态</div><div>${ribbonText} | 强度:${Math.round(ribbon.strength)}%</div></div>
        </div>
        <div style="margin-top:12px;font-size:0.6rem;color:#64748b;text-align:center">⚡ 实时读取图表 | 换股自动更新 | ISET加权方向</div></div>`;
    var btn = document.getElementById('refreshBtn');
    if (btn) btn.onclick = function() { refreshAll(); };
}

// ----- 初始化：监听换股事件，强制刷新 -----
function init() {
    refreshAll();
    var inp = document.getElementById('symbol');
    if (inp) {
        inp.addEventListener('change', function() { setTimeout(refreshAll, 1500); });
    }
    var btns = document.querySelectorAll('button');
    for (var i=0; i<btns.length; i++) {
        var t = btns[i].innerText || '';
        if (t.indexOf('分析') >= 0 || t.indexOf('分析') >= 0) {
            btns[i].addEventListener('click', function() { setTimeout(refreshAll, 2000); });
        }
    }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
