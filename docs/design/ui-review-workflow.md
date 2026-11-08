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
