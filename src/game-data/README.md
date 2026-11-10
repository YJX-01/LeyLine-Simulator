# game-data

正式内容维护在`data/characters`、`weapons`、`artifact-sets`，一实体一JSON；`tables`存当前公共表，`manifest.json`列内容版本及有序ID。`src/catalog.ts`是加载器；`generated`只是运行分块。

`pnpm data:build`验证共同schema后生成；`pnpm data:check`只读比较。内置和自定义角色使用相同CharacterDefinition，介绍、技能参数与静态规则直接进入UI和引擎。来源原件在tools/data/sources；图片在根assets；不读取archive或本地参考仓库。

字段语义见[内容规范](../../docs/standards/content.md)，精度及缺口见[数值审计](../../docs/references/numeric-precision.md)。
