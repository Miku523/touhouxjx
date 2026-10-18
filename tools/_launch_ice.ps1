$g = (Get-ChildItem 'E:\SteamLibrary\steamapps\common' -Directory | Where-Object { $_.Name -like '*Fairy*' } | Select-Object -First 1).FullName
$exe = (Get-ChildItem -LiteralPath $g | Where-Object { $_.Name -like '*.exe' -and $_.Name -like '*Ice*' } | Select-Object -First 1).FullName
Write-Output "EXE=$exe"
Start-Process -FilePath $exe -WorkingDirectory $g
Start-Sleep -Seconds 22
$p = Get-Process | Where-Object { $_.MainWindowTitle -like '*Ice Fairy*' -or $_.ProcessName -like '*Ice*' } | Select-Object -First 1
Write-Output ("PID=" + ($p.Id) + " TITLE=" + $p.MainWindowTitle)
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$bmp.Save('C:\Users\GuSheng\Downloads\HKS\_ice_game.png', [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "SAVED"
