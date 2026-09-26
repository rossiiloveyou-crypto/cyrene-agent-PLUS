# Phase 2 缺陷 #1/#2 修复验证检测器
#
# 用法：
#   pwsh -File docs/construction/tools/phase2fix-verify.ps1 -Cmd rlog
#   pwsh -File docs/construction/tools/phase2fix-verify.ps1 -Cmd rlogBuckets
#   pwsh -File docs/construction/tools/phase2fix-verify.ps1 -Cmd speaker [-Count 40]
#   pwsh -File docs/construction/tools/phase2fix-verify.ps1 -Cmd ctx [-Conv <substr>] [-Full]

param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('rlog', 'rlogBuckets', 'speaker', 'ctx', 'runs')]
  [string]$Cmd,
  [int]$Count = 20,
  [string]$Conv = '',
  [switch]$Full
)

$ErrorActionPreference = 'Stop'
$UserData = Join-Path $env:APPDATA 'live2d-cyrene'

function Read-Utf8([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Scope-Text($s) { if ($s) { return $s } else { return '<legacy:no-scope>' } }

function Show-Rlog {
  $p = Join-Path $UserData 'relationship-log.json'
  $raw = Read-Utf8 $p
  if (-not $raw) { Write-Host "relationship-log.json 不存在"; return }
  $d = $raw | ConvertFrom-Json
  $i = Get-Item $p
  Write-Host "PATH : $p"
  Write-Host "SIZE : $($i.Length) bytes   MTIME: $($i.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
  Write-Host ""
  Write-Host "=== entries（按 scope 分组，只看最近 $Count 条）==="
  Write-Host ("  {0,-20} {1,-10} {2,-40} {3}" -f 'date', 'mood', 'scope', 'userText')
  $d.entries | Select-Object -Last $Count | ForEach-Object {
    $t = [string]$_.userText
    if ($t.Length -gt 46) { $t = $t.Substring(0, 46) + '...' }
    $t = $t -replace "`r?`n", ' / '
    Write-Host ("  {0,-20} {1,-10} {2,-40} {3}" -f $_.date, $_.userMood, (Scope-Text $_.scope), $t)
  }
  Write-Host ""
  Write-Host "=== dailySummaries（按 (scope,date) 分桶）==="
  Write-Host ("  {0,-12} {1,-42} {2}" -f 'date', 'scope', 'nextCareCue')
  $d.dailySummaries | ForEach-Object {
    $c = [string]$_.nextCareCue
    if ($c.Length -gt 60) { $c = $c.Substring(0, 60) + '...' }
    Write-Host ("  {0,-12} {1,-42} {2}" -f $_.date, (Scope-Text $_.scope), $c)
  }
  Write-Host ""
  Write-Host "=== 每 (scope,date) 桶计数（应无重复）==="
  $d.dailySummaries | Group-Object { "$(Scope-Text $_.scope)|$($_.date)" } |
    Select-Object Count, Name | Format-Table -AutoSize
  Write-Host "=== 前缀残留检查（正文里还有 [群聊发送者：…] 的条目）==="
  $dirty = @($d.entries | Where-Object { ([string]$_.userText) -like '*群聊发送者：*' })
  if ($dirty.Count -eq 0) { Write-Host "  ✔ 无（0 条）" }
  else {
    Write-Host "  ✘ $($dirty.Count) 条："
    $dirty | ForEach-Object { Write-Host "      [$($_.date)] scope=$(Scope-Text $_.scope) :: $(([string]$_.userText).Substring(0,[Math]::Min(90,([string]$_.userText).Length)))" }
  }
}

function Show-RlogBuckets {
  $p = Join-Path $UserData 'relationship-log.json'
  $raw = Read-Utf8 $p
  if (-not $raw) { Write-Host "relationship-log.json 不存在"; return }
  $d = $raw | ConvertFrom-Json
  # 复刻 findDailySummary：先精确匹配 scope；只有当天没有任何带 scope 的摘要时才回退 legacy
  $dates = @($d.entries | Select-Object -ExpandProperty date -Unique)
  $scopes = @($d.entries | ForEach-Object { if ($_.scope) { $_.scope } else { $null } } | Sort-Object -Unique)
  foreach ($date in $dates) {
    Write-Host "`n===== date=$date ====="
    $sameDay = @($d.dailySummaries | Where-Object { $_.date -eq $date })
    if ($sameDay.Count -eq 0) { Write-Host "  （当天没有摘要）" }
    else {
      foreach ($s in $sameDay) {
        $c = [string]$s.nextCareCue
        if ($c.Length -gt 70) { $c = $c.Substring(0, 70) + '...' }
        Write-Host ("  桶 scope={0,-42} cue={1}" -f (Scope-Text $s.scope), $c)
      }
    }
    Write-Host "  --- 各域实际会读到哪条 ---"
    foreach ($sc in $scopes) {
      if (-not $sc) { continue }
      $hit = $sameDay | Where-Object { $_.scope -eq $sc } | Select-Object -First 1
      if (-not $hit) {
        $hasScoped = @($sameDay | Where-Object { $_.scope }).Count -gt 0
        if ($hasScoped) { Write-Host ("    {0,-42} -> (无本域摘要，已封堵 legacy 回退) " -f $sc) }
        else { Write-Host ("    {0,-42} -> legacy 兜底: {1}" -f $sc, ([string]($sameDay[0].nextCareCue))) }
      }
      else { Write-Host ("    {0,-42} -> {1}" -f $sc, ([string]$hit.nextCareCue)) }
    }
  }
}

function Show-Speaker {
  Write-Host "=== 发送者前缀完整性检查 ==="
  Write-Host "缺陷 #2 的症状：昵称含 ] 时被截成残片，如 'BEIKIA (2914636187)]' 粘在正文前。"
  Write-Host ""
  $dirs = @(
    (Join-Path $UserData 'channels\history'),
    (Join-Path $UserData 'channels\archive')
  )
  $any = $false
  foreach ($dir in $dirs) {
    if (-not (Test-Path -LiteralPath $dir)) { Write-Host "  [$dir] 目录不存在"; continue }
    $files = @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First $Count)
    foreach ($f in $files) {
      $any = $true
      Write-Host "`n--- $($f.Name)  ($($f.Length) bytes, $($f.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))) ---"
      $n = 0
      foreach ($line in [System.IO.File]::ReadAllLines($f.FullName, [System.Text.Encoding]::UTF8)) {
        if (-not $line.Trim()) { continue }
        $n++
        try { $e = $line | ConvertFrom-Json } catch { Write-Host "    (解析失败) $line"; continue }
        $c = [string]$e.content
        $flat = $c -replace "`r?`n", ' / '
        if ($flat.Length -gt 100) { $flat = $flat.Substring(0, 100) + '...' }
        $flag = ''
        if ($c -match '群聊发送者：') { $flag += ' [含前缀]' }
        if ($c -match '\][^\n]{0,40}\(' -and $c -match '^\S*\]') { $flag += ' [?残片]' }
        Write-Host ("    [{0}] spk={1} id={2}{3}" -f $e.role, $e.speakerName, $e.speakerId, $flag)
        Write-Host ("         content: {0}" -f $flat)
      }
      Write-Host "    (共 $n 条)"
    }
  }
  if (-not $any) { Write-Host "  channels\history 与 channels\archive 都没有文件" }
}

function Show-Ctx {
  $dir = Join-Path $UserData 'cyrene-runs\sessions'
  $files = @(Get-ChildItem -LiteralPath $dir -File -Filter 'run-*.json' |
    Where-Object { $_.Name -notlike '*.events.jsonl' } | Sort-Object LastWriteTime -Descending)
  if ($files.Count -eq 0) { Write-Host "无 run 记录"; return }
  $sel = $files
  if ($Conv) { $sel = @($files | Where-Object { (Read-Utf8 $_.FullName) -match [regex]::Escape($Conv) }) }
  $sel = @($sel | Select-Object -First $Count)
  foreach ($f in $sel) {
    $j = Read-Utf8 $f.FullName | ConvertFrom-Json
    $ctx = @($j.messages | Where-Object { $_.visibility -eq 'internal' }) | Select-Object -Last 1
    Write-Host "`n################ $($f.BaseName)  $($f.LastWriteTime.ToString('MM-dd HH:mm:ss'))  conv=$($j.conversationId) ################"
    if (-not $ctx) { Write-Host "  (无 internal 上下文)"; continue }
    $body = [string]$ctx.content
    if ($Full) { Write-Host $body; continue }
    $lines = $body -split "`n"
    $cap = $false
    foreach ($l in $lines) {
      if ($l -match '【群聊近期上下文】|【近期关系线索】|【相关记忆】|\[用户画像\]|\[近期状态\]|【常驻背景】') { $cap = $true }
      if ($cap) { Write-Host $l }
      if ($cap -and $l -match '^---\s*$') { $cap = $false }
    }
  }
}

function Show-Runs {
  $dir = Join-Path $UserData 'cyrene-runs\sessions'
  $files = @(Get-ChildItem -LiteralPath $dir -File -Filter 'run-*.json' |
    Where-Object { $_.Name -notlike '*.events.jsonl' } | Sort-Object LastWriteTime -Descending | Select-Object -First $Count)
  Write-Host ("  {0,-28} {1,-18} {2,-36} {3,-6} {4}" -f 'run', 'mtime', 'conversation', 'promptChars', 'tools')
  foreach ($f in $files) {
    $j = Read-Utf8 $f.FullName | ConvertFrom-Json
    $ctx = @($j.messages | Where-Object { $_.visibility -eq 'internal' }) | Select-Object -Last 1
    $len = if ($ctx) { ([string]$ctx.content).Length } else { 0 }
    $tools = @($j.toolCalls | ForEach-Object { $_.name }) -join ','
    if ($tools.Length -gt 40) { $tools = $tools.Substring(0, 40) + '...' }
    Write-Host ("  {0,-28} {1,-18} {2,-36} {3,-6} {4}" -f $f.BaseName, $f.LastWriteTime.ToString('MM-dd HH:mm:ss'), $j.conversationId, $len, $tools)
  }
}

switch ($Cmd) {
  'rlog' { Show-Rlog }
  'rlogBuckets' { Show-RlogBuckets }
  'speaker' { Show-Speaker }
  'ctx' { Show-Ctx }
  'runs' { Show-Runs }
}
