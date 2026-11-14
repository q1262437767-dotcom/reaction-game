# 遗迹小队 · Ruin Runners

第二章到第五章、隐藏关《未登记线》和三个结局都在这一版里。第一章《归途灯》五节保持原样。提灯、水位、静步、两端接线和运芯车上的脉冲都进了同一套房间与联机。存档仍是 v2。自建云存档要执行 [`adventure/backend/upgrade-story-arc.sql`](adventure/backend/upgrade-story-arc.sql)，它接在 `upgrade-chapter-badges.sql` 之后，不放宽进度闸门。静态资源 `?v=57`，联机协议 32。手机竖屏可以直接玩，横屏仍是原来的画面。

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

根目录原先的单机放置游戏「放置修仙」已挪到 [`legacy/`](legacy/)，不再作为站点入口。
