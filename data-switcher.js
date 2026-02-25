// 数据源切换UI + 图表缩放优化
function renderSwitcher() {
    const apiCard = document.querySelector('.api-config-card');
    if (!apiCard) return;
    const html = `
    <div class="card api-config-card" style="border-color:#10b981; margin-top:8px;">
        <div class="tag" style="color:#10b981;">📊 數據源切換配置</div>
        <div class="row" style="gap:8px; align-items:center;">
            <span style="font-size:12px; color:#ddd;">當前數據源：</span>
            <select id="data-source-select" style="flex:1; max-width:220px; background:#1f2937; color:#fff; border:1px solid #374151; border-radius:4px; padding:4px 8px;" onchange="DataSourceConfig.switchSource(this.value)">
                <option value="eastmoney">東方財富數據源（默認）</option>
                <option value="free">免費數據源（無需密鑰）</option>
            </select>
        </div>
    </div>
    `;
    apiCard.insertAdjacentHTML('afterend', html);
    document.getElementById('data-source-select').value = DataSourceConfig.currentSource;
}
// 重写分析函数，兼容双数据源
const originalRun = window.runQuantAnalysis;
window.runQuantAnalysis = async function() {
    const symbol = document.getElementById('symbol').value;
    const period = document.getElementById('period').value;
    const loading = document.getElementById('loading');
    if (!symbol) return;
    loading.classList.add('show');
    loading.textContent = `正在拉取數據...`;
    let klineData = null;
    if (DataSourceConfig.currentSource === 'free') {
        klineData = await FreeStockAPI.getKlineData(symbol, period);
    } else {
        const klt = { 'daily': '101', 'weekly': '102', '5min': '5' }[period] || '101';
        try {
            const res = await fetch(`/api/kline?symbol=${symbol}&klt=${klt}`);
            klineData = await res.json();
        } catch (e) {
            klineData = { code: -1, msg: '數據拉取失敗' };
        }
    }
    if (klineData.code !== 0 || !klineData.data) {
        loading.textContent = '數據拉取失敗';
        loading.classList.remove('show');
        return;
    }
    window.fullRawData = klineData.data;
    window.currentSymbolInfo = { name: klineData.name || symbol };
    await originalRun();
    // 开启图表缩放
    if (window.priceChart) {
        window.priceChart.options.plugins.zoom = {
            pan: { enabled: true, mode: 'x' },
            zoom: { pinch: { enabled: true, mode: 'x' }, wheel: { enabled: false } }
        };
        window.priceChart.update();
    }
    loading.classList.remove('show');
    loading.textContent = '數據加載完成';
};
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(renderSwitcher, 300);
});
