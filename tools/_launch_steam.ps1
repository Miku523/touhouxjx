Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$steam = 'C:\Program Files (x86)\Steam\steam.exe'
Start-Process -FilePath $steam -ArgumentList '-applaunch','1955830'
Start-Sleep -Seconds 55
$procs = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object Id, ProcessName, MainWindowTitle
$procs | Format-Table -AutoSize | Out-String | Write-Output
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
function Grab($path) {
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $gfx.Dispose(); $bmp.Dispose()
}
Grab('C:\Users\GuSheng\Downloads\HKS\_ice_game1.png')
Start-Sleep -Seconds 12
Grab('C:\Users\GuSheng\Downloads\HKS\_ice_game2.png')
Write-Output 'SAVED'
