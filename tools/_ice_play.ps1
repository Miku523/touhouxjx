Add-Type -AssemblyName System.Drawing, System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCap2 {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int nCmdShow);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process -Id 39264 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { Write-Output 'NO_PROC'; exit }
$h = $p.MainWindowHandle
[WinCap2]::ShowWindow($h, 3) | Out-Null
[WinCap2]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 700
function Grab($path) {
  $r = New-Object WinCap2+RECT
  [WinCap2]::GetWindowRect($h, [ref]$r) | Out-Null
  $w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
  $bmp = New-Object System.Drawing.Bitmap $w, $ht
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $gfx.GetHdc()
  [WinCap2]::PrintWindow($h, $hdc, 2) | Out-Null
  $gfx.ReleaseHdc($hdc); $gfx.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Start-Sleep -Seconds 4
Grab('C:\Users\GuSheng\Downloads\HKS\_ice_s1.png')
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Start-Sleep -Seconds 7
Grab('C:\Users\GuSheng\Downloads\HKS\_ice_s2.png')
Write-Output 'OK'
