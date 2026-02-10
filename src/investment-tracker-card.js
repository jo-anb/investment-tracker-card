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

    const totalValueEntityId = this._findTotalEntityId(brokerSlug, "total_value");
    const totalInvestedEntityId = this._findTotalEntityId(brokerSlug, "total_invested");
    const totalPLEntityId = this._findTotalEntityId(brokerSlug, "total_profit_loss");
    const totalPLPctEntityId = this._findTotalEntityId(brokerSlug, "total_profit_loss_pct");

    const totalValue = this._formatNumber(this._getStateNumber(totalValueEntityId));
    const totalInvested = this._formatNumber(this._getStateNumber(totalInvestedEntityId));
    const totalPL = this._formatNumber(this._getStateNumber(totalPLEntityId));
    const totalPLPct = this._formatNumber(this._getStateNumber(totalPLPctEntityId));
    const portfolioCurrency = this._getUnit(totalValueEntityId);
    const portfolioSymbol = this._getCurrencySymbol(portfolioCurrency);

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

    const assets = this._getAssets(brokerSlug, brokerName);
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
              <div class="metric-value muted">-</div>
            </div>
            <div class="metric-card">
              <div class="metric-title">Total Return</div>
              <div class="metric-value">${portfolioSymbol}${totalPL} <span class="metric-sub">(${totalPLPct}%)</span></div>
              <div class="metric-foot">Invested: ${portfolioSymbol}${totalInvested}</div>
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
        .layout { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
        .asset-list { grid-column: span 4; background: var(--secondary-background-color, #f7f9fc); border-radius: 12px; padding: 12px; max-height: 320px; overflow: auto; }
        .assets-header { font-weight: 600; margin-bottom: 8px; }
        .asset-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--divider-color, #ddd); cursor: pointer; transition: background 0.2s ease; }
        .asset-row:last-child { border-bottom: 0; }
        .asset-row.selected { background: color-mix(in srgb, var(--primary-color, #1976d2) 90%, #fff); }
        .asset-info { display: flex; flex-direction: column; gap: 4px; }
        .asset-name { font-weight: 600; }
        .asset-meta { font-size: 12px; opacity: 0.6; }
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
        const remapButton = `<button class="asset-remap" data-symbol="${attrs.symbol || ""}" data-broker="${attrs.broker || ""}" data-category="${assetCategory}">🛠</button>`;
        const name = this._normalizeAssetName(
          attrs.friendly_name || attrs.symbol || stateObj.entity_id,
          brokerName
        );
        const valueRaw = Number(attrs.market_value ?? stateObj.state) || 0;
        const plRaw = Number(attrs.profit_loss_pct ?? 0);
        const value = this._formatNumber(valueRaw);
        const pl = this._formatNumber(plRaw);
        const currencySymbol = this._getCurrencySymbol(attrs.currency || "") || portfolioSymbol;
        const plClass = plRaw >= 0 ? "positive" : "negative";
        const selected = stateObj.entity_id === this._selectedAssetEntityId;
        const rowClass = `asset-row${selected ? " selected" : ""}`;
        return `
          <div class="${rowClass}" data-entity="${stateObj.entity_id}" data-name="${this._escapeAttribute(name)}" role="button" tabindex="0">
            <div class="asset-info">
              <div class="asset-name">${name}</div>
              <div class="asset-meta">Qty: ${attrs.quantity ?? "-"}</div>
            </div>
            <div>
              <div class="asset-value">${currencySymbol}${value}</div>
              <div class="asset-pl ${plClass}">${pl !== "" ? `${pl}%` : ""}</div>
            </div>
            ${refreshButton}
            ${remapButton}
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
      const remapBtns = this.content.querySelectorAll(".asset-remap");
      remapBtns.forEach((btn) => {
        btn.onclick = () => {
          const symbol = btn.getAttribute("data-symbol") || "";
          const broker = btn.getAttribute("data-broker") || "";
          const category = btn.getAttribute("data-category") || "";
          this._showRemapDialog(symbol, broker, category);
        };
      });
    }, 0);

    return `<div class="asset-list"><div class="assets-header">Assets</div>${rows}</div>`;
  }

  _showRemapDialog(symbol, broker, category) {
    if (!this._remapDialog) return;
    this._remapDialog.style.display = "block";
    const modal = this._remapDialog.querySelector("#remap-modal");
    modal.style.display = "flex";
    this._remapDialog.querySelector("#remap-symbol").textContent = symbol;
    this._remapDialog.querySelector("#remap-broker").textContent = broker;
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

  _getAssets(brokerSlug, brokerName) {
    const states = this._hass.states;
    // Verzamel alle relevante assets
    let assets = Object.values(states).filter((stateObj) => {
      if (!stateObj || !stateObj.entity_id?.startsWith("sensor.")) return false;
      const attrs = stateObj.attributes || {};
      if (!attrs.symbol || !Object.prototype.hasOwnProperty.call(attrs, "market_value")) return false;
      if (brokerSlug && stateObj.entity_id.startsWith(`sensor.${brokerSlug}_`)) return true;
      if (brokerName && String(attrs.broker || "").toLowerCase() === String(brokerName).toLowerCase()) return true;
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
    return candidates[0] || null;
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
