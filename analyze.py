import csv
from collections import defaultdict
from datetime import date
from pathlib import Path
from statistics import mean

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent
FIGURES = ROOT / "figures"
START, END = date(2013, 1, 1), date(2025, 12, 1)

with (ROOT / "data/jeju_monthly.csv").open(encoding="utf-8-sig", newline="") as file:
    reader = csv.DictReader(file)
    records = sorted(
        (date.fromisoformat(row["month"] + "-01"),
         int(row["total"]), int(row["domestic"]), int(row["foreign"]))
        for row in reader
    )

rows = [row for row in records if START <= row[0] <= END]
expected = [date(year, month, 1) for year in range(2013, 2026)
            for month in range(1, 13)]
if [row[0] for row in rows] != expected:
    raise ValueError("Missing or duplicate month in the analysis period")
if any(min(total, domestic, foreign) < 0 or total != domestic + foreign
       for _, total, domestic, foreign in rows):
    raise ValueError("Negative count or inconsistent total")

dates, totals, domestic, foreign = map(list, zip(*rows))
years = defaultdict(lambda: [0, 0, 0])
for when, *counts in rows:
    for index, count in enumerate(counts):
        years[when.year][index] += count

months = list(range(1, 13))
season = [mean(total for when, total, _, _ in rows
               if when.year <= 2019 and when.month == month)
          for month in months]
moving = [mean(totals[i-11:i+1]) for i in range(11, len(totals))]
yoy = [100 * (current / previous - 1)
       for current, previous in zip(totals[12:], totals)]
actual, forecast = totals[-12:], totals[-24:-12]
errors = [abs(a - f) for a, f in zip(actual, forecast)]

FIGURES.mkdir(exist_ok=True)
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False,
                     "axes.grid": True, "grid.alpha": 0.22, "font.size": 11})

def plot(title, ylabel):
    fig, ax = plt.subplots(figsize=(9.5, 4))
    ax.set(title=title, ylabel=ylabel)
    ax.set_axisbelow(True)
    return fig, ax

def save(fig, name):
    fig.tight_layout()
    fig.savefig(FIGURES / (name + ".png"), dpi=160)
    plt.close(fig)

fig, ax = plot("Monthly tourist arrivals in Jeju", "Million arrivals")
ax.plot(dates, [n / 1e6 for n in totals], color="#94a3b8", label="Monthly")
ax.plot(dates[11:], [n / 1e6 for n in moving], color="#087c75", linewidth=2.5,
        label="Trailing 12-month mean")
ax.legend(frameon=False)
save(fig, "trend")

fig, ax = plot("Seasonality before 2020 (2013-2019)", "Mean arrivals, millions")
ax.bar(months, [n / 1e6 for n in season],
       color=["#087c75" if n == max(season) else "#91b9c3" for n in season])
ax.set(xticks=months, xlabel="Calendar month")
save(fig, "seasonality")

fig, ax = plot("Annual arrivals by visitor group", "2019 = 100 for each series")
for index, label, color in [(0, "Total", "#182842"), (1, "Domestic", "#087c75"),
                            (2, "International", "#c16c33")]:
    ax.plot(list(years), [100 * v[index] / years[2019][index] for v in years.values()],
            marker="o", label=label, color=color)
ax.axhline(100, color="gray", linestyle="--", linewidth=1)
ax.set(xticks=list(range(2013, 2026, 2)))
ax.legend(frameon=False)
save(fig, "recovery")

fig, ax = plot("Year-over-year change in monthly arrivals", "Change (%)")
ax.axhline(0, color="gray", linewidth=1)
ax.plot(dates[12:], yoy, color="#087c75")
save(fig, "yoy")

fig, ax = plot("2025 holdout: same-month previous-year baseline", "Million arrivals")
ax.plot(months, [n / 1e6 for n in actual], marker="o", label="Actual")
ax.plot(months, [n / 1e6 for n in forecast], marker="s", linestyle="--",
        label="Baseline (2024)")
ax.set(xticks=months, xlabel="Calendar month in 2025")
ax.legend(frameon=False)
save(fig, "forecast")

print("Rows:", len(rows), "excluded:", len(records) - len(rows))
print("Annual totals (total, domestic, international):", dict(years))
print("Seasonal means (Jan-Dec):", [round(n) for n in season])
print("Minimum monthly arrivals:", min(zip(totals, dates)))
print("YoY extremes:", min(zip(yoy, dates[12:])), max(zip(yoy, dates[12:])))
print("MAE:", round(mean(errors)), "MAPE:",
      round(100 * mean(e / a for e, a in zip(errors, actual)), 2))
print("Largest forecast error:", max(zip(errors, months)))
