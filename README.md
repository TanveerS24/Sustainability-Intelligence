# Sustainability Intelligence DSS

**Sustainability Intelligence: A Data Mining and Data Warehouse Based Knowledge-Augmented Decision Support System for Household Electricity Consumption**

---

## 1. Overview & UN SDG Alignment

This platform is a full-stack, knowledge-augmented Decision Support System (DSS) designed to analyse smart meter electrical telemetry, discover consumption patterns, and recommend policy and behavioral interventions.

The system directly supports four UN Sustainable Development Goals:
- **SDG 7 (Affordable and Clean Energy)**: Load curve persona profiling and time-of-use demand flexibility.
- **SDG 11 (Sustainable Cities & Communities)**: Socio-demographic ACORN community roll-ups and urban grid stability.
- **SDG 12 (Responsible Consumption & Production)**: Data-mined behavioural association rules highlighting peak drivers and habits.
- **SDG 13 (Climate Action)**: What-If carbon footprint impact simulator with UK grid carbon intensity accounting.

---

## 2. Architecture & Modules

The system is organised into three core operational tiers:

```
┌──────────────────────────────────────────────────────────────┐
│  Tier 1: Data Management & Data Warehouse                    │
│  - Streamed ETL from London Smart Meters (half-hourly)       │
│  - SQLite Star Schema (fact_consumption, dim_time, dim_hh)   │
│  - OLAP Roll-up & Drill-down queries (Time, Community, Tariff)│
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│  Tier 2: Data Mining & Predictive Analytics                  │
│  - CO4: K-Means Clustering on 24h load shapes + load factor  │
│  - DBSCAN Outlier / Anomaly Detection                        │
│  - CO5: Apriori Association Rule Mining (lift-ranked rules)  │
│  - Silhouette & Davies-Bouldin cluster quality evaluation    │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│  Tier 3: Decision Support & Sustainability Dashboard         │
│  - RAG Advisor (BM25 retriever over curated sustainability KB)│
│  - Offline deterministic template generator + optional Claude│
│  - What-If Policy Impact Simulator (peak shift & reduction)  │
│  - Modern React + Vite dashboard with Recharts analytics     │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Quick Start (Windows Native)

### Prerequisites
- Node.js >= 20
- npm >= 10

### Setup & Run
1. **Configure Environment**:
   ```powershell
   Copy-Item .env.example .env
   ```

2. **Install Server Dependencies**:
   ```powershell
   cd server
   npm install
   ```

3. **Install Client Dependencies**:
   ```powershell
   cd ../client
   npm install
   ```

4. **Run Server**:
   ```powershell
   cd ../server
   npm start
   ```
   *(Server starts on `http://localhost:4000`)*

5. **Run Client**:
   ```powershell
   cd ../client
   npm run dev
   ```
   *(Client dashboard opens on `http://localhost:3000`)*

---

## 4. Running with Docker Compose

Ensure Docker Desktop is running on Windows.

1. **Build and start services**:
   ```powershell
   docker compose build
   docker compose up -d
   ```
2. **Access the application**:
   - Web Client (via Nginx proxy): `http://localhost:3000`
   - Server Healthcheck API: `http://localhost:4000/api/health`
3. **Shutdown**:
   ```powershell
   docker compose down
   ```

*Note: Raw data and SQLite database are persisted inside `./server/data` mounted as a volume.*

---

## 5. API Reference

All responses return standard JSON. Validation errors return `{ error: { code, message } }`.

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/api/health` | GET | System and database health status |
| `/api/pipeline/run` | POST | Trigger async ETL pipeline run |
| `/api/pipeline/status` | GET | Get latest pipeline run status and stats |
| `/api/olap/summary` | GET | Total kWh, CO2, households, quality audit |
| `/api/olap/rollup` | GET | Roll-up by dimension (`time`, `community`, `tariff`) |
| `/api/olap/drilldown` | GET | Drill-down into specific date or community group |
| `/api/mining/run` | POST | Run K-Means, DBSCAN, and Association Rule models |
| `/api/mining/clusters` | GET | Discovered personas and average 24h load shapes |
| `/api/mining/outliers` | GET | DBSCAN outlier households with cross-tab |
| `/api/mining/rules` | GET | Discovered association rules ranked by lift |
| `/api/mining/evaluation` | GET | Silhouette and Davies-Bouldin evaluation |
| `/api/impact` | POST | What-if simulation for peak shifting and reduction |
| `/api/advisor/recommend` | POST | Knowledge-augmented RAG recommendations with citations |

---

## 6. Testing & Quality Assurance

Both server and client include automated test suites and a line-count audit script:

```powershell
# Run server test suite (103 tests + line check)
cd server
npm test

# Run client test suite (14 tests + line check)
cd ../client
npm test
```
