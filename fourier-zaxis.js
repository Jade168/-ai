(function(){
console.log('📐 Z轴模块 v28.0 完整修复版');

// =====================
// 工具函數
// =====================
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

function computeEMA(data, period) {
    if (!data || data.length === 0) return [];
    var ema = [data[0]];
    var alpha = 2 / (period + 1);
    for (var i = 1; i < data.length; i++) {
        ema.push(alpha * data[i] + (1 - alpha) * ema[i-1]);
    }
    return ema;
}

// =====================
// [修復1] 計算頻譜 - 標準差歸一化
// =====================
function computeFullSpectrum(p) {
    var n = p.length, size = 1;
    while (size < n) size <<= 1;
    var re = new Array(size).fill(0), im = new Array(size).fill(0);

    var mean = 0; for (var i = 0; i < n; i++) mean += p[i]; mean /= n;
    for (var i = 0; i < n; i++) re[i] = p[i] - mean;
    fft(re, im);

    // 標準差歸一化
    var variance = 0;
    for (var i = 0; i < n; i++) variance += (p[i] - mean) * (p[i] - mean);
    variance /= n;
    var std = Math.sqrt(variance);

    var amps = [];

    // 擴展頻率範圍到 n/2
    for (var i = 1; i < n/2; i++) {
        var rawAmp = Math.sqrt(re[i]*re[i] + im[i]*im[i]) / n;
        var relativeAmp = Math.min(rawAmp / Math.max(std, 0.01), 2.0); // 上限200%
        var period = n / i;
        if (period >= 3 && period <= 500) {
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

// =====================
// [修復2] ISET方向 - 基於實際斜率
// =====================
function computeISETDirection(fullSpec, topN, prices) {
    if (!fullSpec.length || !prices || prices.length < 20) return 0;

    // 中期斜率 (20日)
    var last20Prices = prices.slice(-20);
    var slope20 = (last20Prices[last20Prices.length-1] - last20Prices[0]) / last20Prices[0];
    var normalizedSlope20 = Math.max(-1, Math.min(1, slope20 / 0.05));

    // 短期動量 (5日)
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
    var topSpec = fullSpec.slice(0, topN);
    var totalEnergy = 0;
    for (var k = 0; k < topSpec.length; k++) totalEnergy += topSpec[k].amplitude;
    var spectrumStrength = Math.min(1, totalEnergy * 0.5);

    // 最終方向
    var direction = normalizedSlope20 * 0.5 + normalizedSlope5 * 0.3 + normalizedMomentum * 0.2;
    if (spectrumStrength > 0.3) {
        direction = direction * (1 + spectrumStrength * 0.2);
    }

    return Math.max(-1, Math.min(1, direction));
}

// =====================
// [修復3] 彩帶 - 自適應閾值 + 多週期EMA
// =====================
function calcRibbon(p) {
    if (p.length < 50) return ribbon;

    var emaFast8 = computeEMA(p, 8);
    var emaMedium20 = computeEMA(p, 20);
    var emaSlow50 = computeEMA(p, 50);

    var curFast = emaFast8[emaFast8.length-1];
    var curMedium = emaMedium20[emaMedium20.length-1];
    var curSlow = emaSlow50[emaSlow50.length-1];
    var prevFast = emaFast8[emaFast8.length-2];

    // 自適應閾值
    var recentPrices = p.slice(-20);
    var recentVolatility = computeStdDev(recentPrices) / computeMean(recentPrices);
    var threshold = Math.max(0.0003, recentVolatility * 0.3);

    // 三線多空排列
    var color = 'gray';
    var fastAboveMedium = curFast > curMedium;
    var mediumAboveSlow = curMedium > curSlow;
    var fastRising = curFast > prevFast;
    var fastFalling = curFast < prevFast;

    if (fastAboveMedium && mediumAboveSlow && fastRising) color = 'red';
    else if (!fastAboveMedium && !mediumAboveSlow && fastFalling) color = 'green';
    else if (fastAboveMedium && mediumAboveSlow) color = 'red';
    else if (!fastAboveMedium && !mediumAboveSlow) color = 'green';

    // 震蕩判斷
    var divergence = Math.abs(curFast - curSlow) / curSlow;
    if (divergence < threshold) color = 'gray';

    // 趨勢
    var slope = (curFast - prevFast) / prevFast;
    var trend = slope > threshold ? 'up' : slope < -threshold ? 'down' : 'flat';

    // 強度
    var divergenceStrength = Math.abs(curFast - curSlow) / curSlow;
    var mediumDivergence = Math.abs(curMedium - curSlow) / curSlow;
    var strength = Math.min(100, (divergenceStrength + mediumDivergence) * 200);

    return { color: color, trend: trend, strength: strength };
}

// =====================
// 概率計算
// =====================
function probabilityFromDirection(dir) {
    var up = 50 + dir * 40;
    up = Math.min(92, Math.max(8, up));
    var flat = (1 - Math.abs(dir)) * 35;
    flat = Math.min(50, Math.max(5, flat));
    var down = 100 - up - flat;
    down = Math.min(85, Math.max(3, down));

    var total = up + down + flat;
    if (Math.abs(total - 100) > 0.01) {
        if (up >= down && up >= flat) up = 100 - down - flat;
        else if (down >= up && down >= flat) down = 100 - up - flat;
        else flat = 100 - up - down;
    }

    return { up: Math.round(up), down: Math.round(down), flat: Math.round(flat) };
}

// ... 其餘函數完整保留 ...
})();
