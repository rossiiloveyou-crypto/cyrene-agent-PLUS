# P9.5 复核：旧 settings.css 的 memory-manager*/zone* 规则 -> 新 CSS 的保真比对
$ErrorActionPreference = 'Stop'
$repo = 'E:\AI_Chating\cyrene-agent'

function Parse-Rules([string]$css) {
  $map = @{}
  $skipped = 0
  foreach ($m in [regex]::Matches($css, '(?s)([^{}]+)\{([^{}]*)\}')) {
    $sel = $m.Groups[1].Value.Trim()
    if ($sel -match '@') { $skipped++; continue }
    $body = $m.Groups[2].Value
    $props = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($pm in [regex]::Matches($body, '(?m)(?:^|;)\s*([-a-zA-Z]+)\s*:')) { [void]$props.Add($pm.Groups[1].Value.ToLower()) }
    foreach ($s in ($sel -split ',')) {
      $k = (($s -replace '\s+', ' ').Trim() -replace '^>', '')
      if (-not $k) { continue }
      if (-not $map.ContainsKey($k)) { $map[$k] = New-Object 'System.Collections.Generic.HashSet[string]' }
      foreach ($p in $props) { [void]$map[$k].Add($p) }
    }
  }
  return @{ map = $map; skipped = $skipped }
}

$oldCss = (& git -C $repo show 'phase0-full:src/renderer/settings/settings.css') -join "`n"
"旧 settings.css 行数(按 `n 计) = " + (($oldCss -split "`n").Count)

$newA = [IO.File]::ReadAllText((Join-Path $repo 'src\renderer\react\features\settings\memory-console\MemoryConsole.css'))
$newB = [IO.File]::ReadAllText((Join-Path $repo 'src\renderer\react\features\settings\ZonesPanel.css'))

$old = Parse-Rules $oldCss
$new = Parse-Rules ($newA + "`n" + $newB)
"旧 CSS 规则总数 = {0}（跳过含 @ 的块 {1}）；新 CSS 规则总数 = {2}" -f $old.map.Count, $old.skipped, $new.map.Count

$pat = 'memory-manager|zone'
$oldKeys = @($old.map.Keys | Where-Object { $_ -match $pat } | Sort-Object)
$newKeys = @($new.map.Keys | Where-Object { $_ -match $pat } | Sort-Object)
"`n旧 CSS 中 memory-manager*/zone* 选择器 = {0}" -f $oldKeys.Count
"新 CSS 中 memory-manager*/zone* 选择器 = {0}" -f $newKeys.Count

# --- 出现次数完备性：旧 CSS 里提到这两族的每一行是否都被解析到
$mentioned = 0; $unparsed = @()
$allParsed = @($old.map.Keys)
foreach ($line in ($oldCss -split "`n")) {
  if ($line -match 'memory-manager|zone') {
    $mentioned++
    $isSel = $false
    foreach ($k in $allParsed) { if ($k -and $line.Contains($k)) { $isSel = $true; break } }
    if (-not $isSel) { $unparsed += $line.Trim() }
  }
}
"旧 CSS 提及这两族的行数 = {0}；未被选择器解析命中的行 = {1}" -f $mentioned, $unparsed.Count
foreach ($u in ($unparsed | Select-Object -First 15)) { "   ? $u" }

# --- 缺项：旧有新无
$missing = @($oldKeys | Where-Object { -not $new.map.ContainsKey($_) })
"`n=== 旧有新无（丢失的选择器）= {0} ===" -f $missing.Count
foreach ($k in $missing) { "   - $k" }

# --- 属性名缺失（新规则里少了旧规则有的属性）
"`n=== 属性名缺失（新 < 旧）==="
$dropCount = 0
foreach ($k in $oldKeys) {
  if (-not $new.map.ContainsKey($k)) { continue }
  $lost = @($old.map[$k] | Where-Object { -not $new.map[$k].Contains($_) })
  if ($lost.Count) { $dropCount++; "   $k  -> 缺 {0}" -f ($lost -join ',') }
}
"属性名缺失的选择器数 = {0}" -f $dropCount

# --- 新增选择器（旧无新有）
$added = @($newKeys | Where-Object { -not $old.map.ContainsKey($_) })
"`n=== 旧无新有（新增/改名后）= {0} ===" -f $added.Count
foreach ($k in $added) { "   + $k" }

# --- 颜色保真：新 CSS 里是否残留旧世界深色字面量
"`n=== 新 CSS 中的裸 hex / rgba ==="
foreach ($pair in @(@('MemoryConsole.css', $newA), @('ZonesPanel.css', $newB))) {
  $hex = [regex]::Matches($pair[1], '#[0-9a-fA-F]{3,8}\b').Count
  $rgba = [regex]::Matches($pair[1], 'rgba?\(').Count
  $cy = [regex]::Matches($pair[1], 'var\(--cy-').Count
  "{0}: hex={1} rgba={2} var(--cy-={3}" -f $pair[0], $hex, $rgba, $cy
}

# --- 令牌存在性：新 CSS 用到的 --rb-* 是否都在 tokens.css 里定义
$tokFile = Join-Path $repo 'src\renderer\react\styles\tokens.css'
if (-not (Test-Path -LiteralPath $tokFile)) {
  $tokFile = (Get-ChildItem -LiteralPath (Join-Path $repo 'src\renderer\react') -Recurse -Filter 'tokens.css' -File | Select-Object -First 1).FullName
}
$tokTxt = [IO.File]::ReadAllText($tokFile)
$tokDef = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($m in [regex]::Matches($tokTxt, '(--rb-[a-zA-Z0-9-]+)\s*:')) { [void]$tokDef.Add($m.Groups[1].Value) }
"`ntokens.css = {0}  定义令牌数 = {1}" -f $tokFile, $tokDef.Count
foreach ($pair in @(@('MemoryConsole.css', $newA), @('ZonesPanel.css', $newB))) {
  $used = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($m in [regex]::Matches($pair[1], 'var\((--rb-[a-zA-Z0-9-]+)')) { [void]$used.Add($m.Groups[1].Value) }
  $undefTok = @($used | Where-Object { -not $tokDef.Contains($_) } | Sort-Object)
  "{0}: 用到 --rb-* = {1}   未定义令牌 = {2}" -f $pair[0], $used.Count, $undefTok.Count
  foreach ($u in $undefTok) { "    NO-DEF TOKEN: $u" }
}
