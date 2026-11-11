# 遗迹小队：邮箱登录与云存档配置

本文说明邮箱账号与云存档的配置，并包含第 21 版营地整备及第 26 版灰尾狐伙伴的兼容升级。当前 `profile.coins` 是游戏已有的星屑，可用于武器和营地解锁，不代表新增的金币系统。

## 1. 创建自己的 Supabase 项目

在 [Supabase Dashboard](https://supabase.com/dashboard) 注册并建立项目。组织、项目和数据应归游戏作者自己的账号所有。选择合适地区，数据库密码保存在自己的密码管理器中；不要放到游戏文件或公开仓库。

项目未配置时，游戏继续使用游客本地存档，不会假装云端已经保存。静态网页仍由 GitHub Pages 托管，Supabase 提供登录与数据库。

## 2. 配置邮箱验证码

在 Authentication 中启用 Email 登录和新用户注册，并保留邮箱确认。游戏默认使用邮箱和密码登录；首次注册设置密码后，输入邮箱验证码确认账号。旧验证码账号可登录后直接设置密码。密码仅提交给 Supabase Auth，不进入游戏档案、备份和本机进度缓存，游戏不读取邮箱内容。

**新建 Free 项目需要先配置自定义 SMTP，才能使用这版验证码表单。** 自 2026 年 6 月 3 日起，新 Free 项目使用 Supabase 默认邮件服务时不能修改认证邮件模板；默认 Magic Link 模板与验证码界面不同。配置自定义 SMTP 后可以修改模板。[官方变更说明](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)

1. 在自己的邮件发送服务中配置发件人，以及该服务要求的域名验证。
2. 将 SMTP 主机、端口、用户名、密码和发件地址填入 Supabase 的 Authentication 邮件设置。SMTP 密码只保存在服务端设置，不能放进网页。
3. 编辑 **Confirm signup** 和 **Magic Link** 两份邮件模板，让邮件正文都包含 `{{ .Token }}`。开启邮箱确认时，首次注册使用 Confirm signup，已确认账号登录使用 Magic Link。两份可使用同一正文，例如：

   ```html
   <h2>登录遗迹小队</h2>
   <p>你的登录验证码是：<strong>{{ .Token }}</strong></p>
   <p>若不是你本人操作，请忽略本邮件。</p>
   ```

4. 设置游戏地址为 Site URL：`https://q1262437767-dotcom.github.io/reaction-game/adventure/`。若以后另加跳转登录，只允许自己实际使用的完整回调地址。
5. 使用自己的邮箱测试“填写邮箱和密码注册 → 输入注册验证码 → 退出 → 密码登录”。已有验证码账号请先登录，在账号面板设置密码，再退出并测试密码登录；应继续读取同一个账号的原存档。

找回密码复用已有的邮箱验证码登录：对已有账号请求验证码，验证后设置新密码，不需要新增 Recovery 邮件模板或跳转链接。设置密码始终由已登录用户自己的会话授权，绑定当前账号；不会使用管理员密钥替玩家修改密码。

Supabase 默认 SMTP 只允许向项目组织团队预授权邮箱发送，官方文档当前写明限制为每小时 2 封，且不保证送达或可用性。它不适合直接向朋友开放注册。自定义 SMTP 也有自身额度、发件域名和送达要求，需要实际测试国内常用邮箱。[SMTP 官方说明](https://supabase.com/docs/guides/auth/auth-smtp)、[邮箱验证码流程](https://supabase.com/docs/guides/auth/auth-email-passwordless)

## 3. 安装数据库表和 RPC

在项目 SQL Editor 中，以数据库项目管理员运行同目录的 **schema.sql**。如果已连接 Supabase 插件，可以让助手为选定项目部署。文件在事务中安装，可重复运行，不删除已有存档，也不修改其他表的权限。

安装结果：

- `public.ruins_saves`：每个 Auth 用户一行，保存 v2 游戏档案、递增版本和更新时间。
- 登录用户只能读自己那一行，未登录访客没有读取权限。
- 浏览器不能直接 INSERT、UPDATE、DELETE 或 TRUNCATE 表。
- 唯一写入口是 `public.save_ruins_profile(p_profile jsonb, p_expected_revision bigint)`，身份由 Auth JWT 的 `auth.uid()` 决定，不接受客户端指定用户 ID。
- 档案只接受当前游戏字段，限制为 32 KiB；计数、任务、徽章、遗物、营地升级和最近 80 个结算标识均有类型和范围检查。
- 首次保存传版本 `0`；每次成功后版本加一。过期版本会收到 `code=P0001, message=save_conflict`，前端应让玩家比较两份档案，不能悄悄重试覆盖。
- 账号已经有云档时，再次保存还会和旧档比较：不能倒退，单次增加也不能超过正常游玩能解释的范围。不合法时收到 `code=22023, message=progress_rejected`，本机进度保留。版本 `0` 的第一份存档只做形状检查，空账号仍可导入游客营地。

RPC 必须使用已登录玩家自己的会话调用。公开入口 `public.save_ruins_profile` 为 `SECURITY INVOKER`；具有写入权限的实现位于不暴露给 REST API 的 `ruins_private` schema，使用空 `search_path`、限定表名、`auth.uid()` 身份检查，并撤销 `PUBLIC`、`anon` 执行权限，仅向 `authenticated` 授权。[RLS 官方说明](https://supabase.com/docs/guides/database/postgres/row-level-security)、[数据库函数与权限](https://supabase.com/docs/guides/database/functions)

### 已有项目升级到六种遗物

已有云存档项目在发布第 8 版网页前，由原函数所有者运行同目录的 **upgrade-six-relics.sql**。这份普通部署 SQL 只替换 `ruins_private.save_ruins_profile_impl` 的函数体，将遗物数量上限从 3 扩展到 6，并允许 `pierce`、`swift`、`vigor`、`resonance`、`riposte`、`decoy`。它保留原函数所有者、执行权限、公开 RPC、RLS、CAS 规则以及所有现有档案行。第 14 版增加第一章升级，第 21 版再增加营地成长升级；按下文顺序安装，最后安装的私有函数体应与当前 **schema.sql** 一致。

第 8 版档案继续使用 **v2 和原来的九个字段**，不增加货币、表或字段。旧档案无需回填或重置；已有三种遗物和已获得的“遗物收藏家”徽章继续保留。升级后首次获得这枚徽章需要发现全部六种遗物。招架试炼不写入探险次数、奖励、遗物发现或徽章。

部署前导出数据库备份，部署后先验证旧账号档案仍在，以及六种遗物可以保存、读回。若需要回退网页，可暂时保留这个兼容的数据库校验函数；不要通过删除新增遗物或重写旧档案来回退。旧版网页只认识三种遗物，应避免用旧页面保存覆盖已经包含六种遗物的新档案。

### 已有项目升级到第一章

发布第 14 版网页前，由原函数所有者执行 **upgrade-chapter-one.sql**；新项目直接执行最新 **schema.sql**。旧版的六遗物升级如有需要，应先执行，再安装第一章升级。

第 14 版档案仍为 v2 九个顶层字段。`missions` 在原 `ember`、`salvage`、`holdout` 之外增加 `chapter1`，记录相同结构的 `clears`、`hardClears`、`bestTime`。第一章当前仅开放普通难度，通关后记录独立进度；旧版随机和故事任务不会被当作第一章通关。

升级只替换私有存档函数，不改写现有存档行、账号、所有权策略和公开入口。它同时接受旧三任务档案与新四记录档案，拒绝未知章节；旧页面上传缺少 `chapter1` 的档案时，会保留该账号已存的章节记录。CAS 冲突仍要求玩家明确选择，不能用于跨账号合并。

`work/adventure-chapter-persistence-check.cjs` 用真实 PostgreSQL WASM 验证旧版到新版升级、重复安装、章节读写、旧客户端保留记录、CAS 冲突与账号隔离。线上部署后验证新旧档案校验均通过，未知章节被拒绝；验证事务回滚，不修改玩家存档。

### 已有项目升级到营地成长

发布第 21 版网页前，由原函数所有者执行 **upgrade-camp-progression.sql**；新项目直接执行最新 **schema.sql**。这是一份与此前升级文件相同的独立部署 SQL，不是 Supabase CLI 的迁移历史文件。它仅替换已有私有存档函数，保持原公开 RPC、函数所有者、执行权限、RLS、账号与所有存档行；重复执行也不会重置进度。旧项目若需要前两次升级，应先安装，再以营地成长升级收尾。

档案继续使用 **v2**。服务端同时接受旧版九字段档案与新版十字段档案；新增的可选字段为：

```json
"camp": { "upgrades": [], "startingRelic": null }
```

`upgrades` 是最多三个不重复 ID 的数组：`ward`、`stride`、`relicCase`。三个升级分别消耗 40、60、80 星屑，永久获得开局一次护盾、基础闪避冷却由 1.15 秒减至 1 秒、携带一件已发现遗物出发的资格。升级只购买一次，继续使用原有 `coins` 星屑余额，不增加货币。`startingRelic` 可为 `null` 或六种遗物中的一个；选中遗物必须已经存在于该档案的 `relics` 中，且已购买 `relicCase`。准备界面可免费更换或卸下，不能叠带。

营地成长不影响招架试炼。联机时两人的护盾和轻步升级分别作用于自己；开局遗物由房主选择并对全队生效，同一遗物不会重复叠加。疾风羽饰的 0.75 秒闪避冷却沿用，不再叠加缩短。

旧网页上传不含 `camp` 的档案时，会保留同一账号已存的营地升级与选择；若旧档案缺少当前携带遗物的发现记录，只补回这一条，以保持选择有效。缺少 `chapter1` 时仍保留已有章节记录。余额不会相加，CAS 冲突继续要求玩家选择存档；新版明确提交 `camp` 时，按所选择的整份档案保存。校验限制数据结构和取值，不验证购买、通关或其他经济行为的真实性。

`work/adventure-meta-persistence-check.cjs` 使用真实 PostgreSQL WASM 验证升级前后存档逐项保留、重复安装、三种升级和全部六种携带遗物读写、23 种非法档案拒绝、旧网页写入保留、CAS、账号隔离、匿名与直接写入限制。新建完整 schema 与独立升级使用相同私有函数体。部署后在线检查应在回滚事务内进行，不修改玩家存档。

需要回退网页时，保留新版兼容校验函数。不要再执行旧版 `schema.sql`、六遗物升级或第一章升级覆盖当前函数，否则新版十字段档案将无法上传。

### 已有项目升级到灰尾狐伙伴

发布第 26 版网页前，由原函数所有者执行 **upgrade-fox-companion.sql**；新项目直接执行最新 **schema.sql**。旧项目如需安装前面的遗物、章节或营地升级，应先完成，再以灰尾狐升级收尾。不要在新版部署后重新执行旧升级文件覆盖最新校验函数。

档案保持 **v2 和 10 个顶层字段**，只在已有 `camp` 中增加可选记录：

```json
"companion": { "rescued": false, "name": "灰尾狐", "equipped": false }
```

`rescued` 与 `equipped` 必须为布尔值；名字去除首尾空白后为 1–12 个字符，仅支持基本中日韩汉字（U+3400–U+9FFF）、ASCII 字母数字、空格和 `·_-`。未救出状态固定为默认名字及不同行。客户端为旧档补齐默认值，救出后立即保存，改名和同行设置随原账号云存档、离线草稿与导出备份保留；伙伴不单独增加星屑、通关或探险次数。

这份独立部署 SQL 只替换原私有函数体，不写入 CLI 迁移历史，不修改存档行、公开入口、函数所有者、执行权限、RLS、身份或 CAS 规则。服务端继续接受九字段旧档和不含伙伴的两字段 `camp`；旧客户端上传时在同一次 CAS 更新内保留当前账号已存的伙伴名字及同行设置，不能从其他账号继承。显式提供的伙伴记录必须通过完整类型、长度、字符与状态检查。

本地 `work/adventure-fox-persistence-check.cjs` 使用真实 PostgreSQL WASM 验证重复安装不改行、旧客户端保留伙伴、合法边界名字、非法嵌套记录原子拒绝、版本冲突与跨账号隔离；它不连接线上数据库。线上部署后应再核对函数定义、原存档指纹和权限，并在回滚事务中验证新旧保存形状。回退网页时可保留这份兼容函数，不要改写玩家的伙伴记录。

### 已有项目升级到第一章第二节

发布第 36 版网页前，由现有私有函数所有者执行 **upgrade-timber-section.sql**；新项目直接执行最新 **schema.sql**。这与此前升级相同，是随游戏发布的独立部署 SQL，不是 Supabase CLI 的迁移历史文件。它只替换 `ruins_private.save_ruins_profile_impl(jsonb,bigint)`，不改存档行、表、RLS、公开 RPC、函数所有者、执行权限或 CAS 条件。

档案仍为 **v2、10 个顶层字段**。`missions` 新增可选的第二节记录，旧九字段档案和仅含三项旧任务、第一节的档案仍然有效：

```json
"chapter1_2": { "clears": 0, "hardClears": 0, "bestTime": null }
```

新客户端为旧档补齐空记录。完成第一节后可选择第二节；联机搭档可跟随队长完成尚未亲自解锁的小节，分别记录自己的通关。第二节最多带回 50 星屑，并沿用同一 runId 只结算一次的规则。维修工回营依据第二节通关记录显示，不增加账号字段、货币或永久升级。

旧网页上传缺少 `chapter1_2` 的档案时，服务端在原 CAS 更新中保留该账号已存的第二节记录；缺少第一节、营地或伙伴时，原来的兼容保留继续生效。显式提交第二节记录时仍按玩家选择的整份档案保存，余额不相加。服务器只校验格式与范围，仍是云备份而非服务器验证战绩。

本地 `work/adventure-timber-persistence-check.cjs` 使用真实 PostgreSQL WASM 验证当前 v35 升级、重复安装、第二节读写、旧客户端保留、非法记录拒绝、身份隔离及 CAS。部署后先核对原存档指纹与权限，再用回滚事务调用现有公开 RPC 验证新旧形状。需要回退网页时可保留新版兼容函数，不能再用旧版升级 SQL 覆盖它。

### 已有项目收紧存档进度

发布带进度校验的网页前，由现有私有函数所有者执行 **upgrade-progress-guard.sql**；新项目直接执行最新 **schema.sql**。这仍是一份独立部署 SQL，不是 Supabase CLI 的迁移历史。它新增 `ruins_private.reject_ruins_progress_jump(jsonb,jsonb)`，并替换 `ruins_private.save_ruins_profile_impl(jsonb,bigint)`。不改存档行、表、RLS、公开 RPC、函数所有者或已有执行权限。重复执行不重置进度。不要在这次之后再跑旧版升级，否则会把进度校验覆盖掉。

档案格式仍是 **v2**。校验分两层：

1. 每次写入仍先做原来的形状、类型和硬上限检查。
2. 只有「该用户已经有一行、并且版本号对得上」时，才把合并后的新档案和旧档案比较。版本 `0` 的首次插入不比较，空账号导入游客营地的路径不变。

比较发生在旧客户端兼容合并之后。省略 `chapter1`、`chapter1_2`、`camp` 或伙伴时，仍按原规则保留该账号已有记录，不会被看成倒退。

| 字段 | 相对旧档 | 单次上限 |
| --- | --- | --- |
| `coins` | 不低于「旧值 − 本次新解锁花费」，不高于「旧值 + 新增胜场 × 72 − 本次新解锁花费」 | 见下方花费与 72 |
| `runs` | 不能减少 | 最多增加 480 |
| `wins` | 不能减少，且不能超过本次新增的 `runs` | 受 `runs` 约束 |
| 各任务 `clears` | 不能减少；六个任务的增量合计不能超过新增胜场 | 受胜场约束 |
| `hardClears` | 三个独立故事任务不能减少，增量也不能超过该任务新增通关；章节小节不记录险境 | 受该任务通关约束 |
| `bestTime` | 通关次数不变时必须原样保留；有新通关时可以变小或保持，不能变大，也不能从有记录改回空 | 数值仍须在 0–86400 |
| `badges` / `relics` | 已有项目不能丢；新增至少要伴随 1 次新探险 | 仍是最多 5 枚徽章、6 件遗物 |
| `camp.upgrades` | 已购项目不能丢 | 新购项必须体现在星屑花费里 |
| `scatter` | 不能从已解锁变回未解锁 | 新解锁计入 30 星屑 |
| `companion.rescued` | 不能从已救出变回未救出；首次救出至少要伴随 1 次新探险 | 改名、同行或留营不受这档限制 |
| `clearedRuns` | 探险次数不变时必须完全一致；增加时只能丢掉旧列表前缀并在末尾追加新 id，再保留最近 80 条 | 新 id 个数不能超过新增探险次数 |

本次新解锁的花费按营地标价计算，而且只计算这次新增的项目：散射枪 30、归途护符 `ward` 40、轻步绑带 `stride` 60、遗物匣 `relicCase` 80。没有新胜场时，星屑必须正好减少这笔花费。同一存档里如果还有胜场，净变化要落在「减去花费」和「加上最多 72×新增胜场再减去花费」之间。72 是目前单场最高入账：熄灭炉心 40，加险境 20，加隐藏房间 12。其他任务、章节、猎场和运送的入账都更低，失败和训练不加星屑。

480 次是离线积压的上限，不是单场奖励。在线时页面大约每完成一次操作就上传，正常请求只增加 0 或 1 次探险。480 次约等于连续 40 小时（按每场 5 分钟估算）。因此一次请求最多解释 480×72 = 34560 星屑，挡得住从 0 直接改到 10 万或 100 万。已经登录并有云档的玩家，如果本机比云端超前超过 480 次探险，这次上传会被拒绝，本机进度仍留在浏览器里。把 480 或 72 改大只需要改函数里的这两个数字，不必改游戏奖励。

这仍不是服务器权威结算。版本 0 的第一行可以是一份很高的游客档；最佳时间可以改到 0；多次落在上限内的请求仍能慢慢堆高计数。它只拒绝相对旧档的倒退和一次请求里的离谱跳跃。

部署前导出备份。部署后先确认原存档行还在，再用**会回滚的事务**做下面的检查，不要提交。把 `'玩家uuid'` 换成自己的测试账号；身份沿用 Supabase 的 `request.jwt.claim.sub`，这样 `auth.uid()` 指向该账号。

```sql
begin;
select set_config('request.jwt.claim.sub', '玩家uuid', true);
-- 合法小幅进度应返回一行，版本加一。把档案改成相对该账号旧档只增加一场胜利和相应星屑。
-- select * from public.save_ruins_profile('…'::jsonb, 当前版本);
-- 倒退或暴涨应失败，SQLSTATE 22023，message = progress_rejected。
rollback;
```

游戏内再确认：登录后完成一场或购买一件已付得起的营地升级，云存档可以保存；把星屑改到远高于旧档、或删掉已有徽章后再保存，页面提示「云端拒绝了这次存档」，云端旧档不变。

### 已有项目升级到第一章第三节

发布第三节《借走的主芯》前，由现有函数所有者执行 **upgrade-rail-section.sql**。新项目直接执行最新 **schema.sql**。已有项目升级时保留原存档行、公开 RPC、角色授权与 RLS 策略。不要在更新之后重新执行旧版升级文件。

档案仍为 v2，第三节记录放在原有的 `missions` 下。旧客户端省略 `chapter1_3` 时，服务端在原 CAS 更新里保留当前账号已有的记录。玩家可以随已解锁的联机队长完成第三节，因此服务端接受第三节通关而没有前两节记录的档案。

第三节不开放险境，`hardClears` 必须为零。已有存档的每次新增第三节通关可解释最多 60 星屑，其他胜场仍按原有上限校验。更新前后的专用用例随 `test/sql/progress-guard.sql` 运行。

### 已有项目升级到第一章徽章

发布把营地记录改成第一章五节的网页前，由现有函数所有者执行 **upgrade-chapter-badges.sql**。新项目直接执行最新 **schema.sql**。这仍是一份独立部署 SQL，不是 Supabase CLI 的迁移历史。它只替换 `ruins_private.reject_ruins_progress_jump(jsonb,jsonb)` 和 `ruins_private.save_ruins_profile_impl(jsonb,bigint)`。不改存档行、表、RLS、公开 RPC、函数所有者或已有执行权限。重复执行不重置进度。不要在这次之后再跑旧版升级，否则会把第五节和新徽章校验覆盖掉。

档案仍为 **v2**。这一版同时补上客户端已经在写、旧函数却会拒绝的 `chapter1_5`：

| 项目 | 规则 |
| --- | --- |
| `missions.chapter1_5` | 可选。旧客户端省略时，服务端在原 CAS 更新里保留该账号已有记录 |
| 第五节 `hardClears` | 必须为 0 |
| 第五节新增通关 | 每次最多解释 70 星屑，和其他胜场分开计算 |
| 徽章 | 原有 5 个 id 都还接受。新增 `wayhome`（归途已明）、`steady`（稳稳送到）。最多 7 个，不能重复，不能删掉已有的 |
| `wayhome` | 若旧档五节通关都已经大于 0，可以在不增加探险次数的保存里补上这一枚。其他新徽章仍要伴随至少 1 次新探险 |

线上合并后需要执行这份 SQL，游戏网页才会把新徽章和第五节记录写入云存档。未执行时，本地营地仍然显示正确记录，云端保存会被拒绝，云端旧档不变。不要对线上库直接试写；部署后用会回滚的事务核对形状即可。

## 4. 填写公开配置并发布

从项目 Connect / API Keys 中取得 **Project URL** 和 **publishable key**，填写 `coop-adventure/cloud-config.js`：

```js
window.AdventureCloudConfig = Object.freeze({
  url: 'https://你的项目ID.supabase.co',
  publishableKey: 'sb_publishable_你的公开密钥'
});
```

这两个值会随网页公开，符合 Supabase 浏览器客户端的使用方式。**secret key、service_role、数据库密码、SMTP 密码绝不能发布到 GitHub 或写进网页。** 数据隔离依靠已部署的 RLS 和受限 RPC，而不是隐藏 Project URL。[API Key 官方说明](https://supabase.com/docs/guides/api/api-keys)

先安装 SQL，再填写并发布配置。SDK 已固定为 `@supabase/supabase-js` 2.118.0，随网页使用本地 vendor 文件，避免运行时依赖不固定的 CDN 最新版本。

## 5. 验证后再开放

数据库管理员可以先执行这些只读检查：

```sql
select relrowsecurity
from pg_class
where oid = 'public.ruins_saves'::regclass;
-- 应为 true

select
  has_table_privilege('anon', 'public.ruins_saves', 'SELECT') as anon_select,
  has_table_privilege('authenticated', 'public.ruins_saves', 'SELECT') as player_select,
  has_table_privilege('authenticated', 'public.ruins_saves', 'INSERT') as direct_insert,
  has_table_privilege('authenticated', 'public.ruins_saves', 'UPDATE') as direct_update,
  has_table_privilege('authenticated', 'public.ruins_saves', 'DELETE') as direct_delete,
  has_function_privilege('anon', 'public.save_ruins_profile(jsonb,bigint)', 'EXECUTE') as anon_rpc,
  has_function_privilege('authenticated', 'public.save_ruins_profile(jsonb,bigint)', 'EXECUTE') as player_rpc;
-- 应依次为 false, true, false, false, false, false, true

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename='ruins_saves';
-- own_select 和 restrictive owner_guard 都以 auth.uid() = user_id 限制当前用户
```

再做真实流程验证：

1. 账号 A 登录、上传档案，在另一浏览器登录 A 后能读回。
2. 退出 A，确认显示游客进度；登录 B，确认看不到 A 的财富与解锁。
3. 两个页面使用 A 同时修改，一份先保存后，另一份应显示版本冲突；只有玩家明确选择后才替换其中一份。
4. 断网或服务错误时应提示“未同步”，本地修改仍能保留；恢复后再次同步。离线草稿不等于已经上传。
5. Supabase Security Advisor 无新增 RLS / public function 权限告警；邮箱验证码真实送达测试通过。

本仓库本地测试 `work/adventure-cloud-schema-check.cjs` 使用实际 Postgres WASM（PGlite 0.5.10）保留原有 77 条断言，并验证六种遗物读写、拒绝重复/未知/超量遗物、旧档案逐项不变、升级可重复执行，以及函数所有者、授权、RLS、公开入口和 CAS 均不变。它不会连接线上数据库，不能替代真实邮件送达与多浏览器测试。

测试依赖为官方 npm 包 `@electric-sql/pglite@0.5.10`，放在 `work/pglite-0.5.10/package`；其 tarball 完整性为 `sha512-tXc/25U3ulOkiRQuTFdwIv+JhBqtMdAF7Gvo6CfZZWtSB4+hgC4Wr2vwK5ngvvN5PJfAAEGIsfyCVy1JhCOBYw==`。在工作区用 Node 执行 `work/adventure-cloud-schema-check.cjs`。测试库和 work 目录不需要发布。

## 保存范围与后续维护

此版本保存营地进度，不续接正在战斗的一局。账号档案与游客档案应分别保存在本地；首次登录或云端冲突时由玩家明确选择要上传或使用哪份，不能把两个账号的奖励自动相加。

这是一份由玩家客户端提交的**云备份**，外加一层相对旧档的进度闸门。RLS 防止读写别人的档案，CAS 防止两端无声覆盖，进度闸门拒绝倒退和单次暴涨。它仍然不是逐局服务器结算：空账号的第一份存档、以及每次都落在上限内的修改，不会被这层挡住。将来加入公开排行榜、交易、付费或重要奖励前，需要改成服务端验证任务与结算，不能把当前接口宣传成完整反作弊。

长期保存需要项目持续运行，并按实际需求安排数据库备份和恢复演练。云存档不等同于永久服务承诺；调整表结构、删除账号或停止服务前，应先考虑玩家数据导出与迁移。
