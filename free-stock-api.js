// 开源新闻模块：独立运行，只负责拉取新闻，不干扰东方财富K线
window.FreeNewsAPI = {
    // 1. 适配股票代码，生成新闻检索关键词
    getNewsKeyword: (symbol) => {
        const nameMap = {
            '9888': '腾讯控股',
            '00700': '腾讯控股',
            'TSLA': '特斯拉',
            'NVDA': '英伟达',
            'AAPL': '苹果',
            'DIS': '迪士尼'
        };
        return nameMap[symbol] || symbol;
    },

    // 2. 拉取开源新闻（新浪财经+百度新闻，无跨域，公开可用）
    fetchNews: async (symbol) => {
        const keyword = this.getNewsKeyword(symbol);
        if (!keyword) return { code: -1, msg: '未找到对应股票', data: [] };

        // 新浪财经新闻接口（开源，无跨域）
        const sinaNewsUrl = `https://news.sina.cn/2020/more/news_search.php?keyword=${encodeURIComponent(keyword)}&num=10`;
        // 百度新闻接口（补充来源）
        const baiduNewsUrl = `https://news.baidu.com/ns?word=${encodeURIComponent(keyword)}&tn=news&rn=10`;

        try {
            // 并行拉取两个新闻源
            const [sinaRes, baiduRes] = await Promise.all([
                fetch(sinaNewsUrl).then(res => res.text()),
                fetch(baiduNewsUrl).then(res => res.text())
            ]);

            // 解析新浪新闻（HTML 提取）
            const sinaNews = this.parseSinaNews(sinaRes);
            // 解析百度新闻（HTML 提取）
            const baiduNews = this.parseBaiduNews(baiduRes);

            // 合并去重
            const allNews = [...sinaNews, ...baiduNews].slice(0, 10);
            return {
                code: 0,
                data: allNews,
                msg: `成功拉取 ${allNews.length} 条关于「${keyword}」的新闻`
            };
        } catch (error) {
            return { code: -1, msg: `新闻拉取失败: ${error.message}`, data: [] };
        }
    },

    // 3. 解析新浪新闻HTML
    parseSinaNews: (html) => {
        const news = [];
        const regex = /<li><a href="([^"]+)" target="_blank">([^<]+)<\/a><span>([^<]+)<\/span><\/li>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            news.push({
                title: match[2],
                url: match[1],
                time: match[3],
                source: '新浪财经'
            });
        }
        return news;
    },

    // 4. 解析百度新闻HTML
    parseBaiduNews: (html) => {
        const news = [];
        const regex = /<h3 class="c-title"><a href="([^"]+)"[^>]*>([^<]+)<\/a><\/h3>.*?<span class="c-time">([^<]+)<\/span>/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            news.push({
                title: match[2].replace(/<[^>]+>/g, ''), // 去除标签
                url: match[1],
                time: match[3],
                source: '百度新闻'
            });
        }
        return news;
    },

    // 5. 绑定到你页面的「刷新全球熱點新聞」按钮
    bindNewsButton: () => {
        const newsBtn = document.querySelector('button:contains("刷新全球熱點新聞")');
        if (!newsBtn) return;

        newsBtn.onclick = async () => {
            const symbol = document.getElementById('symbol').value.trim();
            if (!symbol) {
                alert('请先输入股票代码');
                return;
            }

            const loadingText = newsBtn.textContent;
            newsBtn.textContent = '拉取新闻中...';
            newsBtn.disabled = true;

            const result = await this.fetchNews(symbol);
            if (result.code === 0 && result.data.length > 0) {
                // 渲染新闻到页面（替换原有占位区）
                const newsContainer = document.querySelector('.news-container');
                if (newsContainer) {
                    newsContainer.innerHTML = result.data.map(item => `
                        <div style="margin:8px 0; padding:8px; border-bottom:1px solid #333;">
                            <a href="${item.url}" target="_blank" style="color:#00a8ff; text-decoration:none;">
                                ${item.title}
                            </a>
                            <div style="font-size:12px; color:#999; margin-top:4px;">
                                ${item.source} | ${item.time}
                            </div>
                        </div>
                    `).join('');
                }
                addChatMessage('chat-system', `✅ ${result.msg}`);
            } else {
                addChatMessage('chat-error', `❌ ${result.msg}`);
            }

            newsBtn.textContent = loadingText;
            newsBtn.disabled = false;
        };
    }
};

// 页面加载时自动绑定新闻按钮
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.FreeNewsAPI.bindNewsButton();
        addChatMessage('chat-system', '✅ 开源新闻模块已加载，点击「刷新全球熱點新聞」即可拉取资讯');
    }, 1000);
});
