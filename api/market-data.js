// api/market-data.js
module.exports = async function handler(req, res) {
  try {
    const [priceRes, fgRes, ohlcRes] = await Promise.all([
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true"),
      fetch("https://api.alternative.me/fng/?limit=2"),
      fetch("https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=7")
    ]);

    if (!priceRes.ok) throw new Error("CoinGecko price request failed");
    if (!fgRes.ok)    throw new Error("Fear & Greed request failed");

    const priceData = await priceRes.json();
    const fgData    = await fgRes.json();

    const btcPrice = priceData.bitcoin.usd;
    const btc24h   = priceData.bitcoin.usd_24h_change;

    // Calculate 7d change from OHLC (first candle open vs current price)
    let btc7d = null;
    if (ohlcRes.ok) {
      const ohlc = await ohlcRes.json();
      if (Array.isArray(ohlc) && ohlc.length > 0) {
        const oldestOpen = ohlc[0][1]; // [timestamp, open, high, low, close]
        btc7d = ((btcPrice - oldestOpen) / oldestOpen) * 100;
      }
    }

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).json({
      btcPrice,
      btc24h,
      btc7d,
      fearGreedNow:  parseInt(fgData.data[0].value),
      fearGreedPrev: parseInt(fgData.data[1].value),
      updatedAt:     Date.now()
    });

  } catch (err) {
    console.error("market-data error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
