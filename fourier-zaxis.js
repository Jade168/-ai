(function(){
console.log('📐 Fourier Z-Axis v4.1 压缩版');
var C={fixedLen:200,topN:3,samples:50,volAdjust:true};
var prices=[],spectrum=[],prob={up:33,down:33,flat:34},ribbon={color:'gray',b:0,d:0,bDir:0},currentSymbol='';

function getSymbol(){try{var inp=document.getElementById('symbol')||document.querySelector('input[placeholder*="代码"]');return inp&&inp.value?inp.value.trim().toUpperCase():'UNKNOWN'}catch(e){return'UNKNOWN'}}

function getPrices(){
    try{
        if(window.myChart&&window.myChart.data)
            for(var i=0;i<window.myChart.data.datasets.length;i++){
                var ds=window.myChart.data.datasets[i],lbl=ds.label||'';
                if((lbl.indexOf('收盘')>=0||lbl=='close'||lbl=='价格')&&ds.data){
                    var d=ds.data.filter(function(v){return v!==null&&!isNaN(v)&&v>0});
                    if(d.length>20)return d;
                }
            }
        var canvases=document.querySelectorAll('canvas');
        for(var i=0;i<canvases.length;i++)
            if(canvases[i].chart&&canvases[i].chart.data)
                for(var j=0;j<canvases[i].chart.data.datasets.length;j++){
                    var ds2=canvases[i].chart.data.datasets[j],lbl2=ds2.label||'';
                    if((lbl2.indexOf('收盘')>=0||lbl2=='close')&&ds2.data){
                        var d2=ds2.data.filter(function(v){return v!==null&&!isNaN(v)&&v>0});
                        if(d2.length>20)return d2;
                    }
                }
        var tables=document.querySelectorAll('table tbody tr'),tp=[];
        if(tables.length>10)
            for(var i=0;i<tables.length&&i<500;i++){
                var v=parseFloat(tables[i].cells[1]?.innerText.replace(/[^0-9.-]/g,''));
                if(!isNaN(v)&&v>0&&v<1e4)tp.push(v);
            }
        if(tp.length>20)return tp;
        var base=150,mp=[];
        for(var i=0;i<C.fixedLen;i++){base+=(Math.random()-0.5)*3;base=Math.max(80,Math.min(300,base));mp.push(parseFloat(base.toFixed(2)));}
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
    for(var i=1;i<Math.min(50,n/2);i++){
        var amp=Math.sqrt(re[i]*re[i]+im[i]*im[i])/n,per=n/i;
        if(per>=5&&per<=300)amps.push({period:Math.round(per),amplitude:parseFloat((amp*100).toFixed(1))});
    }
    amps.sort(function(a,b){return b.amplitude-a.amplitude});
    return amps.slice(0,10);
}

function calcRibbon(p){
    if(p.length<30)return{color:'gray',b:0,d:0,bDir:0};
    var n=p.length,x1=[];
    for(var i=0;i<n;i++)x1.push((3*p[i]+(i>0?p[i-1]:p[i])+(i>0?p[i-1]:p[i])+p[i])/6);
    var b=[],d=[];
    for(var i=20;i<n;i++){
        var s=0;for(var j=0;j<20;j++)s+=(20-j)*x1[i-j];
        b.push(s/210);
    }
    for(var i=14;i<b.length;i++){
        var s=0;for(var j=0;j<15;j++)s+=b[i-j];
        d.push(s/15);
    }
    var curB=b[b.length-1],curD=d[d.length-1],prevB=b.length>1?b[b.length-2]:curB;
    return{color:curB>curD?'red':'green',b:curB,d:curD,bDir:curB>prevB?1:-1};
}

function calcProb(p,sp){
    if(p.length<30)return{up:33,down:33,flat:34};
    var look=20,top=sp.slice(0,C.topN),recent=p.slice(-look),pat=recent.map(function(v,i){return v/recent[0]}),sim=[];
    for(var i=0;i<p.length-look-5;i++){
        var win=p.slice(i,i+look),pat2=win.map(function(v,j){return v/win[0]}),diff=0;
        for(var j=0;j<look;j++)diff+=Math.abs(pat2[j]-pat[j]);
        var ret=(p[i+look+5]/p[i+look]-1)*100;
        sim.push({diff:diff,ret:ret});
    }
    sim.sort(function(a,b){return a.diff-b.diff});
    var topSim=sim.slice(0,C.samples),up=0,down=0,flat=0;
    for(var i=0;i<topSim.length;i++){
        if(topSim[i].ret>0.5)up++;
        else if(topSim[i].ret<-0.5)down++;
        else flat++;
    }
    var total=topSim.length;
    return{up:Math.round(up/total*100),down:Math.round(down/total*100),flat:Math.round(flat/total*100)};
}

function adjustProb(p0,rib){
    var u=p0.up,d=p0.down,f=p0.flat;
    if(rib.color=='red'&&rib.bDir==1){u+=15;d-=10;}
    else if(rib.color=='green'&&rib.bDir==-1){u-=10;d+=15;}
    else if(rib.color=='red'&&rib.bDir==-1){u+=5;d+=5;}
    else if(rib.color=='green'&&rib.bDir==1){u+=5;d+=5;}
    u=Math.min(85,Math.max(5,u));d=Math.min(85,Math.max(5,d));
    return{up:u,down:d,flat:100-u-d};
}

function drawRibbonBar(rib){
    var cv=document.getElementById('ribbonCanvas');
    if(!cv){
        var can=document.querySelector('canvas');
        if(can){
            var div=document.createElement('div');div.style.margin='8px 0';
            div.innerHTML='<canvas id="ribbonCanvas" height="40" style="width:100%; height:40px"></canvas>';
            can.parentElement.insertBefore(div,can.nextSibling);
        }
    }
    cv=document.getElementById('ribbonCanvas');
    if(!cv)return;
    cv.width=cv.parentElement.clientWidth;cv.height=40;
    var ctx=cv.getContext('2d');
    ctx.fillStyle=rib.color=='red'?'#f87171':'#4ade80';
    ctx.fillRect(0,0,cv.width,40);
    ctx.fillStyle='white';ctx.font='10px monospace';
    ctx.fillText('彩带: '+rib.color+' | B线: '+(rib.bDir==1?'向上':'向下'),10,25);
}

function drawHologram(){
    if(!window.myChart)return;
    var ds=window.myChart.data.datasets,orig=null;
    for(var i=0;i<ds.length;i++){
        var lbl=ds[i].label||'';
        if((lbl.indexOf('收盘')>=0||lbl=='close')&&ds[i].data){orig=ds[i].data;break;}
    }
    if(!orig||orig.length<20)return;
    var top=spectrum.slice(0,3),totalAmp=0;
    for(var i=0;i<top.length;i++)totalAmp+=top[i].amplitude;
    var last=orig[orig.length-1],mean=0;
    for(var i=0;i<orig.length;i++)mean+=orig[i];mean/=orig.length;
    var pred=[];
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
    if(!panel)return;
    var topHtml='',sym=getSymbol();
    for(var i=0;i<spectrum.slice(0,3).length;i++){
        var s=spectrum[i];
        topHtml+='<span style="background:#facc15;color:#0f172a;padding:4px 12px;border-radius:20px;margin:4px;font-weight:bold">'+s.period+'天 ('+s.amplitude+'%)</span>';
    }
    var adj=adjustProb(prob,ribbon);
    panel.innerHTML='<div class="fourier-content"><div style="display:flex;justify-content:space-between;flex-wrap:wrap"><h3 style="color:#facc15;margin:0">📐 Z轴｜'+sym+'</h3><button id="refreshBtn" style="background:#3b82f6;border:none;padding:4px 12px;border-radius:20px;color:white;font-size:0.7rem">🔄</button></div><div style="margin:12px 0">🎯 主导周期: '+topHtml+'</div><div style="display:flex;gap:20px;flex-wrap:wrap"><div><div style="color:#94a3b8;font-size:0.7rem">📊 原始概率</div><div><span style="color:#4ade80">▲'+prob.up+'%</span> <span style="color:#f87171">▼'+prob.down+'%</span> <span style="color:#94a3b8">—'+prob.flat+'%</span></div></div><div><div style="color:#facc15;font-size:0.7rem">🎗️ 彩带修正</div><div><span style="color:#4ade80">▲'+adj.up+'%</span> <span style="color:#f87171">▼'+adj.down+'%</span> <span style="color:#94a3b8">—'+adj.flat+'%</span></div></div><div><div style="color:#94a3b8;font-size:0.7rem">🎨 彩带</div><div style="color:'+(ribbon.color=='red'?'#f87171':'#4ade80')+'">'+ribbon.color+' | '+(ribbon.bDir==1?'B向上':'B向下')+'</div></div></div><div style="margin-top:12px;font-size:0.6rem;color:#64748b;text-align:center">⚡ 固定'+C.fixedLen+'天 | Top'+C.topN+'周期加权</div></div>';
    document.getElementById('refreshBtn').onclick=function(){refreshAll();};
}

function refreshAll(){
    var raw=getPrices();
    if(raw.length)prices=raw.length>C.fixedLen?raw.slice(-C.fixedLen):raw;
    spectrum=getSpectrum(prices);
    prob=calcProb(prices,spectrum);
    ribbon=calcRibbon(prices);
    updatePanel();
    drawRibbonBar(ribbon);
    drawHologram();
}

function init(){
    var p=document.createElement('div');p.id='fourierPanel';p.style.cssText='margin:16px;padding:16px;background:#1e293b;border-radius:16px';
    var c=document.querySelector('.container');if(c)c.insertBefore(p,c.firstChild);
    refreshAll();
    var inp=document.getElementById('symbol');if(inp)inp.addEventListener('change',function(){setTimeout(refreshAll,1000);});
    var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++)if(btns[i].innerText.indexOf('分析')>=0)btns[i].addEventListener('click',function(){setTimeout(refreshAll,1500);});
}
if(document.readyState=='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
