#Requires -Version 7
<#
.SYNOPSIS
  Drive a real Windows system dialog for the E2E harness (round-1 review A-01).

.DESCRIPTION
  The receiver uses the real File System Access picker (showSaveFilePicker);
  the capture picker is the real getDisplayMedia window chooser. Those dialogs
  are OS-level (Chromium renders the media picker as a nested views window),
  so browser automation cannot click them. This helper waits for the dialog
  with UI Automation, drives it, and never fabricates a result:
    - save:  sets the dialog's file-name edit to the requested absolute path
             and invokes the dialog's own Save button.
    - share: switches the picker to the "窗口/Windows" tab, selects the source
             whose name contains the requested title, then invokes Share.
             It refuses to click Share when the source was not selected.

  Usage:
    pwsh -NoProfile -File native-dialog.ps1 -Action save -Path <abs path> \
         [-ProcessName msedge] [-TimeoutSec 30]
    pwsh -NoProfile -File native-dialog.ps1 -Action share -SourceTitle <title> \
         [-ProcessName msedge] [-TimeoutSec 30]

  Exit: 0 the dialog was driven to completion, 1 the dialog/source was not found.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('save', 'share', 'share-cancel', 'save-cancel', 'stop-share')][string]$Action,
  [string]$Path,
  [string]$SourceTitle,
  [ValidateSet('window', 'screen', 'tab')][string]$Tab = 'window',
  [string]$ProcessName = 'msedge',
  [int]$ProcessId = 0,
  [int]$TimeoutSec = 30
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class NativeMouse {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint attach, uint attachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr hDlg, int id);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SetWindowText(IntPtr hWnd, string text);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetClassName(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr hWnd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

  // Background processes cannot raise a window with SetForegroundWindow due
  // to the Windows foreground lock. Attaching to the current foreground
  // thread lifts that restriction for the duration of the call.
  public static bool ForceForeground(IntPtr hWnd) {
    IntPtr fg = GetForegroundWindow();
    uint fgPid;
    uint fgThread = GetWindowThreadProcessId(fg, out fgPid);
    uint self = GetCurrentThreadId();
    bool attached = fgThread != 0 && fgThread != self && AttachThreadInput(self, fgThread, true);
    if (IsIconic(hWnd)) ShowWindow(hWnd, 9); // SW_RESTORE
    bool ok = SetForegroundWindow(hWnd);
    if (attached) AttachThreadInput(self, fgThread, false);
    return ok;
  }

  // The file-name edit is a descendant control with ctrl id 1001 AND class
  // Edit. (The breadcrumb toolbar also uses id 1001, so the class check is
  // required.) IDOK is a direct child.
  public static IntPtr FindEdit1001(IntPtr dialog) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(dialog, (child, l) => {
      if (GetDlgCtrlID(child) == 1001) {
        var cls = new StringBuilder(64);
        GetClassName(child, cls, 64);
        if (cls.ToString() == "Edit") { found = child; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  // The dialog can be a top-level #32770 itself or a child that Chromium
  // hosts inside its browser window.
  public static IntPtr FindSaveDialog() {
    IntPtr found = IntPtr.Zero;
    EnumWindows((top, l) => {
      var topClass = new StringBuilder(64);
      GetClassName(top, topClass, 64);
      if (topClass.ToString() == "#32770" &&
          FindEdit1001(top) != IntPtr.Zero &&
          GetDlgItem(top, 1) != IntPtr.Zero) {
        found = top;
        return false;
      }
      EnumChildWindows(top, (child, l2) => {
        var cls = new StringBuilder(64);
        GetClassName(child, cls, 64);
        if (cls.ToString() == "#32770" &&
            FindEdit1001(child) != IntPtr.Zero &&
            GetDlgItem(child, 1) != IntPtr.Zero) {
          found = child;
          return false;
        }
        return true;
      }, IntPtr.Zero);
      return found == IntPtr.Zero;
    }, IntPtr.Zero);
    return found;
  }

  // The overwrite confirmation ("确认另存为" / "Confirm Save As") is a modal
  // #32770. It is only expected if the file-name field was not filled
  // correctly; the caller refuses it (IDNO) instead of overwriting.
  public static IntPtr FindConfirmDialog() {
    IntPtr found = IntPtr.Zero;
    EnumWindows((top, l) => {
      var c = new StringBuilder(64);
      GetClassName(top, c, 64);
      if (c.ToString() == "#32770") {
        var t = new StringBuilder(256);
        GetWindowText(top, t, 256);
        var title = t.ToString();
        if (title.Contains("确认另存为") || title.Contains("Confirm Save As")) {
          found = top;
          return false;
        }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static void Click(int x, int y) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(120);
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
    mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
  }
}
'@

$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$CT = [System.Windows.Automation.ControlType]

function Get-TargetPids {
  if ($ProcessId -gt 0) { return @($ProcessId) }
  @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
}

function Test-DialogName([string]$Name) {
  if ($Action -eq 'save') {
    return $Name -match '(?i)save as|另存为|^save$'
  }
  return $Name -match '(?i)share|共享|choose what to share|选择.*共享'
}

# The media picker is a nested views window inside the browser window, while
# the save dialog can be either nested or a top-level common dialog. Search
# the browser's whole UIA subtree, not only the root's direct children.
function Find-Dialog([string[]]$Pids) {
  $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
    $AE::ControlTypeProperty, $CT::Window)
  $tops = $AE::RootElement.FindAll($TS::Children, $windowCondition)
  foreach ($top in $tops) {
    # A dialog can be its own top-level window (Chromium may host the media
    # picker / FSA dialog in a utility process, so the browser pid filter
    # would skip it). A name match is specific enough.
    if (Test-DialogName "$($top.Current.Name)") { return $top }
    if ($Pids -and ($Pids -notcontains $top.Current.ProcessId)) { continue }
    $nested = $top.FindAll($TS::Descendants, $windowCondition)
    foreach ($candidate in $nested) {
      if (Test-DialogName "$($candidate.Current.Name)") { return $candidate }
      # The FSA save picker is the classic #32770 file dialog; its title can
      # be a security warning instead of "Save As", so recognize the class.
      if ($Action -eq 'save' -and "$($candidate.Current.ClassName)" -eq '#32770') {
        return $candidate
      }
    }
  }
  return $null
}

function Find-ByName($Dialog, [string]$Pattern, $ControlType) {
  $condition = New-Object System.Windows.Automation.PropertyCondition(
    $AE::ControlTypeProperty, $ControlType)
  $items = $Dialog.FindAll($TS::Descendants, $condition)
  foreach ($item in $items) {
    if ("$($item.Current.Name)" -match $Pattern) { return $item }
  }
  return $null
}

function Find-ByAutomationId($Dialog, [string]$Id, $ControlType) {
  $conditions = @(
    (New-Object System.Windows.Automation.PropertyCondition($AE::AutomationIdProperty, $Id)),
    (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $ControlType))
  )
  $and = New-Object System.Windows.Automation.AndCondition($conditions)
  return $Dialog.FindFirst($TS::Descendants, $and)
}

function Invoke-Element($Element, [string]$FallbackKeys = '{ENTER}') {
  $pattern = $null
  if ($Element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
    $pattern.Invoke()
    return
  }
  $Element.SetFocus()
  Start-Sleep -Milliseconds 150
  [System.Windows.Forms.SendKeys]::SendWait($FallbackKeys)
}

# Chromium shows a one-time (per fresh profile) "allow this site to edit the
# file" prompt after the save dialog resolves; it appears only once the app
# actually starts the write. If it is missed, the app gets NotAllowedError
# and the file stays empty. Poll for the prompt and click 允许/Allow.
function Grant-FilePermission([string[]]$Pids) {
  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Date) -lt $deadline) {
    $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
      $AE::ControlTypeProperty, $CT::Window)
    $tops = $AE::RootElement.FindAll($TS::Children, $windowCondition)
    foreach ($top in $tops) {
      if ($Pids -and ($Pids -notcontains $top.Current.ProcessId)) { continue }
      $nested = $top.FindAll($TS::Descendants, $windowCondition)
      foreach ($candidate in $nested) {
        $name = "$($candidate.Current.Name)"
        if ($name -match '允许|此站点|edit.*file|wants to edit|保存对') {
          $buttons = $candidate.FindAll($TS::Descendants,
            (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Button)))
          foreach ($button in $buttons) {
            if ("$($button.Current.Name)" -match '^允许$|^Allow$|允许此站点|允许编辑') {
              Invoke-Element $button
              Write-Output 'granted the file-edit permission'
              Start-Sleep -Milliseconds 400
              return $true
            }
          }
        }
      }
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

# Edge opens a modal "sync your profile" bubble on fresh profiles. It sits
# above the file dialog and hides the dialog's controls from the UIA tree.
# Dismiss it (click 明白/OK) before touching the dialog.
function Dismiss-EdgePromos([string[]]$Pids) {
  $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
    $AE::ControlTypeProperty, $CT::Window)
  $tops = $AE::RootElement.FindAll($TS::Children, $windowCondition)
  foreach ($top in $tops) {
    if ($Pids -and ($Pids -notcontains $top.Current.ProcessId)) { continue }
    $nested = $top.FindAll($TS::Descendants, $windowCondition)
    foreach ($candidate in $nested) {
      if ("$($candidate.Current.Name)" -match '同步用户配置|Sync your profile') {
        $button = Find-ByName $candidate '^明白$|^Got it$' $CT::Button
        if ($button) {
          Invoke-Element $button
          Write-Output 'dismissed the Edge sync bubble'
          Start-Sleep -Milliseconds 500
        }
      }
    }
  }
}

# Cancel-style actions target different windows than the main save/share
# flows; they are handled before the common dialog-wait loop.
if ($Action -in @('share-cancel', 'save-cancel', 'stop-share')) {
  Dismiss-EdgePromos (Get-TargetPids)
  $cancelDeadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $cancelDeadline) {
    if ($Action -eq 'save-cancel') {
      # The save dialog is the classic #32770 with a Cancel button (ID 2).
      $hwnd = [NativeMouse]::FindSaveDialog()
      if ($hwnd -ne [IntPtr]::Zero) {
        $cancel = [NativeMouse]::GetDlgItem($hwnd, 2)
        if ($cancel -ne [IntPtr]::Zero) {
          [NativeMouse]::PostMessage($cancel, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
          Write-Output 'save dialog cancelled'
          exit 0
        }
      }
    } elseif ($Action -eq 'stop-share') {
      # The sharing indicator bar lives inside the browser window: a nested
      # views window whose name contains 正在共享 / is sharing, with a
      # 停止共享 / Stop sharing button.
      $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
        $AE::ControlTypeProperty, $CT::Window)
      $targetPids = Get-TargetPids
      $tops = $AE::RootElement.FindAll($TS::Children, $windowCondition)
      foreach ($top in $tops) {
        if ($targetPids -and ($targetPids -notcontains $top.Current.ProcessId)) { continue }
        $nested = $top.FindAll($TS::Descendants, $windowCondition)
        foreach ($candidate in $nested) {
          if ("$($candidate.Current.Name)" -match '正在共享|is sharing') {
            $stop = Find-ByName $candidate '停止共享|Stop sharing' $CT::Button
            if ($stop) {
              Invoke-Element $stop
              Write-Output 'sharing stopped'
              exit 0
            }
          }
        }
      }
    } else {
      # share-cancel: the media picker's own 取消 button.
      $dialog = Find-Dialog (Get-TargetPids)
      if ($dialog) {
        $cancel = Find-ByName $dialog '^取消$|^Cancel$' $CT::Button
        if ($cancel) {
          Invoke-Element $cancel
          Write-Output 'share picker cancelled'
          exit 0
        }
      }
    }
    Start-Sleep -Milliseconds 300
  }
  [Console]::Error.WriteLine("no cancellable dialog found for '$Action' within $TimeoutSec s")
  exit 1
}

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$dialog = $null
# A fresh Edge profile shows a modal sync bubble that hides the dialog's
# controls; clear it before looking for the dialog.
Dismiss-EdgePromos (Get-TargetPids)
while ((Get-Date) -lt $deadline) {
  $dialog = Find-Dialog (Get-TargetPids)
  if ($dialog) { break }
  Start-Sleep -Milliseconds 250
}
if (-not $dialog) {
  [Console]::Error.WriteLine("dialog not found for action '$Action' within $TimeoutSec s")
  exit 1
}

if ($Action -eq 'save') {
  if (-not $Path) { [Console]::Error.WriteLine('-Path is required for save'); exit 1 }

  # The save dialog is the classic Win32 file dialog. Its file-name edit is
  # control 1001 and its Save button is IDOK (1). Setting the text and
  # clicking the dialog's own button is the same interaction a user does;
  # success is only reported when the file exists on disk afterwards.
  $saveDeadline = (Get-Date).AddSeconds($TimeoutSec)
  $hwnd = [IntPtr]::Zero
  while ((Get-Date) -lt $saveDeadline -and $hwnd -eq [IntPtr]::Zero) {
    $hwnd = [NativeMouse]::FindSaveDialog()
    if ($hwnd -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 300 }
  }
  if ($hwnd -eq [IntPtr]::Zero) {
    [Console]::Error.WriteLine('save dialog not found')
    exit 1
  }
  $edit = [NativeMouse]::FindEdit1001($hwnd)
  if ($edit -eq [IntPtr]::Zero) {
    [Console]::Error.WriteLine('file name edit (1001) not found in the save dialog')
    exit 1
  }
  # Typing character-by-character lets the file dialog's autocomplete
  # dropdown eat part of the path mid-way (observed: the name truncated at
  # "...20261019-tea"). Pasting the full path from the clipboard is atomic
  # and is exactly what a user does with a long path. Edge can re-show its
  # sync bubble while the dialog is open; clear it before typing.
  Dismiss-EdgePromos (Get-TargetPids)
  [NativeMouse]::ForceForeground($hwnd) | Out-Null
  Start-Sleep -Milliseconds 500
  Set-Clipboard -Value $Path
  Start-Sleep -Milliseconds 200
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  Start-Sleep -Milliseconds 150
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  Start-Sleep -Milliseconds 400
  # The file dialog's autocomplete dropdown can swallow the first Enter (it
  # commits the highlighted suggestion instead of saving), so a second Enter
  # completes the save when the file did not appear.
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  $fileDeadline = (Get-Date).AddSeconds(4)
  while ((Get-Date) -lt $fileDeadline -and -not (Test-Path -LiteralPath $Path)) {
    Start-Sleep -Milliseconds 250
  }
  if (-not (Test-Path -LiteralPath $Path) -and [NativeMouse]::FindSaveDialog() -ne [IntPtr]::Zero) {
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  }

  # Our target path is always fresh; if an overwrite prompt still appears the
  # dialog was not filled correctly. Refuse it rather than overwrite silently.
  Start-Sleep -Milliseconds 800
  $confirm = [NativeMouse]::FindConfirmDialog()
  if ($confirm -ne [IntPtr]::Zero) {
    $no = [NativeMouse]::GetDlgItem($confirm, 7) # IDNO
    if ($no -ne [IntPtr]::Zero) {
      [NativeMouse]::PostMessage($no, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    }
    Start-Sleep -Milliseconds 300
    # Make sure nothing is left blocking the page: close the confirm prompt,
    # then cancel the still-open save dialog via its own Cancel button so the
    # app's picker promise settles (state back to Retryable).
    [NativeMouse]::ForceForeground($confirm) | Out-Null
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
    Start-Sleep -Milliseconds 300
    $saveDialog = [NativeMouse]::FindSaveDialog()
    if ($saveDialog -ne [IntPtr]::Zero) {
      $cancelButton = [NativeMouse]::GetDlgItem($saveDialog, 2)
      if ($cancelButton -ne [IntPtr]::Zero) {
        [NativeMouse]::PostMessage($cancelButton, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
      } else {
        [NativeMouse]::ForceForeground($saveDialog) | Out-Null
        [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
      }
      Start-Sleep -Milliseconds 300
    }
    [Console]::Error.WriteLine('an unexpected overwrite confirmation appeared; refused it')
    exit 1
  }

  $verifyDeadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $verifyDeadline -and -not (Test-Path -LiteralPath $Path)) {
    Start-Sleep -Milliseconds 250
  }
  if (Test-Path -LiteralPath $Path) {
    # Chromium may ask once (per fresh profile) whether the site may edit the
    # file; a missed prompt surfaces as NotAllowedError in the app and an
    # empty file. Grant it via its own 允许/Allow button.
    Grant-FilePermission (Get-TargetPids)
    Write-Output "saved: $Path"
    exit 0
  }
  [Console]::Error.WriteLine("the save dialog did not produce the file: $Path")
  exit 1
} else {
  Write-Output "dialog: $($dialog.Current.Name) pid=$($dialog.Current.ProcessId)"

  # The picker opens on the tab list; pick the requested source class.
  $tabPattern = switch ($Tab) {
    'window' { '^窗口$|^Windows?$' }
    'screen' { '^整个屏幕$|^Entire screen$|^Screen' }
    default { '^Microsoft Edge 标签页$|^Edge tab' }
  }
  $tabItem = Find-ByName $dialog $tabPattern $CT::TabItem
  if ($tabItem) {
    $tabSelection = $null
    if ($tabItem.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$tabSelection)) {
      $tabSelection.Select()
    } else {
      Invoke-Element $tabItem '{SPACE}'
    }
    Start-Sleep -Milliseconds 600
  }

  $source = $null
  $buttons = $dialog.FindAll($TS::Descendants,
    (New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $CT::Button)))
  foreach ($button in $buttons) {
    $name = "$($button.Current.Name)"
    if ($SourceTitle -and ($name -match [regex]::Escape($SourceTitle))) { $source = $button; break }
    if (-not $SourceTitle -and "$($button.Current.ClassName)" -eq 'DesktopMediaSourceView') {
      $source = $button; break
    }
  }
  if (-not $source) {
    [Console]::Error.WriteLine("source item not found in the picker: $SourceTitle")
    exit 1
  }
  Write-Output "source: $($source.Current.Name)"
  # Views source cards respond to a real mouse click; InvokePattern alone is
  # not guaranteed to move the selection. The window must be foreground for
  # Chromium to honor the picker interaction.
  [NativeMouse]::ForceForeground([IntPtr]$dialog.Current.NativeWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 200
  try {
    $point = $source.GetClickablePoint()
    [NativeMouse]::Click([int]$point.X, [int]$point.Y)
  } catch {
    Invoke-Element $source '{SPACE}'
  }
  Start-Sleep -Milliseconds 900

  # Clicking the source card may already start the capture and close the
  # picker (observed in Edge 155). Only press Share if the dialog is still
  # there; clicking blind would land on the page underneath.
  $stillOpen = Find-Dialog (Get-TargetPids)
  if (-not $stillOpen) {
    Write-Output 'picker closed after source selection'
    Start-Sleep -Milliseconds 300
    exit 0
  }

  $share = Find-ByName $stillOpen '(?i)^share$|^共享$' $CT::Button
  if (-not $share) { [Console]::Error.WriteLine('share button not found'); exit 1 }
  Write-Output "share button: $($share.Current.Name)"
  try {
    $sharePoint = $share.GetClickablePoint()
    [NativeMouse]::Click([int]$sharePoint.X, [int]$sharePoint.Y)
  } catch {
    Invoke-Element $share
  }
}

Start-Sleep -Milliseconds 300
Write-Output "dialog confirmed: $Action"
exit 0
