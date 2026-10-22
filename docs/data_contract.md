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

## v1.4 code-only migration (supersedes public snapshot references above)

No runtime dataset, supplier catalog, VIX array, generated report, or market-data fixture is tracked or deployed. Build output is ignored. The old public six-stock report and its generator are retired; all nine baseline models still run in the browser. `simulateSignals(universe, generated, hooks)` is the shared chip/REV portfolio accounting interface. REV hooks manage exit reasons and risk lines, without a second cash/fill ledger.

### REV-MOM imports

Root: `calendar`, `symbols`, `benchmark: {symbol, prices}`, `schema_version: "1.4"`. The calendar must contain every market session, including suspensions. A benchmark must cover the same 21 market closes for RS20. Use compatible price/dividend conventions. The live 0050 ETF benchmark is a proxy, not certified index history.

Each symbol contains `security_id` (permanent identity), `symbol`, `industry`, `prices`, `revenues`, `financials`, and optional `corporate_actions`. Financial industries are excluded. Unknown industries share the unknown sector budget. Revenue records contain `month: YYYY-MM`, positive `revenue`, `scope`, `currency`, `unit`, `comparable: true`, and availability evidence. Exactly 25 consecutive raw months are needed. Different units/currencies/scopes reject the window. Quarter records contain `period: YYYY-Q1..Q4`, `revenue`, `operating_income`, `value_kind: single | cumulative`, the same accounting scope/unit/currency/comparability fields, and availability evidence. Cumulative quarters require the preceding same-year cumulative statement then available.

Records may use `versions: [...]`. Each version carries its own availability and `revision_id`; versions are selected by cutoff, never by latest revision. Multiple observations of a revenue month are merged into one permanent event ID. Event features and the latest four complete announced quarters are frozen at the first eligible d0 cutoff. Missing finance rejects that event and never delays d0. Initial backfills use `event_origin: historical_backfill`.

Strict availability evidence requires `available_from` with timezone, `availability_basis: historical_evidence | observed`, `timestamp_precision: timestamp | date`, `source_timezone: Asia/Taipei`, and `revision_id`. Observed versions require `first_seen_at <= available_from`. Date-only formal evidence uses `available_from: YYYY-MM-DDT23:59:59+08:00` and `date_only_conservative: true`; retain `availability_interval` with the source date bounds. Provider ingestion dates remain `proxy`, regardless of timestamp syntax. `bar_state: final` and nonempty `finality_evidence` are required for strict REV price features, including benchmark closes. Completion must be backed by the source; a date passing is insufficient.

Prices require high/low for M30, and volume for ADV/capacity. IFP5 uses the existing `chip_versions` contract when strict, with five complete sessions. There is no zero imputation. Missing sessions break EMA adjacency and indicator warmup; ATR needs fifteen closes/highs/lows. A missing ATR after entry keeps the prior line. F20 excludes stop management; M30 compares against fixed h30 with the same ATR-complete pool and sorting. Strict fills continue to require opening tradability/limits.

Odd-lot imports must declare `execution_market: TW-odd-lot`, `odd_lot_execution_evidence: true`, and `odd_lot_fee_evidence: true`. Their price opens must be independently sourced odd-lot auction prices, not board-lot opens. Their evidence and fee assumptions must match the selected research settings. Without all these fields, odd-lot orders are rejected. No live odd-lot source is claimed.

### Browser source envelopes and storage

`AtlasData` replies carry schema/request/mode/dataset/revision, normalized request, provenance URL, source_asof, fetched_at, first_seen_at, calendar ID, exchange timezone, adjustment, currency, evidence level, license scope, cache state, and coverage. The revision hashes request semantics plus payload. Mutable query pointers have TTL; immutable observed revisions keep first-seen evidence. Request keys include mode/as_of, permission, source, dataset, symbol, range, adjustment, currency and schema. `latest` and `proxy` do not cross-hit. Historical queries select compatible non-proxy observed snapshots at/before as_of, never network-fallback; unavailable history raises `HISTORICAL_VERSION_UNAVAILABLE`.

IndexedDB is local to this browser/origin. It is not a central archival service. Storage unavailable/quota errors retain session memory only; clearing removes records. A run clones and freezes the selected universe, hashes input and engine/build versions, and exports its source manifests, parameters, seed, event log, order log, fills and ledger. Refreshing a query does not mutate an earlier result.

Live older-date bars remain `provisional`: provider completion is unverified. Proxy research explicitly accepts the prior-exchange-date approximation; strict REV rejects it. `NO_DATA`, `UNSUPPORTED_SYMBOL`, `RATE_LIMITED`, `AUTH_REQUIRED`, `UPSTREAM_UNAVAILABLE`, `STALE`, `PARTIAL`, and `HISTORICAL_VERSION_UNAVAILABLE` are explicit errors. TTL-expired entries are not silently served. Price coverage ending more than fourteen calendar days before requested end is rejected as STALE. Unknown calendar gaps remain unassessed rather than an empty completeness claim; strategy windows validate all sessions against the frozen calendar. Partial source collection cancels the new run; previous results/holdings remain the previous run. No missing symbol is silently dropped from ranks.

### Deferred certification

Formal original publication vintages, complete point-in-time/delisted universe, corporate-action reconciliation, source finality/calendars, cross-device private immutable archival storage, independent odd-lot evidence, financial scope validation, and full preregistered ablations/regime/adoption reports remain incomplete. No G1/G2/G3 adoption approval is implied by passing engineering tests.
