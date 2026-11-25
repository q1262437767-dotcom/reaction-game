# 遗迹小队 · Ruin Runners

版本 `?v=70`，联机协议 41。基本配置是旅人短刃、手枪和散射枪；遗迹长枪、回声灯铳、拖钩刃、泄压筒已退出装备，旧档近战回落短刃、远程回落手枪，散射枪照常保留。炉门全队失败可以门口重试。断灯调度站仍是战前路线：可以先接好线路再进，也可以留人在站里引怪。新的云库只执行 [`adventure/backend/schema.sql`](adventure/backend/schema.sql)（已包含全部历史升级）。

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
