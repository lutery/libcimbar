# Round-17 B17-01 RED: the CURRENT (abb650a) native-dialog Pass-2 selection
# logic, verbatim, over a synthetic tree. It mirrors the reviewer's method: the
# real decision rules are copied unchanged and fed records instead of a live
# UIA tree. The target browser is pid 111; the tree contains only an unrelated
# editor process (pid 222) and its nested dialogs:
#   save  : child class #32770, title "Security confirmation"
#   share : child title "Choose what to share"
# The old rules must return pid 222 for BOTH actions - the defect.
Set-StrictMode -Version 3.0

function Test-OldDialogName([string]$Action, [string]$Name) {
  if ($Action -eq 'save') {
    return $Name -match '(?i)save as|另存为|^save$'
  }
  if ($Action -eq 'open' -or $Action -eq 'open-cancel') {
    return $Name -match '(?i)打开|^open$'
  }
  return $Name -match '(?i)选择.*共享|choose what to share|^共享$|^share$'
}

function Select-OldDialog([string]$Action, $Tops, [int[]]$Pids) {
  # abb650a Find-Dialog(): pass 1 (target pids) then pass 2 (any process)
  if ($Pids) {
    foreach ($top in $Tops) {
      if ($Pids -notcontains $top.pid) { continue }
      if (Test-OldDialogName $Action $top.name) { return $top }
      foreach ($c in $top.children) {
        if (Test-OldDialogName $Action $c.name) { return $c }
        if ($Action -eq 'save' -and $c.class -eq '#32770') { return $c }
      }
    }
  }
  foreach ($top in $Tops) {
    if (Test-OldDialogName $Action $top.name) { return $top }
    foreach ($c in $top.children) {
      if (Test-OldDialogName $Action $c.name) { return $c }
      if ($Action -eq 'save' -and $c.class -eq '#32770') { return $c }
    }
  }
  return $null
}

$tops = @(
  [pscustomobject]@{
    pid = 222; name = 'Unrelated editor'; class = ''
    children = @(
      [pscustomobject]@{ pid = 222; name = 'Security confirmation'; class = '#32770' }
    )
  }
)
$shareTops = @(
  [pscustomobject]@{
    pid = 222; name = 'Unrelated editor'; class = ''
    children = @(
      [pscustomobject]@{ pid = 222; name = 'Choose what to share'; class = '' }
    )
  }
)

$saveSel = Select-OldDialog 'save' $tops @(111)
$shareSel = Select-OldDialog 'share' $shareTops @(111)
$savePid = if ($saveSel) { $saveSel.pid } else { $null }
$sharePid = if ($shareSel) { $shareSel.pid } else { $null }

$dir = Split-Path -Parent $PSCommandPath
$lines = @(
  'B17-01 RED (old Find-Dialog pass 1+2, verbatim from abb650a)',
  'targets: [111]; tree: unrelated pid 222 with nested save (#32770 Security confirmation) and share (Choose what to share)',
  'save action  -> selected pid: ' + ($(if ($null -eq $savePid) { 'null' } else { $savePid })),
  'share action -> selected pid: ' + ($(if ($null -eq $sharePid) { 'null' } else { $sharePid })),
  'defect reproduced: ' + (($savePid -eq 222) -and ($sharePid -eq 222))
)
$lines -join "`n" | Set-Content -Path (Join-Path $dir 'b17-01-red.log') -Encoding UTF8
Write-Output ('B17-01-RED savePid=' + $savePid + ' sharePid=' + $sharePid + ' reproduced=' + (($savePid -eq 222) -and ($sharePid -eq 222)))
