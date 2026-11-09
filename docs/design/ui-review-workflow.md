# 前端设计与交互复查

2026-11-08。用户调整过的角色详情、圣遗物卡及详情页和 [现行视觉规范](visual-language.md) 是项目基准。技能用于补充检查，不覆盖已确认的主题、14px 正文下限、40/32/24px 控件及 12/10px 角标规则。

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
