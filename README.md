# Spinhand · 第一章

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

## 第一章内容

- 5 个连续微关卡：向右搓、往回扫、提门栓、压冲头、两次换边
- 球、木箱与两种单轴机关，全部遵守同一套公开轮缘规则
- 完成、无重开、隐藏螺栓三项收集，本地存档与章节完成界面
- 60 Hz 固定步进、最多两个接触子步、连续轮缘扫掠、冲量上限与深穿拒绝
- 3D 工坊场景、实时灯光阴影、火花、程序化音效、触感与降低动态选项
