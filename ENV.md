### 环境配置记录

#### PYTHONPATH配置项目跟路径
https://code.visualstudio.com/docs/python/environments#_use-of-the-pythonpath-variable

in .vscode/settings:
"terminal.integrated.env.windows": {
  "PYTHONPATH": "src"
}
这里把初始配置放在.vscode.default/ 覆盖到.vscode/即可

in .env
PYTHONPATH=src


#### 项目虚拟环境配置
https://code.visualstudio.com/docs/python/environments#_work-with-environments

macOS/Linux
python3 -m venv .venv

windows:
python -m venv .venv

#### Windows PowerShell权限问题
默认情况下ps执行脚本是受限的
在ps中输入命令查看状态
Get-ExecutionPolicy -list
输入以下命令fix问题
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

#### (vsc)激活虚拟环境
命令面板Python: Select Interpreter -> ./venv.... (虚拟环境成功安装的话recommend的就是这个
ps会自动运行.venv/Scripts/Activate.ps1
看到(.venv) PS ...\LeyLine-Simulator>就欧了


### 更改pip镜像源
windows:
设置全局的pip镜像，在[项目目录]\.venv下面建立pip.ini
内容如下:

[global]
index-url = https://pypi.tuna.tsinghua.edu.cn/simple/
[install]
trusted-host=pypi.tuna.tsinghua.edu.cn

虚拟环境的镜像即可生效


#### 安装依赖/导出依赖
(venv)下
pip install -r requirements.txt

如果添加了新的第三方依赖库，需要导出requirements.txt并提交到git仓库
pip freeze -l > requirements.txt
