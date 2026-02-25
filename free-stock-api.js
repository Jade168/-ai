// 免费港股/A股/美股数据API 与原有东方财富接口格式完全兼容
window.FreeStockAPI = {
    getKlineData: async (symbol, period = 'daily') => {
        let kltMap = { 'daily': '101', 'weekly': '102', '5min': '5' };
        let klt = kltMap[period] || '101';
        let secid = '';
        if (symbol.match(/^[0-9]{5}$/)) secid = `116.${symbol}`;
        else if (symbol.match(/^(6|0|3)[0-9]{5}$/)) secid = symbol.startsWith('6') ? `1.${symbol}` : `0.${symbol}`;
        else secid = `105.${symbol.toUpperCase()}`;
        try {
            const res = await fetch(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt=${klt}&fqt=0&end=20500101&lmt=200`);
            const data = await res.json();
            if (!data.data || !data.data.klines) return { code: -1, msg: '數據獲取失敗', data: [] };
            return { code: 0, data: data.data.klines, name: data.data.name || symbol };
        } catch (e) {
            console.error('免费数据源拉取失败', e);
            return { code: -1, msg: '數據獲取失敗', data: [] };
        }
    }
};
window.DataSourceConfig = {
    currentSource: 'eastmoney',
    availableSources: { 'eastmoney': '東方財富數據源', 'free': '免費數據源（無需密鑰）' },
    switchSource: (source) => {
        if (!this.availableSources[source]) return false;
        this.currentSource = source;
        localStorage.setItem('data_source', source);
        if (document.getElementById('symbol').value) runQuantAnalysis();
        return true;
    },
    init: () => {
        const saved = localStorage.getItem('data_source');
        if (saved) this.currentSource = saved;
    }
};
document.addEventListener('DOMContentLoaded', () => DataSourceConfig.init());
