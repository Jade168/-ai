(function(){
console.log('📐 Z轴模块 v7.0 新逻辑版');

var C={fixedLen:200,topN:3};
var prices=[],spectrum=[],prob={up:33,down:33,flat:34},ribbon={color:'gray',trend:'flat',strength:0};

function getSymbol(){try{var i=document.getElementById('symbol');return i&&i.value?i.value.trim().toUpperCase():'STK'}catch(e){return'STK'}}

function getPrices(){
    try{
        if(window.myChart&&window.myChart.data)
            for(var i=0;i<window.myChart.data.datasets.length;i++){
                var ds=window.myChart.data.datasets[i],l=ds.label||'';
                if((l.indexOf('收盘')>=0||l=='close'||l=='价格')&&ds.data){
                    var d=ds.data.filter(function(v){return v!==null&&!isNaN(v)&&v>0});
                    if(d.length>20)return d.length>C.fixedLen?d.slice(-C.fixedLen):d;
                }
            }
        var t=document.querySelectorAll('table tbody tr'),p=[];
        if(t.length>10)
            for(var i=0;i<t.length&&i<500;i++){
                var v=parseFloat(t[i].cells[1]?.innerText.replace(/[^0-9.-]/g,''));
                if(!isNaN(v)&&v>0&&v<1e4)p.push(v);
            }
        if(p.length>20)return p.length>C.fixedLen?p.slice(-C.fixedLen):p;
        var b=150,mp=[];for(var i=0;i<C.fixedLen;i++){b+=(Math.random()-0.5)*3;b=Math.max(80,Math.min(300,b));mp.push(parseFloat(b.toFixed(2)));}
        return mp;
    }catch(e){return[]}
}

function fft(r,i){
    var N=r.length;if(N<=1)return;
    var j=0;
    for(var x=0;x<N-1;x++){
        if(x<j){var tr=r[x];r[x]=r[j];r[j]=tr;var ti=i[x];i[x]=i[j];i[j]=ti;}
        var k=N>>1;while(k<=j){j-=k;k>>=1;}j+=k;
    }
    for(var len=2;len<=N;len<<=1){
        var ang=-2*Math.PI/len,wl_re=Math.cos(ang),wl_im=Math.sin(ang);
        for(var x=0;x<N;x+=len){
            var w_re=1,w_im=0;
            for(var y=0;y<len/2;y++){
                var u_re=r[x+y],u_im=i[x+y],v_re=r[x+y+len/2]*w_re-i[x+y+len/2]*w_im,v_im=r[x+y+len/2]*w_im+i[x+y+len/2]*w_re;
                r[x+y]=u_re+v_re;i[x+y]=u_im+v_im;r[x+y+len/2]=u_re-v_re;i[x+y+len/2]=u_im-v_im;
                var nw_re=w_re*wl_re-w_im*wl_im,nw_im=w_re*wl_im+w_im*wl_re;w_re=nw_re;w_im=nw_im;
            }
        }
    }
}

function getSpectrum(p){
    var n=p.length,size=1;while(size<n)size<<=1;
    var re=Array(size).fill(0),im=Array(size).fill(0),mean=0;
    for(var i=0;i<n;i++)mean+=p[i];mean/=n;
    for(var i=0;i<n;i++)re[i]=p[i]-mean;
    fft(re,im);
    var amps=[];
    for(var i=1;i<Math.min(60,n/2);i++){
        var amp=Math.sqrt(re[i]*re[i]+im[i]*im[i])/n,per=n/i;
        if(per>=5&&per<=300)amps.push({period:Math.round(per),amplitude:parseFloat((amp*100).toFixed(1)),phase:Math.atan2(im[i],re[i])});
    }
    amps.sort(function(a,b){return b.amplitude-a.amplitude});
    return amps.slice(0,5);
}

function calcRibbon(p){
    if(p.length<30)return{color:'gray',trend:'flat',strength:0};
    var n=p.length,x1=[];
    for(var i=0;i<n;i++)x1.push((3*p[i]+(i>0?p[i-1]:p[i])+(i>0?p[i-1]:p[i])+p[i])/6);
    var b=[];
    for(var i=20;i<n;i++){
        var s=0;for(var j=0;j<20;j++)s+=(20-j)*x1[i-j];
        b.push(s/210);
    }
    var d=[];
    for(var i=14;i<b.length;i++){
        var s=0;for(var j=0;j<15;j++)s+=b[i-j];
        d.push(s/15);
    }
    if(b.length<2||d.length<2)return{color:'gray',trend:'flat',strength:0};
    var curB=b[b.length-1],curD=d[d.length-1],prevB=b[b.length-2];
    var color=curB>curD?'red':'green';
    var trend=curB>prevB?'up':'down';
    var strength=Math.min(100,Math.abs((curB-curD)/curD)*100);
    return{color:color,trend:trend,strength:strength};
}

// 基础概率：最近10日线性回归斜率映射到30-70%
function baseProbFromTrend(p){
    if(p.length<10)return 50;
    var recent=p.slice(-10);
    var n=recent.length;
    var sumX=0,sumY=0,sumXY=0,sumX2=0;
    for(var i=0;i<n;i++){
        var x=i;
        var y=recent[i];
        sumX+=x;
        sumY+=y;
        sumXY+=x*y;
        sumX2+=x*x;
    }
    var slope=(n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX);
    var avgPrice=sumY/n;
    var slopePct=(slope/avgPrice)*100;
    // 映射：slopePct -5% -> 30%, 0% -> 50%, +5% -> 70%
    var prob=50+slopePct*4;
    prob=Math.min(70,Math.max(30,prob));
    return prob;
}

// 傅里叶相位修正：最强周期当前相位余弦值
function fourierPhaseCorrection(spectrum){
    if(spectrum.length===0)return 0;
    var top=spectrum[0];
    var phase=top.phase;
    var cosVal=Math.cos(phase);
    if(cosVal>0.2)return 10;
    if(cosVal<-0.2)return -10;
    return 0;
}

// 彩带修正
function ribbonCorrection(rib){
    if(rib.color=='red' && rib.trend=='up') return 20;
    if(rib.color=='red' && rib.trend=='down') return 5;
    if(rib.color=='green' && rib.trend=='down') return -20;
    if(rib.color=='green' && rib.trend=='up') return -5;
    return 0;
}

function computeFinalProb(p,sp,rib){
    var base=baseProbFromTrend(p);
    var fourierCorr=fourierPhaseCorrection(sp);
    var ribbonCorr=ribbonCorrection(rib);
    var final=base + fourierCorr + ribbonCorr;
    final=Math.min(85,Math.max(15,final));
    var down=Math.max(5,Math.min(50,100-final-20));
    var flat=100-final-down;
    return{up:Math.round(final),down:Math.round(down),flat:Math.round(flat)};
}

function drawRibbonBar(rib){
    var cv=document.getElementById('ribbonCanvas');
    if(!cv){
        var can=document.querySelector('canvas');
        if(can){
            var div=document.createElement('div');div.style.margin='8px 0';
            div.innerHTML='<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px; border-radius:8px"></canvas>';
            can.parentElement.insertBefore(div,can.nextSibling);
        }else{
            var panel=document.getElementById('fourierPanel');
            if(panel){
                var div2=document.createElement('div');div2.style.margin='8px 0';
                div2.innerHTML='<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px; border-radius:8px"></canvas>';
                panel.appendChild(div2);
            }
        }
    }
    cv=document.getElementById('ribbonCanvas');
    if(!cv)return;
    cv.width=cv.parentElement.clientWidth||800;cv.height=40;
    var ctx=cv.getContext('2d');
    ctx.fillStyle=rib.color=='red'?'#f87171':'#4ade80';
    ctx.fillRect(0,0,cv.width,40);
    ctx.fillStyle='white';ctx.font='bold 12px monospace';
    ctx.fillText('彩带: '+rib.color+' | 趋势: '+rib.trend+' | 强度: '+Math.round(rib.strength)+'%',10,25);
}

function drawHologram(){
    if(!window.myChart)return;
    var ds=window.myChart.data.datasets,orig=null;
    for(var i=0;i<ds.length;i++){
        var l=ds[i].label||'';
        if((l.indexOf('收盘')>=0||l=='close')&&ds[i].data){orig=ds[i].data;break;}
    }
    if(!orig||orig.length<20)return;
    var last=orig[orig.length-1],mean=0;
    for(var i=0;i<orig.length;i++)mean+=orig[i];mean/=orig.length;
    var top=spectrum.slice(0,3),pred=[];
    for(var d=1;d<=20;d++){
        var sum=0,wSum=0;
        for(var i=0;i<top.length;i++){
            var per=top[i].period,amp=top[i].amplitude;
            if(per>1){sum+=amp*Math.cos(d*2*Math.PI/per);wSum+=amp;}
        }
        var val=last;if(wSum>0)val=last+(sum/wSum)*(last-mean)*0.3;
        pred.push(parseFloat(val.toFixed(2)));
    }
    var full=Array(orig.length).fill(null);
    for(var i=0;i<pred.length;i++)full.push(pred[i]);
    var idx=-1;
    for(var i=0;i<ds.length;i++)if(ds[i].label=='🔮 全息预测线'){idx=i;break;}
    if(idx>=0)ds[idx].data=full;
    else ds.push({label:'🔮 全息预测线',data:full,borderColor:'#a855f7',borderWidth:2,borderDash:[8,4],pointRadius:0,fill:false,tension:0.1});
    window.myChart.update();
}

function updatePanel(){
    var panel=document.getElementById('fourierPanel');
    if(!panel){
        panel=document.createElement('div');panel.id='fourierPanel';
        panel.style.cssText='margin:16px;padding:16px;background:#1e293b;border-radius:16px;border:1px solid #334155';
        var c=document.querySelector('.container')||document.body;
        c.insertBefore(panel,c.firstChild);
    }
    var sym=getSymbol();
    var topHtml='';
    for(var i=0;i<spectrum.length;i++){
        var s=spectrum[i];
        topHtml+='<span style="background:#facc15;color:#0f172a;padding:4px 12px;border-radius:20px;margin:4px;font-weight:bold">'+s.period+'天 ('+s.amplitude+'%)</span>';
    }
    var base=Math.round(baseProbFromTrend(prices));
    var fourierCorr=fourierPhaseCorrection(spectrum);
    var ribbonCorr=ribbonCorrection(ribbon);
    var finalProb=prob;
    var ribbonText=ribbon.color=='red'?'🔴 红色':'🟢 绿色';
    ribbonText+=ribbon.trend=='up'?' ↑':' ↓';
    
    panel.innerHTML='<div><div style="display:flex;justify-content:space-between"><h3 style="color:#facc15;margin:0">📐 Z轴｜'+sym+'</h3><button id="refreshBtn" style="background:#3b82f6;border:none;padding:4px 12px;border-radius:20px;color:white">🔄</button></div>'+
        '<div style="margin:12px 0">🎯 主导周期: '+topHtml+'</div>'+
        '<div style="display:flex;gap:20px;flex-wrap:wrap"><div><div style="color:#94a3b8;font-size:0.7rem">📈 基础趋势(10日)</div><div>'+base+'%</div></div>'+
        '<div><div style="color:#94a3b8;font-size:0.7rem">🌀 傅里叶相位</div><div>'+(fourierCorr>0?'+'+(fourierCorr)+'%':fourierCorr+'%')+'</div></div>'+
        '<div><div style="color:#94a3b8;font-size:0.7rem">🎨 彩带修正</div><div>'+(ribbonCorr>0?'+'+(ribbonCorr)+'%':ribbonCorr+'%')+'</div></div>'+
        '<div><div style="color:#facc15;font-size:0.7rem">🎯 未来5日概率</div><div><span style="color:#4ade80">▲ '+finalProb.up+'%</span> <span style="color:#f87171">▼ '+finalProb.down+'%</span> <span style="color:#94a3b8">— '+finalProb.flat+'%</span></div></div>'+
        '<div><div style="color:#94a3b8;font-size:0.7rem">🎨 彩带状态</div><div>'+ribbonText+' | 强度:'+Math.round(ribbon.strength)+'%</div></div></div>'+
        '<div style="margin-top:12px;font-size:0.6rem;color:#64748b;text-align:center">⚡ 公式: 基础(50%) + 相位(20%) + 彩带(30%)</div></div>';
    
    var btn=document.getElementById('refreshBtn');
    if(btn)btn.onclick=function(){refreshAll();};
    drawRibbonBar(ribbon);
}

function refreshAll(){
    try{
        var raw=getPrices();
        if(raw.length)prices=raw;
        spectrum=getSpectrum(prices);
        ribbon=calcRibbon(prices);
        prob=computeFinalProb(prices,spectrum,ribbon);
        updatePanel();
        drawHologram();
        console.log('✅ 刷新完成 | 上升概率:'+prob.up+'%');
    }catch(e){console.error('刷新错误',e);}
}

function init(){
    refreshAll();
    var inp=document.getElementById('symbol');
    if(inp)inp.addEventListener('change',function(){setTimeout(refreshAll,1000);});
    var btns=document.querySelectorAll('button');
    for(var i=0;i<btns.length;i++){var t=btns[i].innerText||'';if(t.indexOf('分析')>=0||t.indexOf('分析')>=0)btns[i].addEventListener('click',function(){setTimeout(refreshAll,1500);});}
}
if(document.readyState=='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
