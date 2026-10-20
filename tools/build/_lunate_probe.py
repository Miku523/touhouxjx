# -*- coding: utf-8 -*-
import sys, os
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, r'C:\Users\GuSheng\Downloads\HKS\tools')
import midi2js as M
p = r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games\6 - The Embodiment of Scarlet Devil\4. Lunate Elf (ZUN).mid'
mid = M.parse_midi(p)
print('type', type(mid))
data = M.extract_channels(p) if hasattr(M,'extract_channels') else None
print('extract_channels ->', type(data))
print(str(data)[:600])
