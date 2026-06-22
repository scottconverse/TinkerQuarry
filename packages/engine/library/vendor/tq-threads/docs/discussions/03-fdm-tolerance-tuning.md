<!-- category: General -->
# 🧪 FDM tolerance tuning — share your numbers

Thread fit is the one thing worth a 10-minute calibration. Post your printer +
material + the `clearance` that gave you a clean fit, so others have a starting
point.

## How `clearance` works
`clearance` is the **total diametral gap** between mating threads, split evenly:
an external thread shrinks `clearance/2`, an internal thread grows `clearance/2`.
Make a bolt **and** its nut with the *same* `clearance` and they fit.

## Starting points
| Fit | `clearance` |
|---|---|
| Tight, well-tuned | 0.2 – 0.3 mm |
| Default / safe | **0.4 mm** |
| Loose / fast | 0.5 – 0.6 mm |
| Coarse caps / lids | 0.5 – 0.8 mm |

## Tips
- Print **axis vertical** for the cleanest flanks; no supports in tapped holes.
- Keep lead-in chamfers on (default) so threads self-start.
- `profile="rounded"` for stronger roots on load-bearing parts.
- Pitch < ~0.7 mm (fine M2–M3) is at a 0.4 mm nozzle's limit — print slow or use
  a heat-set insert.

## Quick calibration
Print M8 nuts at `clearance` 0.3 / 0.4 / 0.5 on an M8 bolt and keep the one that
spins freely without slop.

**Reply with:** printer · nozzle · material · layer height · the `clearance`
that worked. Let's build a community fit table. 📊
