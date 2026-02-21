// api/market-ohlcv.js
// Fetches real daily OHLCV candles from CoinGecko for TradingView Lightweight Charts
// CoinGecko free tier: /coins/{id}/ohlc — returns up to 90 days, no API key needed

export default async function handler(req, res) {
  try {
    // 90 days of daily OHLC candles
    const response = await fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=90"
    );

    if (!response.ok) throw new Error("CoinGecko OHLC request failed");

    const raw = await response.json();

    // CoinGecko returns: [[timestamp, open, high, low, close], ...]
    // TradingView needs: [{ time, open, high, low, close }, ...]
    // time must be in UNIX seconds (CoinGecko gives milliseconds)
    const candles = raw.map(([timestamp, open, high, low, close]) => ({
      time:  Math.floor(timestamp / 1000),
      open,
      high,
      low,
      close
    }));

    // Sort ascending by time (CoinGecko is usually already sorted but be safe)
    candles.sort((a, b) => a.time - b.time);

    // Cache for 1 hour — daily candles don't change intraday
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).json({ candles, updatedAt: Date.now() });

  } catch (err) {
    console.error("market-ohlcv error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
