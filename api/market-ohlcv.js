// api/market-ohlcv.js
module.exports = async function handler(req, res) {
  try {
    const days = parseInt(req.query.days) || 30;

    const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("CoinGecko request failed: " + response.status);

    const raw = await response.json();

    const candles = raw.prices.map(([timestamp, price]) => ({
      time:  Math.floor(timestamp / 1000),
      open:  price,
      high:  price,
      low:   price,
      close: price
    }));

    const seen = new Set();
    const unique = candles.filter(c => {
      if (seen.has(c.time)) return false;
      seen.add(c.time);
      return true;
    }).sort((a, b) => a.time - b.time);

    const maxAge = days <= 7 ? 300 : days <= 30 ? 600 : 1800;
    res.setHeader("Cache-Control", `s-maxage=${maxAge}, stale-while-revalidate=60`);
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).json({ candles: unique, updatedAt: Date.now() });

  } catch (err) {
    console.error("market-ohlcv error:", err.message);
    res.status(500).json({ error: err.message });
  }
};