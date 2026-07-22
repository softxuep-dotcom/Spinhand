# Spinhand P0

Playable greybox for the P0 gate defined in `SPINHAND_GDD.md`.

## Run

```bash
npm install
npm run dev
```

Open the local URL in a portrait viewport. Hold and drag to move the clockwise power wheel. The wheel is intentionally **not** a physical circle: only the rim sweep applies bounded tangential impulses.

## Controls

- Pointer/touch hold + drag: engage and move the wheel
- `R`: reset the sandbox
- `D`: toggle wheel-sweep diagnostics
- Debug panel: record up to 10 seconds, replay it, run the same input 100 times, or export JSON

Append `?debug=1` to open diagnostics on boot.

## P0 scope

- Ball, box, and fixed-axis gear
- 60 Hz fixed-step Rapier 2D simulation with at most two active-contact substeps
- touch offset, filtered wheel tracking, continuous sampled rim sweep, impulse caps, deep-overlap rejection
- tangential sparks, basic motor/contact audio, normal/tangent debug vectors
- input recording and 100-run functional consistency check

No goals, levels, save data, platform SDK, advertisements, skins, or production assets are included.
