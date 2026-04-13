(function(){
console.log('📐 Z轴模块 v28.0 完整修复版');
var C = { fixedLen: 200, topN: 5, forecastDays: 20 };
var prices = [], fullSpectrum = [], spectrum = [], prob = { up: 33, down: 33, flat: 34 };
var ribbon = { color: 'gray', trend: 'flat', strength: 0 };

// ============================================================
// 工具函數
// ============================================================
function getSymbol() {
    try { var i = document.getElementById('symbol'); return i && i.value ? i.value.trim().toUpperCase() : 'STK'; }
    catch(e) { return 'STK'; }
}
function computeMean(arr) {
    if (!arr || arr.length === 0) return 0;
    var sum = 0;
    for (var k = 0; k < arr.length; k++) sum += arr[k];
    return sum / arr.length;
}
function computeStdDev(arr) {
    if (!arr || arr.length < 2) return 0;
    var mean = computeMean(arr);
    var variance = 0;
    for (var k = 0; k < arr.length; k++) variance += (arr[k] - mean) * (arr[k] - mean);
    variance /= arr.length;
    return Math.sqrt(variance);
}

// ============================================================
// 從圖表實時讀取價格
// ============================================================
function fetchPrices() {
    try {
        if (window.myChart && window.myChart.data) {
            var ds = window.myChart.data.datasets;
            for (var i = 0; i < ds.length; i++) {
                var lbl = ds[i].label || '';
                if ((lbl.indexOf('收盘') >= 0 || lbl === 'close' || lbl === '价格') && ds[i].data) {
                    var d = ds[i].data.filter(function(v){ return v !== null && !isNaN(v) && v > 0; });
                    if (d.length > 20) {
                        return d.length > C.fixedLen ? d.slice(-C.fixedLen) : d;
                    }
                }
            }
        }
        return null;
    } catch(e) { return null; }
}

// ============================================================
// FFT 算法（完整保留）
// ============================================================
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

// ============================================================
// 計算頻譜（修復2：標準差歸一化 + 擴展頻率範圍 + 提高上限）
// ============================================================
function computeFullSpectrum(p) {
    var n = p.length, size = 1; while (size < n) size <<= 1;
    var re = new Array(size).fill(0), im = new Array(size).fill(0);
    var mean = 0; for (var i = 0; i < n; i++) mean += p[i]; mean /= n;
    for (var i = 0; i < n; i++) re[i] = p[i] - mean;
    fft(re, im);
    // [修復2] 計算標準差用於歸一化
    var variance = 0;
    for (var i = 0; i < n; i++) variance += (p[i] - mean) * (p[i] - mean);
    variance /= n;
    var std = Math.sqrt(variance);
    var amps = [];
    // [修復2] 擴展頻率範圍到 n/2
    for (var i = 1; i < Math.min(60, n/2); i++) {
        var rawAmp = Math.sqrt(re[i]*re[i] + im[i]*im[i]) / n;
        // [修復2] 用標準差歸一化，上限提高到 2.0 (200%)
        var relativeAmp = Math.min(rawAmp / Math.max(std, 0.01), 2.0);
        var period = n / i;
        if (period >= 5 && period <= 300) {
            amps.push({
                period: Math.round(period),
                amplitude: relativeAmp,
                phase: Math.atan2(im[i], re[i])
            });
        }
    }
    amps.sort(function(a,b){ return b.amplitude - a.amplitude; });
    return amps;
}

// ============================================================
// 彩帶（修復3：自適應閾值 + 多週期EMA）
// ============================================================
function calcRibbon(p) {
    if (p.length < 30) return ribbon;
    var n = p.length;
    // EMA快線（8日）
    var emaFast = [p[0]];
    var alphaFast = 2 / (8 + 1);
    for (var i = 1; i < n; i++) {
        emaFast.push(alphaFast * p[i] + (1 - alphaFast) * emaFast[i-1]);
    }
    // EMA中線（20日）
    var ema = [p[0]];
    var alpha = 2 / (20 + 1);
    for (var i = 1; i < n; i++) {
        ema.push(alpha * p[i] + (1 - alpha) * ema[i-1]);
    }
    // EMA慢線（50日）
    var emaSlow = [p[0]];
    var alphaSlow = 2 / (50 + 1);
    for (var i = 1; i < n; i++) {
        emaSlow.push(alphaSlow * p[i] + (1 - alphaSlow) * emaSlow[i-1]);
    }
    var b = ema.slice(20);
    var d = [];
    alpha = 2 / (15 + 1);
    for (var i = 1; i < b.length; i++) {
        if (i === 1) d.push(b[0]);
        else d.push(alpha * b[i] + (1 - alpha) * d[d.length-1]);
    }
    if (b.length < 2 || d.length < 2) return ribbon;
    var curFast = emaFast[emaFast.length-1];
    var curB = b[b.length-1], curD = d[d.length-1], prevB = b[b.length-2];
    var curSlow = emaSlow[emaSlow.length-1];
    // [修復3] 自適應閾值
    var recentPrices = p.slice(-20);
    var recentVolatility = computeStdDev(recentPrices) / computeMean(recentPrices);
    var threshold = Math.max(0.0003, recentVolatility * 0.3);
    // 三線多空排列判斷顏色
    var fastAboveMedium = curFast > curB;
    var mediumAboveSlow = curB > curSlow;
    var color = 'gray';
    if (fastAboveMedium && mediumAboveSlow && curFast > prevB) {
        color = 'red';
    } else if (!fastAboveMedium && !mediumAboveSlow && curFast < prevB) {
        color = 'green';
    } else if (fastAboveMedium && mediumAboveMedium) {
        color = 'red';
    } else if (!fastAboveMedium && !mediumAboveSlow) {
        color = 'green';
    }
    var divergence = Math.abs(curFast - curSlow) / curSlow;
    if (divergence < threshold) {
        color = 'gray';
    }
    var trend = (curB - prevB) > threshold ? 'up' :
                (prevB - curB) > threshold ? 'down' :
                ribbon.trend;
    var divergenceStrength = Math.abs(curB - curSlow) / curSlow;
    var strength = Math.min(100, divergenceStrength * 300);
    return { color: color, trend: trend, strength: strength };
}

// ============================================================
// ISET 方向（修復1：基於實際價格斜率）
// ============================================================
function computeISETDirection(fullSpec, topN, prices) {
    if (!fullSpec.length) return 0;
    // 20日中期斜率
    var last20Prices = prices.slice(-20);
    var slope20 = (last20Prices[last20Prices.length-1] - last20Prices[0]) / last20Prices[0];
    var normalizedSlope20 = Math.max(-1, Math.min(1, slope20 / 0.05));
    // 5日短期動量
    var last5Prices = prices.slice(-5);
    var slope5 = (last5Prices[last5Prices.length-1] - last5Prices[0]) / last5Prices[0];
    var normalizedSlope5 = Math.max(-1, Math.min(1, slope5 / 0.02));
    // 10日動能
    var last10Prices = prices.slice(-10);
    var momentum = 0;
    for (var k = 1; k < last10Prices.length; k++) {
        momentum += (last10Prices[k] - last10Prices[k-1]) / last10Prices[k-1];
    }
    var normalizedMomentum = Math.max(-1, Math.min(1, momentum / 0.03));
    // 頻譜能量加權
    var totalE = 0, weighted = 0;
    for (var i = 0; i < Math.min(fullSpec.length, topN); i++) {
        var e = fullSpec[i].amplitude;
        var dir = Math.cos(fullSpec[i].phase);
        weighted += e * dir;
        totalE += e;
    }
    var spectrumDir = totalE === 0 ? 0 : weighted / totalE;
    var spectrumStrength = Math.min(1, totalE * 0.5);
    // 最終方向：40%中期 + 30%短期 + 20%動能 + 10%頻譜
    var direction = normalizedSlope20 * 0.4 + normalizedSlope5 * 0.3 + normalizedMomentum * 0.2 + spectrumDir * 0.1;
    if (spectrumStrength > 0.3) {
        direction = direction * (1 + spectrumStrength * 0.2);
    }
    return Math.max(-1, Math.min(1, direction));
}

// ============================================================
// 概率
// ============================================================
function probabilityFromDirection(dir) {
    var up = 50 + dir * 40;
    up = Math.min(92, Math.max(8, up));
    var flat = (1 - Math.abs(dir)) * 35;
    flat = Math.min(50, Math.max(10, flat));
    var down = 100 - up - flat;
    down = Math.min(85, Math.max(3, down));
    var total = up + down + flat;
    if (total !== 100) {
        var diff = 100 - total;
        if (flat + diff >= 10 && flat + diff <= 50) flat += diff;
        else if (down + diff >= 5 && down + diff <= 85) down += diff;
        else up += diff;
    }
    return { up: Math.round(up), down: Math.round(down), flat: Math.round(flat) };
}

// ============================================================
// 全息預測線
// ============================================================
function computeHologramLine(p, periods, days, totalEnergy) {
    if (!periods.length) return new Array(days).fill(p[p.length-1]);
    var last = p[p.length-1], mean = 0; for (var i=0; i<p.length; i++) mean += p[i]; mean /= p.length;
    var norm = 0; for (var i=0; i<periods.length; i++) norm += periods[i].amplitude;
    if (norm === 0) norm = 1;
    var intensity = Math.min(0.5, totalEnergy / 2.0);
    var slope = p[p.length-1] - (p.length>=6 ? p[p.length-6] : p[0]);
    var trendFactor = 0.1;
    var pred = [];
    for (var d = 1; d <= days; d++) {
        var sum = 0;
        for (var i=0; i<periods.length; i++) {
            var per = periods[i].period, amp = periods[i].amplitude / norm, ph = periods[i].phase;
            sum += amp * Math.cos(2 * Math.PI * d / per + ph);
        }
        var change = sum * (last - mean) * intensity + slope * trendFactor;
        pred.push(parseFloat((last + change).toFixed(2)));
    }
    return pred;
}

// ============================================================
// 繪製彩帶
// ============================================================
function drawRibbonBar(rib) {
    var cv = document.getElementById('ribbonCanvas');
    if (!cv) {
        var can = document.querySelector('canvas');
        if (can) {
            var div = document.createElement('div'); div.style.margin = '8px 0';
            div.innerHTML = '<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px; border-radius:8px"></canvas>';
            can.parentElement.insertBefore(div, can.nextSibling);
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
    ctx.fillText('彩带: ' + rib.color + ' | 趋势: ' + rib.trend + ' | 强度: ' + Math.round(rib.strength) + '%', 10, 25);
}

// ============================================================
// 繪製預測線
// ============================================================
function drawHologram() {
    if (!window.myChart) return;
    var ds = window.myChart.data.datasets, orig = null;
    for (var i=0; i<ds.length; i++) {
        var l = ds[i].label || '';
        if ((l.indexOf('收盘') >= 0 || l === 'close') && ds[i].data) { orig = ds[i].data; break; }
    }
    if (!orig || orig.length < 20) return;
    var topPeriods = spectrum;
    var totalEnergy = topPeriods.reduce(function(s,p){ return s + p.amplitude; }, 0);
    var forecast = computeHologramLine(prices, topPeriods, C.forecastDays, totalEnergy);
    var full = new Array(orig.length).fill(null);
    for (var i=0; i<forecast.length; i++) full.push(forecast[i]);
    var idx = -1;
    for (var i=0; i<ds.length; i++) if (ds[i].label === '🔮 全息预测线') { idx = i; break; }
    if (idx >= 0) ds[idx].data = full;
    else ds.push({ label: '🔮 全息预测线', data: full, borderColor: '#a855f7', borderWidth: 2, borderDash: [8,4], pointRadius: 0, fill: false, tension: 0.1 });
    window.myChart.update();
}

// ============================================================
// 刷新所有
// ============================================================
function refreshAll() {
    try {
        var newPrices = fetchPrices();
        if (!newPrices || newPrices.length === 0) {
            console.log('等待價格數據...');
            return;
        }
        prices = newPrices;
        if (prices.length > C.fixedLen) prices = prices.slice(-C.fixedLen);
        fullSpectrum = computeFullSpectrum(prices);
        spectrum = fullSpectrum.slice(0, C.topN);
        ribbon = calcRibbon(prices);
        var dir = computeISETDirection(fullSpectrum, C.topN, prices);
        prob = probabilityFromDirection(dir);
        updatePanel();
        drawRibbonBar(ribbon);
        drawHologram();
        console.log('✅ Z軸 v28.0 刷新完成');
    } catch(e) { console.error('Z軸錯誤:', e); }
}

// ============================================================
// 更新面板
// ============================================================
function updatePanel() {
    var panel = document.getElementById('fourierPanel');
    if (!panel) {
        panel = document.createElement('div'); panel.id = 'fourierPanel';
        panel.style.cssText = 'margin:16px;padding:16px;background:#1e293b;border-radius:16px;border:1px solid #334155';
        var c = document.querySelector('.container') || document.body;
        c.insertBefore(panel, c.firstChild);
        var ribbonDiv = document.createElement('div'); ribbonDiv.style.margin = '8px 0';
        ribbonDiv.innerHTML = '<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px; border-radius:8px"></canvas>';
        panel.appendChild(ribbonDiv);
        var contentDiv = document.createElement('div'); contentDiv.id = 'fourierContent';
        panel.appendChild(contentDiv);
    }
    var sym = getSymbol();
    var topHtml = '';
    for (var i=0; i<spectrum.length; i++) {
        var s = spectrum[i];
        var ampPercent = (s.amplitude * 100).toFixed(1);
        var barWidth = Math.min(100, parseFloat(ampPercent));
        var barColor = barWidth > 50 ? '#f59e0b' : '#fbbf24';
        topHtml += '<div style="margin:6px 0">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:3px">' +
            '<span style="color:#facc15;font-weight:bold">📅 ' + s.period + '天</span>' +
            '<span style="color:#fff">' + ampPercent + '%</span>' +
            '</div>' +
            '<div style="background:#334155;border-radius:4px;height:8px;overflow:hidden">' +
            '<div style="background:linear-gradient(90deg,#facc15,' + barColor + ');width:' + barWidth + '%;height:100%"></div>' +
            '</div>' +
            '</div>';
    }
    var ribbonText = ribbon.color === 'red' ? '🔴 红色' : '🟢 绿色';
    ribbonText += ribbon.trend === 'up' ? ' ↑' : ' ↓';
    var contentDiv = document.getElementById('fourierContent');
    if (contentDiv) {
        contentDiv.innerHTML = '<div style="display:flex;justify-content:space-between"><h3 style="color:#facc15;margin:0">📐 Z轴 v28.0｜' + sym + '</h3><button id="refreshBtn" style="background:#3b82f6;border:none;padding:4px 12px;border-radius:20px;color:white">🔄</button></div>' +
            '<div style="margin:12px 0"><div style="color:#94a3b8;font-size:0.75rem;margin-bottom:8px">🎯 ISET 核心周期 (Top ' + C.topN + ')</div>' + topHtml + '</div>' +
            '<div style="display:flex;gap:20px;flex-wrap:wrap">' +
            '<div><div style="color:#facc15;font-size:0.7rem">📊 未来5日概率 (ISET方向)</div>' +
            '<div><span style="color:#4ade80">▲ ' + prob.up + '%</span> <span style="color:#f87171">▼ ' + prob.down + '%</span> <span style="color:#94a3b8">— ' + prob.flat + '%</span></div></div>' +
            '<div><div style="color:#94a3b8;font-size:0.7rem">🎨 彩带状态</div><div>' + ribbonText + ' | 强度:' + Math.round(ribbon.strength) + '%</div></div>' +
            '</div>' +
            '<div style="margin-top:12px;font-size:0.6rem;color:#64748b;text-align:center">⚡ v28修復 | 標準差歸一化200% | 多週期EMA | 自適應閾值</div>';
        var btn = document.getElementById('refreshBtn');
        if (btn) btn.onclick = function() { refreshAll(); };
    }
}

// ============================================================
// 初始化
// ============================================================
function init() {
    console.log('🚀 Z軸 v28.0 初始化中...');
    refreshAll();
    var inp = document.getElementById('symbol');
    if (inp) inp.addEventListener('change', function() { setTimeout(refreshAll, 1500); });
    var btns = document.querySelectorAll('button');
    for (var i=0; i<btns.length; i++) {
        var t = btns[i].innerText || '';
        if (t.indexOf('分析') >= 0) {
            btns[i].addEventListener('click', function() { setTimeout(refreshAll, 2000); });
        }
    }
    console.log('✅ Z軸 v28.0 初始化完成');
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
console.log('✅ Z軸模組 v28.0 完整修復版加載完成');
})();
