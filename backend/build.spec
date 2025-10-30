# -*- mode: python ; coding: utf-8 -*-
import os

# --- CRITICAL: EDIT THIS PATH ---
# Set this to the directory of your base Python 3.10 installation.
# Use double backslashes \\
python_dir = 'C:\\Users\\nguye\\AppData\\Local\\Programs\\Python\\Python310'
# --- END OF EDITABLE SECTION ---


a = Analysis(
    ['run.py'],
    pathex=[],
    # --- THIS IS THE FIX ---
    # Manually specify the location of the core Python DLLs.
    binaries=[
        (os.path.join(python_dir, 'python310.dll'), '.'),
        (os.path.join(python_dir, 'vcruntime140.dll'), '.'),
        (os.path.join(python_dir, 'python3.dll'), '.')
    ],
    datas=[
        ('build', 'build'),
        ('schema.sql', '.'),
        ('.env', '.')
    ],
    hiddenimports=['psycopg'],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
)
pyz = PYZ(a.pure, a.zipped_data)
exe = EXE(
    pyz,
    a.scripts,
    name='QualityControlApp',
    console=True,
)
coll = COLLECT(
    exe,
    a.binaries, # Pass the binaries list to the COLLECT step
    a.zipfiles,
    a.datas,
    name='QualityControlApp',
)
