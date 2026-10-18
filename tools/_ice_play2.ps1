Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCap3 {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process -Id 39264 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { Write-Output 'NO_PROC'; exit }
$h = $p.MainWindowHandle
[WinCap3]::ShowWindow($h, 3) | Out-Null
[WinCap3]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 800
$r = New-Object WinCap3+RECT
[WinCap3]::GetWindowRect($h, [ref]$r) | Out-Null
function ClickAt($x, $y) {
  [WinCap3]::SetCursorPos($r.Left + $x, $r.Top + $y) | Out-Null
  Start-Sleep -Milliseconds 200
  [WinCap3]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  [WinCap3]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 400
}
function Grab($path) {
  $rr = New-Object WinCap3+RECT
  [WinCap3]::GetWindowRect($h, [ref]$rr) | Out-Null
  $w = $rr.Right - $rr.Left; $ht = $rr.Bottom - $rr.Top
  $bmp = New-Object System.Drawing.Bitmap $w, $ht
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $gfx.GetHdc()
  [WinCap3]::PrintWindow($h, $hdc, 2) | Out-Null
  $gfx.ReleaseHdc($hdc); $gfx.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
ClickAt 65 131
Start-Sleep -Seconds 1
ClickAt 854 533
Start-Sleep -Seconds 5
Grab('C:\Users\GuSheng\Downloads\HKS\_ice_s3.png')
ClickAt 854 533
Start-Sleep -Seconds 6
Grab('C:\Users\GuSheng\Downloads\HKS\_ice_s4.png')
Write-Output ('RECT=' + $r.Left + ',' + $r.Top + ' ' + ($r.Right-$r.Left) + 'x' + ($r.Bottom-$r.Top))
