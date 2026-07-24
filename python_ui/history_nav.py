#!/usr/bin/env python3
import sys, json, os, subprocess
from pathlib import Path

CONFIG_DIR = Path.home() / ".config" / "desktop-manager"
HISTORY_FILE = CONFIG_DIR / "history.json"

def history_nav(direction):
    try:
        if not os.path.exists(HISTORY_FILE): return
        with open(HISTORY_FILE, 'r') as f: data = json.load(f)
        index = data.get("index", -1)
        stack = data.get("stack", [])
        
        new_index = index
        if direction == "back" and index > 0:
            new_index = index - 1
        elif direction == "forward" and index >= 0 and index < len(stack) - 1:
            new_index = index + 1
            
        if new_index != index:
            target = stack[new_index]
            data["index"] = new_index
            data["lock"] = True
            data["target"] = target
            with open(HISTORY_FILE, 'w') as f: json.dump(data, f)
            subprocess.run(["qdbus-qt6", "org.kde.KWin", "/VirtualDesktopManager", "org.kde.KWin.VirtualDesktopManager.current", target])
        else:
            subprocess.run(["notify-send", "History", f"No more {direction}ward history"])
    except Exception as e:
        subprocess.run(["notify-send", "History Error", str(e)])

if __name__ == '__main__':
    if len(sys.argv) > 1:
        history_nav(sys.argv[1])
