# web

Vue页面在src/pages，共享控件在components；domain为无响应式依赖的纯操作，stores管理状态与命令。platform和workers负责平台/求值边界。desktop是Electron主进程和preload，server是桌面与本地网页共用的Enka服务。generated为只读映射投影；资源维护入口在根assets。完整分工见[仓库地图](../../docs/architecture/repository-map.md)。
