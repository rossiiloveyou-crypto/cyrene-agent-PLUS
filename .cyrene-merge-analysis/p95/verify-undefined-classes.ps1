# P9.5 复核：独立实现 J-32 检测（不使用执行者的 scanner，正则法）
$ErrorActionPreference = 'Stop'
$root = 'E:\AI_Chating\cyrene-agent\src\renderer\react'

$cssFiles = Get-ChildItem -LiteralPath $root -Recurse -Filter '*.css' -File
$defined = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($f in $cssFiles) {
  $txt = [IO.File]::ReadAllText($f.FullName)
  foreach ($m in [regex]::Matches($txt, '\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)')) { [void]$defined.Add($m.Groups[1].Value) }
}
"CSS 文件数 = {0}   已定义类名(去重) = {1}" -f $cssFiles.Count, $defined.Count

$targets = @(
  'features\settings\memory-console\MemoryManagerSection.tsx',
  'features\settings\memory-console\DangerZoneSection.tsx',
  'features\settings\ZonesSettingsPanel.tsx'
)

$pickedPrefix = '^(cy-|memory-|zone|zones-)'
foreach ($rel in $targets) {
  $p = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $p)) { "MISSING $rel"; continue }
  $txt = [IO.File]::ReadAllText($p)
  $names = New-Object 'System.Collections.Generic.HashSet[string]'

  foreach ($m in [regex]::Matches($txt, 'className\s*=\s*(?:"([^"]*)"|\{([^}]*)\})')) {
    $body = if ($m.Groups[1].Success) { $m.Groups[1].Value } else { $m.Groups[2].Value }
    # 双引号静态片段
    foreach ($q in [regex]::Matches($body, '"([^"]*)"')) {
      foreach ($tok in ($q.Groups[1].Value -split '\s+')) {
        if ($tok -match '^[A-Za-z][\w-]*$' -and $tok -notmatch '-$') { [void]$names.Add($tok) }
      }
    }
    # 模板字面量：剔除 ${...} 后取静态片段
    foreach ($t in [regex]::Matches($body, '`([^`]*)`')) {
      $frag = $t.Groups[1].Value -replace '\$\{[^}]*\}', ' '
      foreach ($tok in ($frag -split '\s+')) {
        if ($tok -match '^[A-Za-z][\w-]*$' -and $tok -notmatch '-$') { [void]$names.Add($tok) }
      }
    }
    # 条件分支里的裸标识符字符串（无引号写法不会出现在 className 内，故忽略）
  }

  $mine = @($names | Where-Object { $_ -match $pickedPrefix } | Sort-Object)
  $undef = @($mine | Where-Object { -not $defined.Contains($_) })
  "`n=== $rel ==="
  "  本项目相关类名 = {0}   其中 CSS 无定义 = {1}" -f $mine.Count, $undef.Count
  if ($undef.Count) { foreach ($u in $undef) { "    UNDEFINED: $u" } }
}
