import sys, os, tempfile
os.environ["QT_QPA_PLATFORM"] = "xcb"
import subprocess
print("Running test...")
p = subprocess.Popen(["python3", "/home/dod/projects/Desktop Manager/scripts/rename-box.py", "Test Name"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
try:
    stdout, stderr = p.communicate(timeout=2)
except subprocess.TimeoutExpired:
    p.kill()
    stdout, stderr = p.communicate()
print("STDOUT:", stdout.decode())
print("STDERR:", stderr.decode())
print("EXIT CODE:", p.returncode)
