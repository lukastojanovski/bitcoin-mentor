// Prevent duplicate charts
let dcaChartInstance = null;

// ===== Caches =====
let fearGreedNow = null;
let fearGreedPrev = null;

let spxCloseNow = null;
let spxClosePrev = null;
let spxClose7dAgo = null;

let btcPrice = null;
let btc24h = null;
let btc7d = null;
let btcSpark7d = null;


// ===== LIVE MARKET DATA =====

async function initOverview() {
    await loadLiveMarketData();
}

async function loadLiveMarketData() {
    try {
        const [marketRes, historyRes] = await Promise.all([
            fetch("/api/market-data", { cache: "no-store" }),
            fetch("/api/market-history", { cache: "no-store" })
        ]);

        if (!marketRes.ok) throw new Error("market-data API failed");
        const d = await marketRes.json();
        if (!d.btcPrice) throw new Error("market-data returned empty");

        btcPrice      = d.btcPrice;
        btc24h        = d.btc24h;
        btc7d         = d.btc7d;
        fearGreedNow  = d.fearGreedNow;
        fearGreedPrev = d.fearGreedPrev;

        if (historyRes.ok) {
            const h = await historyRes.json();
            btcSpark7d = Array.isArray(h.prices) && h.prices.length ? h.prices : Array(120).fill(btcPrice);
        } else {
            btcSpark7d = Array(120).fill(btcPrice);
        }

        spxCloseNow   = 5100;
        spxClosePrev  = 5100;
        spxClose7dAgo = 5100;

        updateBTCUI();
        renderOverviewModel();

    } catch (err) {
        console.warn("Live data fetch failed, falling back to static:", err.message);
        loadFallbackData();
    }
}

function loadFallbackData() {
    btcPrice      = null;
    btc24h        = null;
    btc7d         = null;
    fearGreedNow  = null;
    fearGreedPrev = null;
    btcSpark7d    = [];

    spxCloseNow   = 5100;
    spxClosePrev  = 5100;
    spxClose7dAgo = 5100;

    updateBTCUI(true);
    renderOverviewModel();
}


// ===== RENDER =====

function renderOverviewModel() {
    document.querySelectorAll("[data-fg]").forEach(el => {
        el.textContent = (fearGreedNow === null) ? "—" : `${fearGreedNow}`;
    });

    const sp1d   = pctChange(spxCloseNow, spxClosePrev);
    const sp7d   = pctChange(spxCloseNow, spxClose7dAgo);
    const spMood = sp1d === null ? null : Math.round(50 + sp1d * 2);

    // Use smoothed FG (average of today + yesterday) for cycle classification
    const fgSmoothed = getSmoothedFGFromCache(fearGreedNow, fearGreedPrev);
    const pos = positionFromSignals(fgSmoothed, btc7d);

    document.querySelectorAll("[data-market-position]").forEach(el => el.textContent = pos);

    const thesis = thesisFromPosition(pos);
    document.querySelectorAll("[data-market-thesis]").forEach(el => el.textContent = thesis);

    // SPX kept in interpretation only (not risk score)
    const crypto = fearGreedNow === null ? "fear" : cryptoState(fearGreedNow);
    const equity = spMood === null ? "cautious" : equityState(spMood);
    const interp = combinedInterpretation(crypto, equity);

    document.querySelectorAll("[data-interpretation-title]").forEach(el => el.textContent = interp.title);
    document.querySelectorAll("[data-interpretation-text]").forEach(el => el.textContent  = interp.text);

    // Risk score: FG 60% + volatility 40% (no SPX)
    const score  = riskScore({ fg: fearGreedNow, btc24h, btc7d });
    const rLabel = riskLabel(score);

    document.querySelectorAll("[data-risk]").forEach(el => el.textContent = rLabel);
    document.querySelectorAll("[data-risk-level]").forEach(el => el.textContent = rLabel);

    updateRiskDot(score);
    updateHeroDot(score);

    const bias = biasFromPosition(pos, score);
    const note =
        pos === "Accumulation" ? "Historically, this is where retail loses conviction." :
            pos === "Expansion"    ? "Most mistakes happen by sizing up late."              :
                pos === "Euphoria"     ? "Top signals feel good. That's the trap."              :
                    "Panic lows feel permanent. They aren't.";

    document.querySelectorAll("[data-bias]").forEach(el => el.textContent = bias);
    document.querySelectorAll("[data-bias-note]").forEach(el => el.textContent = note);

    const bullets = whatChangedBullets({ fgNow: fearGreedNow, fgPrev: fearGreedPrev, sp1d, sp7d, btc24h, btc7d });
    const ul = document.getElementById("briefChanged");
    if (ul) ul.innerHTML = bullets.map(b => `<li>${b}</li>`).join("");

    const means = whatItMeansText({ pos, risk: score, interpTitle: interp.title });
    const meansEl = document.getElementById("briefMeans");
    if (meansEl) meansEl.textContent = means;
}


function updateRiskDot(score) {
    const dot = document.getElementById("riskDot");
    if (!dot) return;
    dot.classList.remove("good", "warn", "bad");
    if      (score >= 65) dot.classList.add("bad");
    else if (score >= 40) dot.classList.add("warn");
    else                  dot.classList.add("good");
}

function updateHeroDot(score) {
    const dot = document.getElementById("heroDot");
    if (!dot) return;
    dot.classList.remove("good", "warn", "bad");
    if      (score >= 65) dot.classList.add("bad");
    else if (score >= 40) dot.classList.add("warn");
    else                  dot.classList.add("good");
}


// ===== HELPERS =====

function formatPct(v) {
    if (typeof v !== "number") return "—";
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function pctChange(now, prev) {
    if (!Number.isFinite(now) || !Number.isFinite(prev) || prev === 0) return null;
    return ((now - prev) / prev) * 100;
}

function updateBTCUI(failed = false) {
    document.querySelectorAll("[data-btc-price]").forEach(el => {
        if (!btcPrice) {
            el.textContent = failed ? "Price unavailable" : "—";
            return;
        }
        el.textContent = "$" + Math.round(btcPrice).toLocaleString();
        el.classList.add("price-flash");
        setTimeout(() => el.classList.remove("price-flash"), 600);
    });

    document.querySelectorAll("[data-btc-24h]").forEach(el => {
        el.textContent = typeof btc24h === "number" ? formatPct(btc24h) : "—";
    });
    document.querySelectorAll("[data-btc-7d]").forEach(el => {
        el.textContent = typeof btc7d === "number" ? formatPct(btc7d) : "—";
    });

    if (Array.isArray(btcSpark7d)) {
        drawSparkline("heroSpark", btcSpark7d, 1.5);
        drawSparkline("overviewSpark", btcSpark7d, 2.5);
    }
}

function drawSparkline(canvasId, points, linewidth = 2) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !Array.isArray(points)) return;

    const ctx  = canvas.getContext("2d");
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const pad  = 6;
    const data = points.slice(-120);
    const min  = Math.min(...data);
    const max  = Math.max(...data);
    const range = (max - min) || 1;

    ctx.beginPath();
    data.forEach((v, i) => {
        const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
        const y = h - ((v - min) / range) * (h - pad * 2) - pad;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    const lastX = (1) * (w - pad * 2) + pad;
    ctx.lineTo(lastX, h);
    ctx.lineTo(pad, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(247,147,26,0.12)");
    grad.addColorStop(1, "rgba(247,147,26,0.0)");
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineJoin = "round";
    ctx.lineCap  = "round";
    ctx.lineWidth = linewidth;
    ctx.beginPath();
    data.forEach((v, i) => {
        const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
        const y = h - ((v - min) / range) * (h - pad * 2) - pad;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#f7931a";
    ctx.stroke();
}


// ===== MARKET INTERPRETATION =====

function cryptoState(v) {
    if (v < 25) return 'extreme_fear';
    if (v < 50) return 'fear';
    if (v < 75) return 'greed';
    return 'extreme_greed';
}

function equityState(v) {
    if (v < 30) return 'fear';
    if (v < 50) return 'cautious';
    if (v < 70) return 'optimistic';
    return 'euphoric';
}

function combinedInterpretation(crypto, equity) {
    if ((crypto === 'fear' || crypto === 'extreme_fear') && equity === 'optimistic')
        return { title: 'Divergence', text: 'Crypto sentiment is fearful while equities remain optimistic.' };
    if ((crypto === 'greed' || crypto === 'extreme_greed') && equity === 'fear')
        return { title: 'Warning', text: 'Crypto optimism is elevated while equity markets are stressed.' };
    if ((crypto === 'fear' || crypto === 'extreme_fear') && equity === 'fear')
        return { title: 'Risk-Off Environment', text: 'Both crypto and equities show fear.' };
    if ((crypto === 'greed' || crypto === 'extreme_greed') && (equity === 'optimistic' || equity === 'euphoric'))
        return { title: 'Elevated Risk', text: 'Optimism is high across markets.' };
    return { title: 'Neutral Conditions', text: 'Market signals are mixed.' };
}


// ===== CORE LOGIC =====

// Smoothing: average today + yesterday's FG to reduce whiplash
function getSmoothedFGFromCache(fgNow, fgPrev) {
    if (fgNow === null) return null;
    if (fgPrev === null) return fgNow;
    return (fgNow + fgPrev) / 2;
}

// Cycle phase from smoothed FG + 7d price action
function positionFromSignals(fg, btc7d) {
    if (fg === null || btc7d === null) return "Accumulation";
    if (fg <= 25) return "Capitulation";
    if (fg <= 45 && btc7d < 5)  return "Accumulation";
    if (fg <= 75 && btc7d >= 0) return "Expansion";
    if (fg > 75)                return "Euphoria";
    return "Accumulation";
}

// Risk score: FG 60% + asymmetric volatility up to 40%
// Downside moves weighted 1.5x more than upside
function riskScore({ fg, btc24h, btc7d }) {
    const fgRisk = fg === null ? 50 : fg;

    const w24  = (btc24h ?? 0) < 0 ? 1.5 : 1.0;
    const w7d  = (btc7d  ?? 0) < 0 ? 1.5 : 1.0;
    const adj24 = Math.abs(btc24h ?? 0) * w24;
    const adj7d  = Math.abs(btc7d  ?? 0) * w7d;

    const vol     = (adj24 * 1.2 + adj7d) * 1.0;
    const volRisk = Math.max(0, Math.min(40, vol));

    return Math.round(Math.max(0, Math.min(100, fgRisk * 0.60 + volRisk)));
}

function riskLabel(score) {
    if (score >= 75) return "High";
    if (score >= 55) return "Elevated";
    if (score >= 35) return "Normal";
    return "Low";
}

function biasFromPosition(pos, risk) {
    if (pos === "Capitulation") return "Defensive → Patient";
    if (pos === "Accumulation") return risk >= 60 ? "Neutral → Careful" : "Neutral → Constructive";
    if (pos === "Expansion")    return risk >= 70 ? "Constructive → Cautious" : "Constructive";
    return "Cautious → Defensive";
}

function thesisFromPosition(pos) {
    if (pos === "Capitulation") return "Panic is loud. Survival comes first.";
    if (pos === "Accumulation") return "Volatility is noise. Structure still holds.";
    if (pos === "Expansion")    return "Trend improves. Discipline matters more than optimism.";
    return "Risk is highest. Protect gains and avoid chasing.";
}

function whatChangedBullets({ fgNow, fgPrev, sp1d, sp7d, btc24h, btc7d }) {
    const bullets = [];
    if (fgNow !== null && fgNow !== undefined) {
        const d = (fgPrev !== null && fgPrev !== undefined) ? (fgNow - fgPrev) : null;
        if (d !== null) bullets.push(`Sentiment: ${d >= 0 ? "improving" : "worsening"} (${d > 0 ? "+" : ""}${d}).`);
        else bullets.push(`Sentiment: ${fgNow}/100 today.`);
    } else {
        bullets.push("Sentiment: unavailable (API).");
    }
    if (btc24h !== null && btc24h !== undefined && typeof btc24h === "number") {
        bullets.push(`BTC: 24h ${btc24h >= 0 ? "up" : "down"} (${btc24h >= 0 ? "+" : ""}${btc24h.toFixed(2)}%).`);
    }
    if (btc7d !== null && btc7d !== undefined && typeof btc7d === "number") {
        bullets.push(`BTC: 7d ${btc7d >= 0 ? "up" : "down"} (${btc7d >= 0 ? "+" : ""}${btc7d.toFixed(2)}%).`);
    }
    return bullets.slice(0, 3);
}

function whatItMeansText({ pos, risk, interpTitle }) {
    if (pos === "Capitulation") return "Stress is elevated. Reduce noise and avoid reactive decisions.";
    if (pos === "Accumulation") return "Short-term noise increased. Long-term thesis stays intact.";
    if (pos === "Expansion")    return "Momentum improves, but discipline prevents overexposure.";
    return `Risk is elevated (${interpTitle || "mixed signals"}). Avoid chasing and respect limits.`;
}


// ===== REVEAL ANIMATION =====
const reveals = document.querySelectorAll('.reveal');
const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('in');
            io.unobserve(entry.target);
        }
    });
}, { rootMargin: '0px 0px -60px 0px' });

requestAnimationFrame(() => {
    reveals.forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight) {
            el.classList.add('in');
        } else {
            io.observe(el);
        }
    });
});


// ===== NAVIGATION =====
const simpleBtn   = document.getElementById('simpleBtn');
const simplePanel = document.getElementById('simplePanel');

if (simpleBtn && simplePanel) {
    simpleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = simplePanel.style.display === 'block';
        simplePanel.style.display = open ? 'none' : 'block';
        simpleBtn.setAttribute('aria-expanded', String(!open));
    });

    document.addEventListener('click', (e) => {
        if (!simpleBtn.contains(e.target) && !simplePanel.contains(e.target)) {
            simplePanel.style.display = 'none';
            simpleBtn.setAttribute('aria-expanded', 'false');
        }
    });

    document.querySelectorAll('[data-scroll]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-scroll');
            const target = document.querySelector(targetId);
            if (target) target.scrollIntoView({ behavior: 'smooth' });
            simplePanel.style.display = 'none';
        });
    });
}


// ===== MARKET CYCLES =====
const cycleData = {
    capitulation: {
        title: "Capitulation",
        feel: "Fear dominates. Confidence collapses. Most participants believe the asset is broken.",
        mistakes: [
            "Selling purely to reduce emotional pain",
            "Abandoning long-term thesis due to short-term volatility",
            "Obsessively checking price for reassurance"
        ],
        better: [
            "Reduce noise consumption",
            "Follow predefined allocation rules",
            "Accept discomfort as part of long-term investing"
        ],
        example: "Historically, deep drawdowns punished emotional exits more than patient discipline."
    },
    accumulation: {
        title: "Accumulation",
        feel: "Interest fades. Volatility compresses. Attention disappears.",
        mistakes: [
            "Waiting for the perfect entry",
            "Over-optimizing timing",
            "Losing conviction due to boredom"
        ],
        better: [
            "Maintain steady contributions",
            "Focus on allocation over price",
            "Treat boredom as reduced speculation"
        ],
        example: "Long accumulation phases historically rewarded consistency more than precision."
    },
    expansion: {
        title: "Expansion",
        feel: "Confidence returns. Participation increases steadily.",
        mistakes: [
            "Increasing size because price is rising",
            "Confusing momentum with reduced risk",
            "Relaxing discipline due to gains"
        ],
        better: [
            "Respect position limits",
            "Separate long-term from speculative capital",
            "Prepare mentally for volatility"
        ],
        example: "Expansion phases rewarded discipline — but punished emotional overexposure."
    },
    euphoria: {
        title: "Euphoria",
        feel: "Certainty replaces caution. Narratives dominate.",
        mistakes: [
            "Believing upside is unlimited",
            "Increasing leverage",
            "Ignoring risk management"
        ],
        better: [
            "Reassess risk tolerance",
            "Consider partial profit-taking if aligned with plan",
            "Accept missing the exact top"
        ],
        example: "Historically, euphoria punished aggression more than inactivity."
    }
};

const cycleTitleEl    = document.getElementById("cycleTitle");
const cycleFeelEl     = document.getElementById("cycleFeel");
const cycleMistakesEl = document.getElementById("cycleMistakes");
const cycleBetterEl   = document.getElementById("cycleBetter");
const cycleExampleEl  = document.getElementById("cycleExample");

function renderList(ul, items) {
    ul.innerHTML = "";
    items.forEach(text => {
        const li = document.createElement("li");
        li.textContent = text;
        ul.appendChild(li);
    });
}

function setCyclePhase(phaseKey) {
    const data = cycleData[phaseKey];
    if (!data) return;
    cycleTitleEl.textContent   = data.title;
    cycleFeelEl.textContent    = data.feel;
    renderList(cycleMistakesEl, data.mistakes);
    renderList(cycleBetterEl,   data.better);
    cycleExampleEl.textContent = data.example;

    document.querySelectorAll("[data-phase]").forEach(el => el.classList.remove("active-phase"));
    const activeCard = document.querySelector(`[data-phase="${phaseKey}"]`);
    if (activeCard) activeCard.classList.add("active-phase");
}

document.querySelectorAll("[data-phase]").forEach(card => {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => setCyclePhase(card.getAttribute("data-phase")));
});


// ===== DCA SIMULATOR =====

// mulberry32: proper seeded PRNG — replaces Math.sin hack
function mulberry32(seed) {
    let t = seed + 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

// Growth scenarios — Bitcoin-convicted, labeled honestly
const DCA_SCENARIOS = [
    { name: "Conservative", annualGrowth: 0.25 },
    { name: "Base Case",    annualGrowth: 0.40 },
    { name: "Bull Case",    annualGrowth: 0.50 }
];

function generateBTCPath(startPrice, months, annualGrowth, baseSeed) {
    let price = startPrice;
    const prices = [];

    for (let i = 0; i < months; i++) {
        // Growth decay: returns slow 5% per year as asset matures
        const year     = Math.floor(i / 12);
        const decay    = 1 / (1 + year * 0.03);
        const adjusted = Math.max(annualGrowth * decay, 0.10);
        const monthly  = Math.pow(1 + adjusted, 1 / 12) - 1;

        // Box-Muller → normal distribution, scaled to 7% monthly stdev
        // Enough wobble to look realistic without destroying returns
        const u1 = mulberry32(baseSeed + i * 13 + 1);
        const u2 = mulberry32(baseSeed + i * 13 + 2);
        const z  = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
        const shock = z * 0.07;

        price *= (1 + monthly) * (1 + shock);
        if (price < startPrice * 0.15) price = startPrice * 0.15;
        prices.push(price);
    }

    return prices;
}


let simulationMode = "optimistic";

async function runDCASimulation(monthly, years) {
    if (!btcPrice) return;

    const months        = years * 12;
    const totalInvested = monthly * months;
    const startPrice    = btcPrice;
    // Seed based only on inputs — no mode variable
    const baseSeed      = monthly * 17 + years * 31 + 7;

    const tableHTML = [];

    DCA_SCENARIOS.forEach(scenario => {
        const path = generateBTCPath(startPrice, months, scenario.annualGrowth, baseSeed);
        let btcHeld = 0;
        const history = [];

        for (let i = 0; i < months; i++) {
            btcHeld += monthly / path[i];
            history.push(btcHeld * path[i]);
        }

        scenario.history = history;
        const finalValue = history[history.length - 1];
        const gain = ((finalValue - totalInvested) / totalInvested) * 100;

        tableHTML.push(`
            <tr>
                <td>${scenario.name}</td>
                <td>$${totalInvested.toLocaleString()}</td>
                <td>$${Math.round(finalValue).toLocaleString()}</td>
                <td>${gain.toFixed(1)}%</td>
            </tr>
        `);
    });

    const base       = DCA_SCENARIOS.find(s => s.name === "Base Case");
    const baseFinal  = base.history[base.history.length - 1];
    const baseReturn = ((baseFinal - totalInvested) / totalInvested) * 100;

    document.getElementById("summaryInvested").textContent = "$" + totalInvested.toLocaleString();
    document.getElementById("summaryBase").textContent     = "$" + Math.round(baseFinal).toLocaleString();
    document.getElementById("summaryReturn").textContent   = baseReturn.toFixed(1) + "%";
    document.getElementById("dcaTableBody").innerHTML      = tableHTML.join("");
    document.getElementById("dcaResultsWrapper").style.display = "block";

    renderChart(DCA_SCENARIOS, months);
}

function renderChart(scenarios, months) {
    const canvas = document.getElementById("dcaChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (dcaChartInstance) dcaChartInstance.destroy();

    dcaChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: Array.from({ length: months }, (_, i) => i + 1),
            datasets: scenarios.map((s, i) => ({
                label: s.name,
                data: s.history,
                borderWidth: i === 1 ? 2.5 : 1.5,
                tension: 0.15,
                pointRadius: 0,
                fill: false,
                borderColor: i === 0 ? "rgba(255,255,255,0.30)" : i === 1 ? "#f7931a" : "#34c759"
            }))
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            scales: {
                x: { grid: { display: false }, ticks: { display: false } },
                y: {
                    grid: { color: "rgba(255,255,255,0.04)" },
                    ticks: { color: "rgba(255,255,255,0.4)", callback: v => "$" + v.toLocaleString() }
                }
            },
            plugins: { legend: { display: true, labels: { color: "rgba(255,255,255,0.5)", font: { size: 11 } } } }
        }
    });
}



// ===== HORIZON + MODE BUTTONS =====

document.querySelectorAll(".horizon-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".horizon-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("yearsInput").value = btn.dataset.years;
    });
});

document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        simulationMode = btn.dataset.mode;
    });
});

document.getElementById("runDCA").addEventListener("click", () => {
    const monthly = parseFloat(document.getElementById("monthlyInput").value);
    const years   = parseInt(document.getElementById("yearsInput").value);
    if (!monthly || !years) return;
    runDCASimulation(monthly, years);
});


// ===== INIT =====
window.addEventListener("load", async () => {
    await loadLiveMarketData();

    document.getElementById("monthlyInput").value = 500;
    document.getElementById("yearsInput").value   = 10;

    document.querySelectorAll(".horizon-btn").forEach(btn => {
        if (btn.dataset.years === "10") btn.classList.add("active");
    });

    await runDCASimulation(500, 10);
});

const cta = document.getElementById("ctaPersonalize");
if (cta) {
    cta.addEventListener("click", () => {
        window.location.href = "pro.html";
    });
}

window.addEventListener("load", () => {
    if (window.location.hash) {
        const target = document.querySelector(window.location.hash);
        if (target) {
            setTimeout(() => {
                target.scrollIntoView({ behavior: "smooth" });
            }, 100);
        }
    }
});

(function () {
    const MAILCHIMP_URL = "https://gmail.us12.list-manage.com/subscribe/post?u=a75a32e60fbdc38daa0588bc5&id=1e183e547c&f_id=009f9ee0f0";
    const SHOW_COUNT = false;
    const FAKE_COUNT = 47;

    const input    = document.getElementById("ecEmail");
    const btn      = document.getElementById("ecSubmit");
    const btnText  = document.getElementById("ecBtnText");
    const spinner  = document.getElementById("ecBtnSpinner");
    const errorEl  = document.getElementById("ecError");
    const formWrap = document.getElementById("ecFormWrap");
    const success  = document.getElementById("ecSuccess");
    const countEl  = document.getElementById("ecCount");

    if (!input || !btn) return;

    if (SHOW_COUNT && countEl) {
        countEl.textContent = `${FAKE_COUNT} people already on the list`;
    }

    if (localStorage.getItem("btcm_signed_up") === "1") {
        showSuccess();
    }

    function setLoading(on) {
        btn.disabled = on;
        btnText.style.display  = on ? "none"  : "inline";
        spinner.style.display  = on ? "inline-block" : "none";
    }

    function showError(msg) {
        errorEl.textContent    = msg;
        errorEl.style.display  = "block";
    }

    function hideError() {
        errorEl.style.display  = "none";
    }

    function showSuccess() {
        formWrap.style.display = "none";
        success.style.display  = "flex";
    }

    function isValidEmail(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
    }

    btn.addEventListener("click", async () => {
        hideError();
        const email = input.value.trim();

        if (!email) {
            showError("Please enter your email address.");
            input.focus();
            return;
        }
        if (!isValidEmail(email)) {
            showError("That doesn't look like a valid email.");
            input.focus();
            return;
        }

        setLoading(true);

        try {
            if (MAILCHIMP_URL) {
                const url = MAILCHIMP_URL
                        .replace("/post?", "/post-json?")
                    + `&EMAIL=${encodeURIComponent(email)}&c=mcCallback`;

                await new Promise((resolve, reject) => {
                    window.mcCallback = (data) => {
                        delete window.mcCallback;
                        if (data.result === "success") resolve();
                        else reject(new Error(data.msg || "Subscription failed."));
                    };
                    const script = document.createElement("script");
                    script.src = url;
                    script.onerror = () => reject(new Error("Network error."));
                    document.body.appendChild(script);
                    setTimeout(() => reject(new Error("Request timed out.")), 8000);
                });
            } else {
                await new Promise(r => setTimeout(r, 600));
            }

            localStorage.setItem("btcm_signed_up", "1");
            showSuccess();

        } catch (err) {
            const clean = (err.message || "Something went wrong.")
                .replace(/<[^>]+>/g, "")
                .replace(/0 - /g, "")
                .trim();
            showError(clean);
            setLoading(false);
        }
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") btn.click();
    });
})();