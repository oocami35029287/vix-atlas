# Research import contracts

All imported files stay in the browser. Dates use ISO YYYY-MM-DD. Arrays must be sorted, dates unique, prices positive, and numbers finite. Missing values are `null` or absent, never artificial zeroes.

## Price imports

A JSON object contains `symbol`, `name`, `currency`, `source`, `fetchedAt`, `price_adjustment`, and `prices` with `{date, open, close}`. Optional `high`, `low`, `volume_shares` are retained. VIX mode additionally requires `vix: [{date, close}]`; Bollinger mode does not. Load prices before the requested start to supply indicator warmup. Historical price gaps must be represented in the optional explicit `calendar` if they should count as rejected opens.

## Chip imports

The root contains `schema_version: "1.3"`, `calendar` (all market sessions), `symbols`, `availability_basis`, and evidence flags. Each symbol has `symbol`, `industry`, optional `listed_from` / `listed_to`, `prices`, and optional `corporate_actions`. Price rows contain:

- `date, open, close, volume_shares, value_twd`.
- `foreign_net_shares, trust_net_shares, margin_balance_shares` (all in shares).
- `availability_basis: "observed" | "historical_evidence" | "proxy"`, `available_from` as a timezone-aware timestamp, `revision_id`, and source provenance.
- `tradable`, `trading_status`, `limit_up`, `limit_down` for strict opening fills. Unknown or absent tradability does not constitute fill evidence.

A row can hold `chip_versions: [...]` with versioned chip fields. Each version has its own evidence basis, `available_from`, and revision. At each decision timestamp the engine chooses only a version then available. Do not combine asynchronous source records without setting their availability to the latest necessary source observation. Histories without versions must be explicitly labelled proxy. The public six-stock report uses a proxy model; browser imports use strict execution by default.

120 complete market sessions are required. Windows do not silently compress over missing sessions. The current cross-section is withheld if a required symbol lacks features. No missing margin is interpreted as zero. S1 does not require margin, but requires a finite preceding-60-session institutional z-score. `ADV20_value_twd` and `ADV20_volume_shares` are separate quantities.

Corporate actions:

- `{type: "split", date, ratio}` updates units before that day's open. Feature creation is suspended while a split lies inside the 120-session unconverted window.
- `{type: "dividend", ex_date, paid_date, amount_per_share}` assigns rights to holdings before the ex-date open. Receivables enter equity on ex-date and available cash only on payment. Buyers on the ex-date do not receive the distribution. Closed-trade PnL includes earned entitlements without double counting cash.

Cash ledgers separate `available_cash`, `pending_sale_proceeds`, and `dividend_receivables`. Price-only proxy data with no action history is explicitly not total return. Source data completeness cannot be inferred from merely passing schema validation.

## Outputs and reproducibility

Signals, orders, rejected/cancelled buys, blocked sells, fills, daily cash/positions, closed trades, and censored positions remain distinct. h is measured from actual entry using market sessions, including suspension sessions. Failed purchases are never delayed to a more favorable open. Failed exits retain risk until executable. No same-session replacement or reentry after a sale.

Research manifests include input and engine hashes, code SHA, parameters, calendar and universe identifiers, assumptions, cutoff, time range, and statistical seed. Event research is unconstrained by portfolio capital and is not statistically independent. Portfolio R1 is evaluated against the identical S2 candidate pool; event means over that unchanged pool cannot establish ranking gains.

The public `chip_report.json` contains only derived portfolio curves and aggregate research statistics. It must never contain raw institutional or margin observations. Future adopted signals require historical first-publication evidence, point-in-time universe and action coverage, executable opening conditions, and independent adoption review. Current public gates remain false.
