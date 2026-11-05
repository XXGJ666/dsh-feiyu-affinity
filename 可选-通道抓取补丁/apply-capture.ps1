# 好感度插件 · 可选通道抓取补丁
# 作用：让装了这个插件的 QQ 通道，把每条消息写进 ~/.dsh/feiyu-affinity/affinity-last.json
# 不跑这个脚本，插件也能用（靠模型主动打分 + 面板手动）
$ErrorActionPreference = 'Stop'
$home = $env:USERPROFILE
$out = Join-Path $home '.dsh\feiyu-affinity\affinity-last.json'
$nm = Join-Path $home '.dsh\profiles\desktop\node_modules'
$done = 0

function Patch-File($path, $anchor, $code) {
  if (!(Test-Path $path)) { return }
  $txt = Get-Content $path -Raw -Encoding UTF8
  if ($txt -match 'AFFCAP') { Write-Host "已补过：$path"; return }
  if ($txt -notmatch [regex]::Escape($anchor)) { Write-Host "找不到插入点：$path"; return }
  $txt = $txt.Replace($anchor, $anchor + $code)
  Set-Content $path $txt -Encoding UTF8
  Write-Host "已补：$path"
}

$code = @'
        // AFFCAP 好感度抓取
        try {
          const fsx = await import('node:fs')
          const px = await import('node:path')
          const dirx = px.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh', 'feiyu-affinity')
          fsx.mkdirSync(dirx, { recursive: true })
          fsx.writeFileSync(px.join(dirx, 'affinity-last.json'), JSON.stringify({ ts: Date.now(), qq: String(inbound.userId ?? ''), name: String(inbound.nickname ?? ''), text: String(inbound.text ?? '').slice(0, 200) }), 'utf8')
        } catch { /* 忽略 */ }
'@

Patch-File (Join-Path $nm 'dsh-onebot-qq\lib\inbound.js') 'async processInbound(inbound) {' $code
Write-Host '完成（qqbot 官方通道需要单独处理，可私聊作者）'
