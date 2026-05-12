const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let sentCoins = {};

// =============================
// BLACKLIST SYMBOL
// =============================
const badSymbols = new Set();

// =============================
// CACHE USDT IDR
// =============================
let cachedUSDTIDR = 16000;
let lastUSDTUpdate = 0;

// =============================
// UTIL
// =============================

function sleep(ms){
  return new Promise(r => setTimeout(r, ms));
}

// =============================
// FETCH WITH TIMEOUT
// =============================

async function fetchTimeout(url, ms = 10000){

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, ms);

  try{

    const res = await fetch(url, {
      signal: controller.signal
    });

    clearTimeout(timeout);

    return res;

  }catch(e){

    clearTimeout(timeout);

    return null;

  }

}

// =============================
// AMBIL PAIR INDODAX
// =============================

async function getIndodaxPairs(){

  try{

    const res = await fetchTimeout(
      "https://indodax.com/tradingview/search_v2"
    );

    if(!res) return [];

    const data = await res.json();

    return data
      .filter(x => x.symbol.endsWith("IDR"))
      .map(x => x.symbol);

  }catch(e){

    console.log("getIndodaxPairs error");

    return [];

  }

}

// =============================
// CONVERT
// =============================

function toBinance(sym){
  return sym.replace("IDR", "USDT");
}

// =============================
// BINANCE KLINES
// =============================

async function getKlines(symbol, interval){

  // =============================
  // SKIP BAD SYMBOL
  // =============================
  if(badSymbols.has(symbol)){
    return null;
  }

  const urls = [

    `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=50`,

    `https://api2.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=50`,

    `https://api3.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=50`

  ];

  for(const url of urls){

    try{

      const res = await fetchTimeout(url, 10000);

      if(!res) continue;

      // =============================
      // SYMBOL INVALID
      // =============================
      if(
        res.status === 400 ||
        res.status === 404
      ){

        console.log("❌ BAD SYMBOL:", symbol);

        badSymbols.add(symbol);

        return null;

      }

      if(!res.ok) continue;

      return await res.json();

    }catch(e){

      console.log("fetch error", symbol);

    }

  }

  return null;

}

// =============================
// USDT → IDR
// =============================

async function getUSDTIDR(){

  try{

    // cache 5 menit
    if(
      Date.now() - lastUSDTUpdate < 300000
    ){
      return cachedUSDTIDR;
    }

    const res = await fetchTimeout(
      "https://api.binance.com/api/v3/ticker/price?symbol=USDTIDR"
    );

    if(!res) return cachedUSDTIDR;

    const data = await res.json();

    cachedUSDTIDR = parseFloat(data.price);

    lastUSDTUpdate = Date.now();

    return cachedUSDTIDR;

  }catch(e){

    return cachedUSDTIDR;

  }

}

// =============================
// CALCULATION
// =============================

function avgVol(data){

  let v = data
    .slice(-20)
    .map(c => +c[5]);

  return v.reduce((a,b)=>a+b,0)/20;

}

function breakout(data){

  let last = +data.at(-1)[4];

  let high = Math.max(
    ...data
      .slice(-20,-1)
      .map(c => +c[2])
  );

  return last > high;

}

function change(data){

  let a = +data.at(-1)[4];

  let b = +data.at(-2)[4];

  return ((a-b)/b)*100;

}

// =============================
// TELEGRAM SEND
// =============================

async function sendTelegram(msg){

  try{

    await fetchTimeout(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      10000
    );

    await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          chat_id:CHAT_ID,
          text:msg
        })
      }
    );

  }catch(e){

    console.log("telegram error");

  }

}

// =============================
// SCAN COIN
// =============================

async function scan(indodaxSymbol){

  try{

    let symbol = toBinance(indodaxSymbol);

    // =============================
    // SKIP BLACKLIST
    // =============================
    if(badSymbols.has(symbol)){
      return;
    }

    let d5 = await getKlines(symbol,"5m");

    if(!d5) return;

    let d15 = await getKlines(symbol,"15m");

    if(!d15) return;

    // =============================
    // PRICE
    // =============================

    let priceUSDT = +d5.at(-1)[4];

    let usdtIDR = await getUSDTIDR();

    let priceIDR = priceUSDT * usdtIDR;

    // =============================
    // RVOL
    // =============================

    let rvol5 =
      +d5.at(-1)[5] / avgVol(d5);

    let rvol15 =
      +d15.at(-1)[5] / avgVol(d15);

    let br5 = breakout(d5);

    let ch = change(d5);

    let status = "SKIP";

    // =============================
    // LOGIC
    // =============================

    if(
      rvol5 > 2 &&
      br5 &&
      rvol15 > 1.2 &&
      ch < 5
    ){

      status = "🔥 STRONG CONFIRM";

    }

    console.log(
      indodaxSymbol,
      status
    );

    // =============================
    // TELEGRAM ALERT
    // =============================

    if(status === "🔥 STRONG CONFIRM"){

      if(!sentCoins[indodaxSymbol]){

        let msg =
`🚀 STRONG CONFIRM

Coin      : ${indodaxSymbol}

Binance   : ${symbol}

Price IDR : Rp ${priceIDR.toLocaleString("id-ID")}

PriceUSDT : ${priceUSDT}

RVOL5     : ${rvol5.toFixed(2)}

RVOL15    : ${rvol15.toFixed(2)}

Status    : ${status}

Time      : ${new Date().toLocaleString()}
`;

        await sendTelegram(msg);

        sentCoins[indodaxSymbol] = true;

      }

    }else{

      sentCoins[indodaxSymbol] = false;

    }

  }catch(e){

    console.log(
      "scan error:",
      indodaxSymbol
    );

  }

}

// =============================
// MAIN LOOP
// =============================

async function start(){

  const coins =
    await getIndodaxPairs();

  console.log(
    "TOTAL COINS:",
    coins.length
  );

  while(true){

    const startTime = Date.now();

    for(let i=0; i<coins.length; i++){

      try{

        await scan(coins[i]);

      }catch(e){

        console.log(
          "loop error",
          coins[i]
        );

      }

      // anti rate limit
      await sleep(300);

      // progress
      if(i % 20 === 0){

        console.log(
          `SCAN ${i}/${coins.length}`
        );

        console.log(
          "BAD SYMBOL:",
          badSymbols.size
        );

      }

    }

    const duration =
      ((Date.now()-startTime)/1000)
      .toFixed(2);

    console.log(
      `✅ cycle done (${duration}s)`
    );

    console.log(
      `❌ bad symbols: ${badSymbols.size}`
    );

  }

}

start();