## Investment Tracker Card

Minimal Lovelace card (skeleton) for the Investment Tracker integration.

### Installation (HACS)
- Add this repository as a custom card.
- Reload Lovelace.

### Usage
Add to your dashboard:

- type: custom:investment-tracker-card
	title: Investment Tracker
	broker: degiro
	show_header: true
	show_positions: true
	hide_unmapped: false
	show_refresh: true
	show_asset_refresh: true

### Notes
- Reads totals from `sensor.{broker}_investment_*` entities.
- Positions are taken from entities starting with `sensor.*_assets_*`.
- `show_refresh` adds a button that calls `investment_tracker.refresh`.
- `show_asset_refresh` adds a per‑asset refresh button that calls `investment_tracker.refresh_asset` with the asset symbol.
- When `show_asset_refresh` is enabled, a header input lets you refresh a specific symbol on demand.
