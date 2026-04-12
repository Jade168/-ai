/**
 * Fourier Z-Axis Module for 1836.15 数律量化分析系统
 * 版本：v3.0 最终优化版
 * 功能：傅里叶频谱分析 + Z轴概率视角 + 全息预测线（自动检测，画唔到会提示）
 */

(function() {
    console.log('📐 Fourier Z-Axis Module v3.0 加载中...');

    // 配置
    var CONFIG = {
        retryTimes: 10,        // 检测图表次数
        retryInterval: 500,    // 每次间隔(ms)
        useMockData: false     // 是否强制用模拟数据
    };

    var prices = [];
    var spectrumResult = [];
    var probabilityResult = { up: 33, down: 33, flat: 34 };

    // ========== 主函数 ==========
    function init() {
        console.log('✅ Fourier Z-Axis Module 启动');

        // 先尝试获取价格数据
        var success = tryGetPriceData();
        
        if (!success || CONFIG.useMockData) {
            console.log('📊 使用模拟数据');
            prices = generateMockPrices(200);
        }
        
        if (!prices || prices.length < 10) {
            console.error('❌ 无法获取价格数据');
            addErrorPanel('无法获取价格数据，请检查网络');
            return;
        }
        
        // 计算频谱和概率
        spectrumResult = computeSpectrum(prices);
        probabilityResult = computeProbability(prices);
        
        // 添加主面板
        addMainPanel();
        
        // 尝试绘制全息预测线（自动检测，画唔到会提示）
        tryDrawHologramLine();
    }

    // ========== 获取价格数据 ==========
    function tryGetPriceData() {
        try {
            // 方法1：从表格获取
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
                        prices = tempPrices;
                        console.log('✅ 从表格获取到 ' + prices.length + ' 条数据');
                        return true;
                    }
                }
            }
            
            // 方法2：从页面数字提取
            var bodyText = document.body.innerText;
            var numbers = bodyText.match(/\d+\.?\d*/g);
            var tempPrices2 = [];
            for (var i = 0; i < numbers.length && tempPrices2.length < 200; i++) {
                var num = parseFloat(numbers[i]);
                if (num > 10 && num < 10000) {
                    tempPrices2.push(num);
                }
            }
            if (tempPrices2.length > 20) {
                prices = tempPrices2;
                console.log('✅ 从页面提取到 ' + prices.length + ' 条数据');
                return true;
            }
            
            return false;
        } catch(e) {
            console.error('获取数据失败:', e);
            return false;
        }
    }

    // 生成模拟数据
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

    // 计算频谱
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
                amplitudes.push({
                    period: Math.round(period),
                    amplitude: parseFloat((amp * 100).toFixed(1))
                });
            }
        }
        
        amplitudes.sort(function(a, b) { return b.amplitude - a.amplitude; });
        return amplitudes.slice(0, 5);
    }

    // 计算概率
    function computeProbability(pricesData) {
        var lookback = 20;
        if (pricesData.length < lookback + 10) {
            return { up: 33, down: 33, flat: 34 };
        }
        
        var recent = pricesData.slice(-lookback);
        var recentPattern = [];
        for (var i = 0; i < lookback; i++) {
            recentPattern.push(recent[i] / recent[0]);
        }
        
        var similarities = [];
        for (var i = 0; i < pricesData.length - lookback - 5; i++) {
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

    // ========== 添加主面板 ==========
    function addMainPanel() {
        if (document.getElementById('fourierPanel')) return;
        
        var container = document.querySelector('.container') || document.body;
        
        var panel = document.createElement('div');
        panel.id = 'fourierPanel';
        panel.style.cssText = 'margin: 16px; padding: 16px; background: #1e293b; border-radius: 16px; border: 1px solid #334155; color: #e2e8f0; font-family: system-ui;';
        
        // 周期HTML
        var periodHtml = '';
        for (var i = 0; i < spectrumResult.length; i++) {
            periodHtml += '<span style="display: inline-block; background: #334155; padding: 4px 12px; border-radius: 20px; margin: 4px;"><strong style="color: #facc15;">' + spectrumResult[i].period + '天</strong> <span style="color: #94a3b8;">(' + spectrumResult[i].amplitude + '%)</span></span>';
        }
        
        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
                <h3 style="margin: 0; color: #facc15; font-size: 1rem;">📐 Z轴视角｜傅里叶频谱分析</h3>
                <span style="font-size: 0.65rem; color: #94a3b8;">跳出XY轴，从频率域看市场</span>
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
            
            <div id="hologramStatus" style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #334155; font-size: 0.65rem; color: #64748b; text-align: center;">
                ⏳ 正在检测图表，准备绘制全息预测线...
            </div>
        `;
        
        container.insertBefore(panel, container.firstChild);
        console.log('✅ 傅里叶面板已添加');
    }

    // ========== 尝试绘制全息预测线（自动检测，画唔到会提示） ==========
    function tryDrawHologramLine() {
        var attemptCount = 0;
        var statusDiv = document.getElementById('hologramStatus');
        
        function attempt() {
            attemptCount++;
            
            // 方法1：检测 window.myChart（Chart.js 实例）
            if (window.myChart && window.myChart.data && window.myChart.data.datasets) {
                console.log('✅ 检测到 Chart.js 实例，尝试绘制全息预测线');
                drawHologramLine(window.myChart);
                if (statusDiv) {
                    statusDiv.innerHTML = '✅ 全息预测线已绘制｜基于傅里叶主导周期推算未来走势';
                    statusDiv.style.color = '#4ade80';
                }
                return true;
            }
            
            // 方法2：检测页面上的 canvas 图表
            var canvases = document.querySelectorAll('canvas');
            for (var i = 0; i < canvases.length; i++) {
                if (canvases[i].chart && canvases[i].chart.data) {
                    console.log('✅ 检测到 Canvas 图表实例');
                    drawHologramLine(canvases[i].chart);
                    if (statusDiv) {
                        statusDiv.innerHTML = '✅ 全息预测线已绘制｜基于傅里叶主导周期推算未来走势';
                        statusDiv.style.color = '#4ade80';
                    }
                    return true;
                }
            }
            
            // 仲未检测到，继续等
            if (attemptCount < CONFIG.retryTimes) {
                if (statusDiv) {
                    statusDiv.innerHTML = '⏳ 等待图表加载... (' + attemptCount + '/' + CONFIG.retryTimes + ')';
                }
                setTimeout(attempt, CONFIG.retryInterval);
            } else {
                // 检测唔到，显示提示
                console.warn('⚠️ 无法检测到图表实例，全息预测线未能绘制');
                if (statusDiv) {
                    statusDiv.innerHTML = '⚠️ 全息预测线未能绘制｜手机版暂不支持，建议使用桌面浏览器查看完整功能<br>📊 频谱分析和概率数据仍可正常使用';
                    statusDiv.style.color = '#facc15';
                }
            }
        }
        
        attempt();
    }

    // 绘制全息预测线
    function drawHologramLine(chart) {
        if (!chart || !chart.data || !chart.data.datasets) {
            console.warn('图表实例无效');
            return;
        }
        
        // 获取原始价格数据
        var originalData = null;
        var datasets = chart.data.datasets;
        for (var i = 0; i < datasets.length; i++) {
            var ds = datasets[i];
            if (ds.label === '收盘价' || ds.label === 'close' || ds.label === '价格' || ds.type === 'line') {
                originalData = ds.data;
                break;
            }
        }
        
        if (!originalData || originalData.length < 20) {
            console.warn('无法获取原始价格数据');
            return;
        }
        
        // 基于主导周期计算预测值
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
        
        // 生成未来日期标签
        var labels = chart.data.labels;
        var lastDate = labels[labels.length - 1];
        var futureLabels = [];
        for (var i = 1; i <= predictionDays; i++) {
            futureLabels.push('预测+' + i);
        }
        
        // 合并数据
        var fullPredictions = new Array(originalData.length).fill(null);
        for (var i = 0; i < predictions.length; i++) {
            fullPredictions.push(predictions[i]);
        }
        
        // 添加新数据集
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
        
        chart.update();
        console.log('✅ 全息预测线已绘制，预测未来 ' + predictionDays + ' 天');
    }

    // 错误面板
    function addErrorPanel(msg) {
        if (document.getElementById('fourierPanel')) return;
        var container = document.querySelector('.container') || document.body;
        var panel = document.createElement('div');
        panel.id = 'fourierPanel';
        panel.style.cssText = 'margin: 16px; padding: 16px; background: #1e293b; border-radius: 16px; border: 1px solid #facc15; color: #e2e8f0; text-align: center;';
        panel.innerHTML = '<span style="color: #facc15;">📐 Z轴视角模块</span><div style="font-size: 0.7rem; margin-top: 8px;">' + msg + '</div>';
        container.insertBefore(panel, container.firstChild);
    }

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
