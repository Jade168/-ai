// 簡單模擬股票訊號 App.js
document.addEventListener('DOMContentLoaded', function() {

  const container = document.createElement('div');
  container.style.padding = '20px';
  container.style.fontFamily = 'Arial, sans-serif';

  const title = document.createElement('h2');
  title.innerText = '股票模擬訊號';
  container.appendChild(title);

  const buySignal = document.createElement('div');
  buySignal.innerText = '買入訊號';
  buySignal.style.color = 'white';
  buySignal.style.backgroundColor = 'green';
  buySignal.style.padding = '10px';
  buySignal.style.margin = '10px 0';
  container.appendChild(buySignal);

  const sellSignal = document.createElement('div');
  sellSignal.innerText = '賣出訊號';
  sellSignal.style.color = 'white';
  sellSignal.style.backgroundColor = 'red';
  sellSignal.style.padding = '10px';
  sellSignal.style.margin = '10px 0';
  container.appendChild(sellSignal);

  document.body.appendChild(container);
});
