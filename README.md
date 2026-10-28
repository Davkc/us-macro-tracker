# US Macro Tracker

A public, static dashboard for US CPI/PPI, Fed funds and mortgage rates, gasoline, GDP, unemployment, and sentiment. Chart.js is loaded from jsDelivr; the browser reads the generated JSON and never calls FRED. The committed data snapshot contains the latest published FRED observations available when it was refreshed. A daily GitHub Actions workflow extends the dataset automatically as new observations are released; each series can have a different latest date because FRED releases them on different schedules. The dashboard anchors its 1Y–10Y ranges to the latest available observation and expands Max as history grows.

## Deploy

This repository is public at https://github.com/Davkc/us-macro-tracker. In Settings → Pages, choose Deploy from a branch, branch main, folder /(root), then Save. The shareable site will be https://davkc.github.io/us-macro-tracker/ after Pages publishes it.

## Refresh FRED data

1. Get a free API key from https://fred.stlouisfed.org/docs/api/api_key.html.
2. Add it as repository secret FRED_API_KEY in Settings → Secrets and variables → Actions.
3. Run Actions → Update FRED data → Run workflow or wait for the daily schedule. The site continues to display the last committed snapshot if a refresh has not run yet.

Run locally with Python 3.10+: install requirements, set FRED_API_KEY, run python scripts/fetch_data.py, then serve the root using python -m http.server 8000.

## Add an indicator

Add one configuration entry in scripts/fetch_data.py with the FRED series ID, label, units, source frequency, aggregation, and direction. Add the key to the chart groups in js/app.js to display it.

## Data and disclaimer

Data source: Federal Reserve Bank of St. Louis FRED. Series are subject to revisions. This dashboard is for information only and is not financial advice; correlation does not imply causation.
