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
         [-OnOverwrite refuse|confirm] [-RenameTo <abs path>] \
         [-ProcessName msedge] [-TimeoutSec 30]
    pwsh -NoProfile -File native-dialog.ps1 -Action share -SourceTitle <title> \
         [-ProcessName msedge] [-TimeoutSec 30]
    pwsh -NoProfile -File native-dialog.ps1 -Action open -Path <abs path> \
         [-ProcessName msedge] [-TimeoutSec 30]
    pwsh -NoProfile -File native-dialog.ps1 -Action open-cancel \
         [-ProcessName msedge] [-TimeoutSec 30]

  For -Action open the exit code is INFORMATIONAL ONLY: the app-side change
  event (a 'recording:' log line in the receiver) is the sole success
  criterion, judged by run-e2e.mjs, never by this helper's output.

  Exit: 0 the dialog was driven to completion, 1 the dialog/source was not found.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('save', 'share', 'share-cancel', 'save-cancel', 'stop-share', 'open', 'open-cancel')][string]$Action,
  [string]$Path,
  [string]$RenameTo,
  [ValidateSet('', 'refuse', 'confirm')][string]$OnOverwrite,
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

# The overwrite confirm has neither UIA buttons nor direct dialog controls
# on this host (GetDlgItem and UIA both find nothing); walk the WHOLE Win32
# child tree for a Button with the wanted control id instead.
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public class ConfirmDrive {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, StringBuilder lParam);
  // GetWindowText cannot read another process's edit control (it returns the
  // caption only, cross-process). WM_GETTEXT via SendMessage does cross the
  // process boundary for standard controls.
  public static string GetEditText(IntPtr editHwnd) {
    var lenPtr = SendMessage(editHwnd, 0x000E, IntPtr.Zero, null); // WM_GETTEXTLENGTH
    int len = (int)lenPtr;
    if (len <= 0) return string.Empty;
    var sb = new StringBuilder(len + 1);
    SendMessage(editHwnd, 0x000D, (IntPtr)(len + 1), sb); // WM_GETTEXT
    return sb.ToString();
  }
  // Round-5 lane (helper hardening): the OPEN dialog on this host exposes
  // neither win32 edit 1001 nor a UIA-named edit, so the tier-3 paste path is
  // verified best-effort: probe the focused control and every 'Edit' child
  // with the same WM_GETTEXT technique used for the save dialog. The dialog
  // CLOSING after Enter remains the hard, mandatory gate for exit 0.
  [StructLayout(LayoutKind.Sequential)]
  public struct GUITHREADINFO {
    public int cbSize; public int flags;
    public IntPtr hwndActive; public IntPtr hwndFocus; public IntPtr hwndCapture;
    public IntPtr hwndMenuOwner; public IntPtr hwndMoveSize; public IntPtr hwndCaret;
    public int rcCaretLeft; public int rcCaretTop; public int rcCaretRight; public int rcCaretBottom;
  }
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint threadId, ref GUITHREADINFO info);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  public static string GetFocusedControlText(IntPtr dialog) {
    uint pid;
    uint tid = GetWindowThreadProcessId(dialog, out pid);
    if (tid == 0) return null;
    var info = new GUITHREADINFO();
    info.cbSize = Marshal.SizeOf(typeof(GUITHREADINFO));
    if (!GetGUIThreadInfo(tid, ref info) || info.hwndFocus == IntPtr.Zero) return null;
    var cls = new StringBuilder(64);
    GetClassName(info.hwndFocus, cls, 64);
    return cls.ToString() + "|" + GetEditText(info.hwndFocus);
  }
  public static string FindEditTextContaining(IntPtr dialog, string needle) {
    string found = null;
    string file = System.IO.Path.GetFileName(needle);
    EnumChildWindows(dialog, (child, l) => {
      if (found == null) {
        var cls = new StringBuilder(64);
        GetClassName(child, cls, 64);
        if (cls.ToString() == "Edit") {
          var text = GetEditText(child);
          if (!string.IsNullOrEmpty(text) && (text == needle || text.EndsWith(file, StringComparison.OrdinalIgnoreCase))) {
            found = text;
            return false;
          }
        }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static IntPtr FindButtonById(IntPtr dialog, int id) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(dialog, (child, l) => {
      if (found == IntPtr.Zero && GetDlgCtrlID(child) == id) {
        var cls = new StringBuilder(64);
        GetClassName(child, cls, 64);
        if (cls.ToString() == "Button") { found = child; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static IntPtr FindButtonByText(IntPtr dialog, string want) {
    IntPtr found = IntPtr.Zero;
    EnumChildWindows(dialog, (child, l) => {
      if (found == IntPtr.Zero) {
        var cls = new StringBuilder(64);
        GetClassName(child, cls, 64);
        if (cls.ToString() == "Button") {
          var txt = new StringBuilder(128);
          GetWindowText(child, txt, 128);
          if (txt.ToString().IndexOf(want, StringComparison.OrdinalIgnoreCase) >= 0) {
            found = child;
            return false;
          }
        }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static string Dump(IntPtr dialog) {
    var sb = new StringBuilder();
    EnumChildWindows(dialog, (child, l) => {
      var cls = new StringBuilder(64); GetClassName(child, cls, 64);
      var txt = new StringBuilder(128); GetWindowText(child, txt, 128);
      sb.Append("class=").Append(cls).Append(" id=").Append(GetDlgCtrlID(child))
        .Append(" text='").Append(txt).Append("'; ");
      return true;
    }, IntPtr.Zero);
    return sb.ToString();
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
  if ($Action -eq 'open' -or $Action -eq 'open-cancel') {
    # The hidden <input type=file> shows the classic file-OPEN dialog. Its
    # title is 打开 / Open on this host; the same #32770+edit1001 structure
    # also matches the save template, so a structural fallback is allowed
    # only when no title match exists (only one file dialog is ever open in
    # these journeys).
    return $Name -match '(?i)打开|^open$'
  }
  # The share picker's real titles are "选择要与 <url> 共享的内容" and "Choose
  # what to share". A bare 'share' also matches unrelated window titles (a
  # browser tab on a URL containing "share" was picked as the dialog in the
  # round-16 E2E-1 ps51 run), so only the real title shapes match.
  return $Name -match '(?i)选择.*共享|choose what to share|^共享$|^share$'
}

# The open dialog is the classic Win32 file dialog. The edit-id 1001 +
# IDOK structure is VERIFIED for the save template on this host but NOT yet
# verified for the open template (the open dialog also exposes 文件名/File
# name through UIA). Title first, structure fallback; the caller additionally
# uses the UIA-name tier before falling back to focus+paste.
function Find-OpenDialogHwnd {
  $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
    $AE::ControlTypeProperty, $CT::Window)
  $tops = $AE::RootElement.FindAll($TS::Children, $windowCondition)
  foreach ($top in $tops) {
    if ("$($top.Current.Name)" -match '(?i)打开|^open$') {
      $handle = [IntPtr]$top.Current.NativeWindowHandle
      if ($handle -ne [IntPtr]::Zero) { return $handle }
    }
    $nested = $top.FindAll($TS::Descendants, $windowCondition)
    foreach ($candidate in $nested) {
      if ("$($candidate.Current.Name)" -match '(?i)打开|^open$') {
        $handle = [IntPtr]$candidate.Current.NativeWindowHandle
        if ($handle -ne [IntPtr]::Zero) { return $handle }
      }
    }
  }
  return [NativeMouse]::FindSaveDialog()
}

# The media picker is a nested views window inside the browser window, while
# the save dialog can be either nested or a top-level common dialog. Search
# the browser's whole UIA subtree, not only the root's direct children.
function Find-Dialog([string[]]$Pids) {
  $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
    $AE::ControlTypeProperty, $CT::Window)
  $tops = $AE::RootElement.FindAll($TS::Children, $windowCondition)
  # Pass 1: a dialog owned by one of the target processes. A name match here
  # is trustworthy because the pid proves the window belongs to this journey.
  if ($Pids) {
    foreach ($top in $tops) {
      if ($Pids -notcontains $top.Current.ProcessId) { continue }
      if (Test-DialogName "$($top.Current.Name)") { return $top }
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
  }
  # Pass 2: Chromium may host the media picker / FSA dialog in a utility
  # process, so the browser pid filter alone would skip it. Accept a name
  # match from any process only after no target-owned dialog exists.
  foreach ($top in $tops) {
    if (Test-DialogName "$($top.Current.Name)") { return $top }
    $nested = $top.FindAll($TS::Descendants, $windowCondition)
    foreach ($candidate in $nested) {
      if (Test-DialogName "$($candidate.Current.Name)") { return $candidate }
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

# The overwrite confirm ("确认另存为" / "Confirm Save As") is a DirectUI task
# dialog on this host: its Yes/No are Button-class children with control id 0
# behind CtrlNotifySink hosts. Find them by id first, then by text
# ("是(&Y)" / "否(&N)"), click with BM_CLICK, and fall back to the dialog's
# own Alt mnemonic (Alt+Y / Alt+N). Returns $true when the confirm closed.
function Invoke-ConfirmChoice([IntPtr]$DialogHwnd, [string]$Kind) {
  $want = if ($Kind -eq 'yes') { '是' } else { '否' }
  $alt = if ($Kind -eq 'yes') { '%y' } else { '%n' }
  $id = if ($Kind -eq 'yes') { 6 } else { 7 }
  $button = [ConfirmDrive]::FindButtonById($DialogHwnd, $id)
  if ($button -eq [IntPtr]::Zero) { $button = [ConfirmDrive]::FindButtonByText($DialogHwnd, $want) }
  if ($button -ne [IntPtr]::Zero) {
    [NativeMouse]::PostMessage($button, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
  }
  foreach ($attempt in 1..2) {
    Start-Sleep -Milliseconds 500
    if ([NativeMouse]::FindConfirmDialog() -eq [IntPtr]::Zero) { return $true }
    [NativeMouse]::ForceForeground($DialogHwnd) | Out-Null
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait($alt)
  }
  Start-Sleep -Milliseconds 500
  return ([NativeMouse]::FindConfirmDialog() -eq [IntPtr]::Zero)
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

# Edge can raise a translate bubble ("Translate page?" / CJK equivalent)
# even on flagged launches; it sits above the dialogs and hides their
# controls from the UIA tree. Close it (Close/x button, or ESC fallback).
function Dismiss-TranslateBubbles([string[]]$Pids) {
  $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
    $AE::ControlTypeProperty, $CT::Window)
  $tops = $AE::RootElement.FindAll($TS::Children, $windowCondition)
  foreach ($top in $tops) {
    if ($Pids -and ($Pids -notcontains $top.Current.ProcessId)) { continue }
    $nested = $top.FindAll($TS::Descendants, $windowCondition)
    foreach ($candidate in $nested) {
      if ("$($candidate.Current.Name)" -match 'Translate|翻译') {
        $button = Find-ByName $candidate '^Close$|^关闭$|Show original|不翻译|^Cancel$|^取消$' $CT::Button
        if ($button) {
          Invoke-Element $button
          Write-Output 'dismissed a translate bubble'
          Start-Sleep -Milliseconds 400
        } else {
          $handle = [IntPtr]$candidate.Current.NativeWindowHandle
          if ($handle -ne [IntPtr]::Zero) {
            [NativeMouse]::ForceForeground($handle) | Out-Null
            Start-Sleep -Milliseconds 200
            [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
            Write-Output 'dismissed a translate bubble via ESC'
            Start-Sleep -Milliseconds 300
          }
        }
      }
    }
  }
}

# Cancel-style actions target different windows than the main save/share
# flows; they are handled before the common dialog-wait loop.
if ($Action -in @('share-cancel', 'save-cancel', 'stop-share', 'open-cancel')) {
  Dismiss-EdgePromos (Get-TargetPids); Dismiss-TranslateBubbles (Get-TargetPids)
  $cancelDeadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $cancelDeadline) {
    if ($Action -eq 'save-cancel' -or $Action -eq 'open-cancel') {
      # The classic #32770 file dialog carries a Cancel button (ID 2).
      $hwnd = if ($Action -eq 'open-cancel') {
        Find-OpenDialogHwnd
      } else {
        [NativeMouse]::FindSaveDialog()
      }
      if ($hwnd -ne [IntPtr]::Zero) {
        $cancel = [NativeMouse]::GetDlgItem($hwnd, 2)
        if ($cancel -ne [IntPtr]::Zero) {
          [NativeMouse]::PostMessage($cancel, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
          Write-Output "$Action via Cancel id 2"
          exit 0
        }
        # Fallback 1: the dialog's own Cancel button through UIA.
        $dialogElement = $null
        try { $dialogElement = $AE::FromHandle($hwnd) } catch { }
        if ($dialogElement) {
          $cancelElement = Find-ByName $dialogElement '^取消$|^Cancel$' $CT::Button
          if ($cancelElement) {
            Invoke-Element $cancelElement
            Write-Output "$Action via UIA cancel"
            Start-Sleep -Milliseconds 300
            exit 0
          }
        }
        # Fallback 2: ESC on the foregrounded dialog.
        [NativeMouse]::ForceForeground($hwnd) | Out-Null
        Start-Sleep -Milliseconds 200
        [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
        Start-Sleep -Milliseconds 400
        $stillOpen = if ($Action -eq 'open-cancel') {
          Find-OpenDialogHwnd
        } else {
          [NativeMouse]::FindSaveDialog()
        }
        if ($stillOpen -eq [IntPtr]::Zero) {
          Write-Output "$Action via ESC"
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
  if ($Action -eq 'stop-share') {
    # Diagnostics: name every UIA element of the receiver's tree whose name
    # mentions sharing, plus the nested window names, so the real indicator
    # is visible when the selector misses it.
    $targetPids = Get-TargetPids
    $windowCondition = New-Object System.Windows.Automation.PropertyCondition(
      $AE::ControlTypeProperty, $CT::Window)
    $tops = $AE::RootElement.FindAll($TS::Children, $windowCondition)
    foreach ($top in $tops) {
      if ($targetPids -and ($targetPids -notcontains $top.Current.ProcessId)) { continue }
      [Console]::Error.WriteLine("top: '$($top.Current.Name)' class=$($top.Current.ClassName)")
      $named = $top.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      $shown = 0
      foreach ($n in $named) {
        $nm = "$($n.Current.Name)"
        if ($nm -match '共享|shar' -or "$($n.Current.ClassName)" -match ' shar') {
          [Console]::Error.WriteLine("  [$($n.Current.ControlType.ProgrammaticName)] '$nm' class=$($n.Current.ClassName)")
          $shown += 1
          if ($shown -ge 12) { break }
        }
      }
    }
  }
  exit 1
}

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$dialog = $null
# A fresh Edge profile shows a modal sync bubble that hides the dialog's
# controls; clear it before looking for the dialog. Translate bubbles can
# appear later (they hid a picker for 47 minutes in the E2E-18 lane), so the
# wait loop re-dismisses both every ~2 s.
Dismiss-EdgePromos (Get-TargetPids); Dismiss-TranslateBubbles (Get-TargetPids)
$dismissTick = 0
while ((Get-Date) -lt $deadline) {
  $dialog = Find-Dialog (Get-TargetPids)
  if ($dialog) { break }
  $dismissTick += 1
  if (($dismissTick % 8) -eq 0) {
    Dismiss-EdgePromos (Get-TargetPids); Dismiss-TranslateBubbles (Get-TargetPids)
  }
  Start-Sleep -Milliseconds 250
}
if (-not $dialog) {
  [Console]::Error.WriteLine("dialog not found for action '$Action' within $TimeoutSec s")
  # Diagnostics: name every top-level window so the next failed picker is
  # diagnosable from the log alone (translate bubbles, foreground state).
  $targetPids = Get-TargetPids
  $windowCondition2 = New-Object System.Windows.Automation.PropertyCondition(
    $AE::ControlTypeProperty, $CT::Window)
  $tops2 = $AE::RootElement.FindAll($TS::Children, $windowCondition2)
  foreach ($t2 in $tops2) {
    $mark = if ($targetPids -and ($targetPids -contains $t2.Current.ProcessId)) { 'TARGET' } else { '      ' }
    [Console]::Error.WriteLine("  window $mark pid=$($t2.Current.ProcessId) class=$($t2.Current.ClassName) name='$($t2.Current.Name)'")
  }
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
  Dismiss-EdgePromos (Get-TargetPids); Dismiss-TranslateBubbles (Get-TargetPids)
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

  Start-Sleep -Milliseconds 800
  $confirm = [NativeMouse]::FindConfirmDialog()
  if ($confirm -ne [IntPtr]::Zero) {
  # An overwrite confirmation only appears for an existing target. It must
  # never be clicked through: -OnOverwrite decides what a refusal means here.
  # refuse: keep the sentinel untouched and complete the save under -RenameTo
  #         (the app settles like any real save, never stuck in Saving…);
  # confirm: overwrite explicitly, like a user's deliberate Yes;
  # unset: the old safe default - refuse and back out of the dialog entirely.
    if ($OnOverwrite -eq 'refuse' -and $RenameTo) {
      # Refuse the overwrite, then finish under the rename: the sentinel
      # Refuse, then rename: sentinel untouched, picker promise settles.
      if (-not (Invoke-ConfirmChoice $confirm 'no')) {
        [Console]::Error.WriteLine("the refusal did not close the confirm; raw children: $([ConfirmDrive]::Dump($confirm))")
        exit 1
      }
      Write-Output 'overwrite refused'
      # The returned save dialog may not have keyboard focus back: click once
      # inside the file-name edit, paste, and VERIFY the edit text really
      # changed before pressing Enter — an unverified Enter re-submits the
      # refused name and re-opens the confirmation.
      [NativeMouse]::ForceForeground($hwnd) | Out-Null
      Start-Sleep -Milliseconds 1500
      $rect = New-Object 'NativeMouse+RECT'
      [NativeMouse]::GetWindowRect($edit, [ref]$rect) | Out-Null
      [NativeMouse]::Click([int](($rect.Left + $rect.Right) / 2), [int](($rect.Top + $rect.Bottom) / 2))
      Start-Sleep -Milliseconds 300
      $editText = ''
      $pasted = $false
      foreach ($pasteTry in 1..2) {
        Set-Clipboard -Value $RenameTo
        Start-Sleep -Milliseconds 200
        [System.Windows.Forms.SendKeys]::SendWait('^a')
        Start-Sleep -Milliseconds 150
        [System.Windows.Forms.SendKeys]::SendWait('^v')
        Start-Sleep -Milliseconds 500
        $sb = New-Object System.Text.StringBuilder(512)
        $editText = [ConfirmDrive]::GetEditText($edit)
        Write-Output "rename paste: edit text now '$editText'"
        if ($editText -eq $RenameTo) { $pasted = $true; break }
        Write-Output "rename paste try $pasteTry did not take; retrying"
        if ($pasteTry -lt 2) {
          try {
            [System.Windows.Automation.AutomationElement]::FromHandle($edit).SetFocus()
          } catch { }
        }
      }
      if (-not $pasted) {
        [Console]::Error.WriteLine("the rename paste did not take (edit text: '$editText')")
        exit 1
      }
      [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
      $renameDone = $false
      foreach ($renameTry in 1..2) {
        $fileDeadline = (Get-Date).AddSeconds(4)
        while ((Get-Date) -lt $fileDeadline -and -not (Test-Path -LiteralPath $RenameTo)) {
          Start-Sleep -Milliseconds 250
        }
        if (Test-Path -LiteralPath $RenameTo) { $renameDone = $true; break }
        $confirm2 = [NativeMouse]::FindConfirmDialog()
        if ($confirm2 -ne [IntPtr]::Zero) {
          # The paste did not take before this Enter: the refused name was
          # re-submitted. Refuse again and retry the rename once.
          Write-Output 'confirm reappeared after the rename Enter; refusing again'
          $null = Invoke-ConfirmChoice $confirm2 'no'
          continue
        }
        if ([NativeMouse]::FindSaveDialog() -ne [IntPtr]::Zero) {
          [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
          $fileDeadline2 = (Get-Date).AddSeconds(4)
          while ((Get-Date) -lt $fileDeadline2 -and -not (Test-Path -LiteralPath $RenameTo)) {
            Start-Sleep -Milliseconds 250
          }
        }
        if (Test-Path -LiteralPath $RenameTo) { $renameDone = $true; break }
        break
      }
      if ($renameDone) {
        Grant-FilePermission (Get-TargetPids)
        Write-Output "saved: $RenameTo"
        exit 0
      }
      [Console]::Error.WriteLine("the renamed save did not produce the file: $RenameTo (edit text: '$editText')")
      exit 1
    }
    if ($OnOverwrite -eq 'confirm') {
      # Confirm: an explicit, deliberate overwrite.
      if (-not (Invoke-ConfirmChoice $confirm 'yes')) {
        [Console]::Error.WriteLine("the confirm click did not close the confirm; raw children: $([ConfirmDrive]::Dump($confirm))")
        exit 1
      }
      $verifyDeadline = (Get-Date).AddSeconds(15)
      while ((Get-Date) -lt $verifyDeadline -and -not (Test-Path -LiteralPath $Path)) {
        Start-Sleep -Milliseconds 250
      }
      if (Test-Path -LiteralPath $Path) {
        Grant-FilePermission (Get-TargetPids)
        Write-Output 'overwrite confirmed'
        Write-Output "saved: $Path"
        exit 0
      }
      [Console]::Error.WriteLine("the confirmed overwrite did not produce the file: $Path")
      exit 1
    }
    # Default (no -OnOverwrite): our target path is always fresh; if an
    # overwrite prompt still appears the dialog was not filled correctly.
    # Refuse it rather than overwrite silently, then back out of the dialog
    # so the app's picker promise can settle (state back to Retryable).
    # Refuse (best effort); the back-out cleanup below follows regardless.
    $null = Invoke-ConfirmChoice $confirm 'no'
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
      # The modal must be gone first, or the BM_CLICK lands on the wrong
      # window and the save dialog never closes (the stuck-Saving cause).
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
} elseif ($Action -eq 'open') {
  if (-not $Path) { [Console]::Error.WriteLine('-Path is required for open'); exit 1 }

  # The hidden <input type=file> opens the classic file dialog. Its control
  # template looks like the save dialog's, but edit id 1001 for the OPEN
  # template is NOT verified on this host. Three tiers, each best-effort:
  #   1. Win32 edit id 1001 (verified only for the save template)
  #   2. UIA Edit named 文件名 / File name
  #   3. focus the dialog and paste
  # Success is NEVER judged here: the app-side change event (a 'recording:'
  # delta in the receiver log) is the sole criterion, checked by run-e2e.mjs.
  $openDeadline = (Get-Date).AddSeconds($TimeoutSec)
  $hwnd = [IntPtr]::Zero
  while ((Get-Date) -lt $openDeadline -and $hwnd -eq [IntPtr]::Zero) {
    $hwnd = Find-OpenDialogHwnd
    if ($hwnd -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 300 }
  }
  if ($hwnd -eq [IntPtr]::Zero) {
    [Console]::Error.WriteLine('open dialog not found')
    exit 1
  }
  Dismiss-EdgePromos (Get-TargetPids); Dismiss-TranslateBubbles (Get-TargetPids)
  [NativeMouse]::ForceForeground($hwnd) | Out-Null
  Start-Sleep -Milliseconds 400

  $filled = $false
  $edit = [NativeMouse]::FindEdit1001($hwnd)
  if ($edit -ne [IntPtr]::Zero) {
    Set-Clipboard -Value $Path
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 400
    $editText = [ConfirmDrive]::GetEditText($edit)
    Write-Output "open tier 1 (win32 edit 1001): text now '$editText'"
    if ($editText -eq $Path) { $filled = $true }
  } else {
    Write-Output 'open tier 1: no win32 edit 1001 in this dialog'
  }

  if (-not $filled) {
    $dialogElement = $null
    try { $dialogElement = $AE::FromHandle($hwnd) } catch { }
    if ($dialogElement) {
      $nameEdit = Find-ByName $dialogElement '文件名|File name' $CT::Edit
      if ($nameEdit) {
        try {
          $nameEdit.SetFocus()
          Start-Sleep -Milliseconds 200
          Set-Clipboard -Value $Path
          Start-Sleep -Milliseconds 200
          [System.Windows.Forms.SendKeys]::SendWait('^a')
          Start-Sleep -Milliseconds 150
          [System.Windows.Forms.SendKeys]::SendWait('^v')
          Start-Sleep -Milliseconds 400
          $uiaHandle = [IntPtr]$nameEdit.Current.NativeWindowHandle
          if ($uiaHandle -ne [IntPtr]::Zero) {
            $editText = [ConfirmDrive]::GetEditText($uiaHandle)
            Write-Output "open tier 2 (UIA name edit): text now '$editText'"
            if ($editText -eq $Path) { $filled = $true }
          } else {
            Write-Output 'open tier 2: UIA edit has no native handle; paste unverified'
            $filled = $true
          }
        } catch {
          Write-Output "open tier 2 failed: $($_.Exception.Message)"
        }
      } else {
        Write-Output 'open tier 2: no UIA edit named 文件名/File name'
      }
    }
  }

  if (-not $filled) {
    [NativeMouse]::ForceForeground($hwnd) | Out-Null
    Start-Sleep -Milliseconds 200
    Set-Clipboard -Value $Path
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 400
    # Best-effort text probe (round-5 helper hardening): the open dialog has
    # no verified edit handle, so probe the focused control and any Edit child
    # with WM_GETTEXT. This is diagnostics only - dialog closure is the hard
    # gate and the app-side change event remains the runner's criterion.
    $probe = [ConfirmDrive]::FindEditTextContaining($hwnd, $Path)
    if (-not $probe) {
      $focused = [ConfirmDrive]::GetFocusedControlText($hwnd)
      if ($focused -and $focused.EndsWith([System.IO.Path]::GetFileName($Path))) { $probe = $focused }
      elseif ($focused) { Write-Output "open tier 3: focused control '$focused'" }
    }
    if ($probe) {
      Write-Output "open tier 3: text probe verified '$probe'"
    } else {
      Write-Output 'open tier 3: focus+paste (no text probe hit; closure is the hard gate)'
    }
  }

  # Exit 0 requires CLOSURE EVIDENCE: the dialog must disappear after Enter.
  # If it stays open, retry the tier-3 path once (re-focus, Ctrl+A, paste,
  # pause, Enter, poll again); if it is still open, exit 1 with diagnostics.
  $closed = $false
  for ($attempt = 1; $attempt -le 2 -and -not $closed; $attempt += 1) {
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    $closeDeadline = (Get-Date).AddSeconds(3)
    while ((Get-Date) -lt $closeDeadline) {
      if ((Find-OpenDialogHwnd) -eq [IntPtr]::Zero) { $closed = $true; break }
      Start-Sleep -Milliseconds 200
    }
    if (-not $closed -and $attempt -eq 1) {
      Write-Output 'open: dialog still open after Enter; retrying the tier-3 path once'
      [NativeMouse]::ForceForeground($hwnd) | Out-Null
      Start-Sleep -Milliseconds 300
      Set-Clipboard -Value $Path
      Start-Sleep -Milliseconds 200
      [System.Windows.Forms.SendKeys]::SendWait('^a')
      Start-Sleep -Milliseconds 150
      [System.Windows.Forms.SendKeys]::SendWait('^v')
      Start-Sleep -Milliseconds 400
      $retryProbe = [ConfirmDrive]::FindEditTextContaining($hwnd, $Path)
      if ($retryProbe) { Write-Output "open retry: text probe verified '$retryProbe'" }
      else { Write-Output 'open retry: no text probe hit' }
    }
  }
  if (-not $closed) {
    [Console]::Error.WriteLine('the open dialog did not close after Enter (tier-3 retry included)')
    exit 1
  }
  Write-Output 'open dialog closed after Enter (closure observed; the app-side change event decides)'
  exit 0
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
