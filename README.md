# Spinhand · 30 关战役

基于 `SPINHAND_GDD.md` 制作的 2.5D 竖屏物理游戏。Three.js 负责真实 3D 网格、材质、灯光和正交相机；Rapier 2D 负责固定 XY 平面的物理模拟。

## Play online

[Launch the latest `main` build on GitHub Pages](https://softxuep-dotcom.github.io/Spinhand/).

Every push to `main` is built and deployed by `.github/workflows/deploy-pages.yml`.

## Run

```bash
npm install
npm run dev
```

打开 Vite 输出的 `/Spinhand/` 地址。按住并拖动永远顺时针旋转的动力轮；动力轮不是普通圆形碰撞体，只有轮缘扫掠会施加有上限的切向冲量。

## Controls

- Pointer/touch hold + drag: engage and move the wheel
- `R`：重开当前关卡
- `Esc` / `P`：暂停或继续

## 战役内容

- 6 个章节、30 个连续微关卡，覆盖轮缘方向、控力、转子、轨迹、接力与综合考试
- 软胶球、木箱、泡沫球、玻璃货物、圆盘、小车、包裹，以及滑块、齿轮、滑轮、绞盘和阀门
- 完成、无重开、隐藏螺栓三项收集，本地存档、章节选关与逐章完成界面
- 60 Hz 固定步进、最多两个接触子步、连续轮缘扫掠、冲量上限与深穿拒绝
- 3D 工坊场景、实时灯光阴影、火花、程序化音效、触感与降低动态选项

调试时可用 `?debug=1&level=11` 直接打开指定关卡（1–30）。
