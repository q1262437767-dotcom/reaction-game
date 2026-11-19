# 遗迹小队 · Ruin Runners

静态资源 `?v=63`，联机协议 36。首页、出发整备、对局状态栏、暂停和结算采用新的界面。开始游戏 → 随机远征 → 远征目标 → 失联救援。存档仍是 v2。新的云库只执行 [`adventure/backend/schema.sql`](adventure/backend/schema.sql)（已包含全部历史升级）。

在线游玩：https://q1262437767-dotcom.github.io/reaction-game/adventure/

浏览器里的俯视角合作冒险。源文件仍是静态 HTML / CSS / JavaScript，从 `main` 发布时不需要构建。玩法、联机、账号与云存档的说明都在 [`adventure/`](adventure/)（见 [adventure/README.md](adventure/README.md)）。

仓库首页会跳转到 `adventure/`。GitHub Pages 从 `main` 发布后，打开 https://q1262437767-dotcom.github.io/reaction-game/ 也会进入同一款游戏。若在仓库设置里把 Pages 来源改成 GitHub Actions，则会改为发布压缩后的同一套文件；没改设置之前，线上继续直接使用 `main` 里的源文件。

测试：`npm test`（进度闸门用例需要本机 PostgreSQL，或使用仓库里的 GitHub Actions）。

## 本地运行

在仓库根目录：

```bash
python -m http.server 8000
```

打开 http://localhost:8000/ ，应进入遗迹小队。也可以直接打开 http://localhost:8000/adventure/ 。

## 旧版

根目录原先的单机放置游戏「放置修仙」已从站点移除，不再公开提供。需要旧文件时看 git 历史。
