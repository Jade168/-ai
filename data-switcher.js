// 数据源切换UI + 图表缩放优化 完全兼容原有东方财富数据源
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

// 修复：先执行原有逻辑，再叠加新功能，保证东方财富数据正常拉取
const originalRun = window.runQuantAnalysis;
window.runQuantAnalysis = async function() {
    // 先执行原有东方财富数据源逻辑
    await originalRun();
    // 再开启图表缩放优化
    if (window.priceChart) {
        window.priceChart.options.plugins.zoom = {
            pan: { enabled: true, mode: 'x' },
            zoom: { pinch: { enabled: true, mode: 'x' }, wheel: { enabled: false } }
        };
        window.priceChart.update();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(renderSwitcher, 300);
});
