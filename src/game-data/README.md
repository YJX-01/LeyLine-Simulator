# game-data

正式输入在data/characters、weapons、artifact-sets，每实体一份JSON；tables保存公共表，manifest.json维护版本和有序ID。src/catalog.ts提供加载器，generated提供只读运行分块。

pnpm data:build经共同schema校验后离线生成，pnpm data:check直接比较来源、模板与派生结果。内置与自定义角色共用CharacterDefinition，文本、参数、命座加级及规则由相同定义提供；配装消费自身快照。

套装简称位于[data/tables/artifact-set-short-names.json](data/tables/artifact-set-short-names.json)，有效属性与白值基准分别在character-effective-stats.json、effective-roll-basis.json。生成器输出运行索引，具体清单由正式JSON维护。

来源原件和调查在[资料入口](../../tools/data/README.md)，精度与文本采用在[内容核对](../../tools/data/README.md#内容采用与精度核对)，计算能力在[支持记录](../../tools/data/README.md#计算支持与内容绑定)。通用语义见[内容规范](../../docs/content.md)。
