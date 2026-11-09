# 前端设计与交互复查

2026-11-08。用户调整过的角色详情、圣遗物卡及详情页和 [现行视觉规范](visual-language.md) 是项目基准。技能用于补充检查，不覆盖已确认的主题、14px 正文下限、40/32/24px 控件及 12/10px 角标规则。

## 当前交付状态（2026-11-10）

用户已于2026-11-09认可方形外缘关闭B、藤结corner和圆弧三角，并明确批准应用到仓库和打包；divider取消。此前各轮“等待审核、不打包”为当时的历史状态，不再作为当前暂停条件。2026-11-10继续按用户指示加粗关闭图标、统一套装筛选、添加组合收藏及四角装饰。

## 可用技能

| 技能 | 来源 | 用途 |
| --- | --- | --- |
| frontend-design | [Anthropic](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | 视觉层级、排版、文案和样式覆盖的自查 |
| web-design-guidelines | [Vercel](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | 键盘、焦点、表单、弹窗和可访问性；复查时读取上游当前规则 |
| webapp-testing | [Anthropic](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) | 浏览器侦察、真实操作、截图和运行日志 |

技能安装在本机 Codex 技能目录，不作为仓库依赖。Python 浏览器辅助环境只放在忽略的 artifacts 下，项目测试继续使用已声明的 pnpm 和 Playwright。

## 每轮检查顺序

1. 读取现行项目规则，确定改动涉及的页面和数据边界。
2. 等待实际页面及数据加载后查看 DOM 和截图，再操作；不把空壳截图作为完成证据。
3. 用真实来源操作输入、选择、保存、还原、取消和退出；公开展柜与库存保持分离。
4. 数字框必须逐键输入验证，不能只使用 fill；特别检查带命座加成的显示值和自定义等级。
5. 点击字段名称应聚焦输入，不触发旁边加减按钮。图标操作有可访问名称，装饰 SVG 不重复朗读。
6. 检查键盘跳过导航、焦点返回、可见焦点、弹窗边框/遮罩及未保存退出。只从遮罩按下并释放才关闭，滚动和边框操作不能误关。
7. 检查 390px、长主词条、数字边界及减少动态效果偏好；遵循当前字号和尺寸，不以缩字或隐藏溢出来掩盖布局错误。
8. 运行涉及路径的定点测试，检查浏览器错误日志；需要交付桌面包时重新打包并串行验证隔离实例。

## 本轮发现与修复

- `NumberStepper.vue:14`：记录中的安柏战技显示 13（含命座加成），逐键输入 12 实际仍为 13；中途归一化破坏后续按键。改为完整合法值才实时更新，提交时归一化。独立 Python 浏览器复现前后分别为 13/12，原始来源未改。
- `ArtifactForm.vue:53`：强化等级标签包住含按钮的复合控件，标签可能激活加号。改为独立 label/for 指向 NumberStepper 的输入；点击标签聚焦输入，16 仍保持 16。
- `WorkbenchDialog.vue:7`：原先任何以 dialog 为目标的点击都会关闭，包括边框。现在核对按下和释放位置，只允许真正遮罩点击关闭；补上弹窗滚动隔离和顶部滚动留白。
- `WorkspaceShell.vue`、`design-language.css`：补充键盘跳至主要内容入口、全局减少动态效果支持及装饰 SVG 标记。跳转锚点不是旧路由，不恢复退休视图。

测试包括本轮逐键输入、标签焦点与边框点击回归，以及原有真实库存、展柜、草稿和退休视图检查。记录在 artifacts/skill-keyboard-review.json 及 Playwright 报告；不宣称完成全部可访问性认证或 U1 整体验收。

- 2026-11-09：新增嵌套选择弹窗的初始焦点检查，必须在实际390px及角色配置入口检查document.activeElement位于当前dialog内，并验证Escape回到触发按钮。CatalogPicker的无触发容器不得用v-show延迟显示祖先，避免showModal在隐藏祖先内运行导致初始焦点失败。

## 日常规格快检

运行pnpm test:ui:contracts（Chromium单工作线程），以记录的真实展柜完成角色详情、嵌套武器／参考角色、配置选择和三库计数／分页检查。缺少.references/enka/uid-107590923.json时明确跳过，不伪造玩家数据。检查器读取实际计算样式而非只核对源码类名，覆盖40／32／24px动作、16／14px字重、7px圆角、1000／920／560／420px弹窗档位、20px标题、32px关闭及390px边界。此轮发现原生dialog额外max-width使390px下声明350px的弹窗实际337px，已在共用组件显式修正。


## 圣遗物详情及配置性能复查（2026-11-09）

新增定点流程u1-artifact-redesign.spec.ts：真实安柏装备身份只读、别名、三级收藏、逐键副词条、另存新ID、原件及穿戴不变、引用跳转与草稿确认、右键删除、密度配色和390px边界。u1-character-tools-shared.spec.ts用官方四人展柜分别检查账号筛选、选人弹窗、完整目录的工具栏与状态隔离。该记录实际有三位四星、两位弓角色，断言按原始角色ID核对，不能凭记忆假设来源内容。

快速规格检查增加圣遗物详情与40px属性控件，仍读取实际样式和焦点。手动新建、空数值错误及保存后离开沿用真实库存和未保存回归，不以程序fill代替所有输入操作。

配置性能以458件真实莫娜及记录的穿戴备注测量，未添加虚构武器／培养资料。CPU采样发现排序比较器和模板反复折算并扫描静态词条表；改为静态均值索引和配置展示缓存，保留折算公式。相同环境三次点击至双动画帧平均649.9ms降至166.1ms（首次924.0→220.1ms，重复522.3／503.4→155.4／122.8ms）。报告artifacts/config-navigation-before.json、config-navigation-after.json及对应CPU采样；这是本机记录库存的定点结果，不是所有设备性能保证。

Windows桌面使用原生滚动条时，根元素scrollbar-gutter:stable会使CSS的100vw排除保留槽，而innerWidth仍可能包含它。快检使用独立100vw探针计算规范中的视口宽度，不把两者15px差异误报为弹窗退化，也不移除已批准的滚动条预留规则。最终隔离桌面包build-jy2DXH已通过新ID另存、原件穿戴不变、别名、三级收藏、四项引用、未保存跳转确认、右键删除、逐键输入、密度配色和窄屏检查；报告artifacts/u1-artifact-redesign-desktop.json，截图artifact-redesign-packaged-desktop.png与artifact-redesign-packaged-mobile.png。测试只关闭自身隔离实例。


## 星内收藏、删除脱离库存与返回路径复查（2026-11-09）

定点命令：pnpm exec playwright test tests/e2e/u1-artifact-reference-actions.spec.ts tests/e2e/u1-ui-contracts.spec.ts --project=chromium --workers=1。以官方四人真实展柜操作，验证一个右键收藏项、星内数字、独一副本别名、左上删除、组合未入库角标、编辑保存，以及三类引用关闭后回圣遗物库。角色详情右键使用实际装备，检查查看／卸下与还原；展柜选择仅快照后只入库生之花，验证新增一件且不装备。

新artifact-detachment-real.test.ts结合实际观察数据检查有序匹配、持久化推定、展柜覆盖历史、元数据同步、无库存身份快照持久化和删除事务失败回退；与原相关测试共10项通过。真实458件莫娜库存流程、五项草稿退出回归通过。早期返回测试未等目标异步弹窗挂载便按Escape，已改为明确等目标可见后操作，最终浏览器和桌面均确认返回原库，不用固定延时。

最终桌面包build-mOctqe在独立临时资料目录串行通过同类操作及390px窗口检查，异常日志为空。报告artifacts/u1-artifact-reference-desktop.json；截图artifact-reference-packaged-desktop.png、artifact-reference-packaged-mobile.png、artifact-reference-packaged-detached.png已实际查看。普通文本尺寸不变，星内数字作为明确标记的图像角标使用12px。类型、架构258文件、差异空白及构建预算通过。阶段体验验收仍待用户反馈。


## 固定四槽与完整详情返回（2026-11-09）

新增u1-artifact-slots-and-return.spec.ts，以官方四人及记录的12人展柜验证：共享图片、四行副词条、别名位置、合法次数点击循环及保存、默认合并排除副本、绿色入库菜单、删除保留佩戴和数值、引用返回重开原详情、组合点击查看／右键替换、清除搜索及四库按钮边界。真实34.2%暴伤在4与5次合法历史间切换，保存manual来源后再导入恢复展柜记录；此次发现表单parse换对象触发数组watch清理历史，已改为分别观察等级与主词条的真实值变化并复测通过。

11项相关单测、真实458件莫娜库存及五项草稿回归、规格快检通过。截图已查看，编辑正文不低于14px。桌面几何检查等待实际边界连续稳定，保持0.5px容差；Windows弹窗打开及滚动布局更新时不能以第一次SVG边界缓存作为最终结果。最终隔离桌面报告artifacts/u1-artifact-fixed-slots-desktop.json，确认删除后菲林斯攻击仍8.3条；四个右上按钮边界一致，390px无横溢。


最终交付build-dUural；11项相关单测、两项新真实浏览器流程、458件库存、五项草稿、规格快检以及更新后的另存／收藏、单击选装回归通过。类型、架构260文件、差异空白和构建预算通过。隔离桌面确认四页末按钮边界逐项一致，详情和组合操作无异常；截图artifact-fixed-slots-packaged-desktop.png与artifact-fixed-slots-packaged-mobile.png已查看。SVG边界测量采用poll等待稳定，不降低0.5px容差，不以第一次布局中的临时坐标判定最终居中。


## 手动新建与全弹窗规格（2026-11-09）

先按用户要求在ui/design提交既有版本a02e7e3（中文说明），随后本轮改动单独保留。新增u1-create-and-dialogs.spec.ts，用官方真实四人展柜的杯子逐键录入，检查自动名称、左套装右部位、共用四槽、每阶段单个红色取消、预览不写入、返回保留、确认入库和390px。另检查四库末按钮对齐（当时误加160px固定宽度，已按本轮修订撤回）及筛选／排序、导入、角色／武器／参考选择、确认框的标题居中和头部32px。

ui-contract-audit扩展为所有受检弹窗检查标题水平居中和头部动作32px。实际发现部位隐式label查询不明确，以及保存后按钮禁用、v-show隐藏原列表、预览删除原按钮导致焦点逃出；分别改为明确label关联和共用弹窗焦点恢复，不留下页面单独补丁。

本轮9项定点浏览器流程（含五项草稿和选人隔离）全部通过；458件真实莫娜库存也通过。类型、架构262文件、差异空白及构建预算通过。最终包build-SG9ulv用独立临时用户目录串行验证，报告artifacts/u1-create-modal-desktop.json。截图create-modal-packaged-desktop.png、create-modal-packaged-mobile.png及create-modal-packaged-role-mobile.png已查看；异常日志为空。输入来源为记录的展柜归一化副本，手动复制属于明确UI试录，不冒充玩家导出或另一件已观察到的游戏实物。


## 星级与圣遗物表单复查（2026-11-09）

撤回上一轮误加的160px工具栏按钮宽度；160px仅保留培养输入框，主动作继续共用40px高、16px粗体、12px左右内边距及7px圆角。桌面默认四库末按钮自然宽度相同，顶部和右边缘一致；不把测量得到的宽度固化成新标准。

套装目录从现有canonical rarityList生成最高星级，角色／武器／套装共用降序RarityFilter和黄紫蓝绿灰色。验证四星目录图片紫底、固定图片行和两行名称区；没有把目录星级当成新增四星实物计算验收。部位／属性改用共用SingleSelectPicker，套装栏选中不变绿；空置预览只标红聚焦。数字焦点框覆盖完整外框。圣遗物详情图与疏松卡共用112px，移除来源身份，引用按三类分行，无引用隐藏。

新增u1-rarity-and-fields.spec.ts：目录星级及四星紫底、图片偏移、空套装提示、共享部位图标、40px完整焦点框、390px菜单边界与名称完整、112px详情、引用分组和真实原件另存后无引用；目录检查不构造玩家数据。ui-contract-audit增加目录选择栏、共用下拉和星级点选框，捕获实际发现的按钮字重覆盖。

本轮14项相关浏览器流程最终均通过（按受影响流程分批，Chromium单工作进程），包括原458件真实莫娜库存、逐键试录、词条历史与合并、三类引用返回、共享选人及武器筛选。5项数据单测、快照重现、类型、架构265文件和构建预算通过。截图复查发现窄屏部位截字及套装字重被覆盖，修正后另做定点复测。最终包build-HGIK1b用独立临时账号串行验证；证据artifacts/u1-rarity-refine-desktop.json和u1-rarity-refine-references-desktop.json，截图rarity-refine-packaged-*.png及rarity-refine-references-packaged-*.png。U1仍实施中，未新增提交。


## 副词条对齐、导入与筛选（2026-11-09后续）

副词条始终预留单位列，实际安柏花和原458件莫娜库存中的固定／比例副词条在1440px、390px下输入区左缘和宽度一致；逐键重输观察到的原数值后放弃草稿，不改变实物。莫娜／展柜导入共用说明、标签、入口、错误及来源色规则，蓝／紫语义保留；预览和取消不写库存。

所有库筛选，包括角色配置和目录，使用FilterPanel及共用底部动作；强化为等宽全部／16／20与完整等级多选，收藏使用FavoriteFilter与既有FavoriteMark。桌面复测发现MultiSelectPicker在关闭状态仍拦Escape，已按是否展开处理：第一次关闭下拉，随后可关闭筛选弹窗。新增u1-import-filter-consistency.spec.ts覆盖数字列、逐键输入、两类实际资料预览、空搜索操作颜色、四库筛选、星内等级、强化多选、窄屏及Escape传递；规格快检覆盖新增控件。

本轮7项相关浏览器流程最终通过，含实际458件莫娜库存、收藏筛选和共享选人。并行构建时有一次开发页异步模块未在7秒内挂载，trace仍见模块请求未完成；构建结束后独立规格检查通过。类型、架构269文件、差异空白和构建预算通过。最终包build-uMX1DA已在独立临时账号串行验证，报告artifacts/u1-filter-import-desktop.json、截图filter-import-packaged-*.png已查看，页面异常为空。公开UID618285856只回放原始记录作预览并取消，没有与莫娜库存确认混入；不声称本轮重新在线读取展柜。未新增commit，U1仍实施中。


## 凯尔特三角与回环装饰复查（2026-11-09）

读取用户新增archive/1.webp、2.png、3.png，按连续织带、交替穿插和尖叶回环重绘。侧栏CelticKnot为单闭合路径，三处核心交叉及组合版六处环交叉用透明luminance遮罩；useId确保同时显示两图时不冲突。角饰与分隔纹样也重绘为回环，CSS mask继承统一金色，参考图片不进入运行包。

本轮为低影响矢量美术修改，未新增镜像实现的单测。使用实际458件莫娜库存进行浏览器和桌面截图复查：20／24px预览、展开／折叠／390px导航、两个遮罩ID、实际角饰颜色、打包资源加载和不拦截点击均通过；浏览器与桌面串行，结束关闭本次自建服务及实例。类型、架构270文件、差异空白及构建预算通过。最终包build-wsUn9Y，报告artifacts/u1-celtic-browser.json与u1-celtic-desktop.json；celtic-icons-reviewed.png、celtic-ornaments-reviewed.png及celtic-packaged-*.png已查看。用户三张原图保持原样，未新增commit，U1仍实施中。


## Line图标与三角收藏（2026-11-09后续）

按用户选择，侧栏默认改为Line；组合为Line三角叠完整内圆，再加整体外圆，圆不参与编织或断线。Ribbon保留组件变体和两份独立SVG素材供后续中图标使用。FavoriteMark统一改为扁平三瓣三角，无数字、无穿插；上／左下／右下依次填充表示1／2／3级。收藏存储、循环、排序、筛选及可访问名称不改。旧星内数字的现行规范已清理。

相关6项Chromium流程通过，覆盖真实记录的收藏循环、卡片同步、过滤、编辑和引用；更新已有等级断言，不以星形数字作为状态依据。实际458件库存生成Line／双圆和四态收藏预览，浏览器及隔离桌面均核对。类型、架构270文件及预算通过。最终包build-kUvlIT；报告artifacts/u1-line-favorite-preview.json、u1-line-favorite-desktop.json；line-favorite-icons-reviewed.png和line-favorite-packaged-*.png已查看。未提交，U1仍实施中。


用户认可圆弧三角复原后，第二轮审核稿将中心留白略增、组合内圆加入交替穿插，外圆保留完整；分隔带改为参考图的浅底／深回环结构。新增双头交错箭的三款关闭SVG，保留32px按钮／20px图标红色规格，等待选定后通过CloseButton统一替换。v2全部SVG解析与静态浏览器检查通过，遮罩无圆形挖孔；本轮未改正式素材、未打包，原桌面入口不变。


## 装饰 SVG 审核约束（2026-11-09后续）

用户要求先审核再打包，后续装饰迭代先存独立SVG与大图／实际尺寸预览，不改正式素材和桌面入口。最新审核稿位于artifacts/design-review/celtic-arcs-v4/index.html。divider按连续弧形流线重画，放弃上一稿的硬折块；关闭B按最新指示简化为两根相同双头箭直接重叠，无断线、遮罩或深浅差，保留此前收细30%的尺寸。此决定替代前稿的关闭交织方案。

corner新增Anonymous的celtic vine corner单色透明适配，保留下载原稿和来源记录；来源https://openclipart.org/detail/12699/celtic-vine-corner-by-anonymous-12699，许可见https://openclipart.org/share（CC0）。复杂藤结在现有25px下丢失细节，审核页同时提供较大尺寸对照，尺寸尚未写成正式规范。静态SVG解析与图片加载检查通过，截图已查看；本轮未构建、未打包，不作为U1体验验收。


用户选用corner并停止divider制作后，已将认可的藤结轮廓适配到正式knot-corner.svg，保留既有占位尺寸与CSS金色遮罩，补充中央来源、署名及分发副本。完整矢量约7KiB，两份现有装饰合计8177字节，因此装饰预算由5KiB调整为10KiB以容纳选定的原始曲线，并保留预算检查。

关闭B的新审核稿位于artifacts/design-review/celtic-arcs-v5/index.html：每个箭头外侧两条边分别水平和竖直，四个直角贴合同一方形边线；两根相同路径旋转90度重叠，无断线和遮罩。浏览器测量边界(4,4,16,16)，放大辅助线及20px实际尺寸已查看；正式CloseButton仍待审核，不替换。首次file协议CSSmask预览受资源限制为空，改用浏览器拦截的同源HTTP静态资源复查后藤结正常显现；不是以空截图验收。assets:check、licenses:check与差异空白检查通过。未构建、未打包，桌面latest仍为build-kUvlIT。


## 已认可装饰落地与打包（2026-11-09）

用户明确批准改入本地仓库并打包，结束前述等待审核状态。CloseButton统一采用close-arrows.svg，保持32px按钮和20px红色图标，两个相同双头箭的外缘形成正方形四角。CelticKnot的Line分支同步已认可的152°圆弧稿和组合交织内圆，useId隔离三处遮罩；Ribbon素材保留。corner沿用已选藤结；divider的SVG和侧栏／标题／响应式CSS引用全部移除，素材检查改为corner与关闭图标。

类型、架构270文件、素材及许可检查、现有真实展柜弹窗规格回归通过。独立Chromium以实际458件莫娜库存检查关闭点击、收藏循环、圆弧遮罩、侧栏与390px；已查看截图。桌面构建预算通过，包build-d4KbYo在独立临时资料目录串行复查同样路径，关闭红叉正常、corner从打包资源加载、divider无引用、页面异常为空。隐藏测试窗口首次截图超时，改用本次实例的showInactive完成截图，不抢用户焦点；窄屏初次截图落在侧栏过渡帧，加入展开位置稳定条件后重拍并查看。

报告artifacts/u1-approved-celtic-preview.json、artifacts/u1-approved-celtic-desktop.json；截图approved-celtic-icons-reviewed.png与approved-celtic-packaged-detail.png、approved-celtic-packaged-close.png、approved-celtic-packaged-mobile.png。最新桌面入口artifacts/desktop/Start-LeyLine.cmd已更新到build-d4KbYo。未提交，U1整体体验验收仍待后续。


## 套装筛选、组合收藏与四角装饰（2026-11-10）

ArtifactSetFilter统一两页的完整套装目录和MultiSelectPicker，保留最高星级并按星级降序／版本降序／实装ID降序排列，旧版未知身份追加在末尾；通用下拉把星级传给图标，四星紫底正确。组合移除完整度，新增0–3级收藏持久化、详情循环、单项右键收藏、收藏多选筛选与排序。旧记录无字段仍可读取；保存编辑保留当前等级，另存独立为未收藏，写入失败不改内存，收藏不回写库存与穿戴。

关闭箭杆1.82→2.2，正方形四角和32／20px外部规格不变。四库主面板共用LibraryCornerOrnaments，各角40px、内缩7px、透明度.32，不响应点击；选择弹窗和详情不新增四角。

5项实际记录组合单测、两项相关浏览器流程通过，类型、架构273文件、素材、构建预算及差异空白检查通过。新增浏览器用例首次误用不在该四人记录内的琴，修正为记录中的班尼特后通过，没有增造玩家记录。通过UI为记录中的安柏和班尼特明确保存独立组合，验证收藏刷新、编辑保留、按等级排序、多选与重置、两页选项完全同序、四星底色以及四库大屏／390px截图。

桌面包build-jluYrf在隔离临时目录串行复测相同步骤；仅在该测试实例内的Enka IPC回放原始已记录响应，不声称本轮重新在线读取。库存全文前后相同，页面异常为空。报告artifacts/u1-combination-favorites-desktop.json；截图combination-favorites-list.png、combination-favorites-set-filter.png、library-corners-*.png及packaged-combination-favorites-*.png、packaged-library-corners-*.png已查看。最新稳定入口artifacts/desktop/Start-LeyLine.cmd；未提交，U1整体体验验收仍未完成。


## 内置思源黑体（2026-11-10）

按用户指定D:/fish/SourceHanSansSC-Normal.otf复制完整原文件到web资产，2.005、Normal／内部字重350，16,525,388字节；SHA-256与用户文件完全一致，记录于licenses/sources.json。fonts.css集中声明字体与--font-ui，HTML预加载，正文、控件和h1／h2／h3使用同一字体；保留现行字号字重层级与代码等宽字体，粗体由浏览器合成。归档Adobe官方OFL-1.1许可并同步分发。

使用实际458件莫娜库存，通过浏览器CDP确认大标题、主按钮、主词条数字、详情标题和表单标签的isCustomFont=true、postScriptName=SourceHanSansSC-Normal，未以CSS字体栈字符串代替实际字形检查。网页字体只请求一次；普通及粗体截图、390px已查看。真实展柜弹窗规格回归、类型、架构273文件、许可和构建预算通过。

新包build-u5SO5y在独立临时资料目录串行复查上述实际字形与离线加载，包内读取字体哈希与原文件一致，页面异常为空。桌面leyline自定义协议未提供ResourceTiming字体条目，首次计数断言不适用，已改为实际字形加原字节哈希检查；窄屏等待重排稳定后拍实际视口。报告artifacts/u1-source-han-font-browser.json、artifacts/u1-source-han-font-desktop.json；截图source-han-font-*.png与source-han-font-packaged-*.png已查看。启动入口artifacts/desktop/Start-LeyLine.cmd，未提交，U1整体体验验收保持后续独立进行。


## 补齐真实Bold字重（2026-11-10）

按用户指定SourceHanSansSC-Bold.otf内置同版本2.005原始文件，内部字重700，16,963,428字节；哈希df2b90f5bcc6d01dfc964cec5f6d535d6b6aebd26ed7fd79a9c1b3f2112fcb6b与用户文件一致。fonts.css新增700字面，保留350 Normal，HTML分别预加载两份字体；源记录、署名、许可分发及现行视觉规范同步。已有CSS字号／字重值保持，700及原750主词条值均实际匹配Bold，500普通导航匹配Normal。

实际458件库存浏览器及隔离桌面CDP复查了标题、主按钮、主词条数值、副词条数值、详情标题与表单标签的真实PostScript字面，以及普通导航的Normal；初始检查误将原本700的副词条dd当作普通字重样本，已按实际CSS改为Bold并另选500导航核验Normal。网页两份字体各请求一次，桌面两份文件哈希均与原文件一致。普通／粗体及390px截图已查看，页面异常为空。

现有真实展柜弹窗规格回归、类型、许可、构建预算及差异空白检查通过。桌面包build-B55Pqd，启动入口artifacts/desktop/Start-LeyLine.cmd；报告artifacts/u1-source-han-bold-browser.json、artifacts/u1-source-han-bold-desktop.json，截图source-han-bold-*.png与source-han-bold-packaged-*.png。未提交，U1整体体验验收仍待后续。


## 展柜库存状态与左下角标（2026-11-10）

用户反馈删除本地圣遗物后，展柜仍显示头像而未标未入库。原因是展柜wrapper未带库存状态，卡片只识别inventoryId=null，且头像由角色页强制传入。showcaseArtifact新增可选只读库存上下文，与入库共用精确有序匹配，排除脱库快照及副本；角色展柜使用当前已提交账号判断，不依赖旧编辑草稿库存。没有匹配时复用既有未入库角标，ArtifactSummary原有条件自动隐藏头像；有匹配时保留展柜角色头像。显示匹配不采用本地ID、不改快照、不创建或穿戴实物。

9项实际记录单测、3项相关Chromium流程通过，覆盖有库存时无角标、删掉五件后五个角标且零头像、配装仍保留五件脱库内容、单件入库变为四角标一头像、本地脱库装备不自动重连、只读详情标记、刷新及390px。单测另核验有序副词条反转、另存副本和脱库快照不能误判原件，快照JSON保持。类型、架构274文件、构建预算及差异空白检查通过。

桌面包build-pQcUMF在隔离临时资料目录串行复测同样流程；仅在该实例的Enka IPC回放原始记录，没有新造玩家数据。报告artifacts/u1-showcase-inventory-status-desktop.json；截图showcase-inventory-*.png及packaged-showcase-inventory-missing.png、packaged-showcase-inventory-imported.png已查看，异常为空。稳定入口artifacts/desktop/Start-LeyLine.cmd，未提交，U1整体体验验收仍待后续。


## 修正卡片小字笔画粘连（2026-11-10）

用户确认问题位于圣遗物卡片属性名的“素”“值”。实际库存文字为14px／700，放大对照14px粗体、同字号Normal及16px粗体，确认小尺寸Bold的字内留白很窄。对照板取自实际莫娜库存的生命值／元素精通，首次文字选择包含了图像角标，已限定artifact-values内的真实文字后重新截图。

fonts.css增加--font-weight-regular=350，ArtifactSummary仅对疏松和紧凑卡的属性名使用该token；保留14px、行高、列宽、数值及强化次数的Bold，以及控件16px／700。共用组件使角色详情、选装、配置和组合自动采用同一规则。颜色与高亮不改。

真实458件库存的浏览器及隔离桌面CDP确认：生命值、元素精通和紧凑属性名均使用SourceHanSansSC-Normal 350，数值及标题仍使用真实Bold。普通大小、放大对照、疏松／紧凑及390px截图已查看；页面异常为空。已有真实展柜弹窗规格回归、类型、构建预算和差异空白检查通过。新包build-55CC4c，稳定入口artifacts/desktop/Start-LeyLine.cmd；报告artifacts/u1-source-han-readable-browser.json、artifacts/u1-source-han-readable-desktop.json。未提交，U1体验验收保持后续独立进行。


## 全部文字统一微软雅黑（2026-11-10，现行规则）

用户决定停止思源黑体试用，并明确所有字体统一微软雅黑。base.css集中定义--font-ui，正文、标题、中英文、数字、控件、代码、公式及许可原文共用同一字体栈；删除原衬线标题与等宽字体例外。ArtifactSummary移除Normal350例外，疏松及紧凑属性名恢复既有700粗体。此决定覆盖上述思源黑体与小字Normal试验，不改变字号、控件规格或展柜未入库修复。

移除项目内两份OTF、fonts.css、预加载及其来源／许可分发记录；用户D:/fish下的原始字体文件保持。当前构建没有字体二进制，历史候选包作为旧审阅记录保留。

实际458件莫娜库存的浏览器和隔离桌面CDP确认：中文属性名、标题、中英文及数字的粗体使用MicrosoftYaHei-Bold，普通文字和代码／许可原文使用MicrosoftYaHei，均非自定义字体；窄屏页头另行确认同样使用微软雅黑。字体加载列表及网页字体请求为空，页面异常为空。已查看大屏详情、疏松／紧凑卡片及390px截图。现有真实展柜弹窗规格回归、类型、许可同步检查及构建预算通过。

新包build-DiGF2O，稳定入口artifacts/desktop/Start-LeyLine.cmd；报告artifacts/u1-yahei-browser.json、artifacts/u1-yahei-desktop.json，截图yahei-*.png及yahei-packaged-*.png。仍在ui/design，未提交，U1整体体验验收保持后续独立进行。
