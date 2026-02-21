// api/market-ohlcv.js
module.exports = async function handler(req, res) {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=90"
    );

    if (!response.ok) throw new Error("CoinGecko OHLC request failed");

    const raw = await response.json();

    const candles = raw.map(([timestamp, open, high, low, close]) => ({
      time:  Math.floor(timestamp / 1000),
      open,
      high,
      low,
      close
    }));

    candles.sort((a, b) => a.time - b.time);

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).json({ candles, updatedAt: Date.now() });

  } catch (err) {
    console.error("market-ohlcv error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
