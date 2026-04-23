#!/usr/bin/env python3
import sys
import os
os.environ["QT_QPA_PLATFORM"] = "xcb"
import subprocess
import threading
import json
import uuid
import time
from pathlib import Path
from PyQt5.QtWidgets import (QApplication, QWidget, QVBoxLayout, QGraphicsDropShadowEffect, 
                             QInputDialog, QTreeWidgetItem, QMenu)
from PyQt5.QtGui import QColor
from PyQt5.QtCore import Qt, QPropertyAnimation, QEasingCurve, QTimer, QPoint, QEvent, QFileSystemWatcher

# Helpers
from helpers.window_fetcher import WindowFetcher
from helpers.ui_components import OutlineDelegate, FolderTreeWidget
from helpers.ui_styles import (MAIN_CONTAINER_STYLE, STATUS_LABEL_STYLE)
from helpers.data_manager import DataManager
from helpers.ui_logic import filter_tree
from helpers.ui_menus import show_live_context_menu, show_lib_context_menu
from helpers.folder_ops import (create_folder, import_folder, rename_lib_item, 
                                link_script, delete_lib_item, add_app_desktop, deploy_selected)
from helpers.navigation_logic import move_up, move_down, get_selected_uid
from helpers.tree_manager import (apply_live_styling, add_live_desktop_item, 
                                 populate_library_tree, populate_live_tree, update_live_priorities)
from helpers.event_handler import handle_event
from helpers.ui_factory import build_main_ui, force_window_focus, force_window_position

CONFIG_DIR = Path.home() / ".config" / "desktop-manager"
HISTORY_FILE = CONFIG_DIR / "history.json"

class SwitcherMenu(QWidget):
    def __init__(self, title_win, title_label, current_desktop_uuid, id_name_pairs):
        super().__init__()
        self.setWindowTitle(title_win)
        self.id_name_pairs = id_name_pairs
        self.current_desktop_uuid = current_desktop_uuid
        self.data_manager = DataManager(CONFIG_DIR)
        self.pinned_folders = self.data_manager.load_session().get("pinned", [])
        self._is_populating = False
        self.desktop_notes = {}
        self.active_kwin_indices = []
        self.managed_uids = set()
        
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        
        self._is_dragging = False
        
        self.screen_geom = QApplication.primaryScreen().geometry()
        state = self.data_manager.load_ui_state()
        self.hud_width = state.get("width", 400)
        self.height_current = state.get("height", 420)
        self.hud_x = state.get("x", self.screen_geom.width() - self.hud_width + 20)
        self.hud_y = state.get("y", 0)
        self.setWindowOpacity(state.get("opacity", 0.95))
        
        self.setMinimumSize(320, 300)
        self.resize(self.hud_width, self.height_current)
        
        # Animate from off-screen to saved position
        x_start = self.screen_geom.width() + 10 
        self.move(x_start, self.hud_y)
        
        self.anim = QPropertyAnimation(self, b"pos")
        self.anim.setDuration(250)
        self.anim.setStartValue(QPoint(x_start, self.hud_y))
        self.anim.setEndValue(QPoint(self.hud_x, self.hud_y))
        self.anim.setEasingCurve(QEasingCurve.OutCubic)
        self.anim.start()
        
        build_main_ui(self)
        self.sync_btn.clicked.connect(self.refresh_library)
        self.cleanup_btn.clicked.connect(self.cleanup_empty)
        
        self.watcher = QFileSystemWatcher(self)
        templates_path = str(CONFIG_DIR / "templates")
        if os.path.exists(templates_path):
            self.watcher.addPath(templates_path)
        self.watcher.directoryChanged.connect(lambda: QTimer.singleShot(500, self.refresh_library))
        
        self.lib_data = self.data_manager.load_library()
        self.populate_live(initial=True)
        self.populate_library()
        
        self.tabs.currentChanged.connect(self.on_tab_changed)
        
        self.fetcher = WindowFetcher()
        self.fetcher.finished.connect(self.apply_active_windows)
        threading.Thread(target=self.fetcher.fetch_windows_bg, daemon=True).start()
        
        self.installEventFilter(self)
        self.search_entry.installEventFilter(self)
        self.live_list.viewport().installEventFilter(self)
        
        self.force_focus_title = title_win
        QTimer.singleShot(50, lambda: force_window_focus(self.force_focus_title))
        QTimer.singleShot(500, lambda: force_window_position(self.force_focus_title, self.x(), self.y(), self.width(), self.height()))
        self.search_entry.setFocus()

        # Heartbeat to update icons when desktop changes
        self.heartbeat = QTimer(self)
        self.heartbeat.timeout.connect(self.check_current_desktop)
        self.heartbeat.start(1000) # Reverted to 1s now that KWin Rules handle stickiness

    def check_current_desktop(self):
        if self._is_dragging: return # Don't snap while user is moving it
        try:
            res = subprocess.run(["qdbus-qt6", "org.kde.KWin", "/VirtualDesktopManager", "org.kde.KWin.VirtualDesktopManager.current"], 
                                 capture_output=True, text=True)
            new_uuid = res.stdout.strip()
            if new_uuid and new_uuid != self.current_desktop_uuid:
                self.current_desktop_uuid = new_uuid
                self.populate_live(initial=False)
                # Force the window to follow to the new desktop at its CURRENT position
                force_window_position(self.force_focus_title, self.x(), self.y(), self.width(), self.height())
        except: pass

    def switch_desktop(self, uid):
        raw_uuid = uid.split("___")[0]
        try:
            # Special case for Chrome launcher
            if raw_uuid == "ACTION_CHROME":
                subprocess.Popen(["/home/dod/.local/bin/chrome_launcher.sh"], start_new_session=True)
                return

            subprocess.run(["qdbus-qt6", "org.kde.KWin", "/VirtualDesktopManager", "org.kde.KWin.VirtualDesktopManager.current", raw_uuid])
            self.current_desktop_uuid = raw_uuid
            self.populate_live(initial=False)
            # Re-apply stickiness to ensure the window follows the switch
            QTimer.singleShot(50, lambda: force_window_position(self.force_focus_title, self.x(), self.y(), self.width(), self.height()))
        except Exception as e:
            subprocess.run(["notify-send", "Switch Failed", str(e)])

    def apply_active_windows(self, new_indices):
        is_initial = not getattr(self, "_initial_sort_done", False)
        self.active_kwin_indices = new_indices
        if is_initial:
            self._initial_sort_done = True
            self.populate_live(initial=True)
        else:
            self.populate_live(initial=False)
            update_live_priorities(self)
            self.live_list.sortItems(1, Qt.AscendingOrder)
            
        physical_desktops = [p for p in self.id_name_pairs if "___" in p[0]]
        active_count = sum(1 for uid, _ in physical_desktops if (int(uid.split("___")[1]) + 1) in self.active_kwin_indices)
        self.status_label.setText(f"Active: {active_count} • Empty: {len(physical_desktops) - active_count}")
        self.tabs.setTabText(0, f"Live ({active_count})")
        QTimer.singleShot(1000, lambda: threading.Thread(target=self.fetcher.fetch_windows_bg, daemon=True).start())

    def save_library(self):
        if self._is_populating: return
        data = {"folders": {}, "folder_order": [], "expanded": []}
        root = self.tree.invisibleRootItem()
        for i in range(root.childCount()):
            f = root.child(i)
            name = f.data(0, Qt.UserRole + 1)
            data["folder_order"].append(name)
            data["folders"][name] = [{"id": f.child(j).data(0, Qt.UserRole), "name": f.child(j).data(0, Qt.UserRole + 1), "script": f.child(j).data(0, Qt.UserRole + 2)} for j in range(f.childCount())]
            if f.isExpanded(): data["expanded"].append(name)
        self.data_manager.save_library(data)

    def save_session(self):
        if self._is_populating: return
        data = self.data_manager.load_session()
        data.update({"folders": {}, "folder_order": [], "expanded": [], "pinned": self.pinned_folders, "desktop_notes": self.desktop_notes})
        root = self.live_list.invisibleRootItem()
        for i in range(root.childCount()):
            item = root.child(i)
            if item.data(0, Qt.UserRole) == "FOLDER":
                name = item.data(0, Qt.UserRole + 1)
                data["folder_order"].append(name)
                data["folders"][name] = [item.child(j).data(0, Qt.UserRole) for j in range(item.childCount())]
                if item.isExpanded(): data["expanded"].append(name)
        self.data_manager.save_session(data)

    def edit_desktop_note(self, uid):
        raw_uuid = uid.split("___")[0]
        note, ok = QInputDialog.getMultiLineText(self, "Edit Note", "Enter reminder:", self.desktop_notes.get(raw_uuid, ""))
        if ok:
            self.desktop_notes[raw_uuid] = note.strip()
            self.save_session()
            self.populate_live(initial=False)

    def save_ui_state(self):
        if self.width() > 100: 
            self.data_manager.save_ui_state({
                "width": self.width(), 
                "height": self.height(), 
                "opacity": self.windowOpacity(),
                "x": self.x(),
                "y": self.y()
            })

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._is_dragging = True
            self.drag_pos = event.globalPos() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if event.buttons() == Qt.LeftButton:
            self.move(event.globalPos() - self.drag_pos)
            event.accept()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._is_dragging = False
            self.save_ui_state()
            event.accept()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if not self._is_populating: QTimer.singleShot(500, self.save_ui_state)

    def populate_live(self, initial=False):
        self._is_populating = True
        try:
            if initial: populate_live_tree(self); update_live_priorities(self); self.live_list.sortItems(1, Qt.AscendingOrder)
            else: self.update_tree_items_recursive(self.live_list.invisibleRootItem())
        finally: self._is_populating = False

    def populate_library(self):
        self._is_populating = True
        try: populate_library_tree(self.tree, self.lib_data)
        finally: self._is_populating = False

    def refresh_library(self):
        """Reload library from disk and update UI."""
        if self._is_populating: return
        self.lib_data = self.data_manager.load_library()
        self.populate_library()
        self.status_label.setText("Library Synced ✨")
        QTimer.singleShot(2000, lambda: self.apply_active_windows(self.active_kwin_indices))

    def add_live_desktop_item(self, parent, uid, name):
        return add_live_desktop_item(self.live_list, parent, uid, name, self.current_desktop_uuid, self.active_kwin_indices, self.desktop_notes, apply_live_styling)

    def update_tree_items_recursive(self, parent):
        for i in range(parent.childCount()):
            item = parent.child(i)
            uid = item.data(0, Qt.UserRole)
            if uid and uid not in ["FOLDER", "ACTION_CHROME"]:
                name = item.text(0).replace("◉ ", "").replace("○ ", "")
                is_active = (int(uid.split("___")[1]) + 1) in self.active_kwin_indices if "___" in uid else False
                is_current = (uid.split("___")[0] == self.current_desktop_uuid)
                item.setText(0, ("◉ " if is_active else "○ ") + name)
                apply_live_styling(item, name, is_current, is_active)
            elif uid == "FOLDER": self.update_tree_items_recursive(item)

    def on_tab_changed(self, index):
        self.save_ui_state()
        if index == 1: # Templates tab
            self.lib_data = self.data_manager.load_library()
            populate_library_tree(self.tree, self.lib_data)
        self.search_entry.setFocus()

    def on_search(self, text):
        widget = self.live_list if self.tabs.currentIndex() == 0 else self.tree
        item = filter_tree(widget, text.lower(), self.tabs.currentIndex())
        if item: widget.setCurrentItem(item); item.setSelected(True)
        elif not text: widget.clearSelection()

    def on_live_item_clicked(self, item, col):
        uid = item.data(0, Qt.UserRole)
        if uid == "FOLDER": item.setExpanded(not item.isExpanded())
        elif uid: 
            self.switch_desktop(uid)

    def on_live_context_menu(self, pos): show_live_context_menu(self, pos)
    def on_lib_context_menu(self, pos): show_lib_context_menu(self, pos)
    def toggle_pin(self, name):
        if name in self.pinned_folders: self.pinned_folders.remove(name)
        else: self.pinned_folders.append(name)
        self.save_session(); self.populate_live(initial=True)

    def create_folder(self): create_folder(self)
    def import_folder(self): import_folder(self)
    def rename_lib_item(self, item): rename_lib_item(self, item)
    def delete_lib_item(self, item): delete_lib_item(self, item)
    def add_app_desktop(self, item): add_app_desktop(self, item)
    def deploy_selected(self, item): deploy_selected(self, item)
    def link_script(self, item): link_script(self, item)
    def move_up(self): move_up(self)
    def move_down(self): move_down(self)
    def get_selected_uid(self): return get_selected_uid(self)
    def cleanup_empty(self):
        sys.exit(print("CLEAN_EMPTY") or 0)
    def on_back(self):
        try:
            if not os.path.exists(HISTORY_FILE): 
                subprocess.run(["notify-send", "Back Failed", "No history file"])
                return
            with open(HISTORY_FILE, 'r') as f: data = json.load(f)
            target = data.get("last_uuid")
            if target: 
                self.switch_desktop(target)
            else:
                subprocess.run(["notify-send", "Back Failed", "No previous desktop in history"])
        except Exception as e:
            subprocess.run(["notify-send", "Back Error", str(e)])

    def eventFilter(self, obj, event):
        res = handle_event(self, obj, event)
        return res if res is not None else super().eventFilter(obj, event)

if __name__ == '__main__':
    title_win, title_label, current_uuid, args = "Menu", "Select:", None, []
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--menu": title_label = sys.argv[i+1]; i+=2
        elif sys.argv[i] == "--title": title_win = sys.argv[i+1]; i+=2
        elif sys.argv[i] == "--current": current_uuid = sys.argv[i+1]; i+=2
        else: args.append(sys.argv[i]); i+=1
    pairs = [(args[j], args[j+1]) for j in range(0, len(args)-1, 2)]
    app = QApplication(sys.argv)
    window = SwitcherMenu(title_win, title_label, current_uuid, pairs)
    window.show(); sys.exit(app.exec_())
