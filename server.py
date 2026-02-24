from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import os

app = Flask(__name__, static_folder='./')
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization", "x-api-key", "anthropic-version"]}})

# ===================== 復刻GitHub項目的東方財富數據接口 =====================
@app.route('/api/kline', methods=['GET'])
def get_kline():
    symbol = request.args.get('symbol', 'TSLA')
    klt = request.args.get('klt', '101')
    
    if symbol.isdigit():
        secid = f"116.{symbol.zfill(5)}"
    else:
        secid = f"105.{symbol.replace('.US', '')}"
    
    url = f"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={secid}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt={klt}&fqt=0&end=20500101&lmt=150"
    
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        if not data.get('data') or not data['data'].get('klines'):
            for suffix in ['.N', '.O', '.A', '.K']:
                try_secid = f"105.{symbol.replace('.US', '')}{suffix}"
                try_url = f"https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={try_secid}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt={klt}&fqt=0&end=20500101&lmt=150"
                try_resp = requests.get(try_url, timeout=10)
                try_data = try_resp.json()
                if try_data.get('data') and try_data['data'].get('klines'):
                    data = try_data
                    break
        
        return jsonify({
            "code": 0,
            "data": data['data']['klines'],
            "name": data['data'].get('name', symbol)
        })
    except Exception as e:
        return jsonify({"code": -1, "msg": f"數據獲取失敗：{str(e)}"}), 500

# ===================== AI API代理（解決CORS問題）=====================
@app.route('/api/ai-proxy', methods=['POST'])
def ai_proxy():
    """代理AI API請求，避免瀏覽器CORS限制"""
    try:
        data = request.json
        api_url = data.get('url')
        api_headers = data.get('headers', {})
        api_body = data.get('body', {})

        response = requests.post(api_url, headers=api_headers, json=api_body, timeout=30)
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ===================== 新聞API代理（解決CORS問題）=====================
@app.route('/api/news-proxy', methods=['GET'])
def news_proxy():
    """代理新聞API請求，避免瀏覽器CORS限制"""
    try:
        symbol = request.args.get('symbol', '^GSPC')
        limit = request.args.get('limit', '5')
        url = f"https://api.akquant.cn/v1/market/news?symbol={symbol}&limit={limit}"

        response = requests.get(url, timeout=10)
        return jsonify(response.json()), response.status_code
    except Exception as e:
        return jsonify({"code": -1, "msg": str(e)}), 500

# ===================== 復刻GitHub項目的定時任務 =====================
def daily_analysis_task():
    """每日定時自動分析自選股，同GitHub項目嘅定時推送邏輯一致"""
    watch_list = ["TSLA", "00700", "NVDA", "AAPL"]
    print(f"開始每日定時分析，自選股列表：{watch_list}")
    # 呢度可以加自動推送微信/飛書嘅邏輯，同GitHub項目一致

# 啟動定時任務，交易日每日9點執行
scheduler = BackgroundScheduler(timezone="Asia/Hong_Kong")
scheduler.add_job(daily_analysis_task, 'cron', hour=9, minute=0, day_of_week='mon-fri')
scheduler.start()

# ===================== 前端頁面路由 =====================
@app.route('/')
def index():
    return send_from_directory('./', 'index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=1836, debug=True)
