(function(){
console.log('📐 Z轴模块 v32.1 手机安全版 | 无模板字符串');

var C = { fixedLen: 200, topN: 5, forecastDays: 20 };
var prices = [], fullSpectrum = [], spectrum = [], prob = { up: 33, down: 33, flat: 34 };
var ribbon = { color: 'gray', trend: 'flat', strength: 0 };
var techInfo = { score: 0, detail: '' };

function getSymbol() {
    try { var i = document.getElementById('symbol'); return i && i.value ? i.value.trim().toUpperCase() : 'STK'; }
    catch(e) { return 'STK'; }
}

// ----- 获取价格数据 -----
function getPrices() {
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
        var sym = getSymbol();
        var seed = 0;
        for (var i = 0; i < sym.length; i++) seed += sym.charCodeAt(i);
        var base = 100 + (seed % 100);
        var arr = [];
        for (var i = 0; i < C.fixedLen; i++) {
            base += Math.sin(i * 0.2) * (seed % 5 + 1) + (Math.random() - 0.5) * 2;
            arr.push(parseFloat(base.toFixed(2)));
        }
        console.log('使用模拟数据，股票:', sym);
        return arr;
    } catch(e) { return []; }
}

// ---------- FFT ----------
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

// ---------- 辅助统计 ----------
function mean(arr) { return arr.reduce(function(a,b){return a+b;},0)/arr.length; }
function stdDev(arr) {
    var m = mean(arr);
    return Math.sqrt(arr.reduce(function(s,v){return s+(v-m)*(v-m);},0)/arr.length);
}
function EMA(data, period) {
    var alpha = 2/(period+1), res = [data[0]];
    for (var i=1; i<data.length; i++) res.push(alpha*data[i] + (1-alpha)*res[i-1]);
    return res;
}

// ===================== 技术指标模块 =====================

function calcRSI(p, period) {
    period = period || 14;
    if (p.length < period + 1) return null;
    var gains = 0, losses = 0;
    for (var i = 1; i <= period; i++) {
        var d = p[i] - p[i-1];
        if (d >= 0) gains += d; else losses -= d;
    }
    var avgG = gains / period, avgL = losses / period;
    for (var i = period + 1; i < p.length; i++) {
        var d = p[i] - p[i-1];
        avgG = (avgG * (period-1) + Math.max(d,0)) / period;
        avgL = (avgL * (period-1) + Math.max(-d,0)) / period;
    }
    if (avgL === 0) return 100;
    return 100 - 100 / (1 + avgG / avgL);
}

function calcMACD(p) {
    if (p.length < 35) return null;
    var e12 = EMA(p, 12), e26 = EMA(p, 26);
    var dif = [];
    for (var i = 0; i < e12.length; i++) dif.push(e12[i] - e26[i]);
    var dea = EMA(dif, 9);
    var last = dif.length - 1;
    return { macd: dif[last], signal: dea[last], hist: (dif[last]-dea[last])*2 };
}

function calcATR(p, period) {
    period = period || 14;
    if (p.length < period + 1) return null;
    var trs = [];
    for (var i = 1; i < p.length; i++) trs.push(Math.abs(p[i] - p[i-1]));
    var atr = mean(trs.slice(0, period));
    for (var i = period; i < trs.length; i++)
        atr = (atr * (period-1) + trs[i]) / period;
    return atr;
}

function calcBollingerPos(p, period, mult) {
    period = period || 20; mult = mult || 2;
    if (p.length < period) return null;
    var seg = p.slice(-period);
    var m = mean(seg), sd = stdDev(seg);
    if (sd === 0) return 0.5;
    return (p[p.length-1] - (m - mult*sd)) / (2 * mult * sd);
}

function calcTechScore(p) {
    var score = 0, parts = [];
    var rsi = calcRSI(p);
    if (rsi !== null) {
        var r = rsi < 30 ? 30 : (rsi > 70 ? -30 : (50 - rsi));
        score += r; parts.push('RSI:' + rsi.toFixed(0));
    }
    var macd = calcMACD(p);
    if (macd) {
        score += macd.hist > 0 ? 25 : -25;
        parts.push('MACD:' + macd.hist.toFixed(2));
    }
    var bpos = calcBollingerPos(p);
    if (bpos !== null) {
        var bv = bpos > 1 ? -20 : (bpos < 0 ? 20 : (0.5 - bpos) * 40);
        score += bv; parts.push('%B:' + bpos.toFixed(2));
    }
    var atr = calcATR(p);
    if (atr !== null) parts.push('ATR:' + atr.toFixed(2));
    return { score: Math.max(-100, Math.min(100, score)), detail: parts.join(' | ') };
}

// ---------- 频谱（对数收益率 + Hanning窗）----------
function getSpectrum(p) {
    if (p.length < 32) return [];
    var ret = [];
    for (var i = 1; i < p.length; i++) {
        if (p[i-1] > 0) ret.push(Math.log(p[i] / p[i-1]));
    }
    var n = ret.length;
    if (n < 32) return [];
    var m = mean(ret);
    var std = Math.max(stdDev(ret), 0.000001);

    var size = 1; while (size < n) size <<= 1;
    var re = [], im = [];
    for (var i = 0; i < size; i++) { re.push(0); im.push(0); }
    var winSumSq = 0;
    for (var i = 0; i < n; i++) {
        var w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
        winSumSq += w * w;
        re[i] = (ret[i] - m) * w;
    }
    fft(re, im);

    var amps = [];
    for (var i = 1; i < n / 2; i++) {
        var raw = Math.sqrt(re[i]*re[i] + im[i]*im[i]);
        var rel = Math.min(raw / std / Math.sqrt(winSumSq || 1), 2.0);
        var period = n / i;
        if (period >= 3 && period <= 250) {
            amps.push({ period: Math.round(period), amplitude: rel,
                        phase: Math.atan2(im[i], re[i]) });
        }
    }
    amps.sort(function(a,b){ return b.amplitude - a.amplitude; });
    return amps;
}

// ---------- 彩带 ----------
function calcRibbon(p) {
    if (p.length < 50) return { color: 'gray', trend: 'flat', strength: 0 };
    var ema10 = EMA(p, 10);
    var ema20 = EMA(p, 20);
    var ema50 = EMA(p, 50);
    var cur10 = ema10[ema10.length-1], cur20 = ema20[ema20.length-1], cur50 = ema50[ema50.length-1];
    var prev10 = ema10[ema10.length-2];
    var vol = stdDev(p.slice(-20)) / mean(p.slice(-20));
    var thresh = Math.max(0.0005, vol * 0.5);
    var color = 'gray';
    if (cur10 > cur20 && cur20 > cur50) color = 'red';
    else if (cur10 < cur20 && cur20 < cur50) color = 'green';
    var slope = (cur10 - prev10) / prev10;
    var trend = slope > thresh ? 'up' : (slope < -thresh ? 'down' : 'flat');
    var strength = Math.min(100, Math.abs(cur10 - cur50) / cur50 * 500);
    return { color: color, trend: trend, strength: strength };
}

// ---------- ISET 方向（三源融合）----------
function computeISETDirection(fullSpec, topN, p) {
    if (!fullSpec.length || p.length < 35) return 0;
    var last20 = p.slice(-20);
    var slopeDir = Math.max(-1, Math.min(1,
        (last20[last20.length-1] - last20[0]) / last20[0] * 10));
    var tech = calcTechScore(p);
    techInfo = tech;
    var techDir = tech.score / 100;
    var totalE = fullSpec.slice(0, topN).reduce(function(s,a){ return s+a.amplitude; },0);
    var specBias = totalE > 0.8 ? 0 : (totalE > 0.3 ? slopeDir * 0.5 : slopeDir);
    return slopeDir * 0.4 + techDir * 0.4 + specBias * 0.2;
}

// ---------- 概率 ----------
function probabilityFromDirection(dir) {
    dir = Math.max(-1, Math.min(1, dir));
    var up = 50 + dir * 35;
    up = Math.min(85, Math.max(15, up));
    var flat = 20 + (1 - Math.abs(dir)) * 30;
    flat = Math.min(50, Math.max(10, flat));
    var down = 100 - up - flat;
    down = Math.min(85, Math.max(5, down));
    var total = up + down + flat;
    up = up / total * 100; down = down / total * 100; flat = flat / total * 100;
    return { up: Math.round(up), down: Math.round(down), flat: Math.round(flat) };
}

// ---------- 全息预测线（相位修复版）----------
function computeHologramLine(p, periods, days, totalEnergy) {
    if (!periods.length) {
        var flatArr = [];
        for (var k = 0; k < days; k++) flatArr.push(p[p.length-1]);
        return flatArr;
    }
    var last = p[p.length-1], n = p.length;
    var lookback = Math.min(20, n - 1);
    var basePrice = p[n-1-lookback];
    if (!basePrice || basePrice <= 0 || last <= 0) basePrice = last;
    var dailyRet = Math.log(last / basePrice) / lookback;
    if (!isFinite(dailyRet)) dailyRet = 0;
    dailyRet = Math.max(-0.02, Math.min(0.02, dailyRet));
  var norm = periods.reduce(function(s,a){ return s+a.amplitude; },0) || 1;
    var intensity = Math.min(0.4, totalEnergy / 2.0);
    var recentVol = stdDev(p.slice(-20)) / mean(p.slice(-20));
    var pred = [], price = last;
    for (var d = 1; d <= days; d++) {
        var osc = 0;
        for (var i = 0; i < periods.length; i++) {
            var per = periods[i].period;
            var amp = periods[i].amplitude / norm;
            osc += amp * Math.cos(2 * Math.PI * (n - 1 + d) / per + periods[i].phase);
        }
        price *= Math.exp(dailyRet + osc * intensity * recentVol * 0.05);
        pred.push(parseFloat(price.toFixed(2)));
    }
    return pred;
}

// ---------- 绘制彩带 ----------
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
    ctx.fillStyle = rib.color === 'red' ? '#f87171'
                  : rib.color === 'green' ? '#4ade80' : '#94a3b8';
    ctx.fillRect(0, 0, cv.width, 40);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('彩带: ' + rib.color + ' | 趋势: ' + rib.trend + ' | 强度: ' + Math.round(rib.strength) + '%', 10, 25);
}

// ---------- 绘制预测线 ----------
function drawHologram() {
    if (!window.myChart) return;
    var ds = window.myChart.data.datasets, orig = null;
    for (var i=0; i<ds.length; i++) {
        var l = ds[i].label || '';
        if ((l.indexOf('收盘') >= 0 || l === 'close') && ds[i].data) { orig = ds[i].data; break; }
    }
    if (!orig || orig.length < 20) return;
    var topPeriods = spectrum;
    var totalEnergy = topPeriods.reduce(function(s,p){ return s+p.amplitude; },0);
    var forecast = computeHologramLine(prices, topPeriods, C.forecastDays, totalEnergy);
    var full = [];
    for (var i=0; i<orig.length; i++) full.push(null);
    for (var i=0; i<forecast.length; i++) full.push(forecast[i]);
    var idx = -1;
    for (var i=0; i<ds.length; i++) if (ds[i].label === '🔮 全息预测线') { idx = i; break; }
    if (idx >= 0) ds[idx].data = full;
    else ds.push({ label: '🔮 全息预测线', data: full, borderColor: '#a855f7', borderWidth: 2, borderDash: [8,4], pointRadius: 0, fill: false, tension: 0.1 });
    window.myChart.update();
}

// ---------- 刷新全部 ----------
function refreshAll() {
    try {
        var raw = getPrices();
        if (raw.length) prices = raw;
        if (prices.length > C.fixedLen) prices = prices.slice(-C.fixedLen);
        fullSpectrum = getSpectrum(prices);
        spectrum = fullSpectrum.slice(0, C.topN);
        ribbon = calcRibbon(prices);
        var dir = computeISETDirection(fullSpectrum, C.topN, prices);
        prob = probabilityFromDirection(dir);
        updatePanel();
        drawRibbonBar(ribbon);
        drawHologram();
        console.log('刷新完成，上升概率:', prob.up, '| 技术评分:', techInfo.score);
    } catch(e) { console.error(e); }
}

// ---------- 更新面板（纯字符串拼接，无模板字符串）----------
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
        topHtml += '<span style="background:#facc15;color:#0f172a;padding:4px 12px;border-radius:20px;margin:4px;font-weight:bold">' + s.period + '天 (' + ampPercent + '%)</span>';
    }
    var ribbonText = ribbon.color === 'red' ? '🔴 红色'
                   : ribbon.color === 'green' ? '🟢 绿色' : '⚪ 灰色';
    ribbonText += ribbon.trend === 'up' ? ' ↑' : (ribbon.trend === 'down' ? ' ↓' : ' —');
    var techColor = techInfo.score > 15 ? '#4ade80' : (techInfo.score < -15 ? '#f87171' : '#94a3b8');
    var techSign = techInfo.score > 0 ? '+' : '';
    var html = '';
    html += '<div style="display:flex;justify-content:space-between">';
    html += '<h3 style="color:#facc15;margin:0">📐 Z轴｜' + sym + '</h3>';
    html += '<button id="refreshBtn" style="background:#3b82f6;border:none;padding:4px 12px;border-radius:20px;color:white">🔄</button></div>';
    html += '<div style="margin:12px 0">🎯 ISET 核心周期 (Top' + C.topN + '): ' + topHtml + '</div>';
    html += '<div style="display:flex;gap:20px;flex-wrap:wrap">';
    html += '<div><div style="color:#facc15;font-size:0.7rem">📊 未来5日概率</div>';
    html += '<div><span style="color:#4ade80">▲ ' + prob.up + '%</span> ';
    html += '<span style="color:#f87171">▼ ' + prob.down + '%</span> ';
    html += '<span style="color:#94a3b8">— ' + prob.flat + '%</span></div></div>';
    html += '<div><div style="color:#94a3b8;font-size:0.7rem">🎨 彩带状态</div>';
    html += '<div>' + ribbonText + ' | 强度:' + Math.round(ribbon.strength) + '%</div></div>';
    html += '<div><div style="color:#94a3b8;font-size:0.7rem">📈 技术指标评分</div>';
    html += '<div style="color:' + techColor + ';font-weight:bold">' + techSign + techInfo.score + '</div>';
    html += '<div style="font-size:0.6rem;color:#64748b">' + techInfo.detail + '</div></div>';
    html += '</div>';
    html += '<div style="margin-top:12px;font-size:0.6rem;color:#64748b;text-align:center">⚡ 收益率FFT+Hanning窗 | 三源融合方向 | RSI/MACD/%B/ATR</div>';
    var contentDiv = document.getElementById('fourierContent');
    if (contentDiv) {
        contentDiv.innerHTML = html;
        var btn = document.getElementById('refreshBtn');
        if (btn) btn.onclick = function() { refreshAll(); };
    }
}

// ---------- 初始化（防重复监听）----------
function init() {
    refreshAll();
    if (window.__zaxisBound) return;
    window.__zaxisBound = true;
    var inp = document.getElementById('symbol');
    if (inp) inp.addEventListener('change', function() { setTimeout(refreshAll, 1500); });
    var btns = document.querySelectorAll('button');
    for (var i=0; i<btns.length; i++) {
        var t = btns[i].innerText || '';
        if (t.indexOf('分析') >= 0) {
            btns[i].addEventListener('click', function() { setTimeout(refreshAll, 2000); });
        }
    }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
