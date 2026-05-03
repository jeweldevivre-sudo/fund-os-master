import React, { useEffect, useMemo, useState } from "react";

const API_URL =
  (import.meta as any).env?.VITE_API_URL ||
  "https://script.google.com/macros/s/AKfycbwclnL-Qwg5WgcZV2XkU1QkmhF5-dPeDgzFPh-DnnC_e0jIHAIWSHW7daNGhrCcRBHj/exec";

const CATEGORIES = [
  "US Equity",
  "Tech / Growth",
  "Global",
  "Gold / Defensive",
  "Thai",
];

const PALETTE = ["#00d4aa", "#f59e0b", "#3b82f6", "#f43f5e", "#a855f7"];

type SummaryData = {
  status?: string | number;
  dcaBudget?: string | number;
  totalPortfolioValue?: string | number;
  totalValueAfterDCA?: string | number;
  targetGoal?: string | number;
  remaining?: string | number;
  suggestedDCA?: string | number;
  suggestedAction?: string | number;
  currentAge?: string | number;
  retirementAge?: string | number;
  investmentTerm?: string | number;
};

type Holding = {
  type?: string;
  category?: string;
  fundName?: string;
  units?: string | number;
  navCost?: string | number;
  navPrice?: string | number;
  marketValue?: string | number;
  currentPercent?: string | number;
};

type TargetWeight = {
  category?: string;
  targetPercent?: string | number;
};

type BuyOrder = {
  fundName?: string;
  suggestedBuy?: string | number;
};

type ApiData = {
  ok?: boolean;
  meta?: {
    portfolioName?: string;
    lastUpdate?: string;
  };
  summary?: SummaryData;
  holdings?: Holding[];
  targetWeight?: TargetWeight[];
  buyOrders?: BuyOrder[];
  error?: string;
};

type Align = "left" | "right" | "center";
type TabName = "dashboard" | "input";

function num(v: unknown) {
  const n = Number(
    String(v ?? "")
      .replace(/,/g, "")
      .replace("%", "")
      .trim()
  );
  return Number.isFinite(n) ? n : 0;
}

function fmt(v: unknown, digits = 2) {
  return num(v).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function fmtPct(v: unknown) {
  const n = num(v);
  return `${(Math.abs(n) <= 1 ? n * 100 : n).toFixed(2)}%`;
}

function clean(v: unknown) {
  return String(v ?? "").replace(/,/g, "").replace("%", "").trim();
}

function pctInput(v: unknown) {
  const n = num(v);
  return Math.abs(n) <= 1 ? String(n * 100) : String(n);
}

function targetPercentForApi(v: unknown) {
  const n = num(v);
  if (!Number.isFinite(n)) return "";
  return Math.abs(n) <= 1 ? n : n / 100;
}

export default function App() {
  const [data, setData] = useState<ApiData | null>(null);
  const [portfolioName, setPortfolioName] = useState("");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [targetWeight, setTargetWeight] = useState<TargetWeight[]>([]);
  const [summary, setSummary] = useState<SummaryData>({});
  const [activeTab, setActiveTab] = useState<TabName>("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingFund, setLoggingFund] = useState("");
  const [buyAmounts, setBuyAmounts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}?t=${Date.now()}`, {
        cache: "no-store",
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const json: ApiData = await res.json();
      if (json?.ok === false) throw new Error(json.error || "API returned an error");

      setData(json);
      setPortfolioName(json?.meta?.portfolioName || "");
      setSummary(json?.summary || {});
      setHoldings(json?.holdings || []);
      setTargetWeight(
        (json?.targetWeight || []).map((r) => ({
          category: r.category || "",
          targetPercent: pctInput(r.targetPercent),
        }))
      );

      const nextBuyAmounts: Record<string, string> = {};
      (json?.buyOrders || []).forEach((order) => {
        const fundName = String(order.fundName || "").trim();
        if (fundName) nextBuyAmounts[fundName] = String(order.suggestedBuy ?? "");
      });
      setBuyAmounts(nextBuyAmounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function post(body: Record<string, unknown>) {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Save error: ${res.status}`);

    const json = await res.json();
    if (json?.ok === false) throw new Error(json.error || "Save failed");
    return json;
  }

  async function saveAll() {
    setSaving(true);
    setNotice("");
    setError("");

    try {
      await post({ action: "savePortfolioName", portfolioName });

      await post({
        action: "saveSummaryInputs",
        dcaBudget: clean(summary.dcaBudget),
        targetGoal: clean(summary.targetGoal),
        currentAge: clean(summary.currentAge),
        retirementAge: clean(summary.retirementAge),
      });

      await post({
        action: "saveHoldings",
        holdings: holdings.map((h) => ({
          type: h.type || "Tax saving",
          category: h.category || "",
          fundName: h.fundName || "",
          units: clean(h.units),
          navCost: clean(h.navCost),
          navPrice: clean(h.navPrice),
        })),
      });

      await post({
        action: "saveTargetWeight",
        targetWeight: targetWeight.map((t) => ({
          category: t.category || "",
          targetPercent: targetPercentForApi(t.targetPercent),
        })),
      });

      await loadData();
      setNotice("Saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function logDcaBuy(order: BuyOrder) {
    const fundName = String(order.fundName || "").trim();
    const amount = clean(buyAmounts[fundName] ?? order.suggestedBuy);
    if (!fundName || num(amount) <= 0) return;

    setLoggingFund(fundName);
    setNotice("");
    setError("");

    try {
      await post({
        action: "logDcaBuy",
        fundName,
        amount,
      });
      await loadData();
      setNotice(`Logged ${fundName} ฿${fmt(amount)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Log failed");
    } finally {
      setLoggingFund("");
    }
  }

  function updateHolding(index: number, key: keyof Holding, value: string) {
    const next = [...holdings];
    next[index] = { ...next[index], [key]: value };
    setHoldings(next);
  }

  const totalPortfolio = summary.totalPortfolioValue || 0;
  const dcaBudget = summary.dcaBudget || 0;
  const remaining = summary.remaining || 0;

  const donut = useMemo(() => {
    const rows = data?.holdings || [];
    let start = 0;
    const parts = rows.map((r, i) => {
      const pct = num(r.currentPercent) <= 1 ? num(r.currentPercent) * 100 : num(r.currentPercent);
      const end = start + pct;
      const p = `${PALETTE[i % PALETTE.length]} ${start}% ${end}%`;
      start = end;
      return p;
    });
    return parts.length ? `conic-gradient(${parts.join(",")})` : "#1e293b";
  }, [data]);

  if (loading) {
    return (
      <div style={S.root}>
        <Fonts />
        <div style={S.center}>Loading Fund OS…</div>
      </div>
    );
  }

  return (
    <div style={S.root}>
      <Fonts />

      <header style={S.header}>
        <div>
          <div style={S.badge}>RMF FUND OS</div>
          <h1 style={S.title}>Tax Saving Fund Dashboard</h1>
          <p style={S.sub}>A friend for your RMF decision</p>
        </div>

        <div style={S.headerRight}>
          <input
            style={S.input}
            value={portfolioName}
            onChange={(e) => setPortfolioName(e.target.value)}
            placeholder="Portfolio Name"
          />
          <button style={S.btnGhost} onClick={loadData} disabled={saving || !!loggingFund}>
            Refresh
          </button>
          <button style={S.btn} onClick={saveAll} disabled={saving || !!loggingFund}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </header>

      <nav style={S.tabs}>
        <button
          style={activeTab === "dashboard" ? S.tabActive : S.tab}
          onClick={() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>
        <button
          style={activeTab === "input" ? S.tabActive : S.tab}
          onClick={() => setActiveTab("input")}
        >
          Input
        </button>
      </nav>

      {(notice || error) && (
        <div style={error ? S.error : S.notice}>{error || notice}</div>
      )}

      {activeTab === "dashboard" && (
        <main style={S.content}>
          <section style={S.stats}>
            <Stat label="Total Portfolio" value={`฿${fmt(totalPortfolio)}`} />
            <Stat label="DCA Budget" value={`฿${fmt(dcaBudget)}`} />
            <Stat label="Remaining" value={`฿${fmt(remaining)}`} />
            <Stat label="Investment Term" value={`${summary.investmentTerm || 0} years`} />
          </section>

          <section style={S.grid}>
            <div style={S.card}>
              <h2 style={S.cardTitle}>Portfolio Weight</h2>
              <div style={S.donutWrap}>
                <div style={{ ...S.donut, background: donut }}>
                  <div style={S.hole} />
                </div>
              </div>

              {(data?.holdings || []).map((h, i) => (
                <div key={`${h.fundName}-${i}`} style={S.weightRow}>
                  <span>{h.category}</span>
                  <b style={{ color: PALETTE[i % PALETTE.length] }}>{fmtPct(h.currentPercent)}</b>
                </div>
              ))}
            </div>

            <div style={S.card}>
              <h2 style={S.cardTitle}>Portfolio Summary</h2>
              <Summary label="Status" value={summary.status} />
              <Summary label="DCA Budget" value={`฿${fmt(summary.dcaBudget)}`} />
              <Summary label="Total Portfolio Value" value={`฿${fmt(summary.totalPortfolioValue)}`} />
              <Summary label="Total Value After DCA" value={`฿${fmt(summary.totalValueAfterDCA)}`} />
              <Summary label="Target Goal" value={`฿${fmt(summary.targetGoal)}`} />
              <Summary label="Remaining" value={`฿${fmt(summary.remaining)}`} />
              <Summary label="Suggested DCA" value={`฿${fmt(summary.suggestedDCA)}`} />
              <Summary label="Suggested Action" value={summary.suggestedAction} />
              <Summary
                label="Investment Term"
                value={`${summary.investmentTerm || 0} years`}
                hint={`Calculated from your current age to age ${summary.retirementAge || 60}`}
              />
            </div>
          </section>

          <section style={S.card}>
            <div style={S.cardHeaderRow}>
              <div>
                <h2 style={S.cardTitle}>Buy Orders</h2>
                <p style={S.cardHint}>Edit the buy amount if your actual purchase differs, then mark Bought.</p>
              </div>
            </div>
            <table style={S.table}>
              <thead>
                <tr>
                  <Th>Fund Name</Th>
                  <Th align="right">Buy Amount</Th>
                  <Th align="center">Done</Th>
                </tr>
              </thead>
              <tbody>
                {(data?.buyOrders || []).length === 0 && (
                  <tr>
                    <Td>No buy order</Td>
                    <Td align="right">-</Td>
                    <Td align="center">-</Td>
                  </tr>
                )}
                {(data?.buyOrders || []).map((b, i) => (
                  <tr key={`${b.fundName}-${i}`}>
                    <Td>{b.fundName}</Td>
                    <Td align="right">
                      <input
                        style={{ ...S.amountInput, textAlign: "right" }}
                        value={buyAmounts[String(b.fundName || "").trim()] ?? String(b.suggestedBuy ?? "")}
                        onChange={(e) => {
                          const fundName = String(b.fundName || "").trim();
                          setBuyAmounts((prev) => ({ ...prev, [fundName]: e.target.value }));
                        }}
                        disabled={!!loggingFund}
                      />
                    </Td>
                    <Td align="center">
                      <label style={S.checkboxWrap}>
                        <input
                          type="checkbox"
                          style={S.checkbox}
                          disabled={!!loggingFund || num(buyAmounts[String(b.fundName || "").trim()] ?? b.suggestedBuy) <= 0}
                          checked={loggingFund === b.fundName}
                          onChange={(e) => {
                            if (!e.target.checked) return;
                            logDcaBuy(b);
                          }}
                        />
                        <span style={S.checkboxText}>
                          {loggingFund === b.fundName ? "Logging…" : "Bought"}
                        </span>
                      </label>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      )}

      {activeTab === "input" && (
        <main style={S.content}>
          <div style={S.card}>
            <h2 style={S.cardTitle}>Summary Inputs</h2>
            <div style={S.inputGrid}>
              <Input label="DCA Budget" value={summary.dcaBudget} onChange={(v) => setSummary({ ...summary, dcaBudget: v })} />
              <Input label="Target Goal" value={summary.targetGoal} onChange={(v) => setSummary({ ...summary, targetGoal: v })} />
              <Input label="Current Age" value={summary.currentAge} onChange={(v) => setSummary({ ...summary, currentAge: v })} />
              <Input label="Retirement Age" value={summary.retirementAge} onChange={(v) => setSummary({ ...summary, retirementAge: v })} />
            </div>
          </div>

          <div style={S.card}>
            <h2 style={S.cardTitle}>Target Weight</h2>
            <table style={S.table}>
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th align="right">Target %</Th>
                </tr>
              </thead>
              <tbody>
                {targetWeight.map((r, i) => (
                  <tr key={`${r.category}-${i}`}>
                    <Td>
                      <select
                        style={S.select}
                        value={r.category || ""}
                        onChange={(e) => {
                          const next = [...targetWeight];
                          next[i] = { ...next[i], category: e.target.value };
                          setTargetWeight(next);
                        }}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </Td>
                    <Td align="right">
                      <input
                        style={{ ...S.inline, textAlign: "right" }}
                        value={r.targetPercent ?? ""}
                        onChange={(e) => {
                          const next = [...targetWeight];
                          next[i] = { ...next[i], targetPercent: e.target.value };
                          setTargetWeight(next);
                        }}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={S.card}>
            <h2 style={S.cardTitle}>Portfolio Holdings</h2>
            <table style={S.table}>
              <thead>
                <tr>
                  <Th>Type</Th>
                  <Th>Category</Th>
                  <Th>Fund Name</Th>
                  <Th align="right">Units</Th>
                  <Th align="right">NAV Cost</Th>
                  <Th align="right">NAV Price</Th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h, i) => (
                  <tr key={`${h.fundName}-${i}`}>
                    <Td>
                      <input style={S.inline} value={h.type || ""} onChange={(e) => updateHolding(i, "type", e.target.value)} />
                    </Td>
                    <Td>
                      <select style={S.select} value={h.category || ""} onChange={(e) => updateHolding(i, "category", e.target.value)}>
                        <option value="">Select</option>
                        {CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </Td>
                    <Td>
                      <input style={S.inline} value={h.fundName || ""} onChange={(e) => updateHolding(i, "fundName", e.target.value)} />
                    </Td>
                    <Td align="right">
                      <input style={{ ...S.inline, textAlign: "right" }} value={h.units ?? ""} onChange={(e) => updateHolding(i, "units", e.target.value)} />
                    </Td>
                    <Td align="right">
                      <input style={{ ...S.inline, textAlign: "right" }} value={h.navCost ?? ""} onChange={(e) => updateHolding(i, "navCost", e.target.value)} />
                    </Td>
                    <Td align="right">
                      <input style={{ ...S.inline, textAlign: "right" }} value={h.navPrice ?? ""} onChange={(e) => updateHolding(i, "navPrice", e.target.value)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              style={{ ...S.btnGhost, marginTop: 14 }}
              onClick={() =>
                setHoldings([
                  ...holdings,
                  { type: "Tax saving", category: "", fundName: "", units: "", navCost: "", navPrice: "" },
                ])
              }
            >
              Add Fund
            </button>
          </div>
        </main>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={S.stat}>
      <div style={S.statValue}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

function Summary({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div style={S.summaryRow}>
      <div>
        <span style={S.summaryLabel}>{label}</span>
        {hint && <div style={S.hint}>{hint}</div>}
      </div>
      <span style={S.summaryValue}>{value}</span>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: unknown; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      <input style={S.input} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: Align }) {
  return <th style={{ ...S.th, textAlign: align }}>{children}</th>;
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: Align }) {
  return <td style={{ ...S.td, textAlign: align }}>{children}</td>;
}

function Fonts() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');
      * { box-sizing: border-box; }
      body { margin: 0; background: #020817; }
      @media (max-width: 760px) {
        table { min-width: 680px; }
        header { flex-direction: column; align-items: stretch !important; }
      }
    `}</style>
  );
}

const S: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    background: "#020817",
    color: "#e2e8f0",
    fontFamily: "'DM Sans', sans-serif",
  },
  center: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    color: "#64748b",
    fontFamily: "'DM Mono', monospace",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    padding: "18px 24px",
    borderBottom: "1px solid #0f172a",
    background: "rgba(2,8,23,.9)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  headerRight: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  badge: {
    display: "inline-block",
    background: "linear-gradient(135deg,#00d4aa,#0ea5e9)",
    color: "#020817",
    fontFamily: "'Syne', sans-serif",
    fontWeight: 800,
    fontSize: 11,
    letterSpacing: ".14em",
    padding: "5px 10px",
    borderRadius: 6,
  },
  title: {
    margin: "8px 0 0",
    fontFamily: "'Syne', sans-serif",
    fontSize: 22,
  },
  sub: {
    margin: "2px 0 0",
    color: "#475569",
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
  },
  tabs: {
    display: "flex",
    gap: 4,
    padding: "12px 24px 0",
    borderBottom: "1px solid #0f172a",
  },
  tab: {
    background: "transparent",
    color: "#64748b",
    border: 0,
    padding: "10px 16px",
    cursor: "pointer",
    fontWeight: 700,
  },
  tabActive: {
    background: "rgba(0,212,170,.06)",
    color: "#00d4aa",
    border: 0,
    borderBottom: "2px solid #00d4aa",
    padding: "10px 16px",
    cursor: "pointer",
    fontWeight: 700,
  },
  notice: {
    margin: "16px 24px 0",
    padding: "10px 14px",
    border: "1px solid rgba(0,212,170,.35)",
    background: "rgba(0,212,170,.08)",
    color: "#00d4aa",
    borderRadius: 10,
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
  },
  error: {
    margin: "16px 24px 0",
    padding: "10px 14px",
    border: "1px solid rgba(244,63,94,.35)",
    background: "rgba(244,63,94,.08)",
    color: "#fb7185",
    borderRadius: 10,
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
  },
  content: {
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 12,
  },
  stat: {
    background: "#0a1628",
    border: "1px solid #0f172a",
    borderTop: "3px solid #00d4aa",
    borderRadius: 12,
    padding: 16,
  },
  statValue: {
    fontFamily: "'DM Mono', monospace",
    color: "#00d4aa",
    fontSize: 21,
    marginBottom: 5,
  },
  statLabel: {
    color: "#64748b",
    fontSize: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
    gap: 16,
  },
  card: {
    background: "#0a1628",
    border: "1px solid #0f172a",
    borderRadius: 14,
    padding: 18,
    overflowX: "auto",
  },
  cardHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  cardTitle: {
    margin: "0 0 14px",
    fontFamily: "'Syne', sans-serif",
    fontSize: 16,
  },
  cardHint: {
    margin: "-8px 0 14px",
    color: "#64748b",
    fontSize: 12,
    fontFamily: "'DM Mono', monospace",
  },
  donutWrap: {
    height: 170,
    display: "grid",
    placeItems: "center",
  },
  donut: {
    width: 140,
    height: 140,
    borderRadius: "50%",
    position: "relative",
  },
  hole: {
    position: "absolute",
    inset: 38,
    background: "#0a1628",
    borderRadius: "50%",
    border: "1px solid #0f172a",
  },
  weightRow: {
    display: "flex",
    justifyContent: "space-between",
    borderBottom: "1px solid #0f172a",
    padding: "8px 0",
    fontSize: 13,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    padding: "9px 10px",
    background: "rgba(15,23,42,.5)",
    borderRadius: 7,
    marginBottom: 3,
  },
  summaryLabel: {
    color: "#64748b",
    fontSize: 12,
  },
  summaryValue: {
    fontFamily: "'DM Mono', monospace",
    color: "#e2e8f0",
    fontSize: 13,
  },
  hint: {
    marginTop: 3,
    color: "#475569",
    fontSize: 11,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    background: "#0f172a",
    color: "#64748b",
    padding: "10px 12px",
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "9px 12px",
    borderBottom: "1px solid #0f172a",
    color: "#cbd5e1",
    whiteSpace: "nowrap",
  },
  inputGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
    gap: 12,
  },
  label: {
    display: "block",
    color: "#64748b",
    fontSize: 11,
    fontFamily: "'DM Mono', monospace",
    marginBottom: 5,
  },
  input: {
    background: "#0f172a",
    color: "#e2e8f0",
    border: "1px solid #1e293b",
    borderRadius: 8,
    padding: "9px 12px",
    outline: "none",
    fontFamily: "'DM Mono', monospace",
  },
  inline: {
    width: "100%",
    minWidth: 110,
    background: "transparent",
    color: "#e2e8f0",
    border: "1px solid #1e293b",
    borderRadius: 6,
    padding: "6px 8px",
    outline: "none",
    fontFamily: "'DM Mono', monospace",
  },
  select: {
    width: "100%",
    minWidth: 150,
    background: "#0f172a",
    color: "#e2e8f0",
    border: "1px solid #1e293b",
    borderRadius: 6,
    padding: "6px 8px",
    outline: "none",
  },
  btn: {
    background: "linear-gradient(135deg,#00d4aa,#0ea5e9)",
    color: "#020817",
    border: 0,
    borderRadius: 9,
    padding: "9px 16px",
    fontWeight: 800,
    cursor: "pointer",
  },
  btnGhost: {
    background: "transparent",
    color: "#00d4aa",
    border: "1px solid #1e293b",
    borderRadius: 9,
    padding: "9px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  smallBtn: {
    background: "rgba(0,212,170,.1)",
    color: "#00d4aa",
    border: "1px solid rgba(0,212,170,.35)",
    borderRadius: 8,
    padding: "6px 10px",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 12,
  },
};
