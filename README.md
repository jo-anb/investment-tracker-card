# Investment Tracker Card
![Investment Tracker](../branding/readme_banner.svg)

A Lovelace dashboard card that mirrors the Home Assistant `investment_tracker` integration, providing summary totals, asset grids, and service controls with plan tracking baked in.

## Installation (HACS)
1. Install HACS into your Home Assistant instance (if not already installed).
2. Open HACS → Frontend → Add a new repository.
3. Paste `https://github.com/jo-anb/investment-tracker-card`, choose **Card**, and hit **Install**.
4. Reload Lovelace or refresh your browser so the new card definition registers.
5. Add the card to your dashboard using a manual configuration or the Lovelace card picker.


## Features
- Header totals surface `total_value`, `total_profit_loss`, and realized/unrealized splits with day-change comparison.
- Asset list renders price, quantity, allocation, profit/loss (absolute and percent), and plan stickiness.
- Built-in plan editor lets you call `investment_tracker.update_plan` to keep recurring investments, targets, and allocations synced with the service sensor.
- Optional refresh controls expose `investment_tracker.refresh` and `investment_tracker.refresh_asset` directly from the card.
- Supports unmapped asset indicators and manual remapping via service buttons (same helpers as the main integration).

![Investment Tracker Dashboard](preview.jpeg)

## Usage
```yaml
- type: custom:investment-tracker-card
  title: Investment Tracker
  broker: degiro
  show_header: true
  show_positions: true
  hide_unmapped: false
  show_refresh: true
  show_asset_refresh: true
```

### Configuration options
| Option | Type | Description |
| --- | --- | --- |
| `broker` | string | Required. The broker slug exposed by the service sensor (e.g., `degiro`). |
| `show_header` | bool | Toggles the totals panel at the top of the card. |
| `show_positions` | bool | Displays each asset (value + profit/loss). |
| `hide_unmapped` | bool | Hides unmapped assets from the list. |
| `show_refresh` | bool | Adds the main refresh button that triggers `investment_tracker.refresh`. |
| `show_asset_refresh` | bool | Adds per-asset refresh buttons calling `investment_tracker.refresh_asset` with `symbol`. |
| `plan_mode` | string | Optional plan view variant (`simple` or `detailed`). |

## Notes
- The card reads from `sensor.{broker}_service`, `sensor.{broker}_investment_*`, and asset sensors starting with `sensor.{broker}_assets_`.
- Make sure the companion integration is configured and successfully reporting balances before adding the card.
- You can call the service `investment_tracker.remap_symbol` (or use the repair flows) to fix ticker mismatches that appear in the card.

## Development
- Run `npm install` before building or packaging the card.
- The source lives under `investment-tracker-card/src/` and compiles down to `dist/investment-tracker-card.js`.
- Pull the latest `investment-tracker` integration changes when adjusting API contracts or sensor names.

Contributions, bug reports, and design ideas welcome via [GitHub issues](https://github.com/jo-anb/investment-tracker-card/issues).
