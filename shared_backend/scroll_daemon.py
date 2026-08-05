#!/usr/bin/env python3
import evdev
import asyncio
import sys
import json
import logging

logging.basicConfig(level=logging.ERROR)

ALT_KEYS = {evdev.ecodes.KEY_LEFTALT, evdev.ecodes.KEY_RIGHTALT}

state = {
    "alt_held": False,
    "active_alt_scrolling": False
}

def emit(event_type, **kwargs):
    msg = {"type": event_type}
    msg.update(kwargs)
    print(json.dumps(msg), flush=True)

async def monitor_device(device):
    try:
        async for event in device.async_read_loop():
            if event.type == evdev.ecodes.EV_KEY:
                # sys.stderr.write(f"KEY: {event.code} VAL: {event.value}\n")
                if event.code in ALT_KEYS:
                    sys.stderr.write(f"ALT detected: {event.value}\n")
                    sys.stderr.flush()
                    if event.value == 1 or event.value == 2: # Key down or hold
                        state["alt_held"] = True
                    elif event.value == 0: # Key up
                        state["alt_held"] = False
                        if state["active_alt_scrolling"]:
                            emit("confirm")
                            state["active_alt_scrolling"] = False
                            
            elif event.type == evdev.ecodes.EV_REL:
                # sys.stderr.write(f"REL: {event.code} VAL: {event.value}\n")
                if event.code in [evdev.ecodes.REL_WHEEL, evdev.ecodes.REL_WHEEL_HI_RES]:
                    sys.stderr.write(f"SCROLL detected: {event.value} (Alt: {state['alt_held']})\n")
                    sys.stderr.flush()
                    if state["alt_held"]:
                        # Normal scroll direction is positive for up, negative for down.
                        # Mice often report negative for scroll down. Let's normalize it.
                        direction = 1 if event.value > 0 else -1
                        state["active_alt_scrolling"] = True
                        emit("scroll", direction=direction)
    except Exception as e:
        # Device might have disconnected
        pass

async def main():
    devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
    tasks = []
    
    # We want to monitor all keyboards and mice
    for device in devices:
        # Check if device has EV_KEY or EV_REL capabilities
        cap = device.capabilities()
        if evdev.ecodes.EV_KEY in cap or evdev.ecodes.EV_REL in cap:
            tasks.append(asyncio.create_task(monitor_device(device)))

    if not tasks:
        sys.exit(1)
        
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
