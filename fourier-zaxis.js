(function(){
console.log('Z轴模块 v18.0 强制显示版');

// ---------- 配置 ----------
var MAX_DAYS = 200;
var TOP_N = 5;
var FORECAST_DAYS = 20;

var prices = [];
var spectrum = [];
var ribbon = { color: 'gray', trend: 'flat', strength: 0 };
var isUpdating = false;

// ---------- 辅助 ----------
function getSymbol() {
    var inp = document.getElementById('symbol');
    return inp ? inp.value.trim().toUpperCase() : 'STK';
}

// ---------- 从图表获取价格（实时）----------
function fetchPrices() {
    try {
        // 1. 从 Chart.js 获取
        if (window.myChart && window.myChart.data) {
            var ds = window.myChart.data.datasets;
            for (var i = 0; i < ds.length; i++) {
                var label = ds[i].label || '';
                if ((label.indexOf('收盘')>=0 || label==='close' || label==='价格') && ds[i].data) {
                    var d = ds[i].data.filter(v => v !== null && !isNaN(v) && v>0);
                    if (d.length > 20) return d.slice(-MAX_DAYS);
                }
            }
        }
        // 2. 从表格获取
        var rows = document.querySelectorAll('table tbody tr');
        if (rows.length > 10) {
            var tmp = [];
            for (var i=0; i<rows.length && i<500; i++) {
                var cell = rows[i].cells[1];
                if (cell) {
                    var val = parseFloat(cell.innerText.replace(/[^0-9.-]/g,''));
                    if (!isNaN(val) && val>0 && val<10000) tmp.push(val);
                }
            }
            if (tmp.length > 20) return tmp.slice(-MAX_DAYS);
        }
        return null;
    } catch(e) { return null; }
}

// ---------- FFT (标准) ----------
function fft(re, im) {
    var n = re.length;
    if (n <= 1) return;
    var j = 0;
    for (var i=0; i<n-1; i++) {
        if (i < j) {
            var tr = re[i]; re[i] = re[j]; re[j] = tr;
            var ti = im[i]; im[i] = im[j]; im[j] = ti;
        }
        var k = n>>1;
        while (k <= j) { j -= k; k >>= 1; }
        j += k;
    }
    for (var len=2; len<=n; len<<=1) {
        var ang = -2*Math.PI/len;
        var wl_re = Math.cos(ang);
        var wl_im = Math.sin(ang);
        for (var i=0; i<n; i+=len) {
            var w_re = 1, w_im = 0;
            for (var j=0; j<len/2; j++) {
                var u_re = re[i+j], u_im = im[i+j];
                var v_re = re[i+j+len/2]*w_re - im[i+j+len/2]*w_im;
                var v_im = re[i+j+len/2]*w_im + im[i+j+len/2]*w_re;
                re[i+j] = u_re + v_re;
                im[i+j] = u_im + v_im;
                re[i+j+len/2] = u_re - v_re;
                im[i+j+len/2] = u_im - v_im;
                var nw_re = w_re*wl_re - w_im*wl_im;
                var nw_im = w_re*wl_im + w_im*wl_re;
                w_re = nw_re; w_im = nw_im;
            }
        }
    }
}

// ---------- 计算频谱 ----------
function computeSpectrum(p) {
    var n = p.length;
    var size = 1; while (size < n) size <<= 1;
    var re = new Array(size).fill(0);
    var im = new Array(size).fill(0);
    var mean = 0; for (var i=0; i<n; i++) mean += p[i]; mean /= n;
    for (var i=0; i<n; i++) re[i] = p[i] - mean;
    fft(re, im);
    var amps = [];
    for (var i=1; i<Math.min(60, n/2); i++) {
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
    amps.sort((a,b)=>b.amplitude - a.amplitude);
    return amps;
}

// ---------- 彩带 ----------
function computeRibbon(p) {
    if (p.length < 30) return { color:'gray', trend:'flat', strength:0 };
    var n = p.length;
    var x1 = [];
    for (var i=0; i<n; i++) x1.push((3*p[i] + (i>0?p[i-1]:p[i]) + (i>0?p[i-1]:p[i]) + p[i])/6);
    var b = [], d = [];
    for (var i=20; i<n; i++) {
        var s=0; for (var j=0; j<20; j++) s += (20-j)*x1[i-j];
        b.push(s/210);
    }
    for (var i=14; i<b.length; i++) {
        var s=0; for (var j=0; j<15; j++) s += b[i-j];
        d.push(s/15);
    }
    if (b.length<2 || d.length<2) return { color:'gray', trend:'flat', strength:0 };
    var curB = b[b.length-1], curD = d[d.length-1], prevB = b[b.length-2];
    var color = curB > curD ? 'red' : 'green';
    var trend = curB > prevB ? 'up' : 'down';
    var strength = (curD === 0) ? 0 : Math.min(100, Math.abs((curB-curD)/curD)*100);
    return { color:color, trend:trend, strength:strength };
}

// ---------- ISET 方向 ----------
function computeISETDirection(sp, topN) {
    if (!sp.length) return 0;
    var totalE = 0, weighted = 0;
    for (var i=0; i<Math.min(sp.length, topN); i++) {
        var e = sp[i].amplitude;
        var d = Math.cos(sp[i].phase);
        weighted += e * d;
        totalE += e;
    }
    return totalE === 0 ? 0 : weighted / totalE;
}

// ---------- 概率（保证总和100）----------
function probability(dir) {
    var up = 50 + dir*35;
    up = Math.min(85, Math.max(15, up));
    var flat = 20 + (1-Math.abs(dir))*30;
    flat = Math.min(50, Math.max(10, flat));
    var down = 100 - up - flat;
    down = Math.min(85, Math.max(5, down));
    var total = up+down+flat;
    if (total !== 100) {
        var diff = 100 - total;
        if (flat + diff >= 10 && flat + diff <= 50) flat += diff;
        else if (down + diff >= 5 && down + diff <= 85) down += diff;
        else up += diff;
    }
    return { up:Math.round(up), down:Math.round(down), flat:Math.round(flat) };
}

// ---------- 全息预测线 ----------
function computeForecast(p, periods, forecastDays, totalEnergy) {
    if (!periods.length) return new Array(forecastDays).fill(p[p.length-1]);
    var last = p[p.length-1];
    var mean = 0; for (var i=0; i<p.length; i++) mean += p[i]; mean /= p.length;
    var norm = 0; for (var i=0; i<periods.length; i++) norm += periods[i].amplitude;
    if (norm === 0) norm = 1;
    var intensity = Math.min(0.5, totalEnergy / 2.0);
    var pred = [];
    for (var d=1; d<=forecastDays; d++) {
        var sum = 0;
        for (var i=0; i<periods.length; i++) {
            var per = periods[i].period;
            var amp = periods[i].amplitude / norm;
            var ph = periods[i].phase;
            sum += amp * Math.cos(2*Math.PI*d/per + ph);
        }
        var change = sum * (last - mean) * intensity;
        pred.push(parseFloat((last + change).toFixed(2)));
    }
    return pred;
}

// ---------- 绘制彩带 ----------
function drawRibbon(rib) {
    var cv = document.getElementById('ribbonCanvas');
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

// ---------- 绘制预测线到图表 ----------
function drawForecastOnChart(forecast) {
    if (!window.myChart) return;
    var ds = window.myChart.data.datasets;
    var orig = null;
    for (var i=0; i<ds.length; i++) {
        if ((ds[i].label||'').indexOf('收盘')>=0 && ds[i].data) { orig = ds[i].data; break; }
    }
    if (!orig) return;
    var full = new Array(orig.length).fill(null);
    for (var i=0; i<forecast.length; i++) full.push(forecast[i]);
    var idx = ds.findIndex(d => d.label === '🔮 全息预测线');
    if (idx >= 0) ds[idx].data = full;
    else ds.push({ label:'🔮 全息预测线', data:full, borderColor:'#a855f7', borderWidth:2, borderDash:[8,4], pointRadius:0, fill:false, tension:0.1 });
    window.myChart.update();
}

// ---------- 更新面板内容 ----------
function updateContent() {
    var contentDiv = document.getElementById('fourierContent');
    if (!contentDiv) return;
    
    // 如果还没有数据，显示加载中
    if (!spectrum.length) {
        contentDiv.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8">⏳ 等待图表数据加载...</div>';
        return;
    }
    
    var dir = computeISETDirection(spectrum, TOP_N);
    var prob = probability(dir);
    var topPeriods = spectrum.slice(0, TOP_N);
    var totalEnergy = topPeriods.reduce((s,p)=>s+p.amplitude, 0);
    var forecast = computeForecast(prices, topPeriods, FORECAST_DAYS, totalEnergy);
    drawForecastOnChart(forecast);
    
    var sym = getSymbol();
    var topHtml = '';
    for (var i=0; i<topPeriods.length; i++) {
        var ampPercent = (topPeriods[i].amplitude * 100).toFixed(1);
        topHtml += `<span style="background:#facc15;color:#0f172a;padding:4px 12px;border-radius:20px;margin:4px;font-weight:bold">${topPeriods[i].period}天 (${ampPercent}%)</span>`;
    }
    var ribbonText = ribbon.color==='red' ? '🔴 红色' : '🟢 绿色';
    ribbonText += ribbon.trend==='up' ? ' ↑' : ' ↓';
    contentDiv.innerHTML = `
        <div style="display:flex;justify-content:space-between">
            <h3 style="color:#facc15;margin:0">📐 Z轴｜${sym}</h3>
            <button id="refreshBtn" style="background:#3b82f6;border:none;padding:4px 12px;border-radius:20px;color:white">🔄</button>
        </div>
        <div style="margin:12px 0">🎯 ISET 核心周期 (Top${TOP_N}): ${topHtml}</div>
        <div style="display:flex;gap:20px;flex-wrap:wrap">
            <div><div style="color:#facc15;font-size:0.7rem">📊 未来5日概率 (ISET方向)</div>
            <div><span style="color:#4ade80">▲ ${prob.up}%</span> <span style="color:#f87171">▼ ${prob.down}%</span> <span style="color:#94a3b8">— ${prob.flat}%</span></div></div>
            <div><div style="color:#94a3b8;font-size:0.7rem">🎨 彩带状态</div><div>${ribbonText} | 强度:${Math.round(ribbon.strength)}%</div></div>
        </div>
        <div style="margin-top:12px;font-size:0.6rem;color:#64748b;text-align:center">⚡ 实时读取图表数据 | 换股自动更新 | 刷新不重算FFT</div>
    `;
    var btn = document.getElementById('refreshBtn');
    if (btn) btn.onclick = function() { refreshAll(); };
    drawRibbon(ribbon);
}

// ---------- 刷新全部（重新获取数据、重算）----------
function refreshAll() {
    if (isUpdating) return;
    isUpdating = true;
    var newPrices = fetchPrices();
    if (!newPrices || newPrices.length < 20) {
        console.warn('无法获取实时数据，保留原有数据');
        isUpdating = false;
        // 仍然显示等待提示
        updateContent();
        return;
    }
    prices = newPrices;
    spectrum = computeSpectrum(prices);
    ribbon = computeRibbon(prices);
    updateContent();
    isUpdating = false;
    console.log('刷新完成，股票:', getSymbol(), '数据长度:', prices.length);
}

// ---------- 创建固定面板 ----------
function createPanel() {
    if (document.getElementById('fourierPanel')) return;
    var panel = document.createElement('div');
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

// ---------- 监听换股 ----------
function bindEvents() {
    var symInput = document.getElementById('symbol');
    if (symInput) {
        symInput.addEventListener('change', function() { setTimeout(refreshAll, 1500); });
    }
    var btns = document.querySelectorAll('button');
    for (var i=0; i<btns.length; i++) {
        var text = btns[i].innerText || '';
        if (text.indexOf('分析') >= 0 || text.indexOf('分析') >= 0) {
            btns[i].addEventListener('click', function() { setTimeout(refreshAll, 2000); });
        }
    }
}

// ---------- 初始化：轮询直到图表就绪 ----------
function init() {
    createPanel();
    // 显示等待信息
    updateContent();
    // 轮询尝试获取数据
    var tryCount = 0;
    function poll() {
        var data = fetchPrices();
        if (data && data.length >= 20) {
            prices = data;
            spectrum = computeSpectrum(prices);
            ribbon = computeRibbon(prices);
            updateContent();
            bindEvents();
            console.log('初始化成功，数据长度:', prices.length);
        } else if (tryCount < 30) {
            tryCount++;
            setTimeout(poll, 500);
        } else {
            console.warn('超过30次尝试仍未获取到图表数据');
            var contentDiv = document.getElementById('fourierContent');
            if (contentDiv) contentDiv.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444">⚠️ 无法获取图表数据，请检查页面是否正常加载K线</div>';
        }
    }
    poll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
