import sys
import json
import dbus
from gi.repository import GLib
import dbus.mainloop.glib

def emit_event(event_type, desktop_id=None, extra=None):
    payload = {"event": event_type}
    if desktop_id is not None:
        payload["id"] = str(desktop_id)
    if extra is not None:
        payload["extra"] = extra
    print(json.dumps(payload), flush=True)

def on_current_changed(desktop_id):
    emit_event("currentChanged", desktop_id)

def on_desktop_created(desktop_id, data):
    emit_event("desktopCreated", desktop_id)

def on_desktop_removed(desktop_id):
    emit_event("desktopRemoved", desktop_id)

def on_data_changed(desktop_id, data):
    emit_event("desktopDataChanged", desktop_id)

def main():
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    
    try:
        bus = dbus.SessionBus()
        bus.add_signal_receiver(on_current_changed, dbus_interface="org.kde.KWin.VirtualDesktopManager", signal_name="currentChanged")
        bus.add_signal_receiver(on_desktop_created, dbus_interface="org.kde.KWin.VirtualDesktopManager", signal_name="desktopCreated")
        bus.add_signal_receiver(on_desktop_removed, dbus_interface="org.kde.KWin.VirtualDesktopManager", signal_name="desktopRemoved")
        bus.add_signal_receiver(on_data_changed, dbus_interface="org.kde.KWin.VirtualDesktopManager", signal_name="desktopDataChanged")
        
        emit_event("ready")
        
        loop = GLib.MainLoop()
        loop.run()
    except Exception as e:
        emit_event("error", extra=str(e))
        sys.exit(1)

if __name__ == '__main__':
    main()
