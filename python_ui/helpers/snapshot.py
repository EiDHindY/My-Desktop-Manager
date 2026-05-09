import json
import os
import re
import subprocess
import sys
import uuid as uuid_mod
from pathlib import Path

def run_cmd(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, text=True).strip()
    except:
        return ""

def main():
    folder_name = sys.argv[1]
    
    session_file = Path(os.path.expanduser("~/.config/desktop-manager/session.json"))
    if not session_file.exists():
        print("No session file found.")
        return
        
    with open(session_file, 'r') as f:
        session = json.load(f)
        
    live_folders = session.get("live_folders", [])
    target_folder = next((f for f in live_folders if f["name"] == folder_name), None)
    
    if not target_folder:
        print(f"Folder '{folder_name}' not found in live session.")
        run_cmd(f'notify-send "Desktop Manager" "❌ Folder \'{folder_name}\' not found in session."')
        return
        
    target_uuids = target_folder.get("children", [])
    if not target_uuids:
        print("Folder is empty.")
        run_cmd(f'notify-send "Desktop Manager" "❌ Folder \'{folder_name}\' has no desktops assigned."')
        return
    
    # ─── Build UUID → KWin index mapping ───
    raw_desktops = run_cmd('qdbus-qt6 --literal org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.desktops')
    uuid_to_index = {}
    uuid_to_name = {}
    
    pattern = r'\(uss\)\s+(\d+),\s+"([^"]+)",\s+"([^"]*)"'
    for match in re.finditer(pattern, raw_desktops):
        idx = int(match.group(1))
        d_uuid = match.group(2)
        d_name = match.group(3)
        uuid_to_index[d_uuid] = idx
        uuid_to_name[d_uuid] = d_name
    
    target_indices = {}
    for u in target_uuids:
        if u in uuid_to_index:
            target_indices[uuid_to_index[u]] = u
    
    if not target_indices:
        run_cmd(f'notify-send "Desktop Manager" "❌ Could not resolve desktop UUIDs."')
        return
    
    run_cmd(f'notify-send "Desktop Manager" "📸 Snapshotting \'{folder_name}\' ({len(target_indices)} desktops)..."')
    
    out_dir = Path(os.path.expanduser(f"~/.local/bin/{folder_name.replace(' ', '_')}"))
    out_dir.mkdir(parents=True, exist_ok=True)
    
    # ─── Map windows to their desktop indices ───
    desktop_to_windows = {}
    
    wids_raw = run_cmd("kdotool search --class '.*'")
    wids = [w.strip() for w in wids_raw.split('\n') if w.strip()]
    
    for wid in wids:
        # Wrap WID in quotes to handle {uuid} format
        d_idx_str = run_cmd(f'kdotool get_desktop_for_window "{wid}"')
        if d_idx_str and d_idx_str.isdigit():
            d_idx = int(d_idx_str) - 1
            if d_idx in target_indices:
                if d_idx not in desktop_to_windows:
                    desktop_to_windows[d_idx] = []
                desktop_to_windows[d_idx].append(wid)
    
    # ─── Brotab tab scraping ───
    bt_list = run_cmd("~/.local/bin/bt list 2>/dev/null")
    bt_windows = {}
    if bt_list:
        for line in bt_list.split('\n'):
            parts = line.split('\t')
            if len(parts) >= 3:
                tab_id_full = parts[0]
                title = parts[1]
                url = parts[2]
                w_id = tab_id_full.rsplit('.', 1)[0]
                if w_id not in bt_windows:
                    bt_windows[w_id] = []
                bt_windows[w_id].append({"title": title, "url": url})
    
    # ─── Generate scripts per desktop ───
    tasks = []
    
    for i, d_uuid in enumerate(target_uuids):
        if d_uuid not in uuid_to_index:
            continue
        d_idx = uuid_to_index[d_uuid]
        d_name = uuid_to_name.get(d_uuid, f"Desktop {i+1}")
        
        script_path = out_dir / f"task_{i+1}.sh"
        cmd_lines = ["#!/bin/bash", f"# Snapshot of desktop: {d_name}", ""]
        
        has_apps = False
        seen_cmds = set()
        
        wids_on_desk = desktop_to_windows.get(d_idx, [])
        for wid in wids_on_desk:
            # Use kdotool instead of xprop for robustness with {uuid} window IDs
            pid = run_cmd(f'kdotool getwindowpid "{wid}"')
            w_name = run_cmd(f'kdotool getwindowname "{wid}"')
            
            if not pid or not pid.isdigit():
                continue
                
            cmdline = run_cmd(f"cat /proc/{pid}/cmdline | tr '\\0' ' '")
            if not cmdline:
                continue
            
            if "google-chrome" in cmdline.lower():
                matched_win_id = None
                for b_wid, tabs in bt_windows.items():
                    for t in tabs:
                        if t["title"] in w_name or w_name in t["title"]:
                            matched_win_id = b_wid
                            break
                    if matched_win_id: break
                
                chrome_cmd = "google-chrome"
                if matched_win_id:
                    urls = [f'"{t["url"]}"' for t in bt_windows[matched_win_id]]
                    chrome_cmd = f"google-chrome {' '.join(urls)}"
                
                if chrome_cmd not in seen_cmds:
                    seen_cmds.add(chrome_cmd)
                    cmd_lines.append(f"{chrome_cmd} &")
                    has_apps = True
                    
            elif "code" in cmdline.lower():
                parts = cmdline.split()
                folders = [p for p in parts if p.startswith('/') and not p.startswith('/usr') and not p.startswith('/opt')]
                code_cmd = f"code {folders[-1]}" if folders else "code"
                if code_cmd not in seen_cmds:
                    seen_cmds.add(code_cmd)
                    cmd_lines.append(f"{code_cmd} &")
                    has_apps = True
                    
            elif "dolphin" in cmdline.lower():
                parts = cmdline.split()
                folders = [p for p in parts if p.startswith('/')]
                dolphin_cmd = f"dolphin {folders[-1]}" if folders else "dolphin"
                if dolphin_cmd not in seen_cmds:
                    seen_cmds.add(dolphin_cmd)
                    cmd_lines.append(f"{dolphin_cmd} &")
                    has_apps = True
                    
            elif "konsole" in cmdline.lower() or "terminal" in cmdline.lower():
                if "konsole" not in seen_cmds:
                    seen_cmds.add("konsole")
                    cmd_lines.append("konsole &")
                    has_apps = True
            else:
                exe = cmdline.split()[0] if cmdline else ""
                if exe and not exe.startswith("/lib") and "dbus" not in exe and "kwin" not in exe and "plasmashell" not in exe and "xdg" not in exe:
                    base = os.path.basename(exe)
                    if base not in seen_cmds:
                        seen_cmds.add(base)
                        cmd_lines.append(f"{base} &")
                        has_apps = True
                
        if has_apps:
            cmd_lines.append("")
            cmd_lines.append("wait")
            with open(script_path, 'w') as f:
                f.write("\n".join(cmd_lines))
            script_path.chmod(0o755)
            
            tasks.append({
                "id": str(uuid_mod.uuid4()),
                "name": d_name if d_name != "Empty" else f"Desktop {i+1}",
                "script": f"bash '{script_path}'"
            })
            
    if tasks:
        lib_file = Path(os.path.expanduser("~/.config/desktop-manager/library.json"))
        lib_data = {"folders": {}, "folder_order": [], "expanded": []}
        if lib_file.exists():
            with open(lib_file, 'r') as f:
                lib_data = json.load(f)
                
        lib_data["folders"][folder_name] = tasks
        if folder_name not in lib_data.get("folder_order", []):
            lib_data.setdefault("folder_order", []).append(folder_name)
            
        with open(lib_file, 'w') as f:
            json.dump(lib_data, f, indent=2)
            
        run_cmd(f'notify-send "Desktop Manager" "✅ Created Template \'{folder_name}\' with {len(tasks)} tasks!"')
    else:
        run_cmd(f'notify-send "Desktop Manager" "⚠ No running apps found on the selected desktops."')

if __name__ == "__main__":
    main()
