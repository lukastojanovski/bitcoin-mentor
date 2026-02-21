// api/market-history.js
module.exports = async function handler(req, res) {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7&interval=hourly"
    );

    if (!response.ok) throw new Error("CoinGecko history request failed");

    const data   = await response.json();
    const prices = data.prices.map(([, price]) => price);

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).json({ prices, updatedAt: Date.now() });

  } catch (err) {
    console.error("market-history error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
