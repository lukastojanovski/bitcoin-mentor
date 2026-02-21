// api/market-history.js
// Derives 7-day sparkline prices from the OHLCV endpoint
// (avoids CoinGecko /market_chart which requires API key on server)

module.exports = async function handler(req, res) {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin/ohlc?vs_currency=usd&days=7"
    );

    if (!response.ok) throw new Error("CoinGecko OHLC request failed");

    const raw = await response.json();

    // Extract close prices for sparkline, sorted ascending
    const prices = raw
      .map(([timestamp, , , , close]) => close)
      .filter(Boolean);

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).json({ prices, updatedAt: Date.now() });

  } catch (err) {
    console.error("market-history error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
