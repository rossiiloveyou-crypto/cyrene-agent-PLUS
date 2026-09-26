# Read-only probe: line-ending shape of every blob in official b11b8851 (workspace untouched).
# ASCII-only literals on purpose: Windows PowerShell 5.1 decodes BOM-less .ps1 as ANSI.
$ErrorActionPreference = 'Stop'
$repo = 'E:\AI_Chating\cyrene-agent'
$ref  = 'b11b8851'

$entries = @(foreach ($line in (git -C $repo ls-tree -r $ref)) {
  $tab = $line.IndexOf("`t")
  $meta = $line.Substring(0, $tab) -split '\s+'
  [pscustomobject]@{ Sha = $meta[2]; Path = $line.Substring($tab + 1) }
})
Write-Output "official tree blob count: $($entries.Count)"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'git.exe'
$psi.Arguments = '-C "' + $repo + '" cat-file --batch'
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.UseShellExecute = $false
$p = [System.Diagnostics.Process]::Start($psi)
$stdin = $p.StandardInput
$stdout = $p.StandardOutput.BaseStream

$tally = @{}
$crlfList = New-Object System.Collections.ArrayList
$lfList = New-Object System.Collections.ArrayList
$mixedList = New-Object System.Collections.ArrayList

foreach ($e in $entries) {
  $stdin.Write($e.Sha); $stdin.Write("`n"); $stdin.Flush()

  $hdr = New-Object System.Text.StringBuilder
  while ($true) {
    $b = $stdout.ReadByte()
    if ($b -lt 0 -or $b -eq 10) { break }
    [void]$hdr.Append([char]$b)
  }
  $h = $hdr.ToString()
  if ($h -match 'missing|ambiguous') { continue }
  $size = [int](($h -split ' ')[2])

  $buf = New-Object byte[] $size
  $got = 0
  while ($got -lt $size) {
    $r = $stdout.Read($buf, $got, $size - $got)
    if ($r -le 0) { break }
    $got += $r
  }
  [void]$stdout.ReadByte()

  if ($size -eq 0) { $k = 'empty' }
  else {
    $n = [Math]::Min(8000, $size)
    $isBin = $false
    for ($i = 0; $i -lt $n; $i++) { if ($buf[$i] -eq 0) { $isBin = $true; break } }
    if ($isBin) { $k = 'BINARY' }
    else {
      $crlf = 0; $lf = 0
      for ($i = 0; $i -lt $size; $i++) {
        if ($buf[$i] -eq 10) { if ($i -gt 0 -and $buf[$i-1] -eq 13) { $crlf++ } else { $lf++ } }
      }
      if ($lf -eq 0 -and $crlf -gt 0) { $k = 'TEXT_CRLF' }
      elseif ($crlf -eq 0 -and $lf -gt 0) { $k = 'TEXT_LF' }
      elseif ($crlf -gt 0 -and $lf -gt 0) { $k = 'TEXT_MIXED' }
      else { $k = 'TEXT_NOEOL' }

      if ($k -eq 'TEXT_CRLF'  -and $crlfList.Count  -lt 80) { [void]$crlfList.Add($e.Path) }
      if ($k -eq 'TEXT_LF'    -and $lfList.Count    -lt 15) { [void]$lfList.Add($e.Path) }
      if ($k -eq 'TEXT_MIXED' -and $mixedList.Count -lt 20) { [void]$mixedList.Add("$($e.Path)  (CRLF=$crlf LF=$lf)") }
    }
  }
  if (-not $tally.ContainsKey($k)) { $tally[$k] = 0 }
  $tally[$k]++
}

$stdin.Close()
$p.WaitForExit()

Write-Output ""
Write-Output "=== official $ref blob EOL distribution ==="
$tally.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { "{0,-12} {1,6}" -f $_.Key, $_.Value }

Write-Output ""
Write-Output "=== official tree: text files STORED AS CRLF (first 80) ==="
if ($crlfList.Count) { $crlfList | ForEach-Object { "  $_" } } else { Write-Output '  (none - official tree stores LF)' }

Write-Output ""
Write-Output "=== official tree: text files stored as pure LF (first 15) ==="
if ($lfList.Count) { $lfList | ForEach-Object { "  $_" } } else { Write-Output '  (none)' }

Write-Output ""
Write-Output "=== official tree: mixed-EOL text files (first 20) ==="
if ($mixedList.Count) { $mixedList | ForEach-Object { "  $_" } } else { Write-Output '  (none)' }
