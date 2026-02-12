const SETTINGS_FIELDS = [
  { key: "show_asset_refresh", label: "Toon asset refresh-knop" },
  { key: "show_header", label: "Toon header" },
  { key: "show_positions", label: "Toon posities" },
  { key: "hide_unmapped", label: "Verberg niet-gemapte assets" },
  { key: "show_refresh", label: "Toon refresh-knop" },
  { key: "show_charts", label: "Toon charts" },
  { key: "show_plan", label: "Toon investeringsplan" },
];

const PLAN_FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

/* Investment Tracker Card (skeleton) */
class InvestmentTrackerCard extends HTMLElement {
  _assetListScroll = 0;
  _historyRange = "1D";
  _historyRanges = ["1D", "1W", "1M", "3M", "1Y", "ALL"];
  _selectedAssetEntityId = null;
  _selectedAssetName = null;
  _portfolioEntityId = null;
  _apexChart = null;
  _apexLoadPromise = null;
  _pendingApexRender = null;
  _remapDialogToken = null;
  _historyDialog = null;
  _dayChangeCache = {};
  _dayChangeUpdated = {};
  _dayChangeRequestTokens = {};
  _dayChangeStatus = {};
  _dayChangeStartTimes = {};
  _assetSearchTerm = "";
  _assetBrokerFilter = "";
  _assetSortKey = "value";
  _assetSortDirection = "desc";
  _assetSortPopupVisible = false;
  _assetPriceSnapshots = {};
  _assetSearchTimer = null;
  _pendingAssetSearchFocus = null;
  _preservedAssetSearchInput = null;
  _assetFiltersOpen = false;
  _settingsDialog = null;
  _planEditorOverlay = null;
  _planEditorEntries = [];
  _planEditorServiceEntryId = null;
  _planEditorBroker = null;
  _planEditorSaving = false;
  _planEditorTargetInput = null;
  _planEditorFrequencyInput = null;
  _planEditorAssetInput = null;
  _planEditorAssetAmountInput = null;
  _planEditorEntryList = null;
  _planEditorStatusContainer = null;
  _planEditorSaveButton = null;
  setConfig(config) {
    this.config = {
      title: "Investment Tracker",
      subtitle: "Your portfolio, your way.",
      show_header: true,
      show_positions: true,
      hide_unmapped: false,
      show_refresh: true,
      show_asset_refresh: true,
      show_charts: true,
      show_plan: true,
      service_entity: null,
      broker: null,
      default_service_entity: null, // Nieuw: default service entity
      ...config,
    };
    this._assetListScroll = 0; // Track the scroll position globally
  }

  _loadDayChangeRest(entityId, startIso, requestToken) {
    if (!entityId || !this._hass?.callApi) return;
    const path = `history/period/${encodeURIComponent(startIso)}?filter_entity_id=${encodeURIComponent(entityId)}&minimal_response=1`;
    this._hass
      .callApi("GET", path)
      .then((response) => {
        if (this._dayChangeRequestTokens?.[entityId] !== requestToken) return;
        this._dayChangeStatus[entityId] = "ready";
        this._handleDayChangeResponse(entityId, response?.[0] || []);
      })
      .catch((err) => {
        if (this._dayChangeRequestTokens?.[entityId] !== requestToken) return;
        this._dayChangeStatus[entityId] = "error";
        console.warn("Investment Tracker card: day change REST fetch failed", err);
        this._render();
      });
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.content) {
      this.innerHTML = `
        <ha-card>
          <div class="card-content" id="content"></div>
        </ha-card>
      `;
      this.content = this.querySelector("#content");
    }
    this._render();
  }

  _render() {
    if (!this._hass) return;

    if (this.content) {
      this._captureAssetSearchFocus();
    }

    const previousAssetList = this.content?.querySelector(".asset-rows");
    if (previousAssetList) {
      this._assetListScroll = previousAssetList.scrollTop;
    }

    const serviceEntities = this._getServiceEntities();
    const serviceEntity = this._getServiceEntity(serviceEntities);
    const serviceState = serviceEntity ? this._hass.states[serviceEntity] : null;
    const brokerName = (serviceState?.attributes?.broker_name || this.config.broker || "").toString();
    const brokerSlug = this._slugify(brokerName || "investment");
    const serviceBrokerNames = this._getServiceBrokerNames(serviceState, brokerName);
    const serviceBrokerSlugs = serviceBrokerNames.map((name) => this._slugify(name || "investment"));

    const totalValueEntityId = this._findTotalEntityId(brokerSlug, "total_value");
    const totalInvestedEntityId = this._findTotalEntityId(brokerSlug, "total_invested");
    const totalPLEntityId = this._findTotalEntityId(brokerSlug, "total_profit_loss");
    const totalPLPctEntityId = this._findTotalEntityId(brokerSlug, "total_profit_loss_pct");
    const totalActiveInvestedEntityId = this._findTotalEntityId(brokerSlug, "total_active_invested");
    const totalPLRealizedEntityId = this._findTotalEntityId(brokerSlug, "total_realized_profit_loss");
    const totalPLUnrealizedEntityId = this._findTotalEntityId(brokerSlug, "total_unrealized_profit_loss");

    const portfolioCurrency = this._getUnit(totalValueEntityId);
    const portfolioSymbol = this._getCurrencySymbol(portfolioCurrency);
    this._ensureDayChange(totalValueEntityId);
    const dayChangeInfo = this._dayChangeCache?.[totalValueEntityId];
    const dayChangeValue = dayChangeInfo?.value;
    const dayChangePct = dayChangeInfo?.pct;
    const hasDayChange = Number.isFinite(dayChangeValue);
    const displayedDayChangeValue = hasDayChange ? dayChangeValue : 0;
    const displayedDayChangePct = Number.isFinite(dayChangePct) ? dayChangePct : 0;
    const dayChangeClass = displayedDayChangeValue > 0
      ? "positive"
      : displayedDayChangeValue < 0
      ? "negative"
      : "muted";
    const dayChangeDisplay = `${displayedDayChangeValue > 0 ? "+" : displayedDayChangeValue < 0 ? "-" : ""}${portfolioSymbol}${this._formatNumber(
      Math.abs(displayedDayChangeValue)
    )}`;
    const dayChangePctDisplay = `${displayedDayChangePct >= 0 ? "+" : "-"}${this._formatNumber(Math.abs(displayedDayChangePct))}%`;
    const dayChangeFoot = `<div class="metric-foot">${dayChangePctDisplay} today</div>`;
    const totalValueNumber = this._getStateNumber(totalValueEntityId);
    const totalInvestedNumber = this._getStateNumber(totalInvestedEntityId);
    const totalPLNumber = this._getStateNumber(totalPLEntityId);
    const totalPLPctNumberSensor = this._getStateNumber(totalPLPctEntityId);
    let totalPLPctComputed = NaN;
    if (totalInvestedNumber) {
      totalPLPctComputed = (totalPLNumber / totalInvestedNumber) * 100;
    } else if (Number.isFinite(totalPLPctNumberSensor)) {
      totalPLPctComputed = totalPLPctNumberSensor;
    }
    const totalValue = this._formatNumber(totalValueNumber);
    const totalInvested = this._formatNumber(totalInvestedNumber);
    const totalPL = this._formatNumber(totalPLNumber);
    const totalPLPct = this._formatNumber(totalPLPctComputed);
    const totalActiveInvestedValue = this._getStateNumber(totalActiveInvestedEntityId);
    const totalActiveInvested = this._formatNumber(totalActiveInvestedValue);
    const totalPLRealizedValue = this._getStateNumber(totalPLRealizedEntityId);
    const totalPLUnrealizedValue = this._getStateNumber(totalPLUnrealizedEntityId);
    const totalPLRealized = this._formatNumber(totalPLRealizedValue);
    const totalPLUnrealized = this._formatNumber(totalPLUnrealizedValue);
    const totalActiveInvestedFoot = totalActiveInvestedEntityId
      ? `<div class="metric-foot">Active Invested: ${portfolioSymbol}${totalActiveInvested}</div>`
      : "";
    const realizedClass = totalPLRealizedValue > 0 ? "positive" : totalPLRealizedValue < 0 ? "negative" : "muted";
    const unrealizedClass = totalPLUnrealizedValue > 0 ? "positive" : totalPLUnrealizedValue < 0 ? "negative" : "muted";

    const refreshButton = this.config.show_refresh
      ? `<div class="actions"><button class="refresh-btn" id="refresh">Refresh</button></div>`
      : "";

    const quickRefresh = this.config.show_asset_refresh
      ? `
        <div class="asset-refresh-inline">
          <input id="asset-symbol" placeholder="Symbol (e.g. NVDA)" />
          <button class="asset-refresh-btn" id="refresh-asset">Refresh asset</button>
        </div>
      `
      : "";

    const assetStates = this._getAssets(serviceBrokerSlugs, serviceBrokerNames);
    const assetBrokerOptions = this._getAssetBrokerOptions(assetStates);
    const displayAssets = this._applyAssetFilters(assetStates);
    const summaryAssets = this._selectedAssetEntityId
      ? displayAssets.filter((asset) => asset.entity_id === this._selectedAssetEntityId)
      : displayAssets;
    const selectedAssetState = this._selectedAssetEntityId
      ? displayAssets.find((asset) => asset.entity_id === this._selectedAssetEntityId) || null
      : null;
    const selectedHasPrice = Number.isFinite(Number(selectedAssetState?.attributes?.current_price ?? NaN));
    const selectedCurrencySymbol = selectedAssetState
      ? this._getCurrencySymbol(selectedAssetState.attributes?.currency || "") || portfolioSymbol
      : portfolioSymbol;
    const selectedPriceRaw = Number(selectedAssetState?.attributes?.current_price ?? NaN);
    const selectedPriceText = selectedHasPrice
      ? `${selectedCurrencySymbol}${this._formatNumber(selectedPriceRaw)}`
      : "-";
    const brokers = Array.from(new Set(displayAssets.map((asset) => asset.attributes?.broker).filter(Boolean)));
    const assetCount = displayAssets.length;
    const brokerCount = brokers.length || (brokerName ? 1 : 0);
    const portfolioName = serviceState?.attributes?.friendly_name || serviceState?.attributes?.name || serviceState?.state || brokerName || this.config.title;

    const header = this.config.show_header
      ? `
        <div class="header">
          <div class="title-row">
            <div class="title-block">
              <div class="title">${this.config.title}</div>
              <div class="subtitle">${this.config.subtitle}</div>
            </div>
            <div class="header-actions">
              ${refreshButton}
              <button class="settings-btn" title="Settings">⚙</button>
            </div>
          </div>
          ${quickRefresh}
          <div class="portfolio-row">
            <div class="portfolio-info">
              <div class="portfolio-label">Portfolio</div>
              <div class="portfolio-name">${portfolioName}</div>
            </div>
            <div class="portfolio-select">
              ${this._renderPortfolioSelect(serviceEntities, serviceEntity)}
            </div>
            <div class="portfolio-metrics">
              <div class="metric"><span>Assets</span><strong>${assetCount}</strong></div>
              <div class="metric"><span>Brokers</span><strong>${brokerCount}</strong></div>
            </div>
          </div>
          <div class="metrics-row">
            <div class="metric-card">
              <div class="metric-title">Total Value</div>
              <div class="metric-value">${portfolioSymbol}${totalValue}</div>
            </div>
            <div class="metric-card">
              <div class="metric-title">Day Change</div>
              <div class="metric-value ${dayChangeClass}">${dayChangeDisplay}</div>
              ${dayChangeFoot}
            </div>
            <div class="metric-card">
              <div class="metric-title">Total Return</div>
              <div class="metric-value">${portfolioSymbol}${totalPL} <span class="metric-sub">(${totalPLPct}%)</span></div>
              <div class="metric-foot">Invested: ${portfolioSymbol}${totalInvested}</div>
              ${totalActiveInvestedFoot}
              <div class="metric-foot metric-foot-split">
                <span class="metric-foot-label">Realized:</span>
                <span class="metric-foot-value ${realizedClass}">${portfolioSymbol}${totalPLRealized}</span>
                <span class="metric-foot-label">Unrealized:</span>
                <span class="metric-foot-value ${unrealizedClass}">${portfolioSymbol}${totalPLUnrealized}</span>
              </div>
            </div>
          </div>
        </div>
      `
      : "";

    const positions = this.config.show_positions ? this._renderPositions(displayAssets, portfolioSymbol, brokerName, assetBrokerOptions) : "";
    const chartsEnabled = this.config.show_charts && totalValueEntityId;
    this._portfolioEntityId = totalValueEntityId;
    const activeChartEntity = chartsEnabled ? (this._selectedAssetEntityId || totalValueEntityId) : null;
    if (activeChartEntity) {
      this._loadHistory(activeChartEntity, { range: this._historyRange });
    } else {
      this._destroyApexChart();
    }
    const selectedTrend = selectedAssetState
      ? this._assetPriceSnapshots?.[this._selectedAssetEntityId]?.trend
      : null;
    const selectedTrendIcon = selectedTrend === "up"
      ? `<span class="chart-title-price-move chart-title-price-move-up" aria-hidden="true">↑</span>`
      : selectedTrend === "down"
      ? `<span class="chart-title-price-move chart-title-price-move-down" aria-hidden="true">↓</span>`
      : "";
    const selectedPriceSection = selectedHasPrice
      ? `<span class="chart-title-sub">${selectedPriceText}${selectedTrendIcon ? ` ${selectedTrendIcon}` : ""}</span>`
      : "";
    const chartTitle = this._selectedAssetName
      ? `<span class="chart-title-main">Portfolio - ${this._escapeHtml(this._selectedAssetName)}</span>${selectedPriceSection}`
      : "Portfolio";
    const charts = this.config.show_charts
      ? `
        <div class="charts">
          <div class="chart-card">
            <div class="card-title">${chartTitle}</div>
              ${this._renderPortfolioChart(activeChartEntity, portfolioSymbol)}
            <div class="chart-range">
              ${this._renderRangeButtons()}
            </div>
          </div>
        </div>
      `
      : "";

    const plan = this.config.show_plan ? this._renderPlan(serviceState, portfolioSymbol, assetStates) : "";
    const currency = this._renderCurrencyDistribution(summaryAssets, portfolioSymbol);
    const allocation = this._renderAssetAllocation(summaryAssets);
    const sectorAllocation = this._renderSectorAllocation(summaryAssets);

    this.content.innerHTML = `
      <style>
        .header { display: flex; flex-direction: column; gap: 12px; }
        .title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .title { font-size: 20px; font-weight: 600; }
        .subtitle { font-size: 13px; opacity: 0.6; }
        .header-actions { display: flex; align-items: center; gap: 8px; }
        .actions { display: inline-flex; }
        .refresh-btn, .asset-refresh-btn, .settings-btn { background: var(--secondary-background-color, #f5f5f5); border: 0; border-radius: 8px; padding: 6px 10px; cursor: pointer; }
        .asset-refresh-inline { display: flex; gap: 8px; }
        .asset-refresh-inline input { flex: 1; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--divider-color, #ddd); }
        .portfolio-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--divider-color, #ddd); border-bottom: 1px solid var(--divider-color, #ddd); }
        .portfolio-label { font-size: 12px; opacity: 0.6; }
        .portfolio-name { font-size: 16px; font-weight: 600; }
        .portfolio-select select { padding: 6px 8px; border-radius: 8px; border: 1px solid var(--divider-color, #ddd); background: var(--card-background-color, #fff); }
        .portfolio-metrics { display: flex; gap: 16px; }
        .portfolio-metrics .metric { display: flex; flex-direction: column; align-items: flex-end; font-size: 12px; }
        .portfolio-metrics strong { font-size: 16px; }
        .metrics-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .metric-card { background: var(--secondary-background-color, #f7f9fc); border-radius: 12px; padding: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
        .metric-title { font-size: 12px; opacity: 0.6; }
        .metric-value { font-size: 18px; font-weight: 600; }
        .metric-sub { font-size: 12px; opacity: 0.7; }
        .metric-foot { font-size: 12px; opacity: 0.6; margin-top: 6px; }
        .metric-foot-split { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 6px; }
        .metric-foot-label { font-size: 11px; opacity: 0.7; margin-right: 2px; }
        .metric-foot-value { font-size: 12px; font-weight: 600; margin-right: 10px; }
        .muted { color: var(--disabled-text-color, #9ca3af); }
        .layout { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; margin-top: 16px; align-items: stretch; }
        .asset-list { grid-column: span 4; background: var(--secondary-background-color, #f7f9fc); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; min-height: 365px; max-height: 365px; overflow: hidden; }
        .asset-list-header { display: flex; flex-direction: column; gap: 8px; }
        .asset-rows { flex: 1; overflow: auto; margin-top: 8px; display: flex; flex-direction: column; }
        .assets-header { font-weight: 600; margin-bottom: 8px; }
        .asset-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--divider-color, #ddd); cursor: pointer; transition: background 0.2s ease; gap: 12px; }
        .asset-row:last-child { border-bottom: 0; }
        .asset-row.selected { background: color-mix(in srgb, var(--primary-color, #1976d2) 90%, #fff); }
        .asset-filters { color: #0f172a; border-radius: 12px; background: var(--card-background-color, #fff); border: 1px solid rgba(15, 23, 42, 0.08); padding: 10px 14px; box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08); display: flex; flex-direction: column; gap: 8px; }
        .asset-filter-group { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
        .asset-filter { display: flex; flex-direction: column; gap: 4px; min-width: 180px; flex: 1; }
        .asset-filter span { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.85; color: #fff; font-weight: 600; }
        .asset-filter input, .asset-filter select { border-radius: 8px; border: 1px solid rgba(15, 23, 42, 0.25); padding: 8px 10px; background: rgba(255,255,255,0.98); font-size: 14px; color: #0f172a; font-weight: 600; }
        .asset-filters-header { display: flex; justify-content: flex-end; }
        .asset-filter-toggle { border: 0; background: rgba(15, 23, 42, 0.08); color: #fff; border-radius: 24px; padding: 4px 12px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; transition: background 0.2s ease; }
        .asset-filter-toggle ha-icon { color: #fff; }
        .asset-filter-toggle:hover { background: rgba(15, 23, 42, 0.15); }
        .asset-filter-body { display: flex; flex-direction: column; gap: 6px; }
        .asset-filter-body.collapsed { display: none; }
        .asset-filter input::placeholder { color: rgba(15, 23, 42, 0.35); }
        .asset-sort-control { position: relative; display: flex; align-items: center; gap: 6px; }
        #asset-sort-button { border: 1px solid rgba(15, 23, 42, 0.2); background: #0f172a; color: #fff; border-radius: 10px; padding: 6px 14px; display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
        #asset-sort-button .asset-sort-icon { font-size: 14px; }
        #asset-sort-button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
        .asset-sort-popup { position: absolute; top: 42px; right: 0; background: #fff; border-radius: 10px; border: 1px solid rgba(15, 23, 42, 0.2); box-shadow: 0 10px 30px rgba(15, 23, 42, 0.15); padding: 6px; min-width: 160px; display: none; flex-direction: column; gap: 4px; z-index: 10; }
        .asset-sort-popup.open { display: flex; }
        .asset-sort-option { border: none; background: transparent; padding: 6px 10px; border-radius: 6px; text-align: left; font-size: 13px; color: #0b1221; cursor: pointer; }
        .asset-sort-option:hover, .asset-sort-option[data-selected="true"] { background: rgba(59, 130, 246, 0.15); }
        #asset-sort-direction { border: none; background: rgba(15, 23, 42, 0.08); border-radius: 50%; width: 34px; height: 34px; font-size: 18px; color: var(--primary-text-color, #111); cursor: pointer; }
        .asset-empty { padding: 16px 8px; font-size: 13px; opacity: 0.7; }
        .asset-info { display: flex; flex-direction: column; gap: 4px; flex: 1 1 auto; min-width: 0; }
        .asset-name-row { display: flex; align-items: flex-start; gap: 8px; }
        .asset-name { font-weight: 600; }
        .asset-link-button { border: 0; background: transparent; width: 14px; height: 14px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; padding: 4px; cursor: pointer; transition: background 0.2s ease, color 0.2s ease; align-self: flex-start; margin-left: 2px; }
        .asset-link-button:hover { background: rgba(0, 0, 0, 0.04); }
        .asset-link-button.mapped { color: var(--primary-color, #1976d2); }
        .asset-link-button.unmapped { color: var(--error-color, #e53935); }
        .asset-link-button ha-icon { width: 10px; height: 10px; }
        .asset-history-button { border: 0; background: transparent; width: 14px; height: 14px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; transition: background 0.2s ease, color 0.2s ease; color: var(--secondary-text-color, #6b7280); align-self: flex-start; }
        .asset-history-button:hover { background: rgba(0, 0, 0, 0.04); }
        .asset-history-button ha-icon { width: 10px; height: 10px; }
        .asset-meta { font-size: 12px; opacity: 0.6; }
        .asset-stats { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; min-width: 110px; }
        .asset-price { font-size: 13px; color: var(--primary-text-color, #111); display:flex; align-items:center; gap:6px; }
        .asset-value { font-weight: 600; text-align: right; }
        .asset-pl { font-size: 12px; text-align: right; }
        .positive { color: var(--success-color, #4caf50); }
        .negative { color: var(--error-color, #e53935); }
        .asset-price-move { display:inline-flex; align-items:center; justify-content:center; font-size:14px; line-height:1; font-weight:600; width:18px; }
        .asset-price-move-up { color: var(--success-color, #4caf50); }
        .asset-price-move-down { color: var(--error-color, #e53935); }
        .charts { grid-column: span 8; }
        .chart-card { background: var(--secondary-background-color, #f7f9fc); border-radius: 12px; padding: 12px; min-height: 320px; display: flex; flex-direction: column; gap: 12px; }
        .chart-card .card-title { font-weight: 600; display: flex; flex-direction: column; gap: 6px; }
        .chart-card .chart-title-main { font-size: 16px; }
        .chart-card .chart-title-sub { font-size: 13px; color: var(--secondary-text-color, #6b7280); display: flex; align-items: center; gap: 6px; font-weight: 500; }
        .chart-title-price-move { font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; width: 18px; }
        .chart-title-price-move-up { color: var(--success-color, #4caf50); }
        .chart-title-price-move-down { color: var(--error-color, #e53935); }
        .card-title { font-weight: 600; }
        .chart-placeholder { flex: 1; display: flex; align-items: center; justify-content: center; opacity: 0.5; }
        .apex-chart { width: 100%; height: 240px; position: relative; }
        .chart-message { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--secondary-text-color, #6b7280); }
        .bar-list { display: flex; flex-direction: column; gap: 8px; }
        .bar-row { display: grid; grid-template-columns: 1fr 60px; gap: 8px; align-items: center; }
        .bar-label { font-size: 12px; }
        .bar-track { height: 8px; background: rgba(0,0,0,0.08); border-radius: 999px; overflow: hidden; }
        .bar-fill { height: 100%; background: var(--accent-color, #41bdf5); }
        .bar-value { font-size: 12px; text-align: right; }
        .chart-range { display: flex; gap: 6px; flex-wrap: wrap; }
        .chart-range button { background: transparent; border: 1px solid var(--divider-color, #ddd); border-radius: 999px; padding: 4px 10px; font-size: 12px; }
        .chart-range button.active { background: var(--primary-color, #1976d2); color: #fff; border-color: var(--primary-color, #1976d2); }
        .split-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-top: 16px; }
        .pie-card { background: var(--secondary-background-color, #f7f9fc); border-radius: 12px; padding: 12px; min-height: 180px; display: flex; flex-direction: column; gap: 8px; }
        .legend { display: flex; flex-direction: column; gap: 6px; }
        .legend-row { display: grid; grid-template-columns: 1fr 48px; gap: 8px; align-items: center; font-size: 12px; }
        .legend-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-color, #41bdf5); display: inline-block; margin-right: 6px; }
        .plan-card { margin-top: 16px; background: var(--secondary-background-color, #f7f9fc); border-radius: 12px; padding: 12px; }
        .plan-card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 6px; }
        .plan-card-edit { background: transparent; border: 1px solid rgba(15, 23, 42, 0.2); color: var(--primary-text-color, #111); border-radius: 999px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
        .plan-card-edit:disabled { opacity: 0.5; cursor: not-allowed; }
        .plan-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .plan-metric { display: flex; flex-direction: column; gap: 4px; }
        .plan-label { font-size: 12px; opacity: 0.6; }
        .progress { height: 10px; background: rgba(0,0,0,0.08); border-radius: 999px; overflow: hidden; margin: 12px 0; }
        .progress-bar { height: 100%; background: var(--accent-color, #41bdf5); width: 0; }
        .plan-invested-section { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
        .plan-invested-label { font-size: 12px; opacity: 0.7; }
        .plan-invested-bar { display: flex; height: 30px; border-radius: 999px; background: rgba(15, 23, 42, 0.05); overflow: hidden; font-size: 0; }
        .plan-invested-empty { color: var(--secondary-text-color, #6b7280); font-size: 12px; display: inline-flex; align-items: center; justify-content: center; flex: 1; }
        .plan-invested-foot { font-size: 12px; opacity: 0.75; }
        .plan-invested-segment { display: flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; font-weight: 600; text-transform: uppercase; border-right: 1px solid rgba(255,255,255,0.4); background: linear-gradient(90deg, var(--primary-color, #1976d2), var(--accent-color, #41bdf5)); }
        .plan-invested-segment:last-child { border-right: none; }
        .plan-invested-segment-label { padding: 0 4px; }
        .plan-asset-blocks { display: grid; grid-template-columns: repeat(15, minmax(0, 1fr)); gap: 6px; margin-top: 6px; }
        .plan-asset-block { border-radius: 6px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.35); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 10px; font-weight: 600; color: var(--primary-text-color, #111); text-transform: uppercase; aspect-ratio: 2 / 1; padding: 10px 6px; }
        .plan-asset-block-symbol { font-size: 11px; }
        .plan-asset-block-amount { font-size: 9px; opacity: 0.85; }
        .plan-asset-block-progress { width: 100%; height: 4px; border-radius: 999px; background: rgba(15, 23, 42, 0.1); overflow: hidden; }
        .plan-asset-block-progress-fill { width: 0%; height: 100%; background: linear-gradient(90deg, var(--success-color, #4caf50), var(--accent-color, #41bdf5)); transition: width 0.3s ease; }
        .plan-asset-block-empty { grid-column: 1 / -1; font-size: 11px; color: var(--secondary-text-color, #6b7280); text-align: center; padding: 4px 0; }
        @media (max-width: 900px) {
          .layout { grid-template-columns: repeat(6, minmax(0, 1fr)); }
          .asset-list { grid-column: span 6; }
          .charts { grid-column: span 6; }
        }
        @media (max-width: 600px) {
          .layout { grid-template-columns: repeat(1, minmax(0, 1fr)); }
          .metrics-row { grid-template-columns: repeat(1, minmax(0, 1fr)); }
          .split-row { grid-template-columns: repeat(1, minmax(0, 1fr)); }
          .plan-grid { grid-template-columns: repeat(1, minmax(0, 1fr)); }
        }
      </style>
      ${header}
      <div class="layout">
        ${positions}
        ${charts}
      </div>
      <div class="split-row">
        <div class="pie-card">
          <div class="card-title">Currency Distribution (${portfolioSymbol})</div>
          ${currency}
        </div>
        <div class="pie-card">
          <div class="card-title">Asset Allocation</div>
          ${allocation}
        </div>
        <div class="pie-card">
          <div class="card-title">Sector Allocation</div>
          ${sectorAllocation}
        </div>
      </div>
      ${plan}
    `;

    this._restorePreservedAssetSearchInput();
    if (activeChartEntity) {
      this._scheduleApexChartRender(activeChartEntity, portfolioSymbol);
    }
    this._bindChartRangeButtons(activeChartEntity);

    const newAssetList = this.content.querySelector(".asset-rows");
    if (newAssetList) {
      newAssetList.scrollTop = this._assetListScroll;
      newAssetList.addEventListener("scroll", () => {
        this._assetListScroll = newAssetList.scrollTop;
      });
    }

    this._bindAssetSelection();
    this._bindAssetFilterControls();
    this._bindPlanCardActions(serviceEntity);

    const refreshEl = this.content.querySelector("#refresh");
    if (refreshEl) {
      refreshEl.addEventListener("click", () => this._refresh());
    }

    const refreshAssetEl = this.content.querySelector("#refresh-asset");
    if (refreshAssetEl) {
      refreshAssetEl.addEventListener("click", () => {
        const input = this.content.querySelector("#asset-symbol");
        const symbol = input ? String(input.value || "").trim().toUpperCase() : "";
        if (symbol) {
          const broker = brokerName;
          this._refreshAsset(symbol, broker);
        }
      });
    }

    const settingsBtn = this.content.querySelector(".settings-btn");
    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        this._openSettingsDialog();
      });
    }

    const portfolioSelect = this.content.querySelector("#portfolio-select");
    if (portfolioSelect) {
      portfolioSelect.addEventListener("change", (event) => {
        const value = event.target.value;
        this._selectedServiceEntity = value || null;
        this._render();
      });
    }

    const assetRefreshButtons = this.content.querySelectorAll(".asset-refresh");
    assetRefreshButtons.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        const symbol = ev.currentTarget.getAttribute("data-symbol");
        const broker = ev.currentTarget.getAttribute("data-broker");
        this._refreshAsset(symbol, broker);
      });
    });
  }

  _refresh() {
    if (!this._hass) return;
    this._resetHistoryCaches();
    this._render();
    this._hass.callService("investment_tracker", "refresh", {});
  }

  _resetHistoryCaches() {
    this._historyCache = {};
    this._historyUpdated = {};
    this._historyStatus = {};
    this._historyRequestTokens = {};
    this._dayChangeCache = {};
    this._dayChangeStatus = {};
    this._dayChangeRequestTokens = {};
    this._pendingApexRender = null;
    this._dayChangeStartTimes = {};
  }

  _refreshAsset(symbol, broker) {
    if (!this._hass || !symbol) return;
    this._hass.callService("investment_tracker", "refresh_asset", {
      symbol,
      broker,
    });
  }

  _renderPositions(assets, portfolioSymbol, brokerName, brokerOptions = []) {
    const header = `<div class="assets-header">Assets</div>`;
    const filters = this._renderAssetFilters(brokerOptions);
    if (!assets.length) {
      return `
        <div class="asset-list">
          <div class="asset-list-header">
            ${header}
            ${filters}
          </div>
          <div class="asset-rows">
            <div class="asset-empty">No positions available.</div>
          </div>
        </div>
      `;
    }

      const rows = assets
      .map((stateObj) => {
        const attrs = stateObj.attributes || {};
        if (this.config.hide_unmapped && attrs.unmapped) return "";
        const refreshButton = this.config.show_asset_refresh
          ? `<button class="asset-refresh" data-symbol="${attrs.symbol || ""}" data-broker="${attrs.broker || ""}">↻</button>`
          : "";
        const assetCategory = (attrs.category || attrs.type || "equity").toString().toLowerCase();
        const name = this._normalizeAssetName(
          attrs.friendly_name || attrs.symbol || stateObj.entity_id,
          [brokerName, attrs.broker]
        );
        const valueRaw = Number(attrs.market_value ?? stateObj.state) || 0;
        const plRaw = Number(attrs.profit_loss_pct ?? 0);
        const value = this._formatNumber(valueRaw);
        const pl = this._formatNumber(plRaw);
        const currencySymbol = this._getCurrencySymbol(attrs.currency || "") || portfolioSymbol;
        const priceRaw = Number(attrs.current_price ?? NaN);
        const hasPrice = Number.isFinite(priceRaw);
        const priceText = hasPrice ? `${currencySymbol}${this._formatNumber(priceRaw)}` : "-";
        const priceMovement = this._getAssetPriceTrend(stateObj.entity_id, priceRaw);
        const priceMovementIcon = priceMovement === "up"
          ? `<span class="asset-price-move asset-price-move-up" aria-hidden="true">↑</span>`
          : priceMovement === "down"
          ? `<span class="asset-price-move asset-price-move-down" aria-hidden="true">↓</span>`
          : "";
        const plClass = plRaw >= 0 ? "positive" : "negative";
        const selected = stateObj.entity_id === this._selectedAssetEntityId;
        const rowClass = `asset-row${selected ? " selected" : ""}`;
        const isUnmapped = Boolean(attrs.unmapped);
        const mapIcon = isUnmapped ? "mdi:link-off" : "mdi:link";
        const mapLabel = isUnmapped
          ? "Niet gekoppeld asset openen"
          : "Gekoppeld asset bewerken";
        const historyLabel = "Transactiegeschiedenis";
        const historyButton = `<button type="button" class="asset-history-button" data-entity="${stateObj.entity_id}" title="${this._escapeAttribute(historyLabel)}" aria-label="${this._escapeAttribute(historyLabel)}"><ha-icon icon="mdi:history"></ha-icon></button>`;
        const mapButton = `<button type="button" class="asset-link-button ${
          isUnmapped ? "unmapped" : "mapped"
        }" data-entity="${stateObj.entity_id}" data-symbol="${attrs.symbol || ""}" data-broker="${attrs.broker || ""}" data-category="${assetCategory}" title="${this._escapeAttribute(
          mapLabel
        )}" aria-label="${this._escapeAttribute(mapLabel)}"><ha-icon icon="${mapIcon}"></ha-icon></button>`;
        return `
          <div class="${rowClass}" data-entity="${stateObj.entity_id}" data-name="${this._escapeAttribute(name)}" role="button" tabindex="0">
            <div class="asset-info">
              <div class="asset-name-row">
                <div class="asset-name">${name}</div>
                ${historyButton}
                ${mapButton}
              </div>
              <div class="asset-meta">Qty: ${attrs.quantity ?? "-"}</div>
            </div>
            <div class="asset-stats">
              <div class="asset-price">
                ${priceText}
                ${priceMovementIcon}
              </div>
              <div class="asset-value">${currencySymbol}${value}</div>
              <div class="asset-pl ${plClass}">${pl !== "" ? `${pl}%` : ""}</div>
            </div>
            ${refreshButton}
          </div>
        `;
      })
      .join("");

    // Voeg dialoog toe voor remapping
    if (!this._remapDialog) {
      this._remapDialog = document.createElement("div");
      this._remapDialog.style.display = "none";
      this._remapDialog.innerHTML = `
        <div id="remap-modal" style="position:fixed;left:0;top:0;width:100vw;height:100vh;background:rgba(0,0,0,0.45);z-index:10000;display:flex;align-items:center;justify-content:center;">
          <div style="background:#fff;color:#222;padding:32px 28px 24px 28px;border-radius:16px;min-width:340px;max-width:95vw;box-shadow:0 4px 32px #0004;display:flex;flex-direction:column;gap:18px;">
            <style>
              .remap-suggestions { display:flex;flex-direction:column;gap:6px;margin-top:0; }
              .remap-suggestion-list { display:flex;flex-direction:column;gap:6px; }
              .remap-suggestion { border:1px solid #d1d5db;border-radius:12px;padding:8px 10px;background:#fff;text-align:left;font-size:13px;color:#111;cursor:pointer;transition:background 0.2s ease,border-color 0.2s ease; }
              .remap-suggestion.selected { border-color:#2563eb;background:#e0e7ff; }
            </style>
            <h3 style="margin:0 0 8px 0;font-size:1.3em;font-weight:700;color:#1a1a1a;">Asset aanpassen</h3>
            <div style="margin-bottom:8px;font-size:15px;">
              <label style="font-weight:500;">Symbool: <span id="remap-symbol" style="font-weight:400;color:#444;"></span></label><br/>
              <label style="font-weight:500;">Broker: <span id="remap-broker" style="font-weight:400;color:#444;"></span></label>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <label style="font-weight:500;">Yahoo ticker
                <input id="remap-ticker" placeholder="Bijv. VWRL.AS" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid #bbb;font-size:15px;" />
              </label>
              <label style="font-weight:500;">Categorie
                <select id="remap-category" style="width:100%;margin-top:4px;padding:8px 10px;border-radius:8px;border:1px solid #bbb;font-size:15px;background:#fff;color:#222;">
                  <option value="equity" style="background:#fff;color:#222;">Aandeel</option>
                  <option value="etf" style="background:#fff;color:#222;">ETF</option>
                  <option value="bond" style="background:#fff;color:#222;">Obligatie</option>
                  <option value="commodity" style="background:#fff;color:#222;">Grondstof</option>
                  <option value="crypto" style="background:#fff;color:#222;">Crypto</option>
                  <option value="cash" style="background:#fff;color:#222;">Cash</option>
                  <option value="fund" style="background:#fff;color:#222;">Fonds</option>
                  <option value="other" style="background:#fff;color:#222;">Overig</option>
                </select>
              </label>
            </div>
            <div class="remap-suggestions" style="margin-top:4px;">
              <div style="font-weight:600;font-size:14px;">Yahoo suggesties</div>
              <div id="remap-suggestion-list" class="remap-suggestion-list"></div>
              <div id="remap-suggestion-message" style="font-size:13px;color:#555;">Selecteer een matching ticker of voer een Yahoo symbool in.</div>
            </div>
            <div style="display:flex;gap:16px;justify-content:flex-end;margin-top:8px;">
              <button id="remap-cancel" style="padding:8px 18px;border-radius:8px;border:0;background:#eee;color:#333;font-size:15px;cursor:pointer;">Annuleren</button>
              <button id="remap-save" style="padding:8px 18px;border-radius:8px;border:0;background:#1976d2;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">Opslaan</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(this._remapDialog);
    }
    // Event listeners voor remap-knoppen
    setTimeout(() => {
      const remapBtns = this.content.querySelectorAll(".asset-link-button");
      remapBtns.forEach((btn) => {
        btn.onclick = () => {
          const symbol = btn.getAttribute("data-symbol") || "";
          const broker = btn.getAttribute("data-broker") || "";
          const category = btn.getAttribute("data-category") || "";
          const entityId = btn.getAttribute("data-entity") || null;
          this._showRemapDialog(symbol, broker, category, entityId);
        };
      });
        const historyBtns = this.content.querySelectorAll(".asset-history-button");
        historyBtns.forEach((btn) => {
          btn.onclick = () => {
            const entityId = btn.getAttribute("data-entity") || null;
            this._showAssetHistoryDialog(entityId);
          };
        });
    }, 0);

    return `
      <div class="asset-list">
        <div class="asset-list-header">
          ${header}
          ${filters}
        </div>
        <div class="asset-rows">
          ${rows}
        </div>
      </div>
    `;
  }

  _renderAssetFilters(brokerOptions = []) {
    const searchValue = this._escapeAttribute(this._assetSearchTerm);
    const brokerSelect = (Array.isArray(brokerOptions) ? brokerOptions : [])
      .map((broker) => {
        const selected = this._assetBrokerFilter === broker.value ? " selected" : "";
        return `
        <option value="${this._escapeAttribute(broker.value)}"${selected}>
          ${this._escapeAttribute(broker.label)}
        </option>
      `;
      })
      .join("");
    const filtersVisible = Boolean(this._assetFiltersOpen);
    const sortLabel = this._formatSortLabel(this._assetSortKey);
    const directionSymbol = this._assetSortDirection === "asc" ? "↑" : "↓";
    const sortButtons = ["name", "symbol", "pl_pct", "value"]
      .map((key) => `
        <button type="button" class="asset-sort-option" data-key="${key}" data-selected="${this._assetSortKey === key}">
          ${this._formatSortLabel(key)}
        </button>
      `)
      .join("");
    const popupClass = `asset-sort-popup${this._assetSortPopupVisible ? " open" : ""}`;
    const bodyClass = filtersVisible ? "asset-filter-body open" : "asset-filter-body collapsed";
    const bodyAttributes = filtersVisible ? "" : "aria-hidden=\"true\"";
    const toggleIcon = filtersVisible ? "mdi:chevron-double-up" : "mdi:chevron-double-down";
    const toggleLabel = filtersVisible ? "Hide filters" : "Show filters";
    return `
      <div class="asset-filters" aria-label="Asset filters">
        <div class="asset-filters-header">
          <button type="button" class="asset-filter-toggle" aria-expanded="${filtersVisible}">
            <ha-icon icon="${toggleIcon}"></ha-icon>
            <span>${toggleLabel}</span>
          </button>
        </div>
        <div class="${bodyClass}" ${bodyAttributes}>
          <div class="asset-filter-group">
            <label class="asset-filter">
              <span>Search assets</span>
              <input type="search" id="asset-search" placeholder="Symbol, ticker, or name" value="${searchValue}" autocomplete="off" />
            </label>
            <label class="asset-filter">
              <span>Broker</span>
              <select id="asset-broker-filter">
                <option value=""${!this._assetBrokerFilter ? " selected" : ""}>All brokers</option>
                ${brokerSelect}
              </select>
            </label>
            <div class="asset-sort-control">
              <button type="button" id="asset-sort-button" aria-haspopup="true" aria-expanded="${this._assetSortPopupVisible ? "true" : "false"}">
                <span class="asset-sort-icon">⇅</span>
                <span>Sort: ${this._escapeAttribute(sortLabel)}</span>
              </button>
              <div class="${popupClass}">
                ${sortButtons}
              </div>
              <button type="button" id="asset-sort-direction" aria-label="Toggle sort direction">${directionSymbol}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _getAssetBrokerOptions(states) {
    const seen = new Set();
    const options = [];
    (states || []).forEach((stateObj) => {
      const broker = (stateObj?.attributes?.broker || "").toString().trim();
      if (!broker) return;
      const key = broker.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      options.push({ value: broker, label: this._prettifyBrokerLabel(broker) });
    });
    return options;
  }

  _applyAssetFilters(states) {
    const search = (this._assetSearchTerm || "").trim().toLowerCase();
    const brokerFilter = (this._assetBrokerFilter || "").trim().toLowerCase();
    const filtered = (Array.isArray(states) ? states : []).filter((stateObj) => {
      const attrs = stateObj?.attributes || {};
      if (brokerFilter && (attrs.broker || "").toLowerCase() !== brokerFilter) {
        return false;
      }
      if (!search) {
        return true;
      }
      const suggestions = Array.isArray(attrs.repair_suggestions)
        ? attrs.repair_suggestions
            .map((item) => (item?.symbol || item?.ticker || item?.name || "").toString())
        : [];
      const haystack = [
        attrs.symbol,
        attrs.name,
        attrs.display_name,
        attrs.ticker,
        attrs.broker,
        stateObj?.entity_id,
        ...suggestions,
      ]
        .filter(Boolean)
        .map((value) => value.toString().toLowerCase())
        .join(" ");
      return haystack.includes(search);
    });
    return this._sortAssets(filtered);
  }

  _sortAssets(states) {
    const key = this._assetSortKey || "value";
    const direction = this._assetSortDirection === "asc" ? 1 : -1;
    return [...(Array.isArray(states) ? states : [])].sort((a, b) => {
      const aVal = this._assetSortValue(a, key);
      const bVal = this._assetSortValue(b, key);
      if (typeof aVal === "number" && typeof bVal === "number") {
        if (aVal === bVal) return 0;
        return (aVal - bVal) * direction;
      }
      const aText = (aVal || "").toString();
      const bText = (bVal || "").toString();
      return aText.localeCompare(bText, undefined, { sensitivity: "base" }) * direction;
    });
  }

  _assetSortValue(stateObj, key) {
    const attrs = stateObj?.attributes || {};
    if (key === "value") {
      return Number(attrs.market_value ?? stateObj?.state) || 0;
    }
    if (key === "pl_pct") {
      return Number(attrs.profit_loss_pct ?? 0) || 0;
    }
    if (key === "symbol") {
      return (attrs.symbol || "").toString().toLowerCase();
    }
    return (attrs.display_name || attrs.name || attrs.symbol || "").toString().toLowerCase();
  }

  _formatSortLabel(key) {
    switch (key) {
      case "name":
        return "Name";
      case "symbol":
        return "Symbol";
      case "pl_pct":
        return "P/L %";
      case "value":
      default:
        return "Value";
    }
  }

  _bindAssetFilterControls() {
    if (!this.content) return;
    const searchInput = this.content.querySelector("#asset-search");
    if (searchInput) {
      searchInput.value = this._assetSearchTerm;
      this._restoreAssetSearchFocus(searchInput);
      searchInput.oninput = (event) => {
        this._assetSearchTerm = (event.target?.value || "").toString();
        this._scheduleSearchRender();
      };
    }
    const filterToggle = this.content.querySelector(".asset-filter-toggle");
    if (filterToggle) {
      filterToggle.onclick = () => {
        this._assetFiltersOpen = !this._assetFiltersOpen;
        this._render();
      };
    }
    const brokerSelect = this.content.querySelector("#asset-broker-filter");
    if (brokerSelect) {
      brokerSelect.value = this._assetBrokerFilter;
      brokerSelect.onchange = (event) => {
        this._assetBrokerFilter = (event.target?.value || "").toString();
        this._render();
      };
    }
    const sortButton = this.content.querySelector("#asset-sort-button");
    if (sortButton) {
      sortButton.onclick = (event) => {
        event.stopPropagation();
        this._assetSortPopupVisible = !this._assetSortPopupVisible;
        this._render();
      };
    }
    const sortOptions = this.content.querySelectorAll(".asset-sort-option");
    sortOptions.forEach((option) => {
      option.onclick = () => {
        const key = option.dataset.key;
        if (!key) return;
        this._assetSortKey = key;
        this._assetSortPopupVisible = false;
        this._render();
      };
    });
    const directionBtn = this.content.querySelector("#asset-sort-direction");
    if (directionBtn) {
      directionBtn.onclick = () => {
        this._assetSortDirection = this._assetSortDirection === "asc" ? "desc" : "asc";
        this._render();
      };
    }
  }

  _scheduleSearchRender() {
    if (this._assetSearchTimer) {
      clearTimeout(this._assetSearchTimer);
    }
    this._assetSearchTimer = setTimeout(() => {
      this._assetSearchTimer = null;
      this._render();
    }, 280);
  }

  _captureAssetSearchFocus() {
    if (!this.content) {
      this._pendingAssetSearchFocus = null;
      this._preservedAssetSearchInput = null;
      return;
    }
    if (!this._assetFiltersOpen) {
      this._pendingAssetSearchFocus = null;
      this._preservedAssetSearchInput = null;
      return;
    }
    const searchInput = this.content.querySelector("#asset-search");
    if (searchInput && searchInput === document.activeElement) {
      this._pendingAssetSearchFocus = {
        start: typeof searchInput.selectionStart === "number" ? searchInput.selectionStart : null,
        end: typeof searchInput.selectionEnd === "number" ? searchInput.selectionEnd : null,
      };
      this._preservedAssetSearchInput = searchInput;
    } else {
      this._pendingAssetSearchFocus = null;
      this._preservedAssetSearchInput = null;
    }
  }

  _restoreAssetSearchFocus(input) {
    if (!input || !this._pendingAssetSearchFocus) return;
    input.focus({ preventScroll: true });
    const { start, end } = this._pendingAssetSearchFocus;
    if (typeof start === "number" && typeof end === "number") {
      input.setSelectionRange(start, end);
    }
    this._pendingAssetSearchFocus = null;
  }

  _restorePreservedAssetSearchInput() {
    if (!this._preservedAssetSearchInput || !this.content) return;
    const currentInput = this.content.querySelector("#asset-search");
    if (!currentInput || !currentInput.parentNode) {
      this._preservedAssetSearchInput = null;
      return;
    }
    currentInput.parentNode.replaceChild(this._preservedAssetSearchInput, currentInput);
    this._preservedAssetSearchInput = null;
  }

  _prettifyBrokerLabel(value) {
    if (!value) return "";
    return value
      .split(/[_\s]+/)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
      .join(" ");
  }

  _showRemapDialog(symbol, broker, category, entityId) {
    if (!this._remapDialog) return;
    this._remapDialog.style.display = "block";
    const modal = this._remapDialog.querySelector("#remap-modal");
    modal.style.display = "flex";
    this._remapDialog.querySelector("#remap-symbol").textContent = symbol || "-";
    this._remapDialog.querySelector("#remap-broker").textContent = broker || "-";
    console.log("[investment-tracker-card] opening remap", { symbol, broker, category });
    const input = this._remapDialog.querySelector("#remap-ticker");
    const categorySelect = this._remapDialog.querySelector("#remap-category");
    input.value = "";
    input.focus();
    const normalized = String(category || "").trim().toLowerCase() || "equity";
    const validCategories = ["equity", "etf", "bond", "commodity", "crypto", "cash", "fund", "other"];
    categorySelect.value = validCategories.includes(normalized) ? normalized : "equity";
    const cancel = this._remapDialog.querySelector("#remap-cancel");
    const save = this._remapDialog.querySelector("#remap-save");
    const close = () => {
      this._remapDialog.style.display = "none";
      modal.style.display = "none";
    };
    cancel.onclick = close;
    save.onclick = () => {
      const ticker = input.value.trim();
      const category = categorySelect.value;
      // Only send fields that are actually changed
      const payload = { symbol, broker };
      if (ticker) payload.ticker = ticker;
      if (category) payload.category = category;
      if (!ticker && !category) {
        console.log("[investment-tracker-card] remap aborted (nothing changed)", { payload });
        input.focus();
        return;
      }
      if (this._hass) {
        console.log("[investment-tracker-card] calling remap_symbol", payload);
        this._hass.callService("investment_tracker", "remap_symbol", payload);
        close();
      }
    };

    const normalizedSymbol = String(symbol || "").trim();
    const entityState = entityId ? this._hass?.states?.[entityId] : null;
    const suggestions = entityState?.attributes?.repair_suggestions;
    this._loadRemapSuggestions(normalizedSymbol, suggestions);
  }

  _showAssetHistoryDialog(entityId) {
    if (!this._hass || !entityId) return;
    if (!this._historyDialog) {
      this._historyDialog = document.createElement("div");
      this._historyDialog.style.display = "none";
      this._historyDialog.innerHTML = `
        <div id="history-modal" style="position:fixed;left:0;top:0;width:100vw;height:100vh;background:rgba(0,0,0,0.45);z-index:10000;display:none;align-items:center;justify-content:center;">
          <div class="history-panel" style="background:#fff;color:#222;padding:24px 20px 18px;border-radius:16px;min-width:320px;max-width:90vw;box-shadow:0 4px 32px #0004;">
            <style>
              .history-panel { display:flex;flex-direction:column;gap:12px; }
              .history-head { display:flex;justify-content:space-between;align-items:flex-start;gap:12px; }
              .history-head h3 { margin:0;font-size:1.2em;font-weight:700; }
              .history-head button { border:0;background:#eee;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer; }
              .history-meta { display:flex;flex-wrap:wrap;gap:10px;font-size:12px;opacity:0.7; }
              .history-meta span { font-weight:600; }
              .history-content { max-height:280px;overflow:auto; }
              .history-list { display:flex;flex-direction:column;gap:6px; }
              .history-row { display:grid;grid-template-columns:1.6fr 0.8fr 0.8fr 1fr;gap:6px;align-items:center;font-size:13px;padding:6px 0;border-bottom:1px solid #f0f0f0; }
              .history-row:last-child { border-bottom:0; }
              .history-row-header { font-weight:600;opacity:0.8;border-bottom:none; }
              .history-empty { font-size:13px;opacity:0.65;display:flex;justify-content:center;padding:12px 0; }
            </style>
            <div class="history-head">
              <h3>Transactiegeschiedenis</h3>
              <button id="history-close" type="button">Sluiten</button>
            </div>
            <div class="history-meta">
              <div>Symbool: <span id="history-symbol">-</span></div>
              <div id="history-count">Geen transacties</div>
            </div>
            <div class="history-content">
              <div id="history-content"></div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(this._historyDialog);
    }
    const modal = this._historyDialog.querySelector("#history-modal");
    const closeBtn = this._historyDialog.querySelector("#history-close");
    const close = () => {
      this._historyDialog.style.display = "none";
      if (modal) modal.style.display = "none";
    };
    if (closeBtn) closeBtn.onclick = close;
    if (modal) {
      modal.onclick = (event) => {
        if (event.target === modal) close();
      };
      modal.style.display = "flex";
    }
    this._historyDialog.style.display = "block";
    const symbolLabel = this._historyDialog.querySelector("#history-symbol");
    const countLabel = this._historyDialog.querySelector("#history-count");
    const content = this._historyDialog.querySelector("#history-content");
    const state = this._hass.states?.[entityId];
    const transactions = Array.isArray(state?.attributes?.transactions) ? state.attributes.transactions : [];
    if (symbolLabel) symbolLabel.textContent = state?.attributes?.symbol || state?.entity_id || "-";
    if (countLabel) {
      countLabel.textContent = transactions.length
        ? `${transactions.length} transacties`
        : "Geen transacties";
    }
    if (content) {
      content.innerHTML = this._renderAssetHistory(transactions);
    }
  }

  _loadRemapSuggestions(symbol, storedSuggestions = null) {
    if (!this._remapDialog) return;
    const list = this._remapDialog.querySelector("#remap-suggestion-list");
    const message = this._remapDialog.querySelector("#remap-suggestion-message");
    if (!list || !message) return;
    const normalized = String(symbol || "").trim();
    if (!normalized) {
      this._remapDialogToken = null;
      this._renderRemapSuggestions([], "Symbool ontbreekt.");
      return;
    }
    const cached = Array.isArray(storedSuggestions) ? storedSuggestions.slice(0, 5) : [];
    if (cached.length) {
      this._remapDialogToken = null;
      this._renderRemapSuggestions(cached);
      return;
    }
    message.textContent = "Zoekt naar Yahoo suggesties…";
    list.innerHTML = "";
    const token = `${normalized}:${Date.now()}`;
    this._remapDialogToken = token;
    if (!this._hass?.callApi) {
      this._renderRemapSuggestions([], "Suggesties niet beschikbaar.");
      return;
    }
    this._hass
      .callApi("GET", "investment_tracker/search_symbols", { symbol: normalized })
      .then((response) => {
        if (this._remapDialogToken !== token) return;
        const results = Array.isArray(response?.results) ? response.results : [];
        this._renderRemapSuggestions(results);
      })
      .catch(() => {
        if (this._remapDialogToken !== token) return;
        this._renderRemapSuggestions([], "Suggesties tijdelijk niet beschikbaar.");
      });
  }

  _renderRemapSuggestions(results, fallbackMessage) {
    if (!this._remapDialog) return;
    const list = this._remapDialog.querySelector("#remap-suggestion-list");
    const message = this._remapDialog.querySelector("#remap-suggestion-message");
    if (!list || !message) return;
    const hits = Array.isArray(results) ? results.slice(0, 5) : [];
    if (!hits.length) {
      message.textContent = fallbackMessage || "Geen suggesties gevonden.";
      list.innerHTML = "";
      return;
    }
    message.textContent = "Klik op een suggestie om het Yahoo-symbool in te vullen.";
    const buttons = hits
      .filter((hit) => hit && hit.symbol)
      .map((hit) => {
        const ticker = String(hit.symbol || "").trim();
        const shortName = String(hit.shortName || hit.longName || hit.shortname || hit.longname || hit.name || "").trim();
        const descriptor = String(hit.quoteType || hit.industry || hit.sector || "").trim();
        const displayName = shortName || descriptor || ticker;
        const exchange = String(hit.exchange || hit.exchDisp || hit.exchangeDisp || "").trim() || "onbekend";
        const label = `${ticker} - (${displayName} · ${exchange})`;
        return `<button type="button" class="remap-suggestion" data-remap-ticker="${this._escapeAttribute(ticker)}">${this._escapeHtml(label)}</button>`;
      })
      .join("");
    if (!buttons) {
      message.textContent = fallbackMessage || "Geen suggesties gevonden.";
      list.innerHTML = "";
      return;
    }
    list.innerHTML = buttons;
    const suggestionButtons = list.querySelectorAll(".remap-suggestion");
    const input = this._remapDialog.querySelector("#remap-ticker");
    suggestionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const ticker = button.dataset.remapTicker || "";
        if (!input) return;
        input.value = ticker;
        suggestionButtons.forEach((btn) => btn.classList.remove("selected"));
        button.classList.add("selected");
      });
    });
  }

  _renderAssetHistory(transactions) {
    const rows = Array.isArray(transactions) ? [...transactions] : [];
    if (!rows.length) {
      return `<div class="history-empty">Geen transacties beschikbaar.</div>`;
    }
    const sorted = rows
      .slice()
      .sort((a, b) => {
        const aTime = Date.parse(a?.date || "") || 0;
        const bTime = Date.parse(b?.date || "") || 0;
        return bTime - aTime;
      })
      .map((tx) => {
        const qtyValue = Number(tx?.quantity ?? NaN);
        const actionLabel = tx?.type
          ? String(tx.type)
          : qtyValue < 0
          ? "Verkoop"
          : "Koop";
        const normalizedAction = actionLabel ? `${actionLabel.charAt(0).toUpperCase()}${actionLabel.slice(1)}` : "";
        const currencySymbol = this._getCurrencySymbol(tx?.currency || "");
        const qtyText = Number.isFinite(qtyValue) ? this._formatNumber(Math.abs(qtyValue)) : "-";
        const priceValue = Number(tx?.price ?? NaN);
        const priceText = Number.isFinite(priceValue)
          ? `${currencySymbol}${this._formatNumber(Math.abs(priceValue))}`
          : "-";
        return `
          <div class="history-row">
            <span class="history-col history-col-date">${this._escapeHtml(this._formatTransactionDate(tx?.date))}</span>
            <span class="history-col history-col-action">${this._escapeHtml(normalizedAction)}</span>
            <span class="history-col history-col-qty">${qtyText}</span>
            <span class="history-col history-col-price">${priceText}</span>
          </div>
        `;
      })
      .join("");
    const header = `
      <div class="history-row history-row-header">
        <span class="history-col history-col-date">Datum</span>
        <span class="history-col history-col-action">Actie</span>
        <span class="history-col history-col-qty">Aantal</span>
        <span class="history-col history-col-price">Prijs</span>
      </div>
    `;
    return `<div class="history-list">${header}${sorted}</div>`;
  }

  _formatTransactionDate(value) {
    if (!value) return "-";
    const parsed = Date.parse(String(value));
    if (!Number.isFinite(parsed)) return String(value);
    return new Date(parsed).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  _getWeekStartTimestamp(reference = Date.now()) {
    const date = new Date(reference);
    const day = date.getDay();
    const offset = (day + 6) % 7;
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    return date.getTime();
  }

  _formatWeekStartLabel(timestamp) {
    if (!Number.isFinite(timestamp)) return "";
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  }

  _parseTransactionTimestamp(value) {
    if (!value) return null;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed)) return parsed;
    const fallback = new Date(String(value));
    return Number.isFinite(fallback.getTime()) ? fallback.getTime() : null;
  }

  _normalizeSymbol(value) {
    return (value || "").toString().trim().toUpperCase();
  }

  _calculateWeeklyInvested(assetStates, sinceTimestamp) {
    const entries = Array.isArray(assetStates) ? assetStates : [];
    if (!Number.isFinite(sinceTimestamp)) return {};
    const invested = {};
    entries.forEach((asset) => {
      if (!asset) return;
      const attrs = asset.attributes || {};
      const symbol = this._normalizeSymbol(attrs.symbol || attrs.friendly_name);
      const transactions = Array.isArray(attrs.transactions) ? attrs.transactions : [];
      transactions.forEach((tx) => {
        const timestamp = this._parseTransactionTimestamp(tx?.date);
        if (!Number.isFinite(timestamp) || timestamp < sinceTimestamp) return;
        const quantity = Number(tx?.quantity ?? NaN);
        if (!Number.isFinite(quantity) || quantity <= 0) return;
        const price = Number(tx?.price ?? NaN);
        if (!Number.isFinite(price) || price <= 0) return;
        const amount = price * quantity;
        if (!Number.isFinite(amount) || amount <= 0) return;
        const key = symbol || this._normalizeSymbol(tx?.symbol);
        if (!key) return;
        invested[key] = (invested[key] || 0) + amount;
      });
    });
    return invested;
  }

  _renderInvestedSegments(investedBySymbol, totalInvested, currencySymbol) {
    if (!totalInvested || !Object.keys(investedBySymbol).length) return "";
    return Object.entries(investedBySymbol)
      .filter(([, amount]) => Number.isFinite(amount) && amount > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([symbol, amount]) => {
        const label = symbol.length <= 4 ? symbol : symbol.slice(0, 4);
        const tooltip = `${symbol} · ${currencySymbol}${this._formatNumber(amount)}`;
        return `<span class="plan-invested-segment" style="flex:${amount} 1 0;" title="${this._escapeAttribute(tooltip)}"><span class="plan-invested-segment-label">${this._escapeAttribute(label)}</span></span>`;
      })
      .join("");
  }

  _openSettingsDialog() {
    this._ensureSettingsDialog();
    if (!this._settingsDialog) return;
    this._populateSettingsDialog();
    this._settingsDialog.style.display = "flex";
  }

  _closeSettingsDialog() {
    if (this._settingsDialog) {
      this._settingsDialog.style.display = "none";
    }
  }

  _populateSettingsDialog() {
    if (!this._settingsDialog) return;
    SETTINGS_FIELDS.forEach((field) => {
      const checkbox = this._settingsDialog.querySelector(`#settings_${field.key}`);
      if (checkbox) {
        checkbox.checked = !!this.config[field.key];
      }
    });
  }

  _applySettingsChanges() {
    if (!this._settingsDialog) return;
    const updates = {};
    SETTINGS_FIELDS.forEach((field) => {
      const checkbox = this._settingsDialog.querySelector(`#settings_${field.key}`);
      if (checkbox) {
        updates[field.key] = checkbox.checked;
      }
    });
    const newConfig = {
      ...this.config,
      ...updates,
    };
    this.config = newConfig;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: {
          config: {
            ...newConfig,
            type: newConfig.type || "custom:investment-tracker-card",
          },
        },
        bubbles: true,
        composed: true,
      })
    );
    this._render();
    this._closeSettingsDialog();
  }

  _ensureSettingsDialog() {
    if (this._settingsDialog) return;
    this._settingsDialog = document.createElement("div");
    this._settingsDialog.className = "investment-tracker-settings-overlay";
    this._settingsDialog.style.display = "none";
    const rows = SETTINGS_FIELDS
      .map(
        (field) => `
          <label class="settings-option">
            <input type="checkbox" id="settings_${field.key}" />
            <span>${field.label}</span>
          </label>
        `
      )
      .join("");
    this._settingsDialog.innerHTML = `
      <style>
        .investment-tracker-settings-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
        .settings-panel {
          background: var(--ha-card-background, #fff);
          color: var(--primary-text-color, #111);
          width: min(360px, 90vw);
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .settings-close {
          border: none;
          background: transparent;
          font-size: 1.1rem;
          cursor: pointer;
          color: var(--primary-text-color, #111);
          padding: 2px 6px;
          line-height: 1;
        }
        .settings-body {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .settings-panel h3 {
          margin: 0;
          font-size: 1.1rem;
        }
        .settings-option {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 0.95rem;
        }
        .settings-option span {
          color: var(--primary-text-color, #111);
          font-weight: 600;
        }
        .settings-option input {
          width: 18px;
          height: 18px;
        }
        .settings-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        .settings-actions button {
          border: none;
          border-radius: 8px;
          padding: 6px 14px;
          cursor: pointer;
          font-weight: 600;
        }
        .settings-actions .settings-cancel {
          background: #e0e0e0;
        }
        .settings-actions .settings-save {
          background: var(--primary-color, #0b6bff);
          color: #fff;
        }
      </style>
      <div class="settings-panel" role="dialog" aria-modal="true" aria-label="Investment Tracker instellingen">
        <div class="settings-header">
          <h3>Instellingen</h3>
          <button class="settings-close" type="button" aria-label="Sluit">✕</button>
        </div>
        <div class="settings-body">
          ${rows}
        </div>
        <div class="settings-actions">
          <button class="settings-cancel" type="button">Annuleren</button>
          <button class="settings-save" type="button">Opslaan</button>
        </div>
      </div>
    `;
    document.body.appendChild(this._settingsDialog);
    this._settingsDialog.addEventListener("click", (event) => {
      if (event.target === this._settingsDialog) {
        this._closeSettingsDialog();
      }
    });
    const closeBtn = this._settingsDialog.querySelector(".settings-close");
    const cancelBtn = this._settingsDialog.querySelector(".settings-cancel");
    const saveBtn = this._settingsDialog.querySelector(".settings-save");
    closeBtn?.addEventListener("click", () => this._closeSettingsDialog());
    cancelBtn?.addEventListener("click", () => this._closeSettingsDialog());
    saveBtn?.addEventListener("click", () => this._applySettingsChanges());
  }

  _renderPlan(serviceState, currencySymbol, assetStates = []) {
    const attrs = serviceState?.attributes || {};
    const total = Number(attrs.plan_total ?? 0) || 0;
    const freq = attrs.plan_frequency ? String(attrs.plan_frequency) : "monthly";
    const perAssetRaw = Array.isArray(attrs.plan_per_asset) ? attrs.plan_per_asset : [];
    const perAsset = this._parsePlanPerAssetList(perAssetRaw);
    const plannedSoFar = perAsset.reduce((sum, item) => sum + (item.amount || 0), 0);
    const remaining = total > 0 ? Math.max(total - plannedSoFar, 0) : 0;
    const progress = total > 0 ? Math.min((plannedSoFar / total) * 100, 100) : 0;
    const weekStartTimestamp = this._getWeekStartTimestamp();
    const actualInvestedBySymbol = this._calculateWeeklyInvested(assetStates, weekStartTimestamp);
    const investedThisWeek = Object.values(actualInvestedBySymbol).reduce((sum, value) => sum + value, 0);
    const investedSegments = this._renderInvestedSegments(actualInvestedBySymbol, investedThisWeek, currencySymbol);
    const investedLabel = `${currencySymbol}${this._formatNumber(investedThisWeek)}`;
    const weekLabel = this._formatWeekStartLabel(weekStartTimestamp);
    const assetBlocks = perAsset
      .map((item) => {
        const symbol = (item.symbol || "").toUpperCase();
        if (!symbol) return "";
        const label = symbol.length <= 3 ? symbol : symbol.slice(0, 3);
        const plannedAmount = Number.isFinite(item.amount) ? item.amount : 0;
        const amountLabel = `${currencySymbol}${this._formatNumber(plannedAmount)}`;
        const actualAmount = Number.isFinite(actualInvestedBySymbol[symbol]) ? actualInvestedBySymbol[symbol] : 0;
        const ratio = plannedAmount > 0 ? Math.min((actualAmount / plannedAmount) * 100, 100) : actualAmount > 0 ? 100 : 0;
        const statusTooltip = actualAmount
          ? `${symbol} · Invested ${currencySymbol}${this._formatNumber(actualAmount)} this week`
          : `${symbol} · No buys recorded this week`;
        const tooltip = `${symbol} · Planned ${amountLabel}`;
        return `
          <div class="plan-asset-block" title="${this._escapeAttribute(tooltip)}">
            <span class="plan-asset-block-symbol">${this._escapeAttribute(label)}</span>
            <span class="plan-asset-block-amount">${this._escapeAttribute(amountLabel)}</span>
            <div class="plan-asset-block-progress" title="${this._escapeAttribute(statusTooltip)}">
              <div class="plan-asset-block-progress-fill" style="width:${ratio}%;"></div>
            </div>
          </div>
        `;
      })
      .filter(Boolean)
      .join("");
    const serviceEntityId = serviceState?.entity_id || "";
    const editButtonAttrs = serviceEntityId ? `data-service="${this._escapeAttribute(serviceEntityId)}"` : "disabled";

    return `
      <div class="plan-card">
        <div class="plan-card-header">
          <div class="card-title">Investment Plan</div>
          <button type="button" class="plan-card-edit" ${editButtonAttrs}>Edit plan</button>
        </div>
        <div class="plan-grid">
          <div class="plan-metric">
            <div class="plan-label">Target (${freq})</div>
            <div class="metric-value">${currencySymbol}${this._formatNumber(total)}</div>
          </div>
          <div class="plan-metric">
            <div class="plan-label">Planned so far</div>
            <div class="metric-value">${currencySymbol}${this._formatNumber(plannedSoFar)}</div>
          </div>
          <div class="plan-metric">
            <div class="plan-label">Remaining</div>
            <div class="metric-value">${currencySymbol}${this._formatNumber(remaining)}</div>
          </div>
        </div>
        <div class="progress"><div class="progress-bar" style="width:${progress}%;"></div></div>
        <div class="plan-invested-section">
          <div class="plan-invested-label">Invested since ${this._escapeAttribute(weekLabel)}</div>
          <div class="plan-invested-bar" aria-label="Invested ${this._escapeAttribute(investedLabel)} this week">
            ${investedSegments || `<span class="plan-invested-empty">No buys recorded this week.</span>`}
          </div>
          <div class="plan-invested-foot">${investedLabel} added this week</div>
        </div>
        <div class="plan-asset-blocks">
          ${assetBlocks || `<div class="plan-asset-block-empty">No allocations yet. Add assets to see a visual guide.</div>`}
        </div>
      </div>
    `;
  }

  _parsePlanPerAssetList(perAssetRaw) {
    if (!Array.isArray(perAssetRaw)) return [];
    return perAssetRaw
      .map((item) => String(item))
      .map((item) => {
        const [symbol, amount] = item.split(":");
        const normalizedSymbol = symbol?.trim();
        return { symbol: normalizedSymbol ? normalizedSymbol.toUpperCase() : null, amount: Number(amount) || 0 };
      })
      .filter((item) => item.symbol);
  }

  _ensurePlanEditor() {
    if (this._planEditorOverlay) return;
    this._planEditorOverlay = document.createElement("div");
    this._planEditorOverlay.className = "investment-tracker-plan-editor-overlay";
    this._planEditorOverlay.tabIndex = -1;
    this._planEditorOverlay.innerHTML = `
      <style>
        .investment-tracker-plan-editor-overlay {
          position: fixed;
          inset: 0;
          display: none;
          align-items: center;
          justify-content: center;
          background: rgba(15, 23, 42, 0.65);
          z-index: 11000;
        }
        .plan-editor-panel {
          background: var(--ha-card-background, #0f172a);
          color: var(--primary-text-color, #f8fafc);
          border-radius: 14px;
          padding: 20px;
          box-shadow: 0 24px 48px rgba(15, 23, 42, 0.35);
          width: min(460px, 92vw);
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .plan-editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .plan-editor-header h3 {
          margin: 0;
          font-size: 1.1rem;
        }
        .plan-editor-close {
          border: none;
          background: transparent;
          font-size: 1.1rem;
          cursor: pointer;
        }
        .plan-editor-body {
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          max-height: 60vh;
        }
        .plan-editor-field { display: flex; flex-direction: column; gap: 4px; }
        .plan-editor-field label { font-size: 12px; opacity: 0.8; }
        .plan-editor-field input,
        .plan-editor-field select { border-radius: 8px; border: 1px solid rgba(248, 250, 252, 0.2); padding: 8px 10px; font-size: 14px; background: rgba(248, 250, 252, 0.05); color: var(--primary-text-color, #f8fafc); }
        .plan-entry-list { display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; }
        .plan-entry-row { display: flex; gap: 8px; align-items: center; }
        .plan-entry-row input { border-radius: 6px; border: 1px solid rgba(248, 250, 252, 0.2); padding: 6px 10px; font-size: 13px; background: rgba(248, 250, 252, 0.05); color: var(--primary-text-color, #f8fafc); }
        .plan-entry-symbol { flex: 1; }
        .plan-entry-amount { width: 110px; }
        .plan-entry-remove { border: none; background: rgba(248, 250, 252, 0.1); border-radius: 50%; width: 26px; height: 26px; cursor: pointer; font-size: 12px; color: var(--primary-text-color, #f8fafc); }
        .plan-entry-empty { font-size: 12px; opacity: 0.65; }
        .plan-asset-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .plan-asset-actions input { flex: 1; }
        #plan-entry-add { border: none; border-radius: 8px; padding: 8px 16px; background: var(--primary-color, #1d4ed8); color: #fff; cursor: pointer; font-weight: 600; }
        .plan-editor-status { font-size: 12px; min-height: 18px; }
        .plan-editor-status.error { color: var(--error-color, #e53935); }
        .plan-editor-status.success { color: var(--success-color, #4caf50); }
        .plan-editor-footer { display: flex; justify-content: flex-end; gap: 8px; }
        .plan-editor-cancel,
        .plan-editor-save { border: none; border-radius: 8px; padding: 8px 16px; font-weight: 600; cursor: pointer; }
        .plan-editor-cancel { background: rgba(15, 23, 42, 0.08); color: var(--primary-text-color, #111); }
        .plan-editor-save { background: var(--primary-color, #1d4ed8); color: #fff; }
      </style>
      <div class="plan-editor-panel" role="dialog" aria-modal="true" aria-labelledby="plan-editor-title">
        <div class="plan-editor-header">
          <h3 id="plan-editor-title">Investment Plan</h3>
          <button type="button" class="plan-editor-close" aria-label="Close">✕</button>
        </div>
        <div class="plan-editor-body">
          <div class="plan-editor-field">
            <label for="plan-target-input">Target amount</label>
            <input type="number" id="plan-target-input" step="0.01" placeholder="0.00" />
          </div>
          <div class="plan-editor-field">
            <label for="plan-frequency-input">Frequency</label>
            <select id="plan-frequency-input">
              ${PLAN_FREQUENCIES.map((frequency) => `<option value="${frequency.value}">${frequency.label}</option>`).join("")}
            </select>
          </div>
          <div class="plan-editor-field">
            <label>Asset allocations</label>
            <div class="plan-entry-list"></div>
            <div class="plan-asset-actions">
              <input list="plan-asset-options" id="plan-asset-input" placeholder="Symbol" autocomplete="off" />
              <input type="number" id="plan-asset-amount-input" placeholder="Amount" step="0.01" min="0" />
              <button type="button" id="plan-entry-add">Add</button>
            </div>
            <datalist id="plan-asset-options"></datalist>
          </div>
        </div>
        <div class="plan-editor-status" aria-live="polite"></div>
        <div class="plan-editor-footer">
          <button type="button" class="plan-editor-cancel">Cancel</button>
          <button type="button" class="plan-editor-save">Save plan</button>
        </div>
      </div>
    `;
    document.body.appendChild(this._planEditorOverlay);
    const closeButton = this._planEditorOverlay.querySelector(".plan-editor-close");
    const cancelButton = this._planEditorOverlay.querySelector(".plan-editor-cancel");
    this._planEditorSaveButton = this._planEditorOverlay.querySelector(".plan-editor-save");
    const addButton = this._planEditorOverlay.querySelector("#plan-entry-add");
    this._planEditorTargetInput = this._planEditorOverlay.querySelector("#plan-target-input");
    this._planEditorFrequencyInput = this._planEditorOverlay.querySelector("#plan-frequency-input");
    this._planEditorAssetInput = this._planEditorOverlay.querySelector("#plan-asset-input");
    this._planEditorAssetAmountInput = this._planEditorOverlay.querySelector("#plan-asset-amount-input");
    this._planEditorEntryList = this._planEditorOverlay.querySelector(".plan-entry-list");
    this._planEditorStatusContainer = this._planEditorOverlay.querySelector(".plan-editor-status");
    this._planEditorOverlay.addEventListener("click", (event) => {
      if (event.target === this._planEditorOverlay) {
        this._closePlanEditor();
      }
    });
    this._planEditorOverlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this._closePlanEditor();
      }
    });
    closeButton?.addEventListener("click", () => this._closePlanEditor());
    cancelButton?.addEventListener("click", () => this._closePlanEditor());
    this._planEditorSaveButton?.addEventListener("click", () => this._savePlanFromEditor());
    addButton?.addEventListener("click", () => this._planEditorAddEntryFromForm());
    this._planEditorEntryList?.addEventListener("click", (event) => {
      const remove = event.target.closest(".plan-entry-remove");
      if (!remove) return;
      const index = Number(remove.getAttribute("data-index"));
      if (Number.isFinite(index)) {
        this._planEditorRemoveEntry(index);
      }
    });
    this._planEditorEntryList?.addEventListener("input", (event) => this._handlePlanEntryInput(event));
  }

  _openPlanEditor(serviceState, assetStates = []) {
    if (!serviceState) return;
    this._ensurePlanEditor();
    if (!this._planEditorOverlay) return;
    const attrs = serviceState.attributes || {};
    this._planEditorServiceEntryId = attrs.entry_id || null;
    this._planEditorBroker = attrs.broker_name || null;
    const totalValue = Number(attrs.plan_total);
    if (Number.isFinite(totalValue) && totalValue > 0) {
      this._planEditorTargetInput.value = totalValue;
    } else {
      this._planEditorTargetInput.value = "";
    }
    const frequency = attrs.plan_frequency || PLAN_FREQUENCIES[1]?.value || "monthly";
    this._planEditorFrequencyInput.value = frequency;
    this._planEditorEntries = this._parsePlanPerAssetList(attrs.plan_per_asset);
    this._planEditorPopulateAssetOptions(assetStates);
    this._renderPlanEditorEntries();
    this._planEditorClearStatus();
    this._planEditorAssetInput.value = "";
    this._planEditorAssetAmountInput.value = "";
    this._planEditorOverlay.style.display = "flex";
    this._planEditorOverlay.focus();
  }

  _closePlanEditor() {
    if (!this._planEditorOverlay) return;
    this._planEditorOverlay.style.display = "none";
    this._planEditorEntries = [];
    this._planEditorClearStatus();
    this._planEditorSaving = false;
    if (this._planEditorSaveButton) {
      this._planEditorSaveButton.disabled = false;
    }
  }

  _planEditorPopulateAssetOptions(assetStates) {
    if (!this._planEditorOverlay) return;
    const datalist = this._planEditorOverlay.querySelector("#plan-asset-options");
    if (!datalist) return;
    const seen = new Set();
    const options = (Array.isArray(assetStates) ? assetStates : [])
      .map((asset) => (asset?.attributes?.symbol || "").toString().trim().toUpperCase())
      .filter((symbol) => symbol && !seen.has(symbol))
      .map((symbol) => {
        seen.add(symbol);
        return `<option value="${this._escapeAttribute(symbol)}"></option>`;
      })
      .join("");
    datalist.innerHTML = options;
  }

  _renderPlanEditorEntries() {
    if (!this._planEditorEntryList) return;
    if (!this._planEditorEntries?.length) {
      this._planEditorEntryList.innerHTML = `<div class="plan-entry-empty">No asset allocations yet.</div>`;
      return;
    }
    this._planEditorEntryList.innerHTML = this._planEditorEntries
      .map((entry, index) => {
        const symbol = entry.symbol || "";
        const amount = Number.isFinite(entry.amount) ? entry.amount : "";
        return `
          <div class="plan-entry-row" data-index="${index}">
            <input list="plan-asset-options" class="plan-entry-symbol" value="${this._escapeAttribute(symbol)}" placeholder="Symbol" />
            <input type="number" class="plan-entry-amount" min="0" step="0.01" value="${this._escapeAttribute(String(amount))}" />
            <button type="button" class="plan-entry-remove" data-index="${index}" aria-label="Remove ${this._escapeAttribute(symbol || "allocation")}">✕</button>
          </div>
        `;
      })
      .join("");
  }

  _planEditorAddEntryFromForm() {
    if (!this._planEditorAssetInput || !this._planEditorAssetAmountInput) return;
    const symbolValue = (this._planEditorAssetInput.value || "").trim().toUpperCase();
    const amountValue = Number(this._planEditorAssetAmountInput.value);
    if (!symbolValue || !Number.isFinite(amountValue) || amountValue <= 0) {
      this._planEditorSetStatus("Provide a symbol and a positive amount", true);
      return;
    }
    this._planEditorEntries.push({ symbol: symbolValue, amount: amountValue });
    this._planEditorAssetInput.value = "";
    this._planEditorAssetAmountInput.value = "";
    this._renderPlanEditorEntries();
    this._planEditorSetStatus("Entry ready", false);
  }

  _handlePlanEntryInput(event) {
    const target = event.target;
    const row = target.closest(".plan-entry-row");
    if (!row) return;
    const index = Number(row.getAttribute("data-index"));
    if (!Number.isFinite(index)) return;
    if (!this._planEditorEntries[index]) return;
    if (target.classList.contains("plan-entry-symbol")) {
      this._planEditorEntries[index].symbol = (target.value || "").trim().toUpperCase();
    }
    if (target.classList.contains("plan-entry-amount")) {
      const parsed = Number(target.value);
      this._planEditorEntries[index].amount = Number.isFinite(parsed) ? parsed : 0;
    }
  }

  _planEditorRemoveEntry(index) {
    if (!Number.isFinite(index)) return;
    this._planEditorEntries.splice(index, 1);
    this._renderPlanEditorEntries();
  }

  _savePlanFromEditor() {
    if (!this._planEditorSaveButton || this._planEditorSaving || !this._hass) return;
    const payload = {};
    const targetValue = Number(this._planEditorTargetInput?.value);
    if (Number.isFinite(targetValue)) {
      payload.plan_total = targetValue;
    }
    const frequencyValue = this._planEditorFrequencyInput?.value || PLAN_FREQUENCIES[1]?.value || "monthly";
    payload.plan_frequency = frequencyValue;
    const validEntries = (this._planEditorEntries || [])
      .map((entry) => ({ symbol: (entry.symbol || "").trim().toUpperCase(), amount: Number(entry.amount) || 0 }))
      .filter((entry) => entry.symbol && Number.isFinite(entry.amount) && entry.amount > 0);
    payload.plan_per_asset = validEntries.map((entry) => `${entry.symbol}:${entry.amount}`);
    if (this._planEditorServiceEntryId) {
      payload.entry_id = this._planEditorServiceEntryId;
    } else if (this._planEditorBroker) {
      payload.broker = this._planEditorBroker;
    }
    this._planEditorSaving = true;
    this._planEditorSaveButton.disabled = true;
    this._planEditorSetStatus("Saving plan...");
    this._hass
      .callService("investment_tracker", "update_plan", payload)
      .then(() => {
        this._planEditorSetStatus("Plan updated", false);
        this._closePlanEditor();
      })
      .catch((err) => {
        this._planEditorSetStatus("Failed to save plan", true);
        console.error("Investment Tracker card: plan update failed", err);
      })
      .finally(() => {
        this._planEditorSaving = false;
        if (this._planEditorSaveButton) {
          this._planEditorSaveButton.disabled = false;
        }
      });
  }

  _planEditorSetStatus(message, isError = false) {
    if (!this._planEditorStatusContainer) return;
    this._planEditorStatusContainer.textContent = message;
    this._planEditorStatusContainer.classList.toggle("error", Boolean(isError));
    this._planEditorStatusContainer.classList.toggle("success", Boolean(message) && !isError);
  }

  _planEditorClearStatus() {
    if (!this._planEditorStatusContainer) return;
    this._planEditorStatusContainer.textContent = "";
    this._planEditorStatusContainer.classList.remove("error", "success");
  }

  _getAssetPriceTrend(entityId, currentPrice) {
    if (!entityId) return null;
    if (!this._assetPriceSnapshots) {
      this._assetPriceSnapshots = {};
    }
    const previousEntry = this._assetPriceSnapshots[entityId];
    const previousPrice = Number(previousEntry?.price ?? NaN);
    let trend = previousEntry?.trend || null;
    if (Number.isFinite(currentPrice) && Number.isFinite(previousPrice)) {
      if (currentPrice > previousPrice) {
        trend = "up";
      } else if (currentPrice < previousPrice) {
        trend = "down";
      }
    }
    if (Number.isFinite(currentPrice)) {
      this._assetPriceSnapshots[entityId] = { price: currentPrice, trend };
    }
    return trend;
  }

  _getAssets(brokerSlugs = [], brokerNames = []) {
    const states = this._hass.states;
    const normalizedSlugs = (Array.isArray(brokerSlugs) ? brokerSlugs : [])
      .map((slug) => (slug || "").toString().toLowerCase())
      .filter(Boolean);
    const normalizedBrokers = (Array.isArray(brokerNames) ? brokerNames : [])
      .map((name) => (name || "").toString().toLowerCase())
      .filter(Boolean);
    // Verzamel alle relevante assets
    let assets = Object.values(states).filter((stateObj) => {
      if (!stateObj || !stateObj.entity_id?.startsWith("sensor.")) return false;
      const attrs = stateObj.attributes || {};
      if (!attrs.symbol || !Object.prototype.hasOwnProperty.call(attrs, "market_value")) return false;
      const entityId = stateObj.entity_id || "";
      if (normalizedSlugs.length && normalizedSlugs.some((slug) => entityId.startsWith(`sensor.${slug}_`))) {
        return true;
      }
      if (
        normalizedBrokers.length &&
        normalizedBrokers.includes(String(attrs.broker || "").toLowerCase())
      ) {
        return true;
      }
      return false;
    });
    // Dedupliceer op symbol+broker (of entity_id als fallback)
    const seen = new Set();
    assets = assets.filter((stateObj) => {
      const attrs = stateObj.attributes || {};
      const symbol = attrs.symbol || "";
      const broker = String(attrs.broker || "").toLowerCase();
      const key = symbol || broker ? `${symbol}__${broker}` : stateObj.entity_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return assets;
  }

  _normalizeAssetName(value, brokerCandidates = []) {
    const raw = String(value || "");
    if (!raw) return raw;
    let name = raw;
    const candidates = (Array.isArray(brokerCandidates) ? brokerCandidates : [brokerCandidates])
      .map((candidate) => (candidate || "").toString().trim())
      .filter(Boolean);
    const normalizedCandidates = Array.from(
      new Set(
        candidates.flatMap((candidate) => {
          const variants = [candidate];
          const spaced = candidate.replace(/_/g, " ").trim();
          if (spaced && spaced !== candidate) {
            variants.push(spaced);
          }
          return variants;
        })
      )
    );
    for (const candidate of normalizedCandidates) {
      const prefix = `${candidate} `;
      if (candidate && name.toLowerCase().startsWith(prefix.toLowerCase())) {
        name = name.slice(prefix.length).trim();
      }
    }
    if (name.toLowerCase().endsWith(" value")) {
      name = name.slice(0, -6).trim();
    }
    return name;
  }

  _escapeAttribute(value) {
    return (value ?? "").toString().replace(/"/g, "&quot;");
  }

  _escapeHtml(value) {
    return (value ?? "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  _getServiceEntities() {
    const states = this._hass.states;
    return Object.values(states)
      .filter((stateObj) => {
        if (!stateObj || !stateObj.entity_id?.startsWith("sensor.")) return false;
        const attrs = stateObj.attributes || {};
        return attrs.broker_name && attrs.broker_type;
      })
      .map((stateObj) => ({
        entity_id: stateObj.entity_id,
        label: stateObj.attributes?.friendly_name || stateObj.attributes?.broker_name || stateObj.entity_id,
      }));
  }

  _getServiceEntity(serviceEntities = []) {
    // 1. Als gebruiker een andere service selecteerde, gebruik die
    if (this._selectedServiceEntity && this._hass.states[this._selectedServiceEntity]) {
      return this._selectedServiceEntity;
    }
    // 2. Config: expliciet gekozen service_entity
    if (this.config.service_entity && this._hass.states[this.config.service_entity]) {
      this._selectedServiceEntity = this.config.service_entity;
      return this.config.service_entity;
    }
    // 3. Config: default_service_entity
    if (this.config.default_service_entity && this._hass.states[this.config.default_service_entity]) {
      this._selectedServiceEntity = this.config.default_service_entity;
      return this.config.default_service_entity;
    }
    // 4. Config: broker
    const broker = (this.config.broker || "").toString().toLowerCase();
    if (broker) {
      const match = serviceEntities.find((entity) => {
        const attrs = this._hass.states[entity.entity_id]?.attributes || {};
        const brokerName = (attrs.broker_name || "").toString().toLowerCase();
        return brokerName === broker;
      });
      if (match) {
        this._selectedServiceEntity = match.entity_id;
        return match.entity_id;
      }
    }
    // 5. Fallback: eerste service entity
    if (serviceEntities.length) {
      this._selectedServiceEntity = serviceEntities[0].entity_id;
      return serviceEntities[0].entity_id;
    }
    // 6. Fallback: eerste entity met 'investment_tracker_'
    return Object.keys(this._hass.states).find((entityId) => entityId.includes("investment_tracker_")) || null;
  }

  _getServiceBrokerNames(serviceState, fallbackBroker) {
    const attrs = serviceState?.attributes || {};
    const names = [];
    const seen = new Set();
    const append = (value) => {
      const normalized = (value || "").toString().trim();
      if (!normalized) {
        return;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      names.push(normalized);
    };
    append(attrs.broker_name || fallbackBroker || "");
    const additional = attrs.broker_names;
    if (Array.isArray(additional)) {
      additional.forEach((value) => append(value));
    }
    return names;
  }

  _renderPortfolioSelect(serviceEntities, selected) {
    if (!serviceEntities.length) return "";
    const options = serviceEntities
      .map((entity) => {
        const isSelected = entity.entity_id === selected ? "selected" : "";
        return `<option value="${entity.entity_id}" ${isSelected}>${entity.label}</option>`;
      })
      .join("");
    return `<select id="portfolio-select" aria-label="Portfolio">${options}</select>`;
  }

  _renderPortfolioChart(entityId, currencySymbol) {
    if (!entityId) {
      return `<div class="chart-placeholder">No portfolio entity found</div>`;
    }
    const points = this._historyCache?.[entityId] || [];
    const status = this._historyStatus?.[entityId] || "idle";
    const hasData = points.length > 0;
    const latestValue = hasData ? points[points.length - 1].value : this._getStateNumber(entityId);
    const statusMessage = hasData
      ? ""
      : status === "loading" || status === "idle"
      ? "Loading portfolio history…"
      : status === "empty"
      ? "No history data yet"
      : "History unavailable";
    const containerId = this._chartContainerId(entityId);
    return `
      <div class="apex-chart" id="${containerId}">
        ${statusMessage ? `<div class="chart-message">${statusMessage}</div>` : ""}
      </div>
      <div class="metric-foot">Latest: ${currencySymbol}${this._formatNumber(latestValue)}</div>
    `;
  }

  _renderRangeButtons() {
    return this._historyRanges
      .map((range) => {
        const active = range === this._historyRange ? "active" : "";
        return `<button type="button" data-range="${range}" class="${active}">${range}</button>`;
      })
      .join("");
  }

  _scheduleApexChartRender(entityId, currencySymbol) {
    if (!entityId) return;
    this._pendingApexRender = { entityId, currencySymbol };
    const trigger = () => {
      const info = this._pendingApexRender;
      this._pendingApexRender = null;
      if (info) {
        this._renderApexChart(info.entityId, info.currencySymbol);
      }
    };
    const raf = typeof window !== "undefined" && window.requestAnimationFrame?.bind(window);
    if (raf) {
      raf(trigger);
    } else {
      setTimeout(trigger, 0);
    }
  }

  async _renderApexChart(entityId, currencySymbol) {
    if (!entityId || !this.content) return;
    const container = this.content.querySelector(`#${this._chartContainerId(entityId)}`);
    if (!container) return;
    const points = this._historyCache?.[entityId] || [];
    if (!points.length) {
      this._destroyApexChart();
      return;
    }
    container.innerHTML = "";
    try {
      await this._ensureApexLoaded();
    } catch {
      container.innerHTML = `<div class="chart-message">Chart library unavailable</div>`;
      return;
    }
    const accentColor = this._getCssColor("--primary-color") || "#2563eb";
    const now = Date.now();
    const rangeDays = this._historyRangeToDays(this._historyRange);
    const rangeMs = Math.max(rangeDays, 1) * 24 * 60 * 60 * 1000;
    const rangeStart = now - rangeMs;
    let series = points.map((point) => ({
      x: new Date(point.time).getTime(),
      y: Number(point.value),
    }));
    if (series.length && series[0].x > rangeStart) {
      series = [{ x: rangeStart, y: series[0].y }, ...series];
    }
    this._destroyApexChart();
    const formatValue = (value) => `${currencySymbol}${this._formatNumber(value)}`;
    const options = {
      chart: {
        type: "area",
        height: 240,
        toolbar: { show: false },
        animations: { enabled: true, easing: "easeinout", speed: 420 },
        fontFamily: "inherit",
      },
      series: [
        {
          name: "Portfolio",
          data: series,
        },
      ],
      stroke: { curve: "smooth", width: 2.5 },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.55,
          opacityTo: 0,
          stops: [0, 90, 100],
        },
      },
      colors: [accentColor],
      markers: { size: 0 },
      tooltip: {
        y: {
          formatter: formatValue,
        },
        theme: "dark",
        style: {
          fontSize: "13px",
          background: "rgba(15, 23, 42, 0.92)",
        },
      },
      // dataLabels: {
      //   enabled: true,
      //   offsetY: -4,
      //   style: {
      //     colors: ["var(--primary-text-color, #111)"],
      //     fontSize: "10px",
      //   },
      //   formatter: (value) => `${currencySymbol}${this._formatNumberMaxDecimals(Number(value), 2)}`,
      // },
      xaxis: {
        type: "datetime",
        min: rangeStart,
        max: now,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: {
          style: { colors: "var(--primary-text-color, #111)", fontSize: "10px" },
          datetimeUTC: false,
        },
      },
      yaxis: {
        labels: {
          formatter: formatValue,
          style: { colors: "var(--primary-text-color, #111)", fontSize: "10px" },
        },
        axisBorder: { show: true },
        axisTicks: { show: true },
      },
      grid: {
        strokeDashArray: 4,
        borderColor: "rgba(15, 23, 42, 0.08)",
      },
    };
    const ApexChartsCtor = typeof window !== "undefined" ? window.ApexCharts : null;
    if (!ApexChartsCtor) {
      container.innerHTML = `<div class="chart-message">Chart library unavailable</div>`;
      return;
    }
    this._apexChart = new ApexChartsCtor(container, options);
    this._apexChart.render();
  }

  _ensureApexLoaded() {
    if (typeof window !== "undefined" && window.ApexCharts) {
      return Promise.resolve();
    }
    if (this._apexLoadPromise) return this._apexLoadPromise;
    this._apexLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/apexcharts@3.35.3";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load ApexCharts"));
      document.head.appendChild(script);
    });
    return this._apexLoadPromise;
  }

  _getCssColor(variable) {
    if (typeof window === "undefined" || !window.getComputedStyle) return "";
    const value = getComputedStyle(document.documentElement).getPropertyValue(variable);
    return value ? value.trim() : "";
  }

  _destroyApexChart() {
    if (this._apexChart) {
      try {
        this._apexChart.destroy();
      } catch {
        // ignore
      }
      this._apexChart = null;
    }
  }

  _chartContainerId(entityId) {
    const safe = String(entityId || "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return `portfolio-chart-${safe || "default"}`;
  }

  _bindChartRangeButtons(entityId) {
    if (!entityId) return;
    const buttons = this.content?.querySelectorAll(".chart-range button") || [];
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const range = button.dataset.range;
        if (range) {
          this._selectHistoryRange(range, entityId);
        }
      });
    });
  }

  _bindAssetSelection() {
    const rows = this.content?.querySelectorAll(".asset-row") || [];
    rows.forEach((row) => {
      const handleSelection = (event) => {
        if (event?.target?.closest("button")) return;
        const entityId = row.getAttribute("data-entity");
        const name = row.getAttribute("data-name") || "";
        if (entityId) {
          this._selectAsset(entityId, name);
        }
      };
      row.addEventListener("click", handleSelection);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleSelection(event);
        }
      });
    });
  }

  _bindPlanCardActions(serviceEntityId) {
    const button = this.content?.querySelector(".plan-card-edit");
    if (!button || !this._hass) return;
    button.addEventListener("click", () => {
      const entityId = (serviceEntityId || button.getAttribute("data-service") || "").trim();
      if (!entityId) return;
      const serviceState = this._hass.states[entityId];
      if (!serviceState) return;
      const brokerSlugs = Array.isArray(serviceState.attributes?.broker_slugs)
        ? serviceState.attributes.broker_slugs
        : [];
      const brokerNames = Array.isArray(serviceState.attributes?.broker_names)
        ? serviceState.attributes.broker_names
        : [];
      const assetStates = this._getAssets(brokerSlugs, brokerNames);
      this._openPlanEditor(serviceState, assetStates);
    });
  }

  _selectAsset(entityId, name) {
    const alreadySelected = this._selectedAssetEntityId === entityId;
    this._selectedAssetEntityId = alreadySelected ? null : entityId;
    this._selectedAssetName = alreadySelected ? null : name || null;
    const targetEntity = this._selectedAssetEntityId || this._portfolioEntityId;
    if (targetEntity) {
      this._historyUpdated = this._historyUpdated || {};
      this._historyStatus = this._historyStatus || {};
      this._historyUpdated[targetEntity] = 0;
      this._historyStatus[targetEntity] = "loading";
      this._loadHistory(targetEntity, { force: true, range: this._historyRange });
    }
    this._render();
  }

  _selectHistoryRange(range, entityId) {
    if (!range || !entityId) return;
    this._historyRange = range;
    this._historyUpdated = this._historyUpdated || {};
    this._historyStatus = this._historyStatus || {};
    this._historyUpdated[entityId] = 0;
    this._historyStatus[entityId] = "loading";
    this._loadHistory(entityId, { force: true, range });
    this._render();
  }

  _historyRangeToDays(range) {
    const mapping = {
      "1D": 1,
      "1W": 7,
      "1M": 30,
      "3M": 90,
      "1Y": 365,
      "ALL": 3650,
    };
    return mapping[range] || 30;
  }

  _renderCurrencyDistribution(assets, currencySymbol) {
    if (!assets.length) {
      return `<div class="chart-placeholder">No assets available</div>`;
    }
    const total = assets.reduce(
      (sum, asset) => sum + (Number(asset.attributes?.market_value ?? asset.state) || 0),
      0
    );
    const byCurrency = assets.reduce((acc, asset) => {
      // Maak currency hoofdletterongevoelig door te normaliseren naar uppercase
      const currencyRaw = (asset.attributes?.currency || "Unknown").toString();
      const currency = currencyRaw.toUpperCase();
      const value = Number(asset.attributes?.market_value ?? asset.state) || 0;
      acc[currency] = (acc[currency] || 0) + value;
      return acc;
    }, {});
    const rows = Object.entries(byCurrency)
      .sort((a, b) => b[1] - a[1])
      .map(([currency, value]) => {
        const pct = total > 0 ? ((value / total) * 100).toFixed(3) : "0.000";
        return `<div class="legend-row"><span><span class="legend-dot"></span>${currency}</span><span>${pct}%</span></div>`;
      })
      .join("");
    return `<div class="legend">${rows}</div>`;
  }

  _renderSectorAllocation(assets) {
    if (!assets.length) {
      return `<div class="chart-placeholder">No assets available</div>`;
    }
    const total = assets.reduce(
      (sum, asset) => sum + (Number(asset.attributes?.market_value ?? asset.state) || 0),
      0
    );
    const bySector = assets.reduce((acc, asset) => {
      const sectorRaw = (asset.attributes?.sector || "Unknown").toString().trim();
      const sectorKey = (sectorRaw || "Unknown").toLowerCase();
      const sectorLabel = sectorRaw || "Unknown";
      const value = Number(asset.attributes?.market_value ?? asset.state) || 0;
      if (!acc[sectorKey]) {
        acc[sectorKey] = { label: sectorLabel, value: 0 };
      }
      acc[sectorKey].value += value;
      return acc;
    }, {});
    const rows = Object.values(bySector)
      .sort((a, b) => b.value - a.value)
      .map(({ label, value }) => {
        const pct = total > 0 ? ((value / total) * 100).toFixed(3) : "0.000";
        return `<div class="legend-row"><span><span class="legend-dot"></span>${label}</span><span>${pct}%</span></div>`;
      })
      .join("");
    return `<div class="legend">${rows}</div>`;
  }

  _renderAssetAllocation(assets) {
    if (!assets.length) {
      return `<div class="chart-placeholder">No assets available</div>`;
    }
    const total = assets.reduce(
      (sum, asset) => sum + (Number(asset.attributes?.market_value ?? asset.state) || 0),
      0
    );
    const byCategory = assets.reduce((acc, asset) => {
      const category = (asset.attributes?.category || "Other").toString();
      const value = Number(asset.attributes?.market_value ?? asset.state) || 0;
      acc[category] = (acc[category] || 0) + value;
      return acc;
    }, {});
    const rows = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([category, value]) => {
        const pct = total > 0 ? ((value / total) * 100).toFixed(3) : "0.000";
        return `<div class="legend-row"><span><span class="legend-dot"></span>${category}</span><span>${pct}%</span></div>`;
      })
      .join("");
    return `<div class="legend">${rows}</div>`;
  }

  _findTotalEntityId(brokerSlug, key) {
    const legacy = `sensor.${brokerSlug}_investment_${key}`;
    const current = `sensor.${brokerSlug}_${key}`;
    if (this._hass.states[current]) return current;
    if (this._hass.states[legacy]) return legacy;
    const candidates = Object.keys(this._hass.states).filter(
      (entityId) =>
        entityId.startsWith("sensor.") &&
        entityId.includes(brokerSlug) &&
        entityId.endsWith(key)
    );
    if (candidates.length) {
      return candidates[0];
    }
    const fallback = Object.keys(this._hass.states).find(
      (entityId) =>
        entityId.startsWith("sensor.") &&
        entityId.endsWith(key)
    );
    return fallback || null;
  }

  _slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  _formatNumber(value) {
    if (!Number.isFinite(value)) return "-";
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(value);
  }

  _formatNumberMaxDecimals(value, maxDecimals = 2) {
    if (!Number.isFinite(value)) return "-";
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    }).format(value);
  }

  _getStateNumber(entityId) {
    if (!entityId) return 0;
    const state = this._hass.states[entityId];
    if (!state) return 0;
    const value = Number(state.state);
    return Number.isFinite(value) ? value : 0;
  }

  _getUnit(entityId) {
    if (!entityId) return "";
    const state = this._hass.states[entityId];
    return state?.attributes?.unit_of_measurement || "";
  }

  _getCurrencySymbol(code) {
    const upper = String(code || "").toUpperCase();
    const map = {
      EUR: "€",
      USD: "$",
      GBP: "£",
      CHF: "CHF ",
      PLN: "zł",
      JPY: "¥",
    };
    return map[upper] ?? (upper ? `${upper} ` : "");
  }

  _loadHistory(entityId, options = {}) {
    if (!entityId || !this._hass?.callWS) return;
    const { force = false, range } = options;
    const requestedRange = range || this._historyRange;
    const now = Date.now();
    this._historyCache = this._historyCache || {};
    this._historyUpdated = this._historyUpdated || {};
    this._historyStatus = this._historyStatus || {};
    const last = this._historyUpdated[entityId] || 0;
    if (!force && now - last < 300000) return;
    this._historyUpdated[entityId] = now;
    this._historyStatus[entityId] = "loading";
    const requestToken = `${entityId}:${requestedRange}:${now}`;
    this._historyRequestTokens = this._historyRequestTokens || {};
    this._historyRequestTokens[entityId] = requestToken;
    const timeoutId = setTimeout(() => {
      if (this._historyRequestTokens[entityId] !== requestToken) return;
      if (this._historyStatus[entityId] === "loading") {
        this._historyStatus[entityId] = "empty";
        this._render();
      }
    }, 8000);
    const rangeDays = this._historyRangeToDays(requestedRange);
    const start = new Date(now - 1000 * 60 * 60 * 24 * rangeDays).toISOString();
    this._hass
      .callWS({
        type: "history/period",
        start_time: start,
        filter_entity_id: [entityId],
        minimal_response: true,
      })
      .then((response) => {
        clearTimeout(timeoutId);
        if (this._historyRequestTokens[entityId] !== requestToken) return;
        this._handleHistoryResponse(entityId, response?.[0] || []);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (this._historyRequestTokens[entityId] !== requestToken) return;
        if (err?.code === "unknown_command") {
          this._loadHistoryRest(entityId, start, requestToken);
          return;
        }
        this._historyStatus[entityId] = "error";
         
        console.warn("Investment Tracker card: history fetch failed", err);
        this._render();
      });
  }

  _loadHistoryRest(entityId, start, requestToken) {
    if (!this._hass?.callApi) return;
    const path = `history/period/${encodeURIComponent(start)}?filter_entity_id=${encodeURIComponent(entityId)}&minimal_response=1`;
    this._hass
      .callApi("GET", path)
      .then((response) => {
        if (this._historyRequestTokens?.[entityId] !== requestToken) return;
        this._handleHistoryResponse(entityId, response?.[0] || []);
      })
      .catch((err) => {
        if (this._historyRequestTokens?.[entityId] !== requestToken) return;
        this._historyStatus[entityId] = "error";
         
        console.warn("Investment Tracker card: history fetch failed (REST)", err);
        this._render();
      });
  }

  _ensureDayChange(entityId) {
    if (!entityId) return;
    const hasWs = !!this._hass?.callWS;
    const hasRest = !!this._hass?.callApi;
    if (!hasWs && !hasRest) return;
    this._dayChangeUpdated = this._dayChangeUpdated || {};
    this._dayChangeRequestTokens = this._dayChangeRequestTokens || {};
    const now = Date.now();
    const last = this._dayChangeUpdated[entityId] || 0;
    if (now - last < 300000 && this._dayChangeCache?.[entityId]) {
      return;
    }
    this._dayChangeUpdated[entityId] = now;
    const start = new Date();
    start.setHours(0, 0, 0, 0, 0);
    const startIso = start.toISOString();
    this._dayChangeStartTimes[entityId] = start.getTime();
    const requestToken = `${entityId}:${startIso}:${now}`;
    this._dayChangeRequestTokens[entityId] = requestToken;
    this._dayChangeStatus = this._dayChangeStatus || {};
    this._dayChangeStatus[entityId] = "loading";
    const fetchRest = () => {
      if (hasRest) {
        this._loadDayChangeRest(entityId, startIso, requestToken);
      }
    };
    if (hasWs) {
      this._hass
        .callWS({
          type: "history/period",
          start_time: startIso,
          filter_entity_id: [entityId],
          minimal_response: true,
        })
        .then((response) => {
          if (this._dayChangeRequestTokens[entityId] !== requestToken) return;
          this._dayChangeStatus[entityId] = "ready";
          this._handleDayChangeResponse(entityId, response?.[0] || []);
        })
        .catch((err) => {
          if (this._dayChangeRequestTokens[entityId] !== requestToken) return;
          if (err?.code === "unknown_command") {
            if (hasRest) {
              console.warn("Investment Tracker card: history/period WS command unsupported, falling back to REST");
              fetchRest();
              return;
            }
            this._dayChangeStatus[entityId] = "unsupported";
            this._render();
            return;
          }
          this._dayChangeStatus[entityId] = "error";
           
          console.warn("Investment Tracker card: day change fetch failed", err);
          fetchRest();
        });
    } else {
      fetchRest();
    }
  }

  _handleDayChangeResponse(entityId, entries) {
    const points = (entries || [])
      .map((entry) => ({
        value: this._parseNumber(entry.s ?? entry.state),
        time: entry.lu || entry.last_updated || entry.last_changed || entry.t,
      }))
      .filter((point) => Number.isFinite(point.value))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    console.log(
      "day change points",
      entityId,
      points.map((point) => ({
        value: point.value,
        time: new Date(point.time).toISOString(),
      }))
    );
    this._dayChangeCache = this._dayChangeCache || {};
    if (!points.length) {
      this._dayChangeCache[entityId] = null;
      this._render();
      return;
    }
    const startTimeMs = this._dayChangeStartTimes?.[entityId];
    let baselinePoint = points[0];
    if (typeof startTimeMs === "number") {
      const afterStart = points.filter((point) => new Date(point.time).getTime() >= startTimeMs);
      if (afterStart.length) {
        baselinePoint = afterStart[0];
      } else {
        const beforeStart = points.filter((point) => new Date(point.time).getTime() < startTimeMs);
        if (beforeStart.length) {
          baselinePoint = beforeStart[beforeStart.length - 1];
        }
      }
    }
    const startValue = baselinePoint?.value ?? points[0].value;
    const latestValue = points[points.length - 1].value;
    const change = latestValue - startValue;
    const pct = startValue ? (change / startValue) * 100 : 0;
    this._dayChangeCache[entityId] = { value: change, pct };
    this._render();
  }

  _handleHistoryResponse(entityId, entries) {
    const points = (entries || [])
      .map((entry) => ({
        value: this._parseNumber(entry.s ?? entry.state),
        time: entry.lu || entry.last_updated || entry.last_changed || entry.t,
      }))
      .filter((point) => Number.isFinite(point.value))
      .sort((a, b) => {
        const at = new Date(a.time).getTime();
        const bt = new Date(b.time).getTime();
        return at - bt;
      });
    const previousPoints = this._historyCache?.[entityId] || [];
    if (points.length) {
      this._historyCache[entityId] = points;
      this._historyStatus[entityId] = "ready";
    } else if (previousPoints.length) {
      this._historyStatus[entityId] = "ready";
    } else {
      this._historyStatus[entityId] = "empty";
    }
    this._render();
  }

  _parseNumber(value) {
    if (value === null || value === undefined) return NaN;
    if (typeof value === "number") return value;
    const text = String(value).trim();
    if (!text) return NaN;
    const normalized = text.replace(/,/g, ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
    const match = normalized.match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  _getState(entityId) {
    const state = this._hass.states[entityId];
    return state ? state.state : "-";
  }

  static getStubConfig() {
    return {
      title: "Investment Tracker",
      subtitle: "Your portfolio, your way.",
      broker: "teststocks",
      show_header: true,
      show_positions: true,
      hide_unmapped: false,
      show_refresh: true,
      show_asset_refresh: true,
      show_charts: true,
      show_plan: true,
    };
  }

  static getConfigElement() {
    // Home Assistant UI config element conventie
    class InvestmentTrackerCardConfigEditor extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" });
        this.shadowRoot.innerHTML = `
          <style>
            .config-row { margin-bottom: 1em; }
            .config-label { display: block; font-weight: bold; margin-bottom: 0.2em; }
            .config-input { width: 100%; padding: 0.3em; }
          </style>
          <div class="config-row">
            <label class="config-label">Titel</label>
            <input class="config-input" id="title" placeholder="Investment Tracker" />
          </div>
          <div class="config-row">
            <label class="config-label">Standaard service entity</label>
            <select class="config-input" id="default_service_entity"></select>
          </div>
          <div class="config-row">
            <label class="config-label">Toon asset refresh-knop</label>
            <input type="checkbox" id="show_asset_refresh" />
          </div>
          <div class="config-row">
            <label class="config-label">Toon header</label>
            <input type="checkbox" id="show_header" />
          </div>
          <div class="config-row">
            <label class="config-label">Toon posities</label>
            <input type="checkbox" id="show_positions" />
          </div>
          <div class="config-row">
            <label class="config-label">Verberg niet-gemapte assets</label>
            <input type="checkbox" id="hide_unmapped" />
          </div>
          <div class="config-row">
            <label class="config-label">Toon refresh-knop</label>
            <input type="checkbox" id="show_refresh" />
          </div>
          <div class="config-row">
            <label class="config-label">Toon charts</label>
            <input type="checkbox" id="show_charts" />
          </div>
          <div class="config-row">
            <label class="config-label">Toon investeringsplan</label>
            <input type="checkbox" id="show_plan" />
          </div>
        `;
        this._config = {};
        this._hass = null;
      }
      setConfig(config) {
        this._config = config || {};
        this._updateFields();
        this._updateEntities();
      }
      set hass(hass) {
        this._hass = hass;
        this._updateEntities();
      }
      getConfig() {
        return {
          type: "custom:investment-tracker-card",
          title: this.shadowRoot.querySelector("#title").value,
          default_service_entity: this.shadowRoot.querySelector("#default_service_entity").value,
          show_asset_refresh: this.shadowRoot.querySelector("#show_asset_refresh").checked,
          show_header: this.shadowRoot.querySelector("#show_header").checked,
          show_positions: this.shadowRoot.querySelector("#show_positions").checked,
          hide_unmapped: this.shadowRoot.querySelector("#hide_unmapped").checked,
          show_refresh: this.shadowRoot.querySelector("#show_refresh").checked,
          show_charts: this.shadowRoot.querySelector("#show_charts").checked,
          show_plan: this.shadowRoot.querySelector("#show_plan").checked,
        };
      }
      _updateFields() {
        this.shadowRoot.querySelector("#title").value = this._config.title || "";
        this.shadowRoot.querySelector("#show_asset_refresh").checked = !!this._config.show_asset_refresh;
        this.shadowRoot.querySelector("#show_header").checked = !!this._config.show_header;
        this.shadowRoot.querySelector("#show_positions").checked = !!this._config.show_positions;
        this.shadowRoot.querySelector("#hide_unmapped").checked = !!this._config.hide_unmapped;
        this.shadowRoot.querySelector("#show_refresh").checked = !!this._config.show_refresh;
        this.shadowRoot.querySelector("#show_charts").checked = !!this._config.show_charts;
        this.shadowRoot.querySelector("#show_plan").checked = !!this._config.show_plan;
      }
      _updateEntities() {
        const select = this.shadowRoot.querySelector("#default_service_entity");
        if (!select) return;
        select.innerHTML = "";
        if (!this._hass) {
          select.disabled = true;
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = "Laden...";
          select.appendChild(opt);
          return;
        }
        const entities = Object.values(this._hass.states)
          .filter((s) => s.entity_id && s.entity_id.startsWith("sensor.") && s.attributes && s.attributes.broker_name && s.attributes.broker_type)
          .map((s) => ({ id: s.entity_id, label: s.attributes.friendly_name || s.entity_id }));
        if (entities.length === 0) {
          select.disabled = true;
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = "Geen service entiteiten gevonden";
          select.appendChild(opt);
        } else {
          select.disabled = false;
          entities.forEach((e) => {
            const opt = document.createElement("option");
            opt.value = e.id;
            opt.textContent = e.label;
            select.appendChild(opt);
          });
          // Herstel selectie
          if (this._config.default_service_entity) {
            select.value = this._config.default_service_entity;
          }
        }
      }
      connectedCallback() {
        this.shadowRoot.querySelector("#title").addEventListener("input", () => this._fireConfigChanged());
        this.shadowRoot.querySelector("#default_service_entity").addEventListener("change", () => this._fireConfigChanged());
        this.shadowRoot.querySelector("#show_asset_refresh").addEventListener("change", () => this._fireConfigChanged());
        this.shadowRoot.querySelector("#show_header").addEventListener("change", () => this._fireConfigChanged());
        this.shadowRoot.querySelector("#show_positions").addEventListener("change", () => this._fireConfigChanged());
        this.shadowRoot.querySelector("#hide_unmapped").addEventListener("change", () => this._fireConfigChanged());
        this.shadowRoot.querySelector("#show_refresh").addEventListener("change", () => this._fireConfigChanged());
        this.shadowRoot.querySelector("#show_charts").addEventListener("change", () => this._fireConfigChanged());
        this.shadowRoot.querySelector("#show_plan").addEventListener("change", () => this._fireConfigChanged());
      }
      _fireConfigChanged() {
        this.dispatchEvent(new CustomEvent("config-changed", {
          detail: { config: this.getConfig() },
          bubbles: true,
          composed: true,
        }));
      }
    }
    if (!customElements.get("investment-tracker-card-config-editor")) {
      customElements.define("investment-tracker-card-config-editor", InvestmentTrackerCardConfigEditor);
    }
    return document.createElement("investment-tracker-card-config-editor");
  }
}

if (!customElements.get("investment-tracker-card")) {
  customElements.define("investment-tracker-card", InvestmentTrackerCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "investment-tracker-card",
  name: "Investment Tracker Card",
  description: "Monitor your investment portfolio.",
});
