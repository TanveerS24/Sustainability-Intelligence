# Time-of-Use Tariffs and Electricity Pricing

*Authored for this project — Sustainability Intelligence DSS*

## What Is a Time-of-Use Tariff?

A Time-of-Use (ToU) tariff charges different unit rates for electricity depending on the time of day. Unlike a flat-rate tariff, where you pay the same pence per kWh regardless of when you use it, a ToU tariff has at least two price tiers: a higher rate during peak demand periods and a lower rate at other times.

## The London Smart Meter Trial

The Smart Meters in London trial (2011–2014) tested a dynamic ToU tariff in addition to the standard flat-rate tariff. Participating households received a smart meter and could see half-hourly consumption data. The dynamic tariff had three price levels:

- **High**: peak demand, typically afternoon/evening weekdays
- **Low**: overnight, typically 10 pm – 8 am
- **Normal**: all other times

## Behavioural Response

Analysis of the London trial found that ToU households shifted more of their consumption to low-price periods compared with control households on standard tariffs. The shift was most pronounced among households that actively engaged with their in-home display or online portal.

## Who Benefits Most?

Households with flexible loads — particularly those with electric vehicles, heat pumps, or dishwashers — can capture the largest savings. The financial benefit depends on the magnitude of the price differential. A £0.10/kWh spread between peak and off-peak rates could save a typical household £80–150 per year if they shift 20% of their peak usage.

## Limitations

Tariff price levels and spreads change over time and by supplier. **This system does not estimate cost savings** unless you configure current tariff prices in `config.js`, because using outdated rates would be misleading.
