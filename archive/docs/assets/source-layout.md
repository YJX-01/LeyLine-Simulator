# 界面图标维护资料

`icons/`只保存图标来源、选择规则和矢量源文件，均使用JSON或原始SVG：

| 文件 | 用途 |
| --- | --- |
| `icons/sprites.json` | 角色及通用普攻图片来源 |
| `icons/scope.json` | 技能、战斗被动的收录范围 |
| `icons/stats.json` | 属性符号与共用增益别名 |
| `icons/artifact-slots.json` | 五种圣遗物部位符号来源 |
| `icons/buffs.json` | 增益符号来源 |
| `icons/vectors/` | 属性、圣遗物部位的原始SVG路径 |

维护工具在`tools/scripts/`，转换后的实际图片在`src/web/public/`，索引统一生成到`src/web/generated/`。角色、武器、套装的游戏数值到`src/game-data/data/`维护；不要在这里添加另一份游戏元数据。
