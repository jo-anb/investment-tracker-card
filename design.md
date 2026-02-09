# 🎨 **High‑Fidelity Portfolio‑Card Design (HACS Frontend Component)**

```txt
┌──────────────────────────────────────────────────────────────────────────────┐
│  📈  INVESTMENT TRACKER                                      ⚙ Settings      │
│  Your portfolio, your way.                                                  │
├──────────────────────────────────────────────────────────────────────────────┤

│  Portfolio:  [Revolut Portfolio ▼]       Assets: 12     Brokers: 1           │
│                                                                              │
│  ┌───────────────────────┬───────────────────────────┬─────────────────────┐ │
│  │  Total Value          │  Day Change               │  Total Return        │ │
│  │  €12,540.23           │  +€124.12   (+1.03%)      │  +€1,240.12 (+11%)   │ │
│  └───────────────────────┴───────────────────────────┴─────────────────────┘ │

│                                                                              │
│  ┌──────────────────────────────┐   ┌──────────────────────────────────────┐ │
│  │  ASSETS                      │   │  PORTFOLIO VALUE (CHART)            │ │
│  │──────────────────────────────│   │──────────────────────────────────────│ │
│  │  • NVDA      €67.38   +3.7%  │   │   1D  1W  1M  3M  1Y  ALL           │ │
│  │  • MSFT     €180.53  -9.7%   │   │                                      │ │
│  │  • GOOGL     €49.18  -1.6%   │   │        ╭───────╮                     │ │
│  │  • KGC       €52.85  +5.7%   │   │     ╭──╯       ╰──────╮              │ │
│  │  • 2B72      €73.69  +4.2%   │   │   ╭─╯                  ╰───╮         │ │
│  │  • ESP0      €62.72 -11.3%   │   │  ╭╯                       ╰──╮       │ │
│  │  • EU Bond   €95.24  +1.0%   │   │ ╭╯                            ╰──╮    │ │
│  │  • Metals    €100.00         │   │╭╯                                ╰──╮ │ │
│  │  • Robo      €30.00          │   │                                      │ │
│  └──────────────────────────────┘   └──────────────────────────────────────┘ │

│                                                                              │
│  ┌──────────────────────────────┬──────────────────────────────────────────┐ │
│  │  CURRENCY DISTRIBUTION       │  ASSET ALLOCATION                       │ │
│  │──────────────────────────────│──────────────────────────────────────────│ │
│  │   ● USD   62%                │   ● Equities     48%                    │ │
│  │   ● EUR   28%                │   ● ETF’s        22%                    │ │
│  │   ● Metals 10%               │   ● Bonds        10%                    │ │
│  │                              │   ● Metals       10%                    │ │
│  │     (Pie Chart)              │     (Pie Chart)                          │ │
│  └──────────────────────────────┴──────────────────────────────────────────┘ │

│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  INVESTMENT PLAN                                                      │ │
│  │────────────────────────────────────────────────────────────────────────│ │
│  │  Monthly Target: €500                                                 │ │
│  │  Invested So Far: €370                                                │ │
│  │  Remaining: €130                                                      │ │
│  │                                                                        │ │
│  │  Progress:  ████████████████████░░░░░░░░░░░░░░░░░░░░░                 │ │
│  │                                                                        │ │
│  │  Breakdown:                                                            │ │
│  │   • NVDA €50   • MSFT €50   • GOOGL €30   • KGC €30                    │ │
│  │   • 2B72 €30   • ESP0 €20   • World ETF €30   • EU Bond €50            │ │
│  │   • Metals €50   • Robo €30   • Flex €130                              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │

│                                                                              │
│  Last updated: 08 Feb 2026 11:08   |   Brokers connected: Revolut            │
└──────────────────────────────────────────────────────────────────────────────┘
```


---

# 🧱 **1. Layout Grid (12‑column responsive)**

We gebruiken een **12‑koloms grid**, zodat de card schaalbaar is:

- Desktop: 12 kolommen
- Tablet: 6 kolommen
- Mobile: 1 kolom

Mapping van jouw ontwerp:

| Element | Desktop | Tablet | Mobile |
|--------|---------|--------|--------|
| Title | 12 | 6 | 1 |
| Portfolio selector | 12 | 6 | 1 |
| Value metrics | 12 | 6 | 1 |
| Asset list | 4 | 6 | 1 |
| Portfolio chart | 8 | 6 | 1 |
| Currency pie | 4 | 3 | 1 |
| Allocation pie | 4 | 3 | 1 |
| Investment plan | 12 | 6 | 1 |
| Footer | 12 | 6 | 1 |

---

# 🎨 **2. High‑Fi Visual Design**

## **A. Title Bar**
- Font: `600`, 20–22px
- Subtitle: 14px, 60% opacity
- Icon: jouw Investment Tracker icon (24px)
- Right‑side: settings button (mdi:cog)

**Voorbeeld:**
```
[icon] Investment Tracker
Your portfolio, your way.
                          [⚙]
```

---

## **B. Portfolio Selector Row**
Links:
- Portfolio naam (bv. “Revolut Portfolio”)
- Subtext: aantal assets, totale investering

Rechts:
- Dropdown (selecteer portfolio)
- Optie: “All portfolios combined”

---

## **C. Value Metrics Row**
Drie metric‑cards naast elkaar:

### **1. Total Value**
- Groot: €12.540,23
- Klein: “Totale waarde”

### **2. Day Change**
- Groen/rood afhankelijk van waarde
- +€124,12 (1.03%)

### **3. Total Return**
- +€1.240,12 (11.03%)
- Tooltip: invested vs current

**Stijl:**
- Rounded cards
- Soft shadow
- Light/dark adaptive

---

## **D. Asset List (left column)**
Scrollable list (max height 300px):

Elke asset:
- Logo (NVDA, MSFT, GOOGL, etc.)
- Naam + ticker
- Quantity
- Value
- Profit/loss badge (groen/rood)
- Klik → detail popup

**Voorbeeld:**
```
[NVDA logo] NVIDIA (NVDA)
Qty: 0.37 | €67.38
+3.74%
```

---

## **E. Portfolio Chart (right column)**
Een **line chart** met:

- Portfolio value over tijd
- Toggle: 1D / 1W / 1M / 3M / 1Y / ALL
- Hover tooltips
- Smooth bezier curve
- Gradient fill

---

## **F. Currency Pie Chart**
Toont verdeling per valuta:

- USD
- EUR
- GBP
- Crypto
- Metals

Kleine legend rechts of onder.

---

## **G. Asset Allocation Pie Chart**
Toont categorieën:

- Equities
- ETF’s
- Bonds
- Metals
- Crypto
- Cash

Hover → percentage + absolute waarde.

---

## **H. Investment Plan Section**
Een horizontale progress bar:

**Monthly investment target: €500**  
**Invested so far: €370**  
**Remaining: €130**

Onder de bar:
- Breakdown per asset (helpers of API)
- Frequentie badges (weekly/monthly)

---

## **I. Footer**
- Last updated timestamp
- Broker icons (Revolut, DeGiro, Binance)
- Link naar instellingen

---

# 🧩 **3. Interactie & Animaties**

### Hover effects
- Soft scale (1.02)
- Shadow increase
- Tooltip on metrics

### Chart animations
- Ease‑in cubic
- 600ms duration

### Dropdown
- Smooth slide‑down
- Searchable portfolio list

### Asset click
- Opens modal:
  - price history
  - transactions
  - DCA schedule
  - broker link

---

# 🌙 **4. Theming (Light & Dark)**

### Light mode
- Background: #FFFFFF
- Card: #F7F9FC
- Text: #1E1E1E
- Accent: #41BDF5
- Profit: #4CAF50
- Loss: #E53935

### Dark mode
- Background: #0F172A
- Card: #1E293B
- Text: #FFFFFF
- Accent: #41BDF5
- Profit: #4CAF50
- Loss: #EF5350

---

# 🔌 **5. Data Binding (entities)**

De card verwacht:

```
sensor.{service}
sensor.{broker}_investment_total_invested
sensor.{broker}_investment_total_value
sensor.{broker}_investment_total_profit_loss
sensor.{broker}_investment_total_profit_loss_pct
sensor.{broker}_assets_@
sensor.{broker}_assets_@_pl_pct
sensor.{broker}_investment_monthly_target
sensor.{broker}_investment_monthly_actual
```

---

# ⚙️ **6. Card Config Options (YAML)**

Voorbeeld:

```yaml
type: custom:portfolio-card
portfolio_entity: sensor.de_giro
history_entity: sensor.investment_history
allocation_entity: sensor.investment_allocation
currency_entity: sensor.investment_currencies
monthly_target: 500
show_footer: true
show_charts: true
theme: auto
```

---

