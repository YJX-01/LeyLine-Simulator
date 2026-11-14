# 工具与命令

在仓库根使用Node.js 22.12+、pnpm 11.3.0，CI为Node.js 24。先执行`pnpm install --frozen-lockfile`，安装阶段会验证供应链策略并可能联网；普通生成器没有隐式采集。Python及Pillow只用于显式维护采集，不是网页或普通构建的依赖。

| 根命令 | 输入、输出与写入范围 |
| --- | --- |
| `data:build` | 读正式JSON/资源、已采用映射；写game-data/generated、web/generated与.cache/public；跳过相同字节并移除废弃派生文件；离线，不写docs |
| `data:check` | 同输入，直接比较原始数值、验证模板和生成结果；不补写或联网 |
| `data:capture` | 显式读取固定.references/genshin-db，原字节写入全新的artifacts/content-candidates子目录；不覆盖正式数据 |
| `data:prepare-characters --out artifacts/content-candidates/<新目录>` | 采用的完整来源与当前规则生成154份待审角色定义及差异；不覆盖正式输入 |
| `data:audit` | 通过Node显式逐字段核对各数值族，写无文件哈希清单的tools/data/audits摘要；源参数分歧必须先审查，不能自动容差放行 |
| `assets:check` / `architecture:check` / `docs:check` | 只读检查资源完整性、模块边界、当前文档链接及根命令 |
| `dev` / `build` / `build:subpath` | 先离线生成，再启动Vite或写dist/dist-subpath；不采集上游数据 |
| `desktop:build` / `desktop:preview:build` | 直接在临时目录构建并打包，共用artifacts/desktop/releases的最新两版；预览为同一命令别名，不另存Electron副本；已有ZIP可通过LEYLINE_ELECTRON_ZIP_DIR复用 |
| `desktop:start` | 启动最新本地产物；不终止已有应用 |
| `typecheck` / `test` / `test:content` | 类型 / Vitest单元与集成 / Node内容文件检查 |
| `test:e2e` / `test:ui` / `test:ui:contracts` | 全浏览器 / 当前库存 / UI约束；均单worker，测试自行管理本次服务 |
| `test:desktop` / `test:ui:desktop` / `test:content:desktop` | 当前桌面库存任务 / 同任务 / 元数据原生文件往返；使用独立临时profile |
| `test:production` | 串行核对根路径与/leyline/产物；需先构建二者 |
| `build:check` / `perf:engine` | 原有体积预算 / 实际公开展柜的配装求值测量；报告写artifacts/performance，整轴材料缺口明确保留 |
| `project:evaluate <项目.json>` | 只求值调用者给出的当前项目，结果到stdout；无默认场景或自动造例 |
| `licenses:capture` | 显式读取已安装依赖树并更新licenses声明；供应链元数据验证可能联网 |
| `licenses:sync` / `licenses:check` | 离线生成.cache/public/licenses副本 / 只读核对；以licenses原件为准 |
| `preview` | 只绑定127.0.0.1的当前网页/Enka服务，可指定--port、--base、--dir |
| `release:prepare` / `release:verify --dir=...` | 生成/核对本地候选，依赖当前完整三浏览器证据；网页候选仅保留最新两版；不自动发布、提交或推送 |
| `outputs:prune --dry-run` | 预览桌面/网页最终包的两版保留计划；去掉dry-run清理更早的成功包，不清用户文件或不明目录 |
| `clean:outputs --dry-run` / `clean:cache --dry-run` | 先核对已解析绝对路径、目录链接及tracked文件；仅预览；去掉dry-run才清理允许的生成目录 |

`data:build --check`同样只读；失败返回非零并指出来源或产物。原始采集证据按字节保存，正式内容按共同JSON规范维护。显式捕获工具中的--capture路径不由普通生成调用。

普通构建不写docs。修改套装简称后，显式运行`node tools/scripts/data/build-display.mjs --write-docs`更新文档对照表；`data:check`只读核对它与正式JSON是否一致。

`node tools/scripts/data/audit-damage-paths.mjs`只读审计当前目录的命中绑定并向stdout输出摘要，不维护阶段文档或实施台账。

素材采集在tools/scripts/assets：capture-stat-vectors.py、capture-ui-icon-sources.py刷新采集配置，sync-game-icons.py准备待审候选；采集结果先审查再采用，Node的build.mjs只从根assets复制并建索引。应用运行和测试脚本不混在这些工具中。

clean:outputs清除两包generated、资源缓存、网页构建、报告及旧中转目录；最终两版包、内容待审候选、基线备份和用户资料保留。clean:cache显式清空整个.cache。检测到仍在执行的打包工作区时，清理拒绝执行。不要按应用名结束进程；浏览器与桌面串行，仅关闭当前测试自己启动的服务/profile。完整交付条件和证据限制见[部署说明](deployment.md)。

桌面和网页交付分别采用“最新成功包＋上一次成功包”的保留规则。新包在临时目录完成并验证后，原子更新latest.json，再淘汰更早版本；失败清理本次中转，不改变原来的两版。桌面版本号读取根package.json。Windows旧包若仍在运行，拒绝淘汰，不结束用户应用；关闭后可重试outputs:prune。
