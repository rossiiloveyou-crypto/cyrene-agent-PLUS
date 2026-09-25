# Phase 2 手工验证检测器
#
# 用途：场景 1~6 的"检测"侧。所有读取均显式按 UTF-8 解码（避免 PowerShell 5 默认 ANSI 乱码）。
#
# 用法：
#   pwsh -File docs/construction/tools/phase2-verify.ps1 -Cmd runs      [-Count 10]
#   pwsh -File docs/construction/tools/phase2-verify.ps1 -Cmd context   [-Run <runId|latest>] [-Full]
#   pwsh -File docs/construction/tools/phase2-verify.ps1 -Cmd memory
#   pwsh -File docs/construction/tools/phase2-verify.ps1 -Cmd files
#   pwsh -File docs/construction/tools/phase2-verify.ps1 -Cmd zones
#   pwsh -File docs/construction/tools/phase2-verify.ps1 -Cmd sessions
#   pwsh -File docs/construction/tools/phase2-verify.ps1 -Cmd trace     [-Count 15]

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('runs', 'context', 'memory', 'files', 'zones', 'sessions', 'trace', 'settings')]
  [string]$Cmd,
  [int]$Count = 10,
  [string]$Run = 'latest',
  [switch]$Full
)

$ErrorActionPreference = 'Stop'
$UserData = Join-Path $env:APPDATA 'live2d-cyrene'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-Utf8([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Read-Utf8Lines([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  return [System.IO.File]::ReadAllLines($Path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8([string]$Path, [string]$Text) {
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

function Get-RunFiles {
  $dir = Join-Path $UserData 'cyrene-runs\sessions'
  if (-not (Test-Path -LiteralPath $dir)) { return @() }
  # run-*.json 是运行记录本体，run-*.events.jsonl 是同名事件流
  Get-ChildItem -LiteralPath $dir -File -Filter 'run-*.json' |
    Where-Object { $_.Name -notlike '*.events.jsonl' } |
    Sort-Object LastWriteTime -Descending
}

function Get-Run([string]$Name) {
  $files = Get-RunFiles
  if ($files.Count -eq 0) { throw "找不到任何 run 记录：$UserData\cyrene-runs\sessions" }
  if ($Name -eq 'latest') { $f = $files[0] }
  else {
    $f = $files | Where-Object { $_.BaseName -eq $Name -or $_.Name -eq $Name -or $_.BaseName -like "*$Name*" } | Select-Object -First 1
    if (-not $f) { throw "找不到 run：$Name" }
  }
  $obj = (Read-Utf8 $f.FullName) | ConvertFrom-Json
  return [pscustomobject]@{ File = $f; Record = $obj }
}

# always-on 上下文在 messages 里表现为一条"internal"可见性的长 user 消息。
# 它包含运行环境头，是最稳的定位特征。
function Get-ContextMessage($record) {
  $msgs = @($record.messages)
  $cand = @()
  for ($i = 0; $i -lt $msgs.Count; $i++) {
    $m = $msgs[$i]
    if ($m.role -ne 'user') { continue }
    $c = [string]$m.content
    if ($c -match '运行环境（机器实际状态') { $cand += [pscustomobject]@{ Index = $i; Content = $c; Visibility = [string]$m.visibility } }
  }
  if ($cand.Count -eq 0) { return $null }
  # 取最后一条：后面的覆盖前面的（同一轮可能重复注入）
  return $cand[-1]
}

function Get-RunSummary($file, $record) {
  $ctx = Get-ContextMessage $record
  $markers = @()
  if ($ctx) {
    foreach ($mk in '【群聊近期上下文】', '[用户画像]', '[近期状态]', '【近期关系线索】', '【常驻背景】') {
      if ($ctx.Content.Contains($mk)) { $markers += $mk }
    }
  }
  $ctxCount = $null
  if ($ctx -and $ctx.Content -match '群里最近的\s*(\d+)\s*条发言') { $ctxCount = [int]$Matches[1] }
  return [pscustomobject]@{
    RunId       = $record.runId
    When        = $file.LastWriteTime.ToString('MM-dd HH:mm:ss')
    Conv        = $record.conversationId
    Status      = $record.status
    Msgs        = @($record.messages).Count
    Ctx         = if ($ctx) { $ctx.Content.Length } else { 0 }
    GroupN      = $ctxCount
    Markers     = ($markers -join ' ')
  }
}

function Show-Runs {
  $files = Get-RunFiles | Select-Object -First $Count
  if ($files.Count -eq 0) { Write-Host "（无运行记录）"; return }
  $rows = foreach ($f in $files) {
    try { Get-RunSummary $f ((Read-Utf8 $f.FullName) | ConvertFrom-Json) }
    catch { [pscustomobject]@{ RunId = $f.BaseName; When = $f.LastWriteTime.ToString('MM-dd HH:mm:ss'); Conv = 'PARSE-ERR'; Status = ''; Msgs = 0; Ctx = 0; GroupN = $null; Markers = $_.Exception.Message } }
  }
  $rows | Format-Table -AutoSize -Wrap
}

function Show-Context([string]$Name) {
  $r = Get-Run $Name
  $rec = $r.Record
  $ctx = Get-ContextMessage $rec
  Write-Host "RUN      : $($rec.runId)"
  Write-Host "FILE     : $($r.File.FullName)"
  Write-Host "TIME     : $($r.File.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
  Write-Host "CONV     : $($rec.conversationId)"
  Write-Host "STATUS   : $($rec.status)"
  Write-Host "MESSAGES : $(@($rec.messages).Count)"
  if (-not $ctx) { Write-Host "`n!! 本轮没有 always-on 上下文消息（可能全为内部运行）"; return }
  Write-Host "CTX MSG  : index=$($ctx.Index) vis=$($ctx.Visibility) len=$($ctx.Content.Length)"
  foreach ($mk in '【常驻背景】', '【群聊近期上下文】', '[用户画像]', '[近期状态]', '【近期关系线索】') {
    $hit = $ctx.Content.Contains($mk)
    Write-Host ("  {0,-22} {1}" -f $mk, $(if ($hit) { '✔ 有' } else { '✘ 无' }))
  }
  if ($ctx.Content -match '群里最近的\s*(\d+)\s*条发言') { Write-Host "  群上下文条数(声明)     : $($Matches[1])" }
  # 实际行数（以 [说话人]: 开头）
  $actual = ([regex]::Matches($ctx.Content, '(?m)^\[[^\]]+\]: ')).Count
  Write-Host "  群上下文条目(实测)     : $actual"
  $out = Join-Path $env:TEMP "cyrene-ctx-$($rec.runId).txt"
  Write-Utf8 $out $ctx.Content
  Write-Host "`nCTX 正文已导出: $out"
  if ($Full) { Write-Host "`n===== FULL CONTEXT ====="; Write-Host $ctx.Content }
  else {
    $lines = $ctx.Content -split "`n"
    Write-Host "`n===== 关键片段 ====="
    $show = $false
    foreach ($l in $lines) {
      if ($l -match '【群聊近期上下文】|\[用户画像\]|\[近期状态\]|【近期关系线索】') { $show = $true }
      elseif ($l -match '^---\s*$' -or $l -match '^## ') { $show = $false }
      if ($show) { Write-Host $l }
    }
  }
}

function Show-Memory {
  $p = Join-Path $UserData 'memory.json'
  $raw = Read-Utf8 $p
  if (-not $raw) { Write-Host "memory.json 不存在: $p"; return }
  $m = $raw | ConvertFrom-Json
  Write-Host "PATH          : $p"
  Write-Host "SIZE/MTIME    : $((Get-Item $p).Length) bytes / $((Get-Item $p).LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
  Write-Host "schemaVersion : $($m.schemaVersion)   (期望 3)"
  Write-Host "l0.occupation : '$($m.l0.occupation)'"
  Write-Host "l0.preferred  : '$($m.l0.preferredName)'"
  Write-Host "l0.interests  : '$($m.l0.longTermInterests)'"
  Write-Host "l1.roundCount : $($m.l1.roundCount)"
  Write-Host "l1.recentPref : '$($m.l1.recentPreferences)'"
  Write-Host "l2.count      : $(@($m.l2).Count)"
  Write-Host "evidence      : $(@($m.evidence).Count)   conflictLogs: $(@($m.conflictLogs).Count)   reflectionLogs: $(@($m.reflectionLogs).Count)"
  if (@($m.l2).Count -gt 0) {
    Write-Host "`n--- L2 条目 ---"
    @($m.l2) | Select-Object id, scope, status, weight, @{n = 'content'; e = { $s = [string]$_.content; if ($s.Length -gt 60) { $s.Substring(0, 60) + '…' } else { $s } } } |
      Format-Table -AutoSize -Wrap
    Write-Host "--- scope 汇总 ---"
    @($m.l2) | Group-Object scope | Select-Object Count, Name | Format-Table -AutoSize
  }
}

function Show-Files {
  Write-Host "=== 记忆相关文件存在性 ==="
  $checks = @(
    'memory.json',
    'memory-trace.log',
    'relationship-log.json',
    'entity-graph.json',
    'moments.json',
    'moments-state.json',
    'moments-reaction-queue.json',
    'chat-social-atoms.json',
    'proactive-state.json',
    'rag-data\memory-store.json',
    'rag-data\memory-store-meta.json',
    'zones.json',
    'cyrene-chats'
  )
  foreach ($c in $checks) {
    $p = Join-Path $UserData $c
    if (Test-Path -LiteralPath $p) {
      $i = Get-Item -LiteralPath $p
      $extra = if ($i.PSIsContainer) { "dir, $((Get-ChildItem -LiteralPath $p -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count) files" } else { "$($i.Length) bytes" }
      Write-Host ("  存在  {0,-42} {1}  ({2})" -f $c, $i.LastWriteTime.ToString('MM-dd HH:mm:ss'), $extra)
    }
    else { Write-Host ("  缺失  {0}" -f $c) }
  }
  Write-Host "`n=== channels/history 与 channels/archive ==="
  foreach ($sub in 'history', 'archive') {
    $p = Join-Path $UserData "channels\$sub"
    if (-not (Test-Path -LiteralPath $p)) { Write-Host "  channels\$sub : 目录不存在"; continue }
    $files = @(Get-ChildItem -LiteralPath $p -Recurse -File -ErrorAction SilentlyContinue)
    $size = ($files | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $size) { $size = 0 }
    Write-Host "  channels\$sub : $($files.Count) 个文件, $size bytes"
    foreach ($f in $files) { Write-Host "      $($f.Name)  ($($f.Length) bytes, $($f.LastWriteTime.ToString('MM-dd HH:mm')))" }
  }
}

function Show-Zones {
  $p = Join-Path $UserData 'zones.json'
  $raw = Read-Utf8 $p
  if (-not $raw) { Write-Host "zones.json 不存在"; return }
  $z = $raw | ConvertFrom-Json
  Write-Host "PATH: $p  (mtime $((Get-Item $p).LastWriteTime.ToString('MM-dd HH:mm:ss')))"
  foreach ($zone in $z.zones) {
    Write-Host "`n[区块] $($zone.zoneName)  id=$($zone.zoneId)  root=$($zone.isRoot)  observe=$($zone.config.observeGroupMessages)  injectOwnerProfile=$($zone.config.injectOwnerProfile)"
    if (@($zone.members).Count -eq 0) { Write-Host "    (无成员)" }
    foreach ($m in $zone.members) {
      Write-Host ("    - {0,-9} chat={1,-14} type={2,-8} name={3} session={4}" -f $m.kind, $m.chatId, $m.chatType, $m.senderName, $m.sessionId)
    }
  }
}

function Show-Sessions {
  Write-Host "=== 会话 ID 对照表（chatId -> 所属记忆域 / 白名单来源）==="
  # sessionId 规则：channel:<渠道>:<sha256("<渠道>:<chatId>") 前 16 位>（见 channel-context.makeSessionId）
  $zoneRaw = Read-Utf8 (Join-Path $UserData 'zones.json')
  $zones = if ($zoneRaw) { @(($zoneRaw | ConvertFrom-Json).zones) } else { @() }
  $cfgRaw = Read-Utf8 (Join-Path $UserData 'channels-settings.json')
  $cfg = if ($cfgRaw) { $cfgRaw | ConvertFrom-Json } else { $null }

  $rows = New-Object System.Collections.ArrayList
  $seen = @{}
  foreach ($zone in $zones) {
    foreach ($m in $zone.members) {
      if (-not $m.chatId) { continue }
      $key = "$($m.channel):$($m.chatId)"
      if ($seen.ContainsKey($key)) { continue }
      $seen[$key] = $true
      $scope = if ($zone.isRoot -and $m.chatType -ne 'group') { 'zone:root' } else { "zone:$($zone.zoneId)" }
      [void]$rows.Add([pscustomobject]@{
        chatId = $m.chatId; type = $m.chatType; zone = $zone.zoneName
        scope = $scope; session = $m.sessionId; whitelist = 'in-zone'
      })
    }
  }
  if ($cfg) {
    foreach ($g in $cfg.qq.allowedGroupIds) {
      $key = "qq:$g"
      if ($seen.ContainsKey($key)) { continue }
      $seen[$key] = $true
      [void]$rows.Add([pscustomobject]@{
        chatId = $g; type = 'group'; zone = '(无)'
        scope = 'solo:channel:qq:...'; session = '(还没产生过会话)'
        whitelist = 'legacy allowedGroupIds'
      })
    }
  }
  $rows | Format-Table -AutoSize -Wrap

  Write-Host "`n=== channels\context-bindings.json ==="
  $b = Read-Utf8 (Join-Path $UserData 'channels\context-bindings.json')
  if ($b) { Write-Host $b } else { Write-Host '(不存在)' }
}

function Show-Trace {
  $p = Join-Path $UserData 'memory-trace.log'
  $lines = Read-Utf8Lines $p
  if ($lines.Count -eq 0) { Write-Host "memory-trace.log 不存在或为空"; return }
  Write-Host "PATH: $p  ($($lines.Count) 行)"
  $lines | Select-Object -Last $Count
}

function Show-Settings {
  # app-settings.json 是**扁平**结构（saveGeneralSettings 直接写归一化对象），没有 general 段；
  # groupContextLimit 就是顶层的一个键。缺失 = 从来没保存过 → 用默认值 10。
  $p = Join-Path $UserData 'app-settings.json'
  $raw = Read-Utf8 $p
  if (-not $raw) { Write-Host "app-settings.json 不存在"; return }
  $s = $raw | ConvertFrom-Json
  Write-Host "PATH : $p"
  Write-Host "MTIME: $((Get-Item $p).LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
  if ($s.PSObject.Properties.Name -contains 'groupContextLimit') {
    Write-Host "groupContextLimit = $($s.groupContextLimit)    (合法 3~50, 默认 10)"
  }
  else {
    Write-Host "groupContextLimit = <未落盘>  → 设置-记忆 里的输入框还没保存成功，当前用默认值 10"
  }
}

switch ($Cmd) {
  'runs' { Show-Runs }
  'context' { Show-Context $Run }
  'memory' { Show-Memory }
  'files' { Show-Files }
  'zones' { Show-Zones }
  'sessions' { Show-Sessions }
  'trace' { Show-Trace }
  'settings' { Show-Settings }
}
