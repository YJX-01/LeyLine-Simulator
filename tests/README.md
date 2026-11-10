# 测试入口

unit按schema/game-data/engine/web镜像实现；integration放跨模块、文件及实际资料检查；browser分开发与生产；desktop和performance各自独立。helpers只为测试服务，fixtures保存固定输入，所有类型均不属于生产实现。

历史构造JSON、场景专用测试/辅助代码及归档副本已删除。fixtures/recordings/enka仅保存当前导入、配装、浏览器和性能检查仍使用的官方公开响应及完整性记录。用户的458件莫娜库存及另一UID原件仍在忽略的.references，缺失时对应检查明确跳过。

current-format检查使用公开原响应的版本标记衍生输入验证旧版本拒绝、旧存储忽略和当前格式正常恢复；不声称是玩家原始导出或战斗实录。性能报告同样注明没有整轴实录。

维护与验收选择见[测试规范](../docs/standards/testing.md)。

保存、撤销、取消、文件大小及非法输入等软件行为检查使用当前空文档或真实录存的明确派生副本；不构造虚拟战斗或伤害真值。
