# Round-18 B18-01 RED: run the REAL Find-Dialog -> Find-ByName wrapper from the
# round-18 script over an in-memory UI tree, replacing only the UI/CIM boundary
# (the reviewer's method). Target browser pid 111; the legal utility child 333
# (parent 111, image msedge.exe) carries the share picker.
#
# Expected defect: Find-Dialog writes its ownership diagnostics with
# Write-Output, so the returned value is [String, FakeNode] (Count=2) and the
# downstream Find-ByName call fails on the String/array.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

class FakeNode {
  [object]$Current
  [object[]]$Children = @()
  [object[]] FindAll([object]$scope, [object]$condition) { return @($this.Children) }
}

$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$CT = [System.Windows.Automation.ControlType]

$scriptPath = Join-Path $PSScriptRoot '..\..\..\..\..\tools\desktop-recv\e2e\native-dialog.ps1'
$source = Get-Content -Raw -LiteralPath $scriptPath
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw "native-dialog.ps1 does not parse: $($errors[0].Message)" }
$wanted = @('Test-DialogNameForAction', 'Test-OwnershipFacts', 'Select-DialogRecords', 'Find-Dialog', 'Find-ByName')
$defs = @()
foreach ($fn in $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)) {
  if ($wanted -contains $fn.Name) { $defs += $fn.Extent.Text }
}
$defsText = $defs -join "`n`n"
# Boundary swap for the fake UI tree: only the root enumeration is replaced.
$defsText = $defsText.Replace('$tops = $AE::RootElement.FindAll($TS::Children, $windowCondition)', '$tops = $script:FakeTops')
if ($defsText -notmatch '\$script:FakeTops') { throw 'root-enumeration boundary not found; cannot run the wrapper test' }
Invoke-Expression $defsText

# CIM boundary: a stub owner chain for the synthetic processes.
function Get-OwnerChain([int]$ChildPid, [int]$MaxDepth = 8) {
  $table = @{
    333 = [pscustomobject]@{ pid = 333; name = 'msedge.exe'; parent = 111 }
    111 = [pscustomobject]@{ pid = 111; name = 'msedge.exe'; parent = 0 }
  }
  $chain = @(); $cur = $ChildPid; $seen = @{}
  for ($i = 0; $i -lt $MaxDepth -and $cur -gt 0 -and -not $seen.ContainsKey($cur); $i += 1) {
    $seen[$cur] = 1
    if (-not $table.ContainsKey($cur)) { break }
    $chain += $table[$cur]
    $cur = [int]$table[$cur].parent
  }
  return $chain
}

function New-FakeNode([int]$ProcId, [string]$Name, [string]$Class, [object[]]$Children = @()) {
  $node = [FakeNode]::new()
  $node.Current = [pscustomobject]@{ Name = $Name; ClassName = $Class; ProcessId = $ProcId; NativeWindowHandle = 200402 }
  $node.Children = $Children
  return $node
}

$button = New-FakeNode -ProcId 333 -Name '共享' -Class 'Button'
$picker = New-FakeNode -ProcId 333 -Name '选择要与 http://127.0.0.1:8767/ 共享的内容' -Class 'Chrome_WidgetWin_1' -Children @($button)
$top = New-FakeNode -ProcId 111 -Name 'Cimbar 桌面接收器' -Class 'Chrome_WidgetWin_1' -Children @($picker)
$script:FakeTops = @($top)

$selection = Find-Dialog @('111')
$count = @($selection).Count
$types = @($selection | ForEach-Object { if ($_ -is [string]) { 'String' } else { $_.GetType().Name } }) -join ','
$downstream = ''
try {
  $found = Find-ByName $selection '(?i)^share$|^共享$' $CT::Button
  $downstream = "Find-ByName OK name='" + $found.Current.Name + "'"
} catch {
  $downstream = 'Find-ByName ERROR: ' + $_.Exception.Message
}

$lines = @(
  'B18-01 RED (round-18 bytes; real Find-Dialog/Find-ByName, fake UI tree, stubbed owner chain)',
  'target pid=111; legal utility child pid=333 (parent 111, msedge.exe) carries the share picker',
  'Find-Dialog returned Count=' + $count + ' types=[' + $types + ']',
  'downstream: ' + $downstream,
  'defect reproduced: ' + ($count -ne 1 -or $types -match 'String')
)
$lines -join "`n" | Set-Content -Path (Join-Path $PSScriptRoot 'b18-01-red.log') -Encoding UTF8
Write-Output ('B18-01-RED count=' + $count + ' types=' + $types + ' downstream="' + $downstream + '"')
