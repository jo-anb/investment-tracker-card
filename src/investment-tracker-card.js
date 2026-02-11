/* Investment Tracker Card (skeleton) */
class InvestmentTrackerCard extends HTMLElement {
  _assetListScroll = 0;
  _historyRange = "1M";
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
  _dayChangeDisabled = false;
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

  _loadDayChangeRest(entityId, start, requestToken) {
    if (!entityId || !this._hass?.callApi) return;
    const path = `history/period/${encodeURIComponent(start)}?filter_entity_id=${encodeURIComponent(entityId)}&minimal_response=1`;
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
        this._loadDayChangeRest(entityId, startIso, requestToken);
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

    const previousAssetList = this.content?.querySelector(".asset-list");
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

    const assets = this._getAssets(serviceBrokerSlugs, serviceBrokerNames);
    const brokers = Array.from(new Set(assets.map((asset) => asset.attributes?.broker).filter(Boolean)));
    const assetCount = assets.length;
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

    const positions = this.config.show_positions ? this._renderPositions(assets, portfolioSymbol, brokerName) : "";
    const chartsEnabled = this.config.show_charts && totalValueEntityId;
    this._portfolioEntityId = totalValueEntityId;
    const activeChartEntity = chartsEnabled ? (this._selectedAssetEntityId || totalValueEntityId) : null;
    if (activeChartEntity) {
      this._loadHistory(activeChartEntity, { range: this._historyRange });
    } else {
      this._destroyApexChart();
    }
    const chartTitle = this._selectedAssetName ? `Portfolio - ${this._escapeHtml(this._selectedAssetName)}` : "Portfolio";
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

    const plan = this.config.show_plan ? this._renderPlan(serviceState, portfolioSymbol) : "";
    const currency = this._renderCurrencyDistribution(assets, portfolioSymbol);
    const allocation = this._renderAssetAllocation(assets);
    const sectorAllocation = this._renderSectorAllocation(assets);

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
        .layout { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
        .asset-list { grid-column: span 4; background: var(--secondary-background-color, #f7f9fc); border-radius: 12px; padding: 12px; max-height: 320px; overflow: auto; }
        .assets-header { font-weight: 600; margin-bottom: 8px; }
        .asset-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--divider-color, #ddd); cursor: pointer; transition: background 0.2s ease; gap: 12px; }
        .asset-row:last-child { border-bottom: 0; }
        .asset-row.selected { background: color-mix(in srgb, var(--primary-color, #1976d2) 90%, #fff); }
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
        .asset-price { font-size: 13px; color: var(--secondary-text-color, #6b7280); }
        .asset-value { font-weight: 600; text-align: right; }
        .asset-pl { font-size: 12px; text-align: right; }
        .positive { color: var(--success-color, #4caf50); }
        .negative { color: var(--error-color, #e53935); }
        .charts { grid-column: span 8; }
        .chart-card { background: var(--secondary-background-color, #f7f9fc); border-radius: 12px; padding: 12px; min-height: 320px; display: flex; flex-direction: column; gap: 12px; }
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
        .plan-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .plan-metric { display: flex; flex-direction: column; gap: 4px; }
        .plan-label { font-size: 12px; opacity: 0.6; }
        .progress { height: 10px; background: rgba(0,0,0,0.08); border-radius: 999px; overflow: hidden; margin: 12px 0; }
        .progress-bar { height: 100%; background: var(--accent-color, #41bdf5); width: 0; }
        .breakdown { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; }
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
    if (activeChartEntity) {
      this._scheduleApexChartRender(activeChartEntity, portfolioSymbol);
    }
    this._bindChartRangeButtons(activeChartEntity);

    const newAssetList = this.content.querySelector(".asset-list");
    if (newAssetList) {
      newAssetList.scrollTop = this._assetListScroll;
      newAssetList.addEventListener("scroll", () => {
        this._assetListScroll = newAssetList.scrollTop;
      });
    }

    this._bindAssetSelection();

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

  _refreshAsset(symbol, broker) {
    if (!this._hass || !symbol) return;
    this._hass.callService("investment_tracker", "refresh_asset", {
      symbol,
      broker,
    });
  }

  _renderPositions(assets, portfolioSymbol, brokerName) {
    if (!assets.length) {
      return `<div class="asset-list"><div class="assets-header">Assets</div>No positions available.</div>`;
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
          brokerName
        );
        const valueRaw = Number(attrs.market_value ?? stateObj.state) || 0;
        const plRaw = Number(attrs.profit_loss_pct ?? 0);
        const value = this._formatNumber(valueRaw);
        const pl = this._formatNumber(plRaw);
        const currencySymbol = this._getCurrencySymbol(attrs.currency || "") || portfolioSymbol;
        const priceRaw = Number(attrs.current_price ?? NaN);
        const hasPrice = Number.isFinite(priceRaw);
        const priceText = hasPrice ? `${currencySymbol}${this._formatNumber(priceRaw)}` : "-";
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
              <div class="asset-price">${priceText}</div>
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

    return `<div class="asset-list"><div class="assets-header">Assets</div>${rows}</div>`;
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

  _renderPlan(serviceState, currencySymbol) {
    const attrs = serviceState?.attributes || {};
    const total = Number(attrs.plan_total ?? 0) || 0;
    const freq = attrs.plan_frequency ? String(attrs.plan_frequency) : "monthly";
    const perAssetRaw = Array.isArray(attrs.plan_per_asset) ? attrs.plan_per_asset : [];
    const perAsset = perAssetRaw
      .map((item) => String(item))
      .map((item) => {
        const [symbol, amount] = item.split(":");
        return { symbol: symbol?.trim(), amount: Number(amount) || 0 };
      })
      .filter((item) => item.symbol);
    const plannedSoFar = perAsset.reduce((sum, item) => sum + (item.amount || 0), 0);
    const remaining = total > 0 ? Math.max(total - plannedSoFar, 0) : 0;
    const progress = total > 0 ? Math.min((plannedSoFar / total) * 100, 100) : 0;
    const breakdown = perAsset
      .map((item) => `• ${item.symbol} ${currencySymbol}${this._formatNumber(item.amount)}`)
      .join(" ");

    return `
      <div class="plan-card">
        <div class="card-title">Investment Plan</div>
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
        <div class="breakdown">${breakdown || "No per-asset plan provided."}</div>
      </div>
    `;
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
      const key = `${attrs.symbol || ""}__${String(attrs.broker || "").toLowerCase()}` || stateObj.entity_id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return assets;
  }

  _normalizeAssetName(value, brokerName) {
    const raw = String(value || "");
    if (!raw) return raw;
    const broker = (brokerName || "").toString().trim();
    let name = raw;
    if (broker) {
      const brokerLower = broker.toLowerCase();
      if (name.toLowerCase().startsWith(`${brokerLower} `)) {
        name = name.slice(broker.length).trim();
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
    } catch (err) {
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
      xaxis: {
        type: "datetime",
        min: rangeStart,
        max: now,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: {
          style: { colors: "var(--primary-text-color, #111)", fontSize: "11px" },
          datetimeUTC: false,
        },
      },
      yaxis: {
        labels: {
          formatter: formatValue,
          style: { colors: "var(--primary-text-color, #111)", fontSize: "11px" },
        },
      },
      grid: {
        strokeDashArray: 4,
        borderColor: "rgba(15, 23, 42, 0.08)",
      },
    };
    this._apexChart = new ApexCharts(container, options);
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
      } catch (err) {
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
        // eslint-disable-next-line no-console
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
        // eslint-disable-next-line no-console
        console.warn("Investment Tracker card: history fetch failed (REST)", err);
        this._render();
      });
  }

  _ensureDayChange(entityId) {
    if (!entityId || !this._hass?.callWS || this._dayChangeDisabled) return;
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
    const requestToken = `${entityId}:${startIso}:${now}`;
    this._dayChangeRequestTokens[entityId] = requestToken;
    this._dayChangeStatus = this._dayChangeStatus || {};
    this._dayChangeStatus[entityId] = "loading";
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
          this._dayChangeStatus[entityId] = "unsupported";
          this._dayChangeDisabled = true;
          console.warn("Investment Tracker card: history/period WS command unsupported");
          return;
        }
        this._dayChangeStatus[entityId] = "error";
        // eslint-disable-next-line no-console
        console.warn("Investment Tracker card: day change fetch failed", err);
        this._loadDayChangeRest(entityId, startIso, requestToken);
      });
  }

  _handleDayChangeResponse(entityId, entries) {
    const points = (entries || [])
      .map((entry) => ({
        value: this._parseNumber(entry.s ?? entry.state),
        time: entry.lu || entry.last_updated || entry.last_changed || entry.t,
      }))
      .filter((point) => Number.isFinite(point.value))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    this._dayChangeCache = this._dayChangeCache || {};
    if (!points.length) {
      this._dayChangeCache[entityId] = null;
      this._render();
      return;
    }
    const startValue = points[0].value;
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

customElements.define("investment-tracker-card", InvestmentTrackerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "investment-tracker-card",
  name: "Investment Tracker Card",
  description: "Monitor your investment portfolio.",
});
