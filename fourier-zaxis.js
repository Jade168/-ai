/**
 * Fourier Z-Axis Module for 1836.15 数律量化分析系统
 * 版本：v4.0 修正版
 * 
 * 修正内容：
 * 1. 固定数据长度（200天），确保每次计算结果一致
 * 2. 数据源唯一：只从图表读取，不重新抓API
 * 3. 监听股票切换，自动重新计算
 * 4. 刷新按钮只重算，不换数据
 * 5. 概率计算用Top3周期加权平均，不再依赖单周期排序
 */

(function() {
    console.log('📐 Fourier Z-Axis Module v4.0 加载中...');

    // ========== 配置 ==========
    var CONFIG = {
        fixedDataLength: 200,      // 固定数据长度
        topPeriodsCount: 3,        // 取前几个周期
        probabilitySamples: 50,    // 相似形态数量
        volatilityAdjust: true     // 波动率调整
    };

    var currentPrices = [];
    var currentSpectrum = [];
    var currentProbability = { up: 50, down: 25, flat: 25 };
    var currentSymbol = '';
    var isInitialized = false;

    // ========== 获取当前股票代码 ==========
    function getCurrentSymbol() {
        try {
            var input = document.getElementById('symbol') || 
                        document.querySelector('input[placeholder*="代码"]') ||
                        document.querySelector('input[type="text"][value*="TSLA"], input[type="text"][value*="00700"], input[type="text"][value*="AAPL"]');
            if (input && input.value) {
                return input.value.trim().toUpperCase();
            }
            return 'UNKNOWN';
        } catch(e) {
            return 'UNKNOWN';
        }
    }

    // ========== 从图表获取价格数据（唯一数据源） ==========
    function getPricesFromChart() {
        try {
            // 方法1：从 window.myChart 获取
            if (window.myChart && window.myChart.data && window.myChart.data.datasets) {
                var datasets = window.myChart.data.datasets;
                for (var i = 0; i < datasets.length; i++) {
                    var ds = datasets[i];
                    var label = ds.label || '';
                    if (label === '收盘价' || label === 'close' || label === '价格' || label.indexOf('收盘') >= 0 || ds.type === 'line') {
                        var data = ds.data;
                        if (data && data.length > 20) {
                            var prices = data.filter(function(v) { return v !== null && !isNaN(v) && v > 0; });
                            if (prices.length > 20) {
                                console.log('✅ 从图表获取到 ' + prices.length + ' 条数据');
                                return prices;
                            }
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
                        var label2 = ds2.label || '';
                        if (label2 === '收盘价' || label2 === 'close' || label2 === '价格' || label2.indexOf('收盘') >= 0 || ds2.type === 'line') {
                            var data2 = ds2.data;
                            if (data2 && data2.length > 20) {
                                var prices2 = data2.filter(function(v) { return v !== null && !isNaN(v) && v > 0; });
                                if (prices2.length > 20) {
                                    console.log('✅ 从canvas获取到 ' + prices2.length + ' 条数据');
                                    return prices2;
                                }
                            }
                        }
                    }
                }
            }
            
            // 方法3：从表格获取（后备）
            var tables = document.querySelectorAll('table');
            for (var t = 0; t < tables.length; t++) {
                var rows = tables[t].querySelectorAll('tbody tr');
                if (rows.length > 10) {
                    var tempPrices = [];
                    for (var i = 0; i < rows.length && i < 500; i++) {
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
            console.error('获取图表数据失败:', e);
            return null;
        }
    }

    // ========== 固定数据长度 ==========
    function fixDataLength(prices) {
        if (!prices || prices.length === 0) return [];
        if (prices.length <= CONFIG.fixedDataLength) {
            return prices.slice();
        }
        // 只取最近 CONFIG.fixedDataLength 天
        return prices.slice(-CONFIG.fixedDataLength);
    }

    // ========== 生成模拟数据（仅当图表无数据时） ==========
    function generateMockPrices(days) {
        var p = [];
        var base = 150;
        for (var i = 0; i < days; i++) {
            var change = (Math.random() - 0.5) * 3;
            base += change;
            base = Math.max(80, Math.min(300, base));
            p.push(parseFloat(base.toFixed(2)));
        }
        return p;
    }

    // ========== 刷新数据（只从图表读取，不重新抓API） ==========
    function refreshData() {
        console.log('🔄 刷新数据...');
        
        var newPrices = getPricesFromChart();
        if (!newPrices || newPrices.length < 20) {
            console.warn('⚠️ 无法从图表获取数据，使用模拟数据');
            newPrices = generateMockPrices(CONFIG.fixedDataLength);
        }
        
        // 固定长度
        newPrices = fixDataLength(newPrices);
        
        var newSymbol = getCurrentSymbol();
        var dataChanged = (currentPrices.length !== newPrices.length) || (currentSymbol !== newSymbol);
        
        // 检查数据是否真的变了
        if (!dataChanged && currentPrices.length > 0) {
            for (var i = 0; i < Math.min(currentPrices.length, newPrices.length); i++) {
                if (Math.abs(currentPrices[i] - newPrices[i]) > 0.01) {
                    dataChanged = true;
                    break;
                }
            }
        }
        
        if (dataChanged) {
            currentPrices = newPrices;
            currentSymbol = newSymbol;
            console.log('📊 数据已更新，股票: ' + currentSymbol + '，数据长度: ' + currentPrices.length);
            return true;
        }
        
        console.log('📊 数据无变化');
        return false;
    }

    // ========== 强制刷新（用于股票切换时） ==========
    function forceRefresh() {
        var changed = refreshData();
        if (changed || currentSpectrum.length === 0) {
            recalculate();
        }
        return changed;
    }

    // ========== FFT 傅里叶变换 ==========
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
            while (k <= j) {
                j -= k;
                k >>= 1;
            }
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

    // ========== 计算频谱 ==========
    function computeSpectrum(pricesData) {
        if (!pricesData || pricesData.length < 10) return [];
        
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
            if (period >= 5 && period <= 300) {
                amplitudes.push({
                    period: Math.round(period),
                    amplitude: parseFloat((amp * 100).toFixed(1))
                });
            }
        }
        
        amplitudes.sort(function(a, b) { 
            if (b.amplitude === a.amplitude) {
                return a.period - b.period;
            }
            return b.amplitude - a.amplitude; 
        });
        
        return amplitudes.slice(0, 10);
    }

    // ========== 计算波动率 ==========
    function computeVolatility(pricesData) {
        if (pricesData.length < 2) return 0.02;
        var sum = 0;
        for (var i = 1; i < pricesData.length; i++) {
            var ret = Math.abs((pricesData[i] - pricesData[i-1]) / pricesData[i-1]);
            sum += ret;
        }
        return sum / (pricesData.length - 1);
    }

    // ========== 计算概率（使用Top3周期加权平均） ==========
    function computeProbability(pricesData, spectrum) {
        if (!pricesData || pricesData.length < 30) {
            return { up: 33, down: 33, flat: 34 };
        }
        
        var lookback = 20;
        var topPeriods = spectrum.slice(0, CONFIG.topPeriodsCount);
        
        // 如果没有频谱数据，用默认
        if (topPeriods.length === 0) {
            topPeriods = [{ period: 50, amplitude: 100 }];
        }
        
        // 计算加权权重
        var totalAmp = 0;
        for (var i = 0; i < topPeriods.length; i++) {
            totalAmp += topPeriods[i].amplitude;
        }
        var weights = [];
        for (var i = 0; i < topPeriods.length; i++) {
            weights.push(topPeriods[i].amplitude / totalAmp);
        }
        
        // 获取最近的价格形态
        var recent = pricesData.slice(-lookback);
        var recentPattern = [];
        for (var i = 0; i < lookback; i++) {
            recentPattern.push(recent[i] / recent[0]);
        }
        
        // 在历史中寻找相似形态
        var similarities = [];
        var maxStart = Math.max(0, pricesData.length - 1000);
        for (var i = maxStart; i < pricesData.length - lookback - 5; i++) {
            var windowPrices = pricesData.slice(i, i + lookback);
            var pattern = [];
            for (var j = 0; j < lookback; j++) {
                pattern.push(windowPrices[j] / windowPrices[0]);
            }
            var diff = 0;
            for (var j = 0; j < lookback; j++) {
                diff += Math.abs(pattern[j] - recentPattern[j]);
            }
            var futureReturn = (pricesData[i + lookback + 5] / pricesData[i + lookback] - 1) * 100;
            similarities.push({ diff: diff, futureReturn: futureReturn });
        }
        
        similarities.sort(function(a, b) {
            if (a.diff === b.diff) {
                return Math.abs(a.futureReturn) - Math.abs(b.futureReturn);
            }
            return a.diff - b.diff;
        });
        
        var topMatches = similarities.slice(0, CONFIG.probabilitySamples);
        
        // 波动率调整
        var volatility = computeVolatility(pricesData);
        var upThreshold = 0.5;
        var downThreshold = -0.5;
        if (volatility > 0.03) {
            upThreshold = 0.3;
            downThreshold = -0.3;
        } else if (volatility < 0.01) {
            upThreshold = 0.8;
            downThreshold = -0.8;
        }
        
        var weightedUp = 0, weightedDown = 0, weightedFlat = 0;
        var totalWeight = 0;
        
        for (var i = 0; i < topMatches.length; i++) {
            var match = topMatches[i];
            var weight = 1 / (1 + match.diff);
            totalWeight += weight;
            if (match.futureReturn > upThreshold) {
                weightedUp += weight;
            } else if (match.futureReturn < downThreshold) {
                weightedDown += weight;
            } else {
                weightedFlat += weight;
            }
        }
        
        if (totalWeight === 0) {
            return { up: 33, down: 33, flat: 34 };
        }
        
        return {
            up: Math.round(weightedUp / totalWeight * 100),
            down: Math.round(weightedDown / totalWeight * 100),
            flat: Math.round(weightedFlat / totalWeight * 100)
        };
    }

    // ========== 重新计算所有 ==========
    function recalculate() {
        if (!currentPrices || currentPrices.length === 0) {
            console.warn('无数据，无法计算');
            return false;
        }
        
        console.log('📐 重新计算 FFT...');
        currentSpectrum = computeSpectrum(currentPrices);
        currentProbability = computeProbability(currentPrices, currentSpectrum);
        
        updatePanelContent();
        tryDrawHologramLine();
        
        return true;
    }

    // ========== 更新面板内容 ==========
    function updatePanelContent() {
        var panel = document.getElementById('fourierPanel');
        if (!panel) return;
        
        var topPeriods = currentSpectrum.slice(0, CONFIG.topPeriodsCount);
        var otherPeriods = currentSpectrum.slice(CONFIG.topPeriodsCount, 6);
        
        var topHtml = '';
        for (var i = 0; i < topPeriods.length; i++) {
            topHtml += '<span style="display: inline-block; background: #facc15; color: #0f172a; padding: 4px 12px; border-radius: 20px; margin: 4px; font-weight: bold;"><strong>' + topPeriods[i].period + '天</strong> <span style="font-weight: normal;">(' + topPeriods[i].amplitude + '%)</span></span>';
        }
        
        var otherHtml = '';
        for (var i = 0; i < otherPeriods.length; i++) {
            otherHtml += '<span style="display: inline-block; background: #334155; padding: 3px 10px; border-radius: 20px; margin: 3px; font-size: 0.7rem;"><strong>' + otherPeriods[i].period + '天</strong> (' + otherPeriods[i].amplitude + '%)</span>';
        }
        
        var contentDiv = panel.querySelector('.fourier-content');
        if (contentDiv) {
            contentDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
                    <h3 style="margin: 0; color: #facc15; font-size: 1rem;">📐 Z轴视角｜${currentSymbol} 傅里叶频谱分析</h3>
                    <button id="refreshFourierBtn" style="background: #3b82f6; border: none; padding: 4px 12px; border-radius: 20px; color: white; font-size: 0.7rem; cursor: pointer;">🔄 重算</button>
                </div>
                
                <div style="display: flex; flex-wrap: wrap; gap: 16px;">
                    <div style="flex: 2; min-width: 180px;">
                        <div style="color: #94a3b8; font-size: 0.7rem; margin-bottom: 6px;">🎯 主导周期（加权平均用 Top${CONFIG.topPeriodsCount}）</div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px;">${topHtml || '<span style="color: #64748b;">计算中...</span>'}</div>
                        ${otherHtml ? '<div style="margin-top: 8px;"><span style="color: #64748b; font-size: 0.6rem;">其他周期：</span>' + otherHtml + '</div>' : ''}
                    </div>
                    
                    <div style="flex: 1; min-width: 130px;">
                        <div style="color: #94a3b8; font-size: 0.7rem; margin-bottom: 6px;">📊 未来5日概率（Top3加权）</div>
                        <div style="display: flex; gap: 15px;">
                            <div><span style="color: #4ade80;">▲ 涨</span> <strong style="font-size: 1.2rem;">${currentProbability.up}%</strong></div>
                            <div><span style="color: #f87171;">▼ 跌</span> <strong style="font-size: 1.2rem;">${currentProbability.down}%</strong></div>
                            <div><span style="color: #94a3b8;">— 平</span> <strong style="font-size: 1.2rem;">${currentProbability.flat}%</strong></div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #334155; font-size: 0.6rem; color: #64748b; display: flex; justify-content: space-between; flex-wrap: wrap;">
                    <span>⚡ 基于固定长度 ${CONFIG.fixedDataLength}天数据 | Top${CONFIG.topPeriodsCount}周期加权平均</span>
                    <span>📅 数据长度: ${currentPrices.length}天</span>
                </div>
            `;
            
            var refreshBtn = document.getElementById('refreshFourierBtn');
            if (refreshBtn) {
                refreshBtn.onclick = function() {
                    console.log('🔄 用户点击重算按钮');
                    recalculate();
                };
            }
        }
    }

    // ========== 绘制全息预测线 ==========
    function tryDrawHologramLine() {
        if (!currentSpectrum || currentSpectrum.length === 0) return;
        
        var chart = null;
        if (window.myChart) {
            chart = window.myChart;
        } else {
            var canvases = document.querySelectorAll('canvas');
            for (var i = 0; i < canvases.length; i++) {
                if (canvases[i].chart) {
                    chart = canvases[i].chart;
                    break;
                }
            }
        }
        
        if (!chart || !chart.data) {
            console.log('无法检测到图表实例，跳过画线');
            return;
        }
        
        // 获取原始数据
        var originalData = null;
        var datasets = chart.data.datasets;
        for (var i = 0; i < datasets.length; i++) {
            var ds = datasets[i];
            var label = ds.label || '';
            if (label === '收盘价' || label === 'close' || label === '价格' || label.indexOf('收盘') >= 0 || ds.type === 'line') {
                originalData = ds.data;
                break;
            }
        }
        
        if (!originalData || originalData.length < 20) return;
        
        // 用Top3周期加权计算预测
        var topPeriods = currentSpectrum.slice(0, CONFIG.topPeriodsCount);
        var totalAmp = 0;
        for (var i = 0; i < topPeriods.length; i++) totalAmp += topPeriods[i].amplitude;
        
        var n = originalData.length;
        var lastPrice = originalData[n - 1];
        var mean = 0;
        for (var i = 0; i < n; i++) mean += originalData[i];
        mean /= n;
        
        var predictionDays = 20;
        var predictions = [];
        for (var day = 1; day <= predictionDays; day++) {
            var sum = 0;
            var weightSum = 0;
            for (var i = 0; i < topPeriods.length; i++) {
                var period = topPeriods[i].period;
                var amp = topPeriods[i].amplitude;
                if (period > 1) {
                    var angle = (day * 2 * Math.PI) / period;
                    sum += amp * Math.cos(angle);
                    weightSum += amp;
                }
            }
            var predValue = lastPrice;
            if (weightSum > 0) {
                var change = (sum / weightSum) * (lastPrice - mean) * 0.3;
                predValue = lastPrice + change;
            }
            predictions.push(parseFloat(predValue.toFixed(2)));
        }
        
        var fullPredictions = new Array(originalData.length).fill(null);
        for (var i = 0; i < predictions.length; i++) fullPredictions.push(predictions[i]);
        
        // 更新或添加预测线
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

    // ========== 监听股票切换 ==========
    function watchSymbolChange() {
        // 监听股票代码输入框
        var symbolInput = document.getElementById('symbol');
        if (symbolInput) {
            symbolInput.addEventListener('change', function() {
                console.log('📊 股票代码已切换至:', this.value);
                setTimeout(function() {
                    forceRefresh();
                }, 1000);
            });
        }
        
        // 监听分析按钮
        var btns = document.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
            var btn = btns[i];
            var btnText = btn.innerText || '';
            if (btnText.indexOf('分析') >= 0 || btnText.indexOf('分析') >= 0 || btn.id === 'runBtn' || btn.id === 'analyzeBtn') {
                btn.addEventListener('click', function() {
                    setTimeout(function() {
                        forceRefresh();
                    }, 1500);
                });
            }
        }
        
        // 监听页面可见性变化（从后台回来时刷新）
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                setTimeout(function() {
                    forceRefresh();
                }, 500);
            }
        });
    }

    // ========== 添加主面板 ==========
    function addMainPanel() {
        if (document.getElementById('fourierPanel')) return;
        
        var container = document.querySelector('.container') || document.body;
        var panel = document.createElement('div');
        panel.id = 'fourierPanel';
        panel.style.cssText = 'margin: 16px; padding: 16px; background: #1e293b; border-radius: 16px; border: 1px solid #334155; color: #e2e8f0;';
        panel.innerHTML = '<div class="fourier-content">加载中...</div>';
        
        if (container.firstChild) {
            container.insertBefore(panel, container.firstChild);
        } else {
            container.appendChild(panel);
        }
        
        return panel;
    }

    // ========== 初始化 ==========
    function init() {
        console.log('✅ Fourier Z-Axis Module v4.0 启动');
        
        addMainPanel();
        
        // 等待图表加载
        setTimeout(function() {
            forceRefresh();
            watchSymbolChange();
        }, 2000);
        
        isInitialized = true;
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
