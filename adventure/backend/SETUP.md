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

这是一份由玩家客户端提交的**云备份**。RLS 防止读写别人的档案，CAS 防止两端无声覆盖，但玩家仍可修改自己的客户端档案；它不是服务器验证过的经济系统。将来加入公开排行榜、交易、付费或重要奖励前，需要改成服务端验证任务与结算，不能把当前接口宣传为反作弊方案。

长期保存需要项目持续运行，并按实际需求安排数据库备份和恢复演练。云存档不等同于永久服务承诺；调整表结构、删除账号或停止服务前，应先考虑玩家数据导出与迁移。
