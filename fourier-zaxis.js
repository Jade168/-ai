/**
 * fourier-zaxis.js
 * 為 1836.15 數律量化分析系統 加入：
 * - 傅里葉頻譜分析 (Z軸視角)
 * - 概率分布計算
 * - 全息預測線
 * 
 * 使用方法：在 index.html 最底部加入 <script src="fourier-zaxis.js"></script>
 * 無需修改原有任何代碼
 */

(function() {
    // 等待 DOM 加載完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        console.log('📐 Fourier Z-Axis Module 已加載');

        // 檢測是否有 Chart.js 實例
        let existingChart = null;
        if (window.myChart) {
            existingChart = window.myChart;
        } else {
            // 嘗試從 canvas 獲取
            const canvas = document.querySelector('canvas');
            if (canvas && canvas.chart) {
                existingChart = canvas.chart;
            }
        }

        if (!existingChart) {
            console.warn('⚠️ 未檢測到 Chart.js 圖表，請確保 Chart.js 已加載並有圖表實例');
            return;
        }

        // 獲取原始數據（從 Chart.js 實例中提取）
        const originalData = getChartData(existingChart);
        if (!originalData || originalData.length < 10) {
            console.warn('⚠️ 無法獲取圖表數據');
            return;
        }

        // 在圖表下方加入頻譜分析面板
        addSpectrumPanel(originalData);
    }

    // 從 Chart.js 實例提取價格數據
    function getChartData(chart) {
        try {
            // 嘗試從 datasets 中提取收盤價數據
            const datasets = chart.data.datasets;
            for (let ds of datasets) {
                if (ds.label === '收盤價' || ds.label === 'close' || ds.label === '價格') {
                    return ds.data;
                }
            }
            // 如果沒有標籤匹配，取第一個 line/scatter 類型的數據
            for (let ds of datasets) {
                if (ds.type === 'line' || !ds.type) {
                    return ds.data;
                }
            }
            return null;
        } catch(e) {
            console.error('提取數據失敗:', e);
            return null;
        }
    }

    // 快速傅里葉變換 (簡化版，適用於實時分析)
    function fft(re, im) {
        const N = re.length;
        if (N <= 1) return;
        
        // 位元反轉排序
        let j = 0;
        for (let i = 0; i < N - 1; i++) {
            if (i < j) {
                let temp = re[i]; re[i] = re[j]; re[j] = temp;
                temp = im[i]; im[i] = im[j]; im[j] = temp;
            }
            let k = N >> 1;
            while (k <= j) {
                j -= k;
                k >>= 1;
            }
            j += k;
        }
        
        // FFT 運算
        for (let len = 2; len <= N; len <<= 1) {
            const ang = -2 * Math.PI / len;
            const wlen_re = Math.cos(ang);
            const wlen_im = Math.sin(ang);
            for (let i = 0; i < N; i += len) {
                let w_re = 1;
                let w_im = 0;
                for (let j = 0; j < len/2; j++) {
                    const u_re = re[i + j];
                    const u_im = im[i + j];
                    const v_re = re[i + j + len/2] * w_re - im[i + j + len/2] * w_im;
                    const v_im = re[i + j + len/2] * w_im + im[i + j + len/2] * w_re;
                    re[i + j] = u_re + v_re;
                    im[i + j] = u_im + v_im;
                    re[i + j + len/2] = u_re - v_re;
                    im[i + j + len/2] = u_im - v_im;
                    const next_w_re = w_re * wlen_re - w_im * wlen_im;
                    const next_w_im = w_re * wlen_im + w_im * wlen_re;
                    w_re = next_w_re;
                    w_im = next_w_im;
                }
            }
        }
    }

    // 計算頻譜
    function computeSpectrum(prices) {
        const n = prices.length;
        // 補零到 2 的冪次方
        let size = 1;
        while (size < n) size <<= 1;
        
        const real = new Array(size).fill(0);
        const imag = new Array(size).fill(0);
        
        // 去趨勢（減去線性趨勢）
        const mean = prices.reduce((a,b) => a+b, 0) / n;
        for (let i = 0; i < n; i++) {
            real[i] = prices[i] - mean;
        }
        
        fft(real, imag);
        
        const amplitudes = [];
        const maxFreq = Math.min(50, n/2);
        for (let i = 1; i < maxFreq; i++) {
            const amp = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / n;
            const period = n / i;
            if (period >= 2 && period <= 200) {
                amplitudes.push({
                    period: Math.round(period),
                    amplitude: parseFloat(amp.toFixed(4))
                });
            }
        }
        
        // 按振幅排序，取前5個主導周期
        amplitudes.sort((a,b) => b.amplitude - a.amplitude);
        return amplitudes.slice(0, 10);
    }

    // 計算概率分布（基於歷史相似形態）
    function computeProbabilityDistribution(prices, lookback = 20) {
        const recent = prices.slice(-lookback);
        const recentPattern = recent.map((v, i) => v / recent[0]);
        
        const similarities = [];
        for (let i = 0; i < prices.length - lookback - 5; i++) {
            const window = prices.slice(i, i + lookback);
            const pattern = window.map((v, j) => v / window[0]);
            let diff = 0;
            for (let j = 0; j < lookback; j++) {
                diff += Math.abs(pattern[j] - recentPattern[j]);
            }
            similarities.push({
                index: i,
                diff: diff,
                futureReturn: (prices[i + lookback + 5] / prices[i + lookback] - 1) * 100
            });
        }
        
        similarities.sort((a,b) => a.diff - b.diff);
        const topMatches = similarities.slice(0, 20);
        
        let upCount = 0, downCount = 0;
        for (let m of topMatches) {
            if (m.futureReturn > 0.5) upCount++;
            else if (m.futureReturn < -0.5) downCount++;
        }
        
        return {
            up: (upCount / topMatches.length * 100).toFixed(1),
            down: (downCount / topMatches.length * 100).toFixed(1),
            flat: (100 - upCount - downCount).toFixed(1),
            samples: topMatches.length
        };
    }

    // 全息預測線（基於主導周期延展）
    function computeHologramLine(prices, dominantPeriods, daysToPredict = 20) {
        if (dominantPeriods.length === 0) return [];
        
        const n = prices.length;
        const mean = prices.reduce((a,b) => a+b, 0) / n;
        const detrended = prices.map(p => p - mean);
        
        let prediction = [];
        for (let t = 1; t <= daysToPredict; t++) {
            let sum = 0;
            let weightSum = 0;
            for (let dp of dominantPeriods.slice(0, 3)) {
                const period = dp.period;
                const amp = dp.amplitude;
                if (period > 1) {
                    const phase = (t * 2 * Math.PI / period);
                    sum += amp * Math.cos(phase);
                    weightSum += amp;
                }
            }
            const predValue = mean + (weightSum > 0 ? sum / weightSum * (prices[n-1] - mean) : 0);
            prediction.push(parseFloat(predValue.toFixed(2)));
        }
        return prediction;
    }

    // 加入頻譜分析面板
    function addSpectrumPanel(prices) {
        // 檢查是否已存在
        if (document.getElementById('fourierPanel')) {
            console.log('頻譜面板已存在');
            return;
        }
        
        // 找 Chart.js 圖表的父容器
        const canvas = document.querySelector('canvas');
        if (!canvas) return;
        
        const chartContainer = canvas.parentElement;
        
        // 建立面板
        const panel = document.createElement('div');
        panel.id = 'fourierPanel';
        panel.style.cssText = `
            margin-top: 20px;
            padding: 16px;
            background: #1e293b;
            border-radius: 12px;
            border: 1px solid #334155;
        `;
        
        // 計算頻譜
        const spectrum = computeSpectrum(prices);
        const probability = computeProbabilityDistribution(prices);
        const hologram = computeHologramLine(prices, spectrum);
        
        // 構建面板內容
        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="margin: 0; color: #facc15; font-size: 1rem;">📐 Z軸視角｜傅里葉頻譜分析</h3>
                <span style="font-size: 0.7rem; color: #94a3b8;">跳出XY軸，從頻率域看市場</span>
            </div>
            
            <div style="display: flex; flex-wrap: wrap; gap: 16px;">
                <!-- 主導周期 -->
                <div style="flex: 2; min-width: 200px;">
                    <div style="color: #94a3b8; font-size: 0.7rem; margin-bottom: 8px;">🎯 主導周期（振幅排序）</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${spectrum.slice(0, 5).map(s => `
                            <div style="background: #334155; padding: 4px 12px; border-radius: 20px;">
                                <span style="color: #facc15;">${s.period}天</span>
                                <span style="color: #94a3b8; font-size: 0.7rem;"> (${(s.amplitude*100).toFixed(1)}%)</span>
                            </div>
                        `).join('')}
                        ${spectrum.length === 0 ? '<span style="color: #64748b;">計算中...</span>' : ''}
                    </div>
                    <div style="font-size: 0.65rem; color: #64748b; margin-top: 8px;">
                        💡 周期越長、振幅越大，對價格影響越強
                    </div>
                </div>
                
                <!-- 概率分布 -->
                <div style="flex: 1; min-width: 150px;">
                    <div style="color: #94a3b8; font-size: 0.7rem; margin-bottom: 8px;">📊 未來5日概率（YZ軸視角）</div>
                    <div style="display: flex; gap: 12px;">
                        <div><span style="color: #4ade80;">▲ 漲</span> <span style="font-weight: bold;">${probability.up}%</span></div>
                        <div><span style="color: #f87171;">▼ 跌</span> <span style="font-weight: bold;">${probability.down}%</span></div>
                        <div><span style="color: #94a3b8;">— 平</span> <span style="font-weight: bold;">${probability.flat}%</span></div>
                    </div>
                    <div style="font-size: 0.65rem; color: #64748b;">基於 ${probability.samples} 個相似形態</div>
                </div>
                
                <!-- 全息預測 -->
                <div style="flex: 2; min-width: 180px;">
                    <div style="color: #94a3b8; font-size: 0.7rem; margin-bottom: 8px;">🔮 全息預測線（基於主導周期）</div>
                    <div style="font-family: monospace; font-size: 0.75rem;">
                        ${hologram.length > 0 ? 
                            `${hologram.slice(0, 5).map((p,i) => `+${i+1}: ${p}`).join(' · ')} ...` : 
                            '計算中...'}
                    </div>
                    <div style="font-size: 0.65rem; color: #64748b;">「拿到碎片，拼出全貌」</div>
                </div>
            </div>
            
            <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #334155; font-size: 0.65rem; color: #475569; text-align: center;">
                ⚡ 時間只是採樣方式｜站在Z軸，只有概率，沒有時間
            </div>
        `;
        
        chartContainer.parentElement.insertBefore(panel, chartContainer.nextSibling);
        
        // 如果可以，將全息預測線加入原圖表
        if (hologram.length > 0 && window.myChart) {
            const lastPrice = prices[prices.length - 1];
            const futureLabels = [];
            const futureData = [];
            
            const labels = window.myChart.data.labels;
            const lastDate = new Date(labels[labels.length - 1]);
            
            for (let i = 1; i <= hologram.length; i++) {
                const futureDate = new Date(lastDate);
                futureDate.setDate(lastDate.getDate() + i);
                futureLabels.push(futureDate.toISOString().split('T')[0]);
                futureData.push(hologram[i-1]);
            }
            
            window.myChart.data.datasets.push({
                label: '全息預測線 (Z軸)',
                data: [...new Array(prices.length).fill(null), ...futureData],
                borderColor: '#a855f7',
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                tension: 0.1
            });
            
            window.myChart.update();
        }
    }
})();
