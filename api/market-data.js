// api/market-data.js
// Fetches BTC price + Fear & Greed index, caches for 15 minutes via Vercel CDN

export default async function handler(req, res) {
  try {
    const [priceRes, fgRes] = await Promise.all([
      fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_7d_change=true"
      ),
      fetch("https://api.alternative.me/fng/?limit=2")
    ]);

    if (!priceRes.ok) throw new Error("CoinGecko request failed");
    if (!fgRes.ok)    throw new Error("Fear & Greed request failed");

    const priceData = await priceRes.json();
    const fgData    = await fgRes.json();

    const btcPrice = priceData.bitcoin.usd;
    const btc24h   = priceData.bitcoin.usd_24h_change;
    const btc7d    = priceData.bitcoin.usd_7d_change;

    const fgNow    = parseInt(fgData.data[0].value);
    const fgPrev   = parseInt(fgData.data[1].value); // yesterday

    // Cache at Vercel CDN edge for 15 min, serve stale for 5 min while revalidating
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).json({
      btcPrice,
      btc24h,
      btc7d,
      fearGreedNow:  fgNow,
      fearGreedPrev: fgPrev,
      updatedAt: Date.now()
    });

  } catch (err) {
    console.error("market-data error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
