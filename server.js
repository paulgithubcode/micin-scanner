const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let sentCoins = {};

function sleep(ms){
  return new Promise(r=>setTimeout(r,ms));
}

// ============================
// USDT → IDR RATE
// ============================

async function getUSDTIDR(){

  try{

    const res = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=USDTIDR"
    );

    const data = await res.json();

    return parseFloat(data.price);

  }catch(e){

    console.log("USDTIDR error, fallback");

    return 16000; // fallback kalau API gagal

  }

}

// ============================
// BINANCE KLINES
// ============================

async function getKlines(symbol, interval){

  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=50`;

  const res = await fetch(url);

  return await res.json();

}

// ============================

function avgVol(data){

  let v = data.slice(-20).map(c=>+c[5]);

  return v.reduce((a,b)=>a+b,0)/20;

}

function breakout(data){

  let last = +data.at(-1)[4];

  let high = Math.max(
    ...data.slice(-20,-1).map(c=>+c[2])
  );

  return last > high;

}

function change(data){

  let a = +data.at(-1)[4];

  let b = +data.at(-2)[4];

  return ((a-b)/b)*100;

}

// ============================
// TELEGRAM
// ============================

async function sendTelegram(msg){

  await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: msg
      })
    }
  );

}

// ============================
// SCAN COIN
// ============================

async function scan(symbol){

  try{

    let d5 = await getKlines(symbol,"5m");

    let d15 = await getKlines(symbol,"15m");

    if(!d5 || !d15) return;

    // =========================
    // PRICE USDT
    // =========================

    let priceUSDT = +d5.at(-1)[4];

    let usdtIDR = await getUSDTIDR();

    let priceIDR = priceUSDT * usdtIDR;

    // =========================
    // RVOL
    // =========================

    let rvol5 = +d5.at(-1)[5] / avgVol(d5);

    let rvol15 = +d15.at(-1)[5] / avgVol(d15);

    let br5 = breakout(d5);

    let ch = change(d5);

    let status = "SKIP";

    // =========================
    // LOGIC
    // =========================

    if(rvol5 > 2 && br5 && rvol15 > 1.2 && ch < 5){

      status = "🔥 STRONG CONFIRM";

    }

    console.log(symbol, status);

    // =========================
    // TELEGRAM ALERT
    // =========================

    if(status === "🔥 STRONG CONFIRM"){

      if(!sentCoins[symbol]){

        let msg =
`🚀 STRONG CONFIRM

Coin   : ${symbol}

Price  : Rp ${priceIDR.toLocaleString("id-ID")}

PriceUSDT : ${priceUSDT}

RVOL5  : ${rvol5.toFixed(2)}

RVOL15 : ${rvol15.toFixed(2)}

Status : ${status}

Time   : ${new Date().toLocaleString()}
`;

        await sendTelegram(msg);

        sentCoins[symbol] = true;

      }

    }else{

      sentCoins[symbol] = false;

    }

  }catch(e){

    console.log("error", symbol);

  }

}

// ============================
// COINS
// ============================

const coins = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT"
];

// ============================
// LOOP
// ============================

async function start(){

  while(true){

    for(let c of coins){

      await scan(c);

      await sleep(500);

    }

    console.log("cycle done");

    await sleep(60000);

  }

}

start();