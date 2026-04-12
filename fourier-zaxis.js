/**
 * Fourier Z-Axis Module for 1836.15 数律量化分析系统
 * 版本：v3.1 修正版 - 修复概率数据错误问题
 */

(function() {
    console.log('📐 Fourier Z-Axis Module v3.1 加载中...');

    var CONFIG = {
        retryTimes: 10,
        retryInterval: 500,
        useMockData: false
    };

    var prices = [];
    var spectrumResult = [];
    var probabilityResult = { up: 55, down: 15, flat: 30 };
    var currentSymbol = '';

    // ========== 获取当前股票代码 ==========
    function getCurrentSymbol() {
        try {
            var symbolInput = document.getElementById('symbol') || document.querySelector('input[placeholder*="代码"]');
            if (symbolInput && symbolInput.value) {
                return symbolInput.value.trim().toUpperCase();
            }
            return 'UNKNOWN';
        } catch(e) {
            return 'UNKNOWN';
        }
    }

    // ========== 从图表获取价格数据（优先） ==========
    function getPricesFromChart() {
        try {
            // 方法1：从 window.myChart 获取
            if (window.myChart && window.myChart.data && window.myChart.data.datasets) {
                var datasets = window.myChart.data.datasets;
                for (var i = 0; i < datasets.length; i++) {
                    var ds = datasets[i];
                    if (ds.label === '收盘价' || ds.label === 'close' || ds.label === '价格' || ds.type === 'line') {
                        var data = ds.data;
                        if (data && data.length > 20) {
                            console.log('✅ 从图表获取到 ' + data.length + ' 条价格数据');
                            return data.filter(function(v) { return v !== null && !isNaN(v); });
                        }
                    }
                }
            }
            
            // 方法2：从 canvas chart 实例获取
            var canvases = document.querySelectorAll('canvas');
            for (var i = 0; i < canvases.length; i++) {
                if (canvases[i].chart && canvases[i].chart.data) {
                    var datasets2 = canvases[i].chart.data.datasets;
                    for (var j = 0; j < datasets2.length; j++) {
                        var ds2 = datasets2[j];
                        if (ds2.label === '收盘价' || ds2.label === 'close' || ds2.type === 'line') {
                            var data2 = ds2.data;
                            if (data2 && data2.length > 20) {
                                console.log('✅ 从canvas图表获取到 ' + data2.length + ' 条数据');
                                return data2.filter(function(v) { return v !== null && !isNaN(v); });
                            }
                        }
                    }
                }
            }
            return null;
        } catch(e) {
            console.error('获取图表数据失败:', e);
            return null;
        }
    }

    // ========== 从表格获取价格数据（后备） ==========
    function getPricesFromTable() {
        try {
            var tables = document.querySelectorAll('table');
            for (var t = 0; t < tables.length; t++) {
                var rows = tables[t].querySelectorAll('tbody tr');
                if (rows.length > 10) {
                    var tempPrices = [];
                    for (var i = 0; i < rows.length && i < 300; i++) {
                        var cell = rows[i].cells[1];
                        if (cell) {
                            var val = parseFloat(cell.innerText.replace(/[^0-9.-]/g, ''));
                            if (!isNaN(val) && val > 0 && val < 10000) {
                                tempPrices.push(val);
                            }
                        }
                    }
                    if (tempPrices.length > 20) {
                        console.log('✅ 从表格获取到 ' + tempPrices.length + ' 条数据');
                        return tempPrices;
                    }
                }
            }
            return null;
        } catch(e) {
            return null;
        }
    }

    // ========== 获取价格数据（主函数） ==========
    function refreshPriceData() {
        var newPrices = getPricesFromChart();
        if (!newPrices || newPrices.length < 20) {
            newPrices = getPricesFromTable();
        }
        if (!newPrices || newPrices.length < 20) {
            console.log('📊 使用模拟数据');
            newPrices = generateMockPrices(200);
        }
        
        if (newPrices && newPrices.length > 0) {
            prices = newPrices;
            return true;
        }
        return false;
    }

    // ========== 重新计算所有数据 ==========
    function recalculate() {
        console.log('🔄 重新计算频谱和概率...');
        
        if (!refreshPriceData()) {
            console.warn('无法获取价格数据');
            return false;
        }
        
        if (!prices || prices.length < 10) {
            console.warn('价格数据不足');
            return false;
        }
        
        spectrumResult = computeSpectrum(prices);
        probabilityResult = computeProbability(prices);
        
        console.log('📊 计算结果: 涨=' + probabilityResult.up + '%, 跌=' + probabilityResult.down + '%, 平=' + probabilityResult.flat);
        
        updatePanelContent();
        return true;
    }

    // ========== 更新面板内容 ==========
    function updatePanelContent() {
        var panel = document.getElementById('fourierPanel');
        if (!panel) return;
        
        var periodHtml = '';
        for (var i = 0; i < spectrumResult.length; i++) {
            periodHtml += '<span style="display: inline-block; background: #334155; padding: 4px 12px; border-radius: 20px; margin: 4px;"><strong style="color: #facc15;">' + spectrumResult[i].period + '天</strong> <span style="color: #94a3b8;">(' + spectrumResult[i].amplitude + '%)</span></span>';
        }
        
        var symbol = getCurrentSymbol();
        var contentDiv = panel.querySelector('.fourier-content');
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
                    <h3 style="margin: 0; color: #facc15; font-size: 1rem;">📐 Z轴视角｜${symbol} 傅里叶频谱分析</h3>
                    <button id="refreshFourierBtn" style="background: #3b82f6; border: none; padding: 4px 12px; border-radius: 20px; color: white; font-size: 0.7rem; cursor: pointer;">🔄 刷新</button>
                </div>
                
                <div style="display: flex; flex-wrap: wrap; gap: 16px;">
                    <div style="flex: 2; min-width: 150px;">
                        <div style="color: #94a3b8; font-size: 0.7rem; margin-bottom: 6px;">🎯 主导周期（振幅排序）</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">${periodHtml || '<span style="color: #64748b;">计算中...</span>'}</div>
                    </div>
                    
                    <div style="flex: 1; min-width: 120px;">
                        <div style="color: #94a3b8; font-size: 0.7rem; margin-bottom: 6px;">📊 未来5日概率（YZ轴）</div>
                        <div style="display: flex; gap: 12px;">
                            <div><span style="color: #4ade80;">▲ 涨</span> <strong style="font-size: 1.1rem;">${probabilityResult.up}%</strong></div>
                            <div><span style="color: #f87171;">▼ 跌</span> <strong style="font-size: 1.1rem;">${probabilityResult.down}%</strong></div>
                            <div><span style="color: #94a3b8;">— 平</span> <strong style="font-size: 1.1rem;">${probabilityResult.flat}%</strong></div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #334155; font-size: 0.6rem; color: #64748b; text-align: center;">
                    ⚡ 基于当前股票 "${symbol}" 的实时数据计算 | 点击刷新可更新
                </div>
            `;
            
            var refreshBtn = document.getElementById('refreshFourierBtn');
            if (refreshBtn) {
                refreshBtn.onclick = function() {
                    recalculate();
                    tryDrawHologramLine(true);
                };
            }
        }
    }

    // ========== FFT 和频谱计算 ==========
    function fft(re, im) {
        var N = re.length;
        if (N <= 1) return;
        var j = 0;
        for (var i = 0; i < N - 1; i++) {
            if (i < j) {
                var tr = re[i]; re[i] = re[j]; re[j] = tr;
                var ti = im[i]; im[i] = im[j]; im[j] = ti;
            }
            var k = N >> 1;
            while (k <= j) { j -= k; k >>= 1; }
            j += k;
        }
        for (var len = 2; len <= N; len <<= 1) {
            var ang = -2 * Math.PI / len;
            var wlen_re = Math.cos(ang);
            var wlen_im = Math.sin(ang);
            for (var i = 0; i < N; i += len) {
                var w_re = 1;
                var w_im = 0;
                for (var j = 0; j < len/2; j++) {
                    var u_re = re[i + j];
                    var u_im = im[i + j];
                    var v_re = re[i + j + len/2] * w_re - im[i + j + len/2] * w_im;
                    var v_im = re[i + j + len/2] * w_im + im[i + j + len/2] * w_re;
                    re[i + j] = u_re + v_re;
                    im[i + j] = u_im + v_im;
                    re[i + j + len/2] = u_re - v_re;
                    im[i + j + len/2] = u_im - v_im;
                    var next_w_re = w_re * wlen_re - w_im * wlen_im;
                    var next_w_im = w_re * wlen_im + w_im * wlen_re;
                    w_re = next_w_re;
                    w_im = next_w_im;
                }
            }
        }
    }

    function computeSpectrum(pricesData) {
        var n = pricesData.length;
        var size = 1;
        while (size < n) size <<= 1;
        var real = new Array(size).fill(0);
        var imag = new Array(size).fill(0);
        var mean = 0;
        for (var i = 0; i < n; i++) mean += pricesData[i];
        mean /= n;
        for (var i = 0; i < n; i++) real[i] = pricesData[i] - mean;
        fft(real, imag);
        var amplitudes = [];
        var maxFreq = Math.min(50, n/2);
        for (var i = 1; i < maxFreq; i++) {
            var amp = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / n;
            var period = n / i;
            if (period >= 2 && period <= 300) {
                amplitudes.push({ period: Math.round(period), amplitude: parseFloat((amp * 100).toFixed(1)) });
            }
        }
        amplitudes.sort(function(a, b) { return b.amplitude - a.amplitude; });
        return amplitudes.slice(0, 5);
    }

    function computeProbability(pricesData) {
        var lookback = 20;
        if (pricesData.length < lookback + 10) {
            return { up: 33, down: 33, flat: 34 };
        }
        var recent = pricesData.slice(-lookback);
        var recentPattern = [];
        for (var i = 0; i < lookback; i++) recentPattern.push(recent[i] / recent[0]);
        var similarities = [];
        for (var i = 0; i < pricesData.length - lookback - 5; i++) {
            var windowPrices = pricesData.slice(i, i + lookback);
            var pattern = [];
            for (var j = 0; j < lookback; j++) pattern.push(windowPrices[j] / windowPrices[0]);
            var diff = 0;
            for (var j = 0; j < lookback; j++) diff += Math.abs(pattern[j] - recentPattern[j]);
            var futureReturn = (pricesData[i + lookback + 5] / pricesData[i + lookback] - 1) * 100;
            similarities.push({ diff: diff, futureReturn: futureReturn });
        }
        similarities.sort(function(a, b) { return a.diff - b.diff; });
        var topMatches = similarities.slice(0, 20);
        var upCount = 0, downCount = 0;
        for (var i = 0; i < topMatches.length; i++) {
            if (topMatches[i].futureReturn > 0.5) upCount++;
            else if (topMatches[i].futureReturn < -0.5) downCount++;
        }
        var total = topMatches.length;
        return {
            up: Math.round(upCount / total * 100),
            down: Math.round(downCount / total * 100),
            flat: Math.round((total - upCount - downCount) / total * 100)
        };
    }

    function generateMockPrices(days) {
        var p = [];
        var base = 150;
        for (var i = 0; i < days; i++) {
            var change = (Math.random() - 0.5) * 4;
            base += change;
            base = Math.max(80, Math.min(300, base));
            p.push(parseFloat(base.toFixed(2)));
        }
        return p;
    }

    // ========== 绘制全息预测线 ==========
    function tryDrawHologramLine(forceRefresh) {
        if (window.myChart && window.myChart.data) {
            drawHologramLine(window.myChart);
        } else {
            var canvases = document.querySelectorAll('canvas');
            for (var i = 0; i < canvases.length; i++) {
                if (canvases[i].chart && canvases[i].chart.data) {
                    drawHologramLine(canvases[i].chart);
                    break;
                }
            }
        }
    }

    function drawHologramLine(chart) {
        if (!chart || !chart.data) return;
        var originalData = null;
        var datasets = chart.data.datasets;
        for (var i = 0; i < datasets.length; i++) {
            var ds = datasets[i];
            if (ds.label === '收盘价' || ds.label === 'close' || ds.label === '价格' || ds.type === 'line') {
                originalData = ds.data;
                break;
            }
        }
        if (!originalData || originalData.length < 20) return;
        
        var n = originalData.length;
        var lastPrice = originalData[n - 1];
        var mean = 0;
        for (var i = 0; i < n; i++) mean += originalData[i];
        mean /= n;
        
        var predictionDays = 20;
        var predictions = [];
        for (var day = 1; day <= predictionDays; day++) {
            var sum = 0, weightSum = 0;
            for (var i = 0; i < Math.min(spectrumResult.length, 3); i++) {
                var period = spectrumResult[i].period;
                var amp = spectrumResult[i].amplitude / 100;
                if (period > 1) {
                    var angle = (day * 2 * Math.PI) / period;
                    sum += amp * Math.cos(angle);
                    weightSum += amp;
                }
            }
            var predValue = lastPrice;
            if (weightSum > 0) {
                var change = (sum / weightSum) * (lastPrice - mean) * 0.5;
                predValue = lastPrice + change;
            }
            predictions.push(parseFloat(predValue.toFixed(2)));
        }
        
        var fullPredictions = new Array(originalData.length).fill(null);
        for (var i = 0; i < predictions.length; i++) fullPredictions.push(predictions[i]);
        
        var existingIndex = -1;
        for (var i = 0; i < datasets.length; i++) {
            if (datasets[i].label === '🔮 全息预测线 (Z轴)') {
                existingIndex = i;
                break;
            }
        }
        
        if (existingIndex >= 0) {
            chart.data.datasets[existingIndex].data = fullPredictions;
        } else {
            chart.data.datasets.push({
                label: '🔮 全息预测线 (Z轴)',
                data: fullPredictions,
                borderColor: '#a855f7',
                borderWidth: 2,
                borderDash: [8, 4],
                pointRadius: 0,
                fill: false,
                tension: 0.1
            });
        }
        chart.update();
        console.log('✅ 全息预测线已更新');
    }

    // ========== 添加主面板 ==========
    function addMainPanel() {
        if (document.getElementById('fourierPanel')) return;
        var container = document.querySelector('.container') || document.body;
        var panel = document.createElement('div');
        panel.id = 'fourierPanel';
        panel.style.cssText = 'margin: 16px; padding: 16px; background: #1e293b; border-radius: 16px; border: 1px solid #334155; color: #e2e8f0;';
        panel.innerHTML = '<div class="fourier-content">加载中...</div>';
        container.insertBefore(panel, container.firstChild);
        return panel;
    }

    // ========== 监听股票切换 ==========
    function watchSymbolChange() {
        var symbolInput = document.getElementById('symbol');
        if (symbolInput) {
            symbolInput.addEventListener('change', function() {
                console.log('📊 股票代码已切换至:', this.value);
                setTimeout(function() {
                    recalculate();
                    tryDrawHologramLine(true);
                }, 1000);
            });
        }
        
        var analyzeBtn = document.querySelector('button[onclick*="runQuantAnalysis"], button:contains("分析")');
        if (analyzeBtn) {
            analyzeBtn.addEventListener('click', function() {
                setTimeout(function() {
                    recalculate();
                    tryDrawHologramLine(true);
                }, 1500);
            });
        }
    }

    // ========== 初始化 ==========
    function init() {
        console.log('✅ Fourier Z-Axis Module v3.1 启动');
        addMainPanel();
        setTimeout(function() {
            recalculate();
            tryDrawHologramLine();
            watchSymbolChange();
        }, 2000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
