(function(){
console.log('📐 Z轴模块 v12.0 ｜ 强制面板显示 + ISET缓存');

// ---------- 配置 ----------
var C = {
    fixedLen: 200,
    topN: 5,
    forecastDays: 20
};

var prices = [];
var spectrum = [];          // [{period, amplitude, phase}] 振幅原始值
var ribbon = { color: 'gray', trend: 'flat', strength: 0 };
var forecastLine = [];

// ---------- 辅助 ----------
function getSymbol() {
    try {
        var inp = document.getElementById('symbol');
        return inp && inp.value ? inp.value.trim().toUpperCase() : 'STK';
    } catch(e) { return 'STK'; }
}

// ---------- 强制创建面板（保证可见）----------
function ensurePanel() {
    var panel = document.getElementById('fourierPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'fourierPanel';
        panel.style.cssText = 'margin:16px;padding:16px;background:#1e293b;border-radius:16px;border:1px solid #334155;color:#e2e8f0';
        var container = document.querySelector('.container') || document.body;
        container.insertBefore(panel, container.firstChild);
    }
    return panel;
}

// ---------- 加载价格数据（仅一次）----------
function loadPricesOnce() {
    if (prices.length > 0) return prices;
    try {
        // 1. 从 Chart.js 获取
        if (window.myChart && window.myChart.data) {
            var dsets = window.myChart.data.datasets;
            for (var i = 0; i < dsets.length; i++) {
                var ds = dsets[i];
                var lbl = ds.label || '';
                if ((lbl.indexOf('收盘') >= 0 || lbl === 'close' || lbl === '价格') && ds.data) {
                    var d = ds.data.filter(function(v){ return v !== null && !isNaN(v) && v > 0; });
                    if (d.length > 20) {
                        prices = d.length > C.fixedLen ? d.slice(-C.fixedLen) : d;
                        console.log('从图表加载数据，长度:', prices.length);
                        return prices;
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
                prices = tmp.length > C.fixedLen ? tmp.slice(-C.fixedLen) : tmp;
                console.log('从表格加载数据，长度:', prices.length);
                return prices;
            }
        }
        // 无数据则生成固定模拟数据（仅用于演示，避免空白）
        console.warn('无真实数据，使用固定模拟数据');
        var base = 150;
        for (var i = 0; i < C.fixedLen; i++) {
            base += (Math.sin(i * 0.1) * 2);
            prices.push(parseFloat(base.toFixed(2)));
        }
        return prices;
    } catch(e) {
        console.error(e);
        return [];
    }
}

// ---------- FFT (核心，无改动) ----------
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
        var wlen_re = Math.cos(ang);
        var wlen_im = Math.sin(ang);
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
                var nw_re = w_re * wlen_re - w_im * wlen_im;
                var nw_im = w_re * wlen_im + w_im * wlen_re;
                w_re = nw_re; w_im = nw_im;
            }
        }
    }
}

// ---------- 计算完整频谱（振幅原始值）----------
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
                amplitude: amp,
                phase: Math.atan2(im[i], re[i])
            });
        }
    }
    amps.sort(function(a, b) { return b.amplitude - a.amplitude; });
    return amps;
}

// ---------- 彩带 ----------
function computeRibbon(p) {
    if (p.length < 30) return { color: 'gray', trend: 'flat', strength: 0 };
    var n = p.length;
    var x1 = [];
    for (var i = 0; i < n; i++) {
        x1.push((3 * p[i] + (i>0 ? p[i-1] : p[i]) + (i>0 ? p[i-1] : p[i]) + p[i]) / 6);
    }
    var b = [];
    for (var i = 20; i < n; i++) {
        var s = 0;
        for (var j = 0; j < 20; j++) s += (20 - j) * x1[i - j];
        b.push(s / 210);
    }
    var d = [];
    for (var i = 14; i < b.length; i++) {
        var s = 0;
        for (var j = 0; j < 15; j++) s += b[i - j];
        d.push(s / 15);
    }
    if (b.length < 2 || d.length < 2) return { color: 'gray', trend: 'flat', strength: 0 };
    var curB = b[b.length-1];
    var curD = d[d.length-1];
    var prevB = b[b.length-2];
    var color = curB > curD ? 'red' : 'green';
    var trend = curB > prevB ? 'up' : 'down';
    var strength = Math.min(100, Math.abs((curB - curD) / curD) * 100);
    return { color: color, trend: trend, strength: strength };
}

// ---------- ISET 方向 ----------
function computeISETDirection(fullSpectrum, topN) {
    if (!fullSpectrum || fullSpectrum.length === 0) return 0;
    var totalEnergy = 0;
    var weightedDir = 0;
    for (var i = 0; i < Math.min(fullSpectrum.length, topN); i++) {
        var s = fullSpectrum[i];
        var energy = s.amplitude;
        var dir = Math.cos(s.phase);
        weightedDir += energy * dir;
        totalEnergy += energy;
    }
    if (totalEnergy === 0) return 0;
    return weightedDir / totalEnergy;
}

// ---------- 概率基于 ISET 方向 ----------
function probabilityFromDirection(dir) {
    var upProb = 50 + dir * 35;
    upProb = Math.min(85, Math.max(15, upProb));
    var flatProb = 20 + (1 - Math.abs(dir)) * 30;
    flatProb = Math.min(50, Math.max(10, flatProb));
    var downProb = 100 - upProb - flatProb;
    downProb = Math.max(5, Math.min(85, downProb));
    // 微调总和
    var total = upProb + downProb + flatProb;
    if (total !== 100) {
        upProb += (100 - total);
    }
    return {
        up: Math.round(upProb),
        down: Math.round(downProb),
        flat: Math.round(flatProb)
    };
}

// ---------- 全息预测线（归一化振幅叠加）----------
function computeHologramLine(p, periods, forecastDays, totalISETEnergy) {
    var n = p.length;
    var lastPrice = p[n-1];
    var mean = 0;
    for (var i = 0; i < n; i++) mean += p[i];
    mean /= n;
    var norm = 0;
    for (var i = 0; i < periods.length; i++) norm += periods[i].amplitude;
    if (norm === 0) norm = 1;
    var intensity = Math.min(0.5, totalISETEnergy / 2.0);
    var pred = [];
    for (var d = 1; d <= forecastDays; d++) {
        var sum = 0;
        for (var i = 0; i < periods.length; i++) {
            var per = periods[i].period;
            var amp = periods[i].amplitude / norm;
            var phase = periods[i].phase;
            sum += amp * Math.cos(2 * Math.PI * d / per + phase);
        }
        var change = sum * (lastPrice - mean) * intensity;
        var val = lastPrice + change;
        pred.push(parseFloat(val.toFixed(2)));
    }
    return pred;
}

// ---------- 绘制彩带图 ----------
function drawRibbonBar(rib) {
    var cv = document.getElementById('ribbonCanvas');
    if (!cv) {
        var can = document.querySelector('canvas');
        if (can) {
            var div = document.createElement('div');
            div.style.margin = '8px 0';
            div.innerHTML = '<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px; border-radius:8px"></canvas>';
            can.parentElement.insertBefore(div, can.nextSibling);
        } else {
            var panel = document.getElementById('fourierPanel');
            if (panel) {
                var div2 = document.createElement('div');
                div2.style.margin = '8px 0';
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
    ctx.fillText('彩带: ' + rib.color + ' | 趋势: ' + rib.trend + ' | 强度: ' + Math.round(rib.strength) + '%', 10, 25);
}

// ---------- 将预测线画到图表 ----------
function drawHologramOnChart(forecastData) {
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
    var full = new Array(orig.length).fill(null);
    for (var i = 0; i < forecastData.length; i++) full.push(forecastData[i]);
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

// ---------- 刷新 UI（不重算 FFT）----------
function refreshUI() {
    if (!spectrum.length) return;
    var dir = computeISETDirection(spectrum, C.topN);
    var prob = probabilityFromDirection(dir);
    var topPeriods = spectrum.slice(0, C.topN);
    var totalEnergy = 0;
    for (var i = 0; i < topPeriods.length; i++) totalEnergy += topPeriods[i].amplitude;
    var forecast = computeHologramLine(prices, topPeriods, C.forecastDays, totalEnergy);
    forecastLine = forecast;
    // 更新面板
    var panel = ensurePanel();
    var sym = getSymbol();
    var topHtml = '';
    for (var i = 0; i < Math.min(spectrum.length, C.topN); i++) {
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
        '<div style="margin-top:12px;font-size:0.6rem;color:#64748b;text-align:center">⚡ FFT缓存 | 归一化振幅 | flat基于方向不确定性 | 预测线强度来自ISET能量</div></div>';
    var btn = document.getElementById('refreshBtn');
    if (btn) btn.onclick = function() { refreshUI(); };
    drawRibbonBar(ribbon);
    drawHologramOnChart(forecast);
    console.log('UI刷新 | ISET方向:', dir.toFixed(3), '上升概率:', prob.up);
}

// ---------- 初始化 ----------
function init() {
    loadPricesOnce();
    if (prices.length === 0) {
        console.error('无法加载数据');
        return;
    }
    var data = prices.length > C.fixedLen ? prices.slice(-C.fixedLen) : prices.slice();
    prices = data;
    spectrum = computeFullSpectrum(prices);
    console.log('FFT 完成，周期数:', spectrum.length);
    ribbon = computeRibbon(prices);
    refreshUI();
    // 监听股票切换
    var inp = document.getElementById('symbol');
    if (inp) inp.addEventListener('change', function() {
        prices = [];
        spectrum = [];
        setTimeout(function() {
            loadPricesOnce();
            if (prices.length) {
                var newData = prices.length > C.fixedLen ? prices.slice(-C.fixedLen) : prices.slice();
                prices = newData;
                spectrum = computeFullSpectrum(prices);
                ribbon = computeRibbon(prices);
                refreshUI();
            }
        }, 1000);
    });
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
        var t = btns[i].innerText || '';
        if (t.indexOf('分析') >= 0) {
            btns[i].addEventListener('click', function() {
                setTimeout(function() {
                    prices = [];
                    spectrum = [];
                    loadPricesOnce();
                    if (prices.length) {
                        var newData = prices.length > C.fixedLen ? prices.slice(-C.fixedLen) : prices.slice();
                        prices = newData;
                        spectrum = computeFullSpectrum(prices);
                        ribbon = computeRibbon(prices);
                        refreshUI();
                    }
                }, 1500);
            });
        }
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
