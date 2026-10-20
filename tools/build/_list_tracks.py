
import os
base=r'C:\Users\GuSheng\AppData\Local\Temp\thmidi\touhou-midi-collection-main\1 - Shooter Games'
for g in ['6 - The Embodiment of Scarlet Devil','7 - Perfect Cherry Blossom','8 - Imperishable Night','10 - Mountain of Faith']:
    p=os.path.join(base,g)
    print('\n###', g)
    for f in sorted(os.listdir(p)):
        if f.lower().endswith('.mid'): print('   ', f)
