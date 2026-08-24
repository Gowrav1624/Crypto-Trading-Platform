import React, { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import "./App.css";

const COINS = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin", pair: "btcusdt" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum", pair: "ethusdt" },
  { id: "solana", symbol: "SOL", name: "Solana", pair: "solusdt" },
  { id: "binancecoin", symbol: "BNB", name: "BNB", pair: "bnbusdt" },
  { id: "ripple", symbol: "XRP", name: "XRP", pair: "xrpusdt" },
  { id: "cardano", symbol: "ADA", name: "Cardano", pair: "adausdt" },
];

function App() {
  const [selectedCoin, setSelectedCoin] = useState(COINS[0]);
  const [marketData, setMarketData] = useState([]);
  const [prices, setPrices] = useState({});
  const [priceHistory, setPriceHistory] = useState({});
  const [wallet, setWallet] = useState(10000);
  const [portfolio, setPortfolio] = useState({});
  const [amount, setAmount] = useState("");
  const [tradeType, setTradeType] = useState("buy");
  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState("");

  // CoinGecko API
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=true"
        );

        if (!response.ok) throw new Error("API request failed");

        const data = await response.json();
        setMarketData(data);

        const initialPrices = {};

        data.forEach((coin) => {
          initialPrices[coin.symbol.toUpperCase()] = coin.current_price;

          setPriceHistory((prev) => ({
            ...prev,
            [coin.symbol.toUpperCase()]:
              coin.sparkline_in_7d?.price?.slice(-50) || [],
          }));
        });

        setPrices((prev) => ({
          ...initialPrices,
          ...prev,
        }));
      } catch (error) {
        console.error("CoinGecko error:", error);
      }
    };

    fetchMarketData();

    const interval = setInterval(fetchMarketData, 30000);

    return () => clearInterval(interval);
  }, []);

  // WebSocket - Binance live prices
  useEffect(() => {
    const socket = new WebSocket(
      `wss://stream.binance.com:9443/stream?streams=${COINS.map(
        (coin) => `${coin.pair}@trade`
      ).join("/")}`
    );

    socket.onopen = () => {
      setConnected(true);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const symbol = data.data.s.replace("USDT", "");
        const price = parseFloat(data.data.p);

        setPrices((prev) => ({
          ...prev,
          [symbol]: price,
        }));

        setPriceHistory((prev) => {
          const history = prev[symbol] || [];

          return {
            ...prev,
            [symbol]: [...history.slice(-49), price],
          };
        });
      } catch (error) {
        console.error("WebSocket error:", error);
      }
    };

    socket.onerror = () => {
      setConnected(false);
    };

    socket.onclose = () => {
      setConnected(false);
    };

    return () => socket.close();
  }, []);

  const selectedPrice =
    prices[selectedCoin.symbol] ||
    marketData.find(
      (coin) => coin.symbol.toUpperCase() === selectedCoin.symbol
    )?.current_price ||
    0;

  const selectedMarketData = marketData.find(
    (coin) => coin.symbol.toUpperCase() === selectedCoin.symbol
  );

  const history = priceHistory[selectedCoin.symbol] || [];

  // D3 chart
  useEffect(() => {
    if (!history.length) return;

    const svg = d3.select("#price-chart");
    svg.selectAll("*").remove();

    const width = 720;
    const height = 280;

    const margin = {
      top: 20,
      right: 20,
      bottom: 35,
      left: 60,
    };

    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const chart = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain([0, history.length - 1])
      .range([0, chartWidth]);

    const y = d3
      .scaleLinear()
      .domain([d3.min(history) * 0.995, d3.max(history) * 1.005])
      .range([chartHeight, 0]);

    chart
      .append("g")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(6)
          .tickFormat(() => "")
      )
      .attr("color", "#394150");

    chart
      .append("g")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickFormat((d) => `$${d.toLocaleString()}`)
      )
      .attr("color", "#394150");

    const line = d3
      .line()
      .x((d, i) => x(i))
      .y((d) => y(d))
      .curve(d3.curveMonotoneX);

    chart
      .append("path")
      .datum(history)
      .attr("fill", "none")
      .attr("stroke", "#7c5cff")
      .attr("stroke-width", 3)
      .attr("d", line);

    chart
      .append("path")
      .datum(history)
      .attr("fill", "url(#gradient)")
      .attr("opacity", 0.12)
      .attr(
        "d",
        `${line(history)} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`
      );

    const defs = svg.append("defs");

    const gradient = defs
      .append("linearGradient")
      .attr("id", "gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#7c5cff");

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#7c5cff")
      .attr("stop-opacity", 0);
  }, [history, selectedCoin]);

  const filteredCoins = useMemo(() => {
    return COINS.filter(
      (coin) =>
        coin.name.toLowerCase().includes(search.toLowerCase()) ||
        coin.symbol.toLowerCase().includes(search.toLowerCase())
    );
  }, [search]);

  const totalPortfolio = Object.entries(portfolio).reduce(
    (total, [symbol, quantity]) => {
      return total + quantity * (prices[symbol] || 0);
    },
    wallet
  );

  const handleTrade = () => {
    const quantity = parseFloat(amount);

    if (!quantity || quantity <= 0 || selectedPrice <= 0) return;

    const tradeValue = quantity * selectedPrice;

    if (tradeType === "buy") {
      if (tradeValue > wallet) {
        alert("Insufficient USD balance.");
        return;
      }

      setWallet((prev) => prev - tradeValue);

      setPortfolio((prev) => ({
        ...prev,
        [selectedCoin.symbol]:
          (prev[selectedCoin.symbol] || 0) + quantity,
      }));
    } else {
      const owned = portfolio[selectedCoin.symbol] || 0;

      if (quantity > owned) {
        alert("You don't own enough of this asset.");
        return;
      }

      setWallet((prev) => prev + tradeValue);

      setPortfolio((prev) => ({
        ...prev,
        [selectedCoin.symbol]: owned - quantity,
      }));
    }

    setAmount("");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">₿</div>
          <div>
            <h1>CryptoTrade</h1>
            <span>Trading Dashboard</span>
          </div>
        </div>

        <div className="connection">
          <span className={connected ? "status-dot online" : "status-dot"} />
          {connected ? "Live Market" : "Connecting..."}
        </div>
      </header>

      <main className="dashboard">
        <section className="stats-grid">
          <div className="stat-card">
            <span>Total Portfolio</span>
            <strong>${totalPortfolio.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}</strong>
            <small className="positive">+4.82% today</small>
          </div>

          <div className="stat-card">
            <span>Available USD</span>
            <strong>
              $
              {wallet.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </strong>
            <small>Ready to trade</small>
          </div>

          <div className="stat-card">
            <span>BTC Price</span>
            <strong>
              ${(prices.BTC || 0).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </strong>
            <small className="positive">
              {marketData[0]?.price_change_percentage_24h?.toFixed(2) || "0"}%
            </small>
          </div>

          <div className="stat-card">
            <span>Assets</span>
            <strong>{Object.keys(portfolio).length}</strong>
            <small>In your wallet</small>
          </div>
        </section>

        <section className="content-grid">
          <div className="market-panel">
            <div className="panel-header">
              <div>
                <h2>Market Overview</h2>
                <p>Real-time cryptocurrency prices</p>
              </div>

              <input
                type="text"
                placeholder="Search coin..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="coin-list">
              {filteredCoins.map((coin) => {
                const apiCoin = marketData.find(
                  (item) =>
                    item.symbol.toUpperCase() === coin.symbol
                );

                const price = prices[coin.symbol] || apiCoin?.current_price || 0;

                return (
                  <button
                    className={`coin-row ${
                      selectedCoin.symbol === coin.symbol ? "selected" : ""
                    }`}
                    key={coin.symbol}
                    onClick={() => setSelectedCoin(coin)}
                  >
                    <div className="coin-info">
                      <div className="coin-logo">
                        {coin.symbol.charAt(0)}
                      </div>

                      <div>
                        <strong>{coin.symbol}</strong>
                        <span>{coin.name}</span>
                      </div>
                    </div>

                    <div className="coin-price">
                      <strong>
                        $
                        {price.toLocaleString(undefined, {
                          maximumFractionDigits: 4,
                        })}
                      </strong>

                      <span
                        className={
                          (apiCoin?.price_change_percentage_24h || 0) >= 0
                            ? "positive"
                            : "negative"
                        }
                      >
                        {apiCoin?.price_change_percentage_24h?.toFixed(2) ||
                          "0.00"}
                        %
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="chart-panel">
            <div className="chart-header">
              <div>
                <div className="selected-name">
                  <div className="large-coin">
                    {selectedCoin.symbol.charAt(0)}
                  </div>

                  <div>
                    <h2>{selectedCoin.name}</h2>
                    <span>{selectedCoin.symbol}/USDT</span>
                  </div>
                </div>
              </div>

              <div className="chart-price">
                <strong>
                  $
                  {selectedPrice.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}
                </strong>

                <span
                  className={
                    (selectedMarketData?.price_change_percentage_24h || 0) >=
                    0
                      ? "positive"
                      : "negative"
                  }
                >
                  {selectedMarketData?.price_change_percentage_24h?.toFixed(
                    2
                  ) || "0.00"}
                  %
                </span>
              </div>
            </div>

            <div className="chart-container">
              <svg id="price-chart"></svg>
            </div>
          </div>
        </section>

        <section className="bottom-grid">
          <div className="wallet-panel">
            <div className="panel-header">
              <div>
                <h2>My Wallet</h2>
                <p>Your crypto holdings</p>
              </div>
            </div>

            <div className="wallet-balance">
              <span>Wallet Value</span>
              <strong>
                $
                {totalPortfolio.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </strong>
            </div>

            <div className="holdings">
              {Object.entries(portfolio).filter(
                ([, quantity]) => quantity > 0
              ).length === 0 ? (
                <div className="empty">
                  No crypto assets yet.
                  <br />
                  Start trading to build your portfolio.
                </div>
              ) : (
                Object.entries(portfolio)
                  .filter(([, quantity]) => quantity > 0)
                  .map(([symbol, quantity]) => (
                    <div className="holding" key={symbol}>
                      <div>
                        <strong>{symbol}</strong>
                        <span>{quantity.toFixed(6)} units</span>
                      </div>

                      <strong>
                        $
                        {(quantity * (prices[symbol] || 0)).toLocaleString(
                          undefined,
                          {
                            maximumFractionDigits: 2,
                          }
                        )}
                      </strong>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="trade-panel">
            <div className="panel-header">
              <div>
                <h2>Trade {selectedCoin.symbol}</h2>
                <p>Simulated trading</p>
              </div>
            </div>

            <div className="trade-tabs">
              <button
                className={tradeType === "buy" ? "active buy" : ""}
                onClick={() => setTradeType("buy")}
              >
                Buy
              </button>

              <button
                className={tradeType === "sell" ? "active sell" : ""}
                onClick={() => setTradeType("sell")}
              >
                Sell
              </button>
            </div>

            <label>Amount ({selectedCoin.symbol})</label>

            <input
              className="amount-input"
              type="number"
              min="0"
              step="0.000001"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <div className="trade-summary">
              <div>
                <span>Current Price</span>
                <strong>
                  ${selectedPrice.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}
                </strong>
              </div>

              <div>
                <span>Estimated Total</span>
                <strong>
                  $
                  {(
                    (parseFloat(amount) || 0) * selectedPrice
                  ).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </div>
            </div>

            <button className="trade-button" onClick={handleTrade}>
              {tradeType === "buy" ? "Buy" : "Sell"} {selectedCoin.symbol}
            </button>

            <small className="simulation-note">
               Demo trading only — no real funds are used.
            </small>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;