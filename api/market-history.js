// api/market-history.js
// Fetches 7 days of hourly BTC prices for sparkline charts
// CoinGecko free tier: /coins/{id}/market_chart — no API key needed

export default async function handler(req, res) {
  try {
    // 7 days of hourly data (~168 points)
    const response = await fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=hourly"
    );

    if (!response.ok) throw new Error("CoinGecko history request failed");

    const data = await response.json();

    // data.prices is an array of [timestamp, price]
    // We only need the price values for the sparkline
    const prices = data.prices.map(([, price]) => price);

    // Cache for 1 hour — history doesn't need to be as fresh as current price
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).json({
      prices,
      updatedAt: Date.now()
    });

  } catch (err) {
    console.error("market-history error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
