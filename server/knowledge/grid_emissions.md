# UK Grid Carbon Emissions and the Emission Factor

*Authored for this project — Sustainability Intelligence DSS*

## What Is the Emission Factor?

The electricity emission factor (or carbon intensity) expresses how many kilograms of CO₂ equivalent are released per kilowatt-hour of electricity consumed at the meter. It accounts for the full generation mix on the grid, including coal, gas, nuclear, hydro, wind, solar, and imports.

## Current UK Grid Intensity

The UK grid carbon intensity has fallen sharply over the past decade due to the retirement of coal power stations and rapid growth in offshore wind capacity. Indicative values:

- 2013 (London trial year): approximately 0.490 kg CO₂/kWh
- 2018: approximately 0.280 kg CO₂/kWh
- 2022–2024: approximately 0.180–0.230 kg CO₂/kWh (varies by hour and season)

**This system uses a default of 0.207 kg CO₂/kWh**, which is representative of recent UK averages. You should verify the current value at [National Grid ESO Carbon Intensity API](https://carbonintensity.org.uk/) and update `EMISSION_FACTOR_KG_PER_KWH` in your `.env` file.

## Marginal vs Average Intensity

Two concepts matter for policy:

- **Average intensity**: total CO₂ from all generation divided by total kWh consumed. Used for annual reporting.
- **Marginal intensity**: the CO₂ intensity of the next unit of electricity, i.e. what plant would start or stop if demand changed by 1 kWh. This is higher during peak demand (gas peakers are on the margin).

Load shifting recommendations in this system are based on average intensity for simplicity. The actual emissions benefit of peak shifting is higher than the average figure suggests, because the marginal fuel at peak times is typically natural gas with an intensity of ~0.40 kg CO₂/kWh.
