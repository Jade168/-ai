// 免费数据源核心：直接对接东方财富公开API，无需本地服务器，完整兼容1836系统
window.FreeStockAPI = {
    // 1. 核心取K线数据：兼容你原有系统的入参和出参格式
    getKlineData: async (symbol, period = 'daily') => {
        // 适配你的代码：自动识别港股/A股/美股代码格式
        let secid = '';
        if (symbol.match(/^[0-9]{5}$/)) {
            secid = `116.${symbol}`; // 港股
        } else if (symbol.match(/^(6|0|3)[0-9]{5}$/)) {
            secid = symbol.startsWith('6') ? `1.${symbol}` : `0.${symbol}`; // A股
        } else {
            secid = `105.${symbol.toUpperCase()}`; // 美股
        }

        // 时间周期映射：完全匹配你原有系统的 period 参数
        const kltMap = {
            'daily': '101',
            'weekly': '102',
            '5min': '5'
        };
        const klt = kltMap[period] || '101';

        // 东方财富公开K线接口（无跨域限制，直接可用）
        const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=${klt}&fqt=0&end=20500101&lmt=300`;

        try {
            const response = await fetch(url);
            const result = await response.json();

            // 格式转换：转成你原有系统能识别的数组格式
            if (result.data && result.data.klines) {
                return {
                    code: 0,
                    data: result.data.klines, // 直接传给fullRawData
                    name: result.data.name || symbol, // 股票名称
                    msg: '成功'
                };
            } else {
                return { code: -1, msg: '免费数据源无数据', data: [] };
            }
        } catch (error) {
            return { code: -1, msg: `接口异常: ${error.message}`, data: [] };
        }
    },

    // 2. 适配你原有系统的切换逻辑：真正接管数据拉取
    takeOver: async () => {
        const symbol = document.getElementById('symbol').value.trim();
        const period = document.getElementById('period').value || 'daily';
        const loading = document.getElementById('loading');

        if (!symbol) {
            addChatMessage('chat-error', '❌ 请输入股票代码');
            return false;
        }

        loading.classList.add('show');
        loading.textContent = `📡 免费数据源拉取 ${symbol} 数据中...`;

        // 真正拉取数据
        const klineRes = await window.FreeStockAPI.getKlineData(symbol, period);
        if (klineRes.code !== 0 || klineRes.data.length === 0) {
            loading.textContent = `❌ 拉取失败: ${klineRes.msg}`;
            loading.classList.remove('show');
            addChatMessage('chat-error', `❌ 免费数据源失败: ${klineRes.msg}`);
            return false;
        }

        // 关键：把数据注入你原有系统的全局变量
        window.fullRawData = klineRes.data;
        window.currentSymbolInfo = {
            name: klineRes.name,
            code: symbol
        };

        loading.textContent = `✅ 免费数据源加载完成，共 ${klineRes.data.length} 条K线`;
        loading.classList.remove('show');
        addChatMessage('chat-system', `✅ 已切换至免费数据源，股票：${klineRes.name}(${symbol})`);

        // 触发你原有系统的核心分析（1836.15数律模型）
        if (typeof window.runQuantAnalysisOriginal === 'function') {
            window.runQuantAnalysisOriginal();
        } else {
            // 兼容首次加载：直接执行原有分析逻辑
            window.runQuantAnalysis();
        }

        return true;
    }
};

// 初始化数据源配置：修复之前的全局变量问题
window.DataSourceConfig = {
    currentSource: 'eastmoney',
    availableSources: {
        'eastmoney': '東方財富數據源（本地）',
        'free': '免費數據源（公開接口）'
    },

    // 真正的切换逻辑：点击下拉框立即生效
    switchSource: async (source) => {
        if (!window.DataSourceConfig.availableSources[source]) return;
        window.DataSourceConfig.currentSource = source;
        localStorage.setItem('data_source', source);

        // 关键：如果是免费数据源，直接接管取数；否则恢复原有逻辑
        if (source === 'free') {
            // 备份原有分析函数，防止重复覆盖
            if (!window.runQuantAnalysisOriginal) {
                window.runQuantAnalysisOriginal = window.runQuantAnalysis;
            }
            // 强制使用免费数据源取数
            await window.FreeStockAPI.takeOver();
        } else {
            // 切回东方财富：恢复原有本地取数逻辑
            if (window.runQuantAnalysisOriginal) {
                window.runQuantAnalysis = window.runQuantAnalysisOriginal;
            }
            // 重新触发原有分析（需本地server）
            if (document.getElementById('symbol').value) {
                window.runQuantAnalysis();
            }
        }

        // 更新下拉框显示
        const select = document.getElementById('data-source-select');
        if (select) select.value = source;
    },

    init: () => {
        const saved = localStorage.getItem('data_source');
        if (saved && window.DataSourceConfig.availableSources[saved]) {
            window.DataSourceConfig.currentSource = saved;
        }
    }
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    window.DataSourceConfig.init();
    // 给下拉框绑定正确的事件（修复之前的绑定失效）
    setTimeout(() => {
        const select = document.getElementById('data-source-select');
        if (select) {
            select.onchange = (e) => {
                window.DataSourceConfig.switchSource(e.target.value);
            };
            select.value = window.DataSourceConfig.currentSource;
        }
    }, 500);
});
