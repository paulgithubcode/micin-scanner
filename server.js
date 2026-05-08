const BOT_TOKEN = "8705907765:AAGTBF2ka5cgnZ9jzcnIlXnVxmqjtqc0X1k";
const CHAT_ID = "8241745751";

const sentCoins = {};

function sleep(ms){
    return new Promise(r=>setTimeout(r,ms));
}

// ======================================
// GET PAIRS
// ======================================

async function getPairs(){

    const res = await fetch(
        "https://indodax.com/tradingview/search_v2"
    );

    const data = await res.json();

    return data
        .filter(x=>x.symbol.endsWith("IDR"))
        .map(x=>x.symbol);

}

// ======================================

function toBinance(sym){

    return sym.replace("IDR","USDT");

}

// ======================================

async function getKlines(symbol, interval){

    const urls = [

        `https://api1.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=50`,

        `https://api2.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=50`,

        `https://api3.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=50`

    ];

    for(const url of urls){

        try{

            const res = await fetch(url);

            if(res.ok){

                return await res.json();

            }

        }catch(err){}

    }

    return null;

}

// ======================================

function avgVol(data){

    let v = data
        .slice(-20)
        .map(c=>parseFloat(c[5]));

    return v.reduce((a,b)=>a+b,0)/20;

}

// ======================================

function breakout(data){

    let last = parseFloat(data.at(-1)[4]);

    let high = Math.max(
        ...data
        .slice(-20,-1)
        .map(c=>parseFloat(c[2]))
    );

    return last > high;

}

// ======================================

function whale(data){

    let curr = parseFloat(data.at(-1)[5]);

    let prev = parseFloat(data.at(-2)[5]);

    return curr > prev*2;

}

// ======================================

function change(data){

    let a = parseFloat(data.at(-1)[4]);

    let b = parseFloat(data.at(-2)[4]);

    return ((a-b)/b)*100;

}

// ======================================
// TELEGRAM
// ======================================

async function sendTelegram(message){

    try{

        const res = await fetch(

            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,

            {
                method:"POST",

                headers:{
                    "Content-Type":"application/json"
                },

                body:JSON.stringify({

                    chat_id:CHAT_ID,

                    text:message

                })
            }

        );

        const data = await res.json();

        console.log("TELEGRAM:", data.ok);

    }catch(err){

        console.log(err);

    }

}

// ======================================
// PROCESS
// ======================================

async function process(pair){

    try{

        let sym = toBinance(pair);

        let data5 = await getKlines(sym,"5m");

        let data15 = await getKlines(sym,"15m");

        if(!data5 || !data15) return;

        let last = parseFloat(
            data5.at(-1)[4]
        );

        let rvol5 =
            parseFloat(data5.at(-1)[5]) /
            avgVol(data5);

        let rvol15 =
            parseFloat(data15.at(-1)[5]) /
            avgVol(data15);

        let br5 = breakout(data5);

        let br15 = breakout(data15);

        let wh = whale(data5);

        let ch = change(data5);

        let status = "SKIP";

        if(
            rvol5 > 2 &&
            br5 &&
            rvol15 > 1.2 &&
            ch < 5
        ){

            status = "STRONG CONFIRM";

        }
        else if(
            rvol5 > 2 &&
            ch < 3 &&
            !br15
        ){

            status = "EARLY";

        }
        else if(
            wh &&
            ch < 4
        ){

            status = "WHALE";

        }
        else if(
            br5 &&
            rvol5 < 1.5
        ){

            status = "FAKE";

        }

        console.log(
            pair,
            rvol5.toFixed(2),
            rvol15.toFixed(2),
            status
        );

        // ======================================
        // TELEGRAM ALERT
        // ======================================

        if(status === "STRONG CONFIRM"){

            if(!sentCoins[pair]){

                let harga = new Intl.NumberFormat(
                    'id-ID',
                    {
                        style:'currency',
                        currency:'IDR'
                    }
                ).format(last);

                let msg =
`🚀 STRONG CONFIRM

Coin      : ${pair}

Harga     : ${harga}

RVOL 5M   : ${rvol5.toFixed(2)}

RVOL 15M  : ${rvol15.toFixed(2)}

Status    : ${status}

Time      :
${new Date().toLocaleString()}
`;

                await sendTelegram(msg);

                sentCoins[pair] = true;

                console.log(
                    "ALERT SENT:",
                    pair
                );

            }

        }else{

            sentCoins[pair] = false;

        }

    }catch(err){

        console.log(err);

    }

}

// ======================================
// SCAN
// ======================================

async function scan(){

    console.log("START SCAN");

    const pairs = await getPairs();

    console.log("TOTAL:", pairs.length);

    for(let i=0;i<pairs.length;i++){

        await process(pairs[i]);

        await sleep(200);

    }

    console.log("DONE");

}

// ======================================
// LOOP
// ======================================

async function start(){

    while(true){

        await scan();

        console.log(
            "WAIT 15 MINUTES..."
        );

//        await sleep(900000);

    }

}

start();