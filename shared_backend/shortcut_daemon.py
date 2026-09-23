#!/usr/bin/env python3
import evdev
import asyncio
import sys
import json
import logging
import time

# Set up logging to /tmp/shortcut_daemon.log
logging.basicConfig(filename='/tmp/shortcut_daemon.log', level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

logging.info("Shortcut daemon started")
import os
import subprocess
import logging

logging.basicConfig(level=logging.ERROR)

CONFIG_PATH = os.path.expanduser('~/.config/desktop-manager/labels.json')

# Map electron shortcut string parts to evdev keycodes
MODIFIERS = {
    'ctrl': {evdev.ecodes.KEY_LEFTCTRL, evdev.ecodes.KEY_RIGHTCTRL},
    'control': {evdev.ecodes.KEY_LEFTCTRL, evdev.ecodes.KEY_RIGHTCTRL},
    'commandorcontrol': {evdev.ecodes.KEY_LEFTCTRL, evdev.ecodes.KEY_RIGHTCTRL},
    'cmdorctrl': {evdev.ecodes.KEY_LEFTCTRL, evdev.ecodes.KEY_RIGHTCTRL},
    'alt': {evdev.ecodes.KEY_LEFTALT, evdev.ecodes.KEY_RIGHTALT},
    'option': {evdev.ecodes.KEY_LEFTALT, evdev.ecodes.KEY_RIGHTALT},
    'shift': {evdev.ecodes.KEY_LEFTSHIFT, evdev.ecodes.KEY_RIGHTSHIFT},
    'meta': {evdev.ecodes.KEY_LEFTMETA, evdev.ecodes.KEY_RIGHTMETA},
    'super': {evdev.ecodes.KEY_LEFTMETA, evdev.ecodes.KEY_RIGHTMETA},
    'cmd': {evdev.ecodes.KEY_LEFTMETA, evdev.ecodes.KEY_RIGHTMETA},
    'command': {evdev.ecodes.KEY_LEFTMETA, evdev.ecodes.KEY_RIGHTMETA},
}

def parse_electron_shortcut(shortcut_str):
    parts = shortcut_str.lower().split('+')
    parsed_mods = []
    parsed_key = None
    
    for p in parts:
        p = p.strip()
        if p in MODIFIERS:
            parsed_mods.append(MODIFIERS[p])
        else:
            # Map standard keys
            key_name = p.upper()
            if hasattr(evdev.ecodes, f'KEY_{key_name}'):
                parsed_key = getattr(evdev.ecodes, f'KEY_{key_name}')
            elif hasattr(evdev.ecodes, f'KEY_{key_name.upper()}'):
                parsed_key = getattr(evdev.ecodes, f'KEY_{key_name.upper()}')
    
    if parsed_key is not None:
        return {'modifiers': parsed_mods, 'key': parsed_key}
    return None

class ShortcutManager:
    def __init__(self):
        self.shortcuts = {} # uuid -> parsed_shortcut
        self.last_mtime = 0
        self.pressed_keys = set()
        
    def reload_config(self):
        try:
            mtime = os.path.getmtime(CONFIG_PATH)
            if mtime > self.last_mtime:
                with open(CONFIG_PATH, 'r') as f:
                    data = json.load(f)
                
                new_shortcuts = {}
                for uuid, info in data.items():
                    if 'shortcut' in info and info['shortcut']:
                        parsed = parse_electron_shortcut(info['shortcut'])
                        if parsed:
                            new_shortcuts[uuid] = parsed
                
                self.shortcuts = new_shortcuts
                self.last_mtime = mtime
                # sys.stderr.write(f"Reloaded shortcuts: {self.shortcuts}\n")
        except Exception as e:
            pass

    def check_shortcuts(self):
        logging.debug(f"check_shortcuts called. Shortcuts: {self.shortcuts}, pressed: {self.pressed_keys}")
        logging.debug(f"check_shortcuts called. Shortcuts: {self.shortcuts}, pressed: {self.pressed_keys}")
        for uuid, shortcut in self.shortcuts.items():
            # Check if key is pressed
            if shortcut['key'] not in self.pressed_keys:
                continue
            # Check if all modifiers are pressed
            mods_match = True
            for mod_set in shortcut['modifiers']:
                if not any(k in self.pressed_keys for k in mod_set):
                    mods_match = False
                    break
                    
            if mods_match:
                # To prevent rapid re-triggering, we can rely on the fact that 
                # the user will likely release the key. Or we can just trigger it.
                # sys.stderr.write(f"Triggering shortcut for {uuid}\n")
                import threading
                def run_dbus(target_uuid):
                    try:
                        import subprocess
                        subprocess.run(['qdbus-qt6', 'org.kde.KWin', '/VirtualDesktopManager', 'org.kde.KWin.VirtualDesktopManager.current', target_uuid], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    except Exception:
                        pass
                threading.Thread(target=run_dbus, args=(uuid,), daemon=True).start()
                # We can remove the key from pressed_keys so it doesn't spam
                self.pressed_keys.remove(shortcut['key'])

manager = ShortcutManager()

async def monitor_device(device):
    try:
        async for event in device.async_read_loop():
            if event.type == evdev.ecodes.EV_KEY:
                if event.value == 1: # Key down
                    manager.pressed_keys.add(event.code)
                    logging.debug(f"Key down: {event.code}, pressed_keys: {manager.pressed_keys}")
                    manager.check_shortcuts()
                elif event.value == 0: # Key up
                    if event.code in manager.pressed_keys:
                        manager.pressed_keys.remove(event.code)
                        logging.debug(f"Key up: {event.code}, pressed_keys: {manager.pressed_keys}")
    except Exception as e:
        logging.error(f"Error in monitor_device for {device.name}: {e}")
        sys.stderr.write(f"Error in monitor_device for {device.name}: {e}\n")
        sys.stderr.flush()

async def watch_devices():
    known_devices = set(evdev.list_devices())
    while True:
        await asyncio.sleep(2)
        current_devices = set(evdev.list_devices())
        if current_devices != known_devices:
            logging.info("Devices changed, exiting to restart...")
            sys.exit(1)

async def watch_config():
    while True:
        manager.reload_config()
        await asyncio.sleep(1)

async def main():
    devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
    tasks = []
    
    # We want to monitor all keyboards
    for device in devices:
        cap = device.capabilities()
        if evdev.ecodes.EV_KEY in cap:
            tasks.append(asyncio.create_task(monitor_device(device)))

    if not tasks:
        sys.exit(1)
        
    tasks.append(asyncio.create_task(watch_devices()))
    tasks.append(asyncio.create_task(watch_config()))
        
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    try:
        manager.reload_config()
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
