// api/market-data.js
module.exports = async function handler(req, res) {
  try {
    const [priceRes, fgRes] = await Promise.all([
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_7d_change=true"),
      fetch("https://api.alternative.me/fng/?limit=2")
    ]);

    if (!priceRes.ok) throw new Error("CoinGecko request failed");
    if (!fgRes.ok)    throw new Error("Fear & Greed request failed");

    const priceData = await priceRes.json();
    const fgData    = await fgRes.json();

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).json({
      btcPrice:      priceData.bitcoin.usd,
      btc24h:        priceData.bitcoin.usd_24h_change,
      btc7d:         priceData.bitcoin.usd_7d_change,
      fearGreedNow:  parseInt(fgData.data[0].value),
      fearGreedPrev: parseInt(fgData.data[1].value),
      updatedAt:     Date.now()
    });

  } catch (err) {
    console.error("market-data error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
