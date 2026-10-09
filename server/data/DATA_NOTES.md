# DATA NOTES — Smart Meters in London

**Dataset**: Smart Meters in London (Kaggle, jeanmidev)
**Copied from**: `C:\Users\Tanveer\Downloads\New folder`
**Date recorded**: 2026-10-09

## File Inventory (project copy)

| File | Size | Notes |
|---|---|---|
| `hhblock_dataset/block_0.csv` | 11.4 MB | 50 households |
| `hhblock_dataset/block_1.csv` | 14.1 MB | 50 households |
| `hhblock_dataset/block_2.csv` | 13.8 MB | 50 households |
| `hhblock_dataset/block_3.csv` | 13.0 MB | 50 households |
| `hhblock_dataset/block_4.csv` | 13.9 MB | 50 households |
| `hhblock_dataset/block_5.csv` | 13.3 MB | 50 households |
| `informations_households.csv` | 0.22 MB | 5566 households total |
| `weather_hourly_darksky.csv` | 1.94 MB | City-wide hourly |
| `uk_bank_holidays.csv` | ~1 KB | Bank holidays list |

## Detected Headers

### block_*.csv (WIDE format, one row = one household-day)
```
LCLid, day, hh_0, hh_1, ..., hh_47
```
- `LCLid`: household ID (e.g. `MAC000002`)
- `day`: date string `YYYY-MM-DD`
- `hh_0`..`hh_47`: energy in kWh for each 30-min slot (midnight to 23:30)
- Missing values appear as `"Null"` string

### informations_households.csv
```
LCLid, stdorToU, Acorn, Acorn_grouped, file
```
- `stdorToU`: `Std` or `ToU` tariff
- `Acorn`: e.g. `ACORN-A`
- `Acorn_grouped`: `Affluent`, `Comfortable`, `Adversity`, `ACORN-U`, `ACORN-`
- `file`: which block file (e.g. `block_0`)

### weather_hourly_darksky.csv
```
visibility, windBearing, temperature, time, dewPoint, pressure,
apparentTemperature, windSpeed, precipType, icon, humidity, summary
```
- `temperature`: Celsius
- `time`: `YYYY-MM-DD HH:MM:SS` UTC

### uk_bank_holidays.csv
```
Bank holidays, Type
```
- Date format: `YYYY-MM-DD`

## Statistics

- **Total households in informations_households.csv**: 5,566
- **Total block files**: 112 (blocks 0–111)
- **Households per block**: ~50
- **Blocks copied** (for 300-HH sample): 0–5 (300 households total)
- **Date range in blocks**: starts 2011-11-11, we filter to 2013-01-01–2013-12-31
- **Weather data range**: starts 2011-11-11

## Tariff Distribution (full dataset)
- Std: 4,443 households (79.8%)
- ToU: 1,123 households (20.2%)

## ACORN Group Distribution (full dataset)
- Affluent: 2,192
- Adversity: 1,816
- Comfortable: 1,507
- ACORN-U: 49
- ACORN-: 2

## Quirks

1. **Wide format**: Each row is a household × day with 48 half-hour columns (`hh_0`…`hh_47`),
   NOT the "long" format with a single energy column. The loader must melt/pivot this.
2. **Missing values**: Appear as the literal string `"Null"` (not empty). Must parse as NaN.
3. **`ACORN-`** group (2 households) has no ACORN classification — treated as `Unknown`.
4. **daily_dataset.csv** (335 MB, pre-aggregated daily) is present but ignored since
   half-hourly blocks are available.
5. No appliance-level data — association rule items are usage-level and contextual only.
