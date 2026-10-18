Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCap {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int nCmdShow);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process -Id 39264 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { Write-Output 'NO_WINDOW'; exit }
$h = $p.MainWindowHandle
[WinCap]::ShowWindow($h, 3) | Out-Null
[WinCap]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 900
$r = New-Object WinCap+RECT
[WinCap]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
Write-Output ("SIZE=" + $w + "x" + $ht)
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $gfx.GetHdc()
[WinCap]::PrintWindow($h, $hdc, 2) | Out-Null
$gfx.ReleaseHdc($hdc)
$gfx.Dispose()
$bmp.Save('C:\Users\GuSheng\Downloads\HKS\_ice_menu.png', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output 'OK'
