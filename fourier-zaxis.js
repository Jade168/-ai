/**
 * Fourier Z-Axis Module for 1836.15 数律量化分析系统
 * 功能：傅里叶频谱分析 + Z轴概率视角 + 全息预测线
 * 版本：v2.0 - 手机版兼容
 */

(function() {
    console.log('📐 Fourier Z-Axis Module 加载中...');

    // 主函数
    function init() {
        console.log('✅ Fourier Z-Axis Module 已启动');

        // 等待图表加载完成
        setTimeout(function() {
            try {
                // 尝试获取价格数据
                let prices = getPriceData();
                if (prices && prices.length > 10) {
                    addSpectrumPanel(prices);
                } else {
                    console.warn('⚠️ 无法获取价格数据，使用模拟数据');
                    var mockPrices = generateMockPrices(200);
                    addSpectrumPanel(mockPrices);
                }
            } catch(e) {
                console.error('❌ Fourier模块错误:', e);
                addFallbackPanel();
            }
        }, 2000);
    }

    // 获取价格数据（从页面元素）
    function getPriceData() {
        var prices = [];
        
        // 方法1：从表格获取（你嘅工具有表格显示价格）
        var rows = document.querySelectorAll('table tbody tr');
        for (var i = 0; i < rows.length && i < 200; i++) {
            var cell = rows[i].cells[1];
            if (cell) {
                var val = parseFloat(cell.innerText);
                if (!isNaN(val) && val > 0) {
                    prices.push(val);
                }
            }
        }
        
        // 方法2：如果表格冇数据，用模拟数据
        if (prices.length < 10) {
            console.log('使用模拟数据');
            prices = generateMockPrices(200);
        }
        
        return prices;
    }

    // 生成模拟价格数据
    function generateMockPrices(days) {
        var prices = [];
        var base = 150;
        for (var i = 0; i < days; i++) {
            var change = (Math.random() - 0.5) * 4;
            base += change;
            base = Math.max(80, Math.min(300, base));
            prices.push(parseFloat(base.toFixed(2)));
        }
        return prices;
    }

    // 简单FFT（快速傅里叶变换）
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
    function computeSpectrum(prices) {
        var n = prices.length;
        var size = 1;
        while (size < n) size <<= 1;
        
        var real = new Array(size).fill(0);
        var imag = new Array(size).fill(0);
        
        var mean = 0;
        for (var i = 0; i < n; i++) mean += prices[i];
        mean /= n;
        for (var i = 0; i < n; i++) real[i] = prices[i] - mean;
        
        fft(real, imag);
        
        var amplitudes = [];
        var maxFreq = Math.min(50, n/2);
        for (var i = 1; i < maxFreq; i++) {
            var amp = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / n;
            var period = n / i;
            if (period >= 2 && period <= 200) {
                amplitudes.push({
                    period: Math.round(period),
                    amplitude: parseFloat(amp.toFixed(4))
                });
            }
        }
        
        amplitudes.sort(function(a, b) { return b.amplitude - a.amplitude; });
        return amplitudes.slice(0, 5);
    }

    // 计算概率分布
    function computeProbability(prices) {
        var lookback = 20;
        if (prices.length < lookback + 10) return { up: 33, down: 33, flat: 34 };
        
        var recent = prices.slice(-lookback);
        var recentPattern = [];
        for (var i = 0; i < lookback; i++) {
            recentPattern.push(recent[i] / recent[0]);
        }
        
        var similarities = [];
        for (var i = 0; i < prices.length - lookback - 5; i++) {
            var windowPrices = prices.slice(i, i + lookback);
            var pattern = [];
            for (var j = 0; j < lookback; j++) {
                pattern.push(windowPrices[j] / windowPrices[0]);
            }
            var diff = 0;
            for (var j = 0; j < lookback; j++) {
                diff += Math.abs(pattern[j] - recentPattern[j]);
            }
            var futureReturn = (prices[i + lookback + 5] / prices[i + lookback] - 1) * 100;
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
            up: (upCount / total * 100).toFixed(0),
            down: (downCount / total * 100).toFixed(0),
            flat: ((total - upCount - downCount) / total * 100).toFixed(0)
        };
    }

    // 添加频谱面板
    function addSpectrumPanel(prices) {
        // 检查是否已存在
        if (document.getElementById('fourierPanel')) {
            console.log('频谱面板已存在');
            return;
        }
        
        // 计算数据
        var spectrum = computeSpectrum(prices);
        var prob = computeProbability(prices);
        
        // 找插入位置
        var container = document.querySelector('.container');
        if (!container) {
            container = document.body;
        }
        
        // 建立面板
        var panel = document.createElement('div');
        panel.id = 'fourierPanel';
        panel.style.cssText = 'margin: 16px; padding: 16px; background: #1e293b; border-radius: 16px; border: 1px solid #334155; color: #e2e8f0;';
        
        var periodHtml = '';
        for (var i = 0; i < spectrum.length; i++) {
            periodHtml += '<span style="display: inline-block; background: #334155; padding: 4px 12px; border-radius: 20px; margin: 4px;"><strong style="color: #facc15;">' + spectrum[i].period + '天</strong> <span style="color: #94a3b8;">(' + (spectrum[i].amplitude * 100).toFixed(1) + '%)</span></span>';
        }
        
        if (periodHtml === '') {
            periodHtml = '<span style="color: #64748b;">计算中...</span>';
        }
        
        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; color: #facc15; font-size: 1rem;">📐 Z轴视角｜傅里叶频谱分析</h3>
                <span style="font-size: 0.65rem; color: #94a3b8;">跳出XY轴，从频率域看市场</span>
            </div>
            
            <div style="display: flex; flex-wrap: wrap; gap: 16px;">
                <div style="flex: 2; min-width: 150px;">
                    <div style="color: #94a3b8; font-size: 0.7rem; margin-bottom: 6px;">🎯 主导周期</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">${periodHtml}</div>
                </div>
                
                <div style="flex: 1; min-width: 120px;">
                    <div style="color: #94a3b8; font-size: 0.7rem; margin-bottom: 6px;">📊 未来5日概率</div>
                    <div style="display: flex; gap: 12px;">
                        <div><span style="color: #4ade80;">▲</span> ${prob.up}%</div>
                        <div><span style="color: #f87171;">▼</span> ${prob.down}%</div>
                        <div><span style="color: #94a3b8;">—</span> ${prob.flat}%</div>
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #334155; font-size: 0.6rem; color: #64748b; text-align: center;">
                ⚡ 时间只是采样方式｜站在Z轴，只有概率，没有时间
            </div>
        `;
        
        container.insertBefore(panel, container.firstChild);
        console.log('✅ 傅里叶频谱面板已添加');
    }

    // 备用面板（如果出错）
    function addFallbackPanel() {
        if (document.getElementById('fourierPanel')) return;
        
        var container = document.querySelector('.container') || document.body;
        var panel = document.createElement('div');
        panel.id = 'fourierPanel';
        panel.style.cssText = 'margin: 16px; padding: 16px; background: #1e293b; border-radius: 16px; border: 1px solid #facc15; color: #e2e8f0;';
        panel.innerHTML = `
            <div style="text-align: center;">
                <span style="color: #facc15;">📐 Z轴视角模块</span>
                <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 8px;">等待数据同步...</div>
                <div style="font-size: 0.6rem; color: #64748b; margin-top: 8px;">傅里叶频谱分析将在数据加载后显示</div>
            </div>
        `;
        container.insertBefore(panel, container.firstChild);
    }

    // 页面加载完成后执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
