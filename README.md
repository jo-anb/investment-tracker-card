# Investment Tracker Card
![Investment Tracker](/branding/readme_banner.svg)

A Lovelace dashboard card that displays your investment portfolio with summary totals, asset details, and portfolio management tools. Integrates seamlessly with the Home Assistant `investment_tracker` integration.

![Investment Tracker Card](preview.jpeg)

## Features

- **Portfolio Summary** – View total portfolio value, profit/loss breakdown (realized vs. unrealized), and day-over-day changes
- **Asset Grid** – See all holdings with current price, quantity, allocation percentage, and profit/loss metrics
- **Asset Icons** – Cryptocurrency icons and asset pictures display directly in the asset rows for quick identification
- **Staking Support** – Separate display of staked crypto holdings vs. regular quantities
- **Plan Tracking** – Manage recurring investments, targets, and allocations directly from the card
- **Quick Actions** – Refresh portfolio data, refresh individual assets, and manage asset mappings without leaving the dashboard
- **Filtering & Sorting** – Filter assets by category, sector, or currency; sort by value, profit/loss, or other metrics
- **Unmapped Asset Indicators** – Easily identify assets that need ticker mapping to market data providers
- **Chart Visualizations** – View historical portfolio performance and asset allocation charts

## Installation (HACS)
1. Install [HACS](https://hacs.xyz/) in your Home Assistant instance if you haven't already
2. Open **HACS** → **Frontend** → **Explore & Download Repositories**
3. Search for **Investment Tracker Card** and click it
4. Click **Download** and confirm
5. **Reload Lovelace** (Settings → Dashboards → top-right menu → Reload Resources)
6. Add the card to your dashboard

## Manual Installation
1. Download `dist/investment-tracker-card.js` from the [latest release](https://github.com/jo-anb/investment-tracker-card/releases)
2. Place it in your Home Assistant `config/www/` directory
3. Add the JavaScript resource to your dashboard:
   ```yaml
   resources:
     - url: /local/investment-tracker-card.js
       type: module
   ```
4. Add `custom:investment-tracker-card` to your dashboard

## Getting Started

### Prerequisites
- Home Assistant with the [`investment_tracker` integration](https://github.com/jo-anb/investment-tracker) installed and configured
- At least one portfolio/broker configured in the integration

### Basic Configuration
```yaml
type: custom:investment-tracker-card
title: Investment Tracker
default_service_entity: sensor.investment_tracker_degiro
```

### Full Configuration Example
```yaml
type: custom:investment-tracker-card
title: My Portfolio
default_service_entity: sensor.investment_tracker_degiro
show_header: true
show_positions: true
show_refresh: true
show_asset_refresh: false
show_charts: true
show_plan: true
hide_unmapped: false
```

## Configuration Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | - | Card title displayed at the top |
| `default_service_entity` | string | **required** | The investment tracker service entity (e.g., `sensor.investment_tracker_degiro`) |
| `show_header` | bool | `true` | Display portfolio summary (total value, profit/loss, allocations) |
| `show_positions` | bool | `true` | Display the list of individual assets/holdings |
| `show_refresh` | bool | `true` | Show main refresh button to update all portfolio data |
| `show_asset_refresh` | bool | `false` | Show individual refresh buttons for each asset |
| `show_charts` | bool | `true` | Display portfolio performance and allocation charts |
| `show_plan` | bool | `true` | Show investment plan section for recurring investments |
| `hide_unmapped` | bool | `false` | Hide assets that haven't been mapped to market data providers |

## How It Works

The card reads data directly from your Home Assistant `investment_tracker` integration:
- **Portfolio totals** come from the main service sensor (e.g., `sensor.investment_tracker_degiro`)
- **Individual assets** are fetched from asset sensors created by the integration
- **Market prices** are pulled from your configured provider (Yahoo Finance, Stooq, etc.)
- **Historical data** powers the charts and trend analysis

All calculation and aggregation happens in Home Assistant, so the card simply displays the real-time data from the integration.

## Managing Assets

### Mapping Unmapped Assets
If an asset shows as "unmapped" (link icon in red), you can fix it:
1. Click the asset row to open details
2. Click the link icon to open the mapping dialog
3. Search for the correct ticker symbol
4. Confirmation updates the integration's mapping

### Refreshing Data
- Use the **Refresh** button to update all portfolio data
- Use **per-asset refresh** buttons (if enabled) to update individual prices
- The card automatically updates based on your configured refresh interval in the integration

### Staking & Cryptocurrency
For staked cryptocurrencies, the card displays:
- **Regular quantity** – Your active holdings
- **Staked quantity** – Labeled separately in orange to distinguish from holdings

## Troubleshooting

### Entities Not Appearing
- Ensure the `investment_tracker` integration is set up and running
- Check that you've selected the correct `default_service_entity` in the card config
- Reload the dashboard (Settings → Dashboards → Reload Resources)

### No Market Prices Showing
- Check that the integration's market data provider is configured (Yahoo, Stooq, Alpha Vantage)
- Verify internet connectivity to the price provider
- Check Home Assistant logs for any API errors

### Unmapped Assets
- Click the asset and use the "Remap Symbol" feature to match tickers correctly
- The integration includes a "Repair Asset Mapping" flow in Settings → System → Repairs

## Support & Contributions

Found a bug or have a feature request? Open an issue on [GitHub](https://github.com/jo-anb/investment-tracker-card/issues).

Want to contribute? See [DEVELOPMENT.md](./DEVELOPMENT.md) for setup instructions.
