#!/usr/bin/env python3
import subprocess
import json
import os
import signal
import sys
import time
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "desktop-manager"
HISTORY_FILE = CONFIG_DIR / "history.json"
PID_FILE = Path("/tmp/desktop-tracker.pid")
LOG_FILE = Path("/tmp/desktop-tracker.log")

def log(msg):
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{time.ctime()}] {msg}\n")

def load_history():
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {"stack": [], "index": -1, "lock": False, "target": "", "last_uuid": ""}

def save_history(data):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(HISTORY_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def get_current_desktop():
    try:
        res = subprocess.run(["qdbus-qt6", "org.kde.KWin", "/VirtualDesktopManager", "org.kde.KWin.VirtualDesktopManager.current"], 
                             capture_output=True, text=True)
        return res.stdout.strip()
    except:
        return ""

def handle_switch(new_uuid):
    data = load_history()
    stack = data.get("stack", [])
    index = data.get("index", -1)
    
    # Track which desktop we are moving FROM (for Alt+Tab toggle)
    if index >= 0:
        old_uuid = stack[index]
        if old_uuid != new_uuid:
            data["last_uuid"] = old_uuid

    # If we are in 'lock' mode, it means this switch was triggered by our own Back/Forward command
    if data.get("lock") and data.get("target") == new_uuid:
        data["lock"] = False
        data["target"] = ""
        # We still updated last_uuid above, so just save and exit
        save_history(data)
        return

    # Manual switch or first switch
    # If the new desktop is the same as where we already are (pointer-wise), ignore
    if index >= 0 and stack[index] == new_uuid:
        return

    # Clear 'Forward' history (everything after current index)
    new_stack = stack[:index + 1]
    new_stack.append(new_uuid)
    
    # Keep history size reasonable (last 100)
    if len(new_stack) > 100:
        new_stack = new_stack[-100:]
        
    data["stack"] = new_stack
    data["index"] = len(new_stack) - 1
    data["lock"] = False
    data["target"] = ""
    save_history(data)

def monitor():
    # 1. Kill duplicate processes
    if PID_FILE.exists():
        try:
            old_pid = int(PID_FILE.read_text().strip())
            os.kill(old_pid, signal.SIGTERM)
            log(f"Killed old tracker (PID {old_pid})")
        except:
            pass
    PID_FILE.write_text(str(os.getpid()))

    log("Tracker started")
    
    # Initialize history with current desktop
    initial_uuid = get_current_desktop()
    if initial_uuid:
        log(f"Initial desktop: {initial_uuid}")
        handle_switch(initial_uuid)

    cmd = ["dbus-monitor", "--session", "type='signal',interface='org.kde.KWin.VirtualDesktopManager',member='currentChanged'"]
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)

    try:
        while True:
            line = process.stdout.readline()
            if not line:
                break
            if "member=currentChanged" in line:
                log(f"Signal detected: {line.strip()}")
                next_line = process.stdout.readline()
                if "string" in next_line:
                    try:
                        new_uuid = next_line.split('"')[1]
                        log(f"Switching to: {new_uuid}")
                        handle_switch(new_uuid)
                    except IndexError:
                        pass
    except KeyboardInterrupt:
        process.terminate()

if __name__ == "__main__":
    monitor()
