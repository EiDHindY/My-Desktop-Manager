#!/usr/bin/env python3
import sys
import os
os.environ["QT_QPA_PLATFORM"] = "xcb"
import subprocess
import threading
import json
import uuid
import time
import signal
from pathlib import Path
from PyQt5.QtWidgets import (QApplication, QWidget, QVBoxLayout, QGraphicsDropShadowEffect, 
                             QInputDialog, QTreeWidgetItem, QMenu)
from PyQt5.QtGui import QColor, QCursor, QFont, QBrush
from PyQt5.QtCore import Qt, QPropertyAnimation, QEasingCurve, QTimer, QPoint, QEvent, QFileSystemWatcher

# Helpers
from helpers.window_fetcher import WindowFetcher
from helpers.ui_components import OutlineDelegate, FolderTreeWidget
from helpers.ui_styles import (MAIN_CONTAINER_STYLE, STATUS_LABEL_STYLE)
from helpers.data_manager import DataManager
from helpers.ui_logic import filter_tree
from helpers.ui_menus import show_live_context_menu, show_lib_context_menu
from helpers.folder_ops import (create_folder, import_folder, rename_lib_item, 
                                link_script, edit_script, go_to_folder_dir, delete_lib_item, add_app_desktop, deploy_selected)
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
        self.last_desktop_uuid = self._load_last_uuid()
        
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        
        self._is_dragging = False
        
        self.screen_geom = QApplication.primaryScreen().geometry()
        state = self.data_manager.load_ui_state()
        self.hud_width = state.get("width", 400)
        self.height_current = state.get("height", 420)
        
        # Center the app exactly at the mouse cursor
        cursor_pos = QCursor.pos()
        self.hud_x = cursor_pos.x() - (self.hud_width // 2)
        self.hud_y = cursor_pos.y() - (self.height_current // 2)
        
        # Keep it within screen bounds
        self.hud_x = max(0, min(self.hud_x, self.screen_geom.width() - self.hud_width))
        self.hud_y = max(0, min(self.hud_y, self.screen_geom.height() - self.height_current))
        
        self.setWindowOpacity(state.get("opacity", 0.95))
        
        # Minigame states
        self._initial_friction = state.get("ball_friction", 0.92)
        self._initial_slingshot = state.get("slingshot_enabled", False)
        self._initial_goal = state.get("goal_enabled", False)
        self._initial_moving_goal = state.get("moving_goal_enabled", False)
        
        # Summon feature (SIGUSR1)
        self.summon_flag = False
        self.is_summoning = False
        signal.signal(signal.SIGUSR1, self._on_sigusr1)
        self.summon_timer = QTimer(self)
        self.summon_timer.timeout.connect(self._check_summon)
        self.summon_timer.start(16)
        
        # Start in expanded state by default
        self.is_collapsed = False
        self.saved_width = self.hud_width
        self.saved_height = self.height_current
        
        # Initial position at the cursor
        cx = cursor_pos.x()
        cy = cursor_pos.y()
        self.setGeometry(cx - self.hud_width // 2, cy - self.height_current // 2, self.hud_width, self.height_current)
        self.setMinimumSize(320, 300)
        
        build_main_ui(self)
        
        # Show container by default
        self.container.show()
        self.ball.hide()
        self.layout().setContentsMargins(20, 2, 20, 20)
        
        from PyQt5.QtWidgets import QLabel
        self.fake_label = QLabel(self)
        self.fake_label.setScaledContents(True)
        self.fake_label.hide()
        
        # Apply minigame states to the newly built ball
        if hasattr(self, '_initial_friction'):
            self.ball._friction = self._initial_friction
        if hasattr(self, '_initial_slingshot'):
            self.ball._slingshot_enabled = self._initial_slingshot
        if hasattr(self, '_initial_goal'):
            self.ball._moving_goal_enabled = self._initial_moving_goal
            self.ball.set_goal_enabled(self._initial_goal)

        self.sync_btn.clicked.connect(self.refresh_library)
        self.open_scripts_btn.clicked.connect(self.open_scripts_dir)
        self.cleanup_btn.clicked.connect(self.cleanup_empty)
        self.collapse_btn.clicked.connect(self.toggle_collapse)
        self.note_btn.clicked.connect(self.toggle_note_popup)
        self.add_folder_btn.clicked.connect(self.create_folder_action)
        self.note_popup = None
        
        self.watcher = QFileSystemWatcher(self)
        templates_path = str(CONFIG_DIR / "templates")
        if os.path.exists(templates_path):
            self.watcher.addPath(templates_path)
        self.watcher.directoryChanged.connect(lambda: QTimer.singleShot(500, self.refresh_library))
        
        # Watch history file for last_uuid changes
        history_path = str(HISTORY_FILE)
        if os.path.exists(history_path):
            self.watcher.addPath(history_path)
        self.watcher.fileChanged.connect(self._on_history_changed)
        
        self.lib_data = self.data_manager.load_library()
        self.populate_live(initial=True)
        self.populate_library()
        self.update_note_btn()  # Set initial button state
        
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

    def _load_last_uuid(self):
        try:
            if os.path.exists(HISTORY_FILE):
                with open(HISTORY_FILE, 'r') as f:
                    return json.load(f).get("last_uuid", "")
        except: pass
        return ""

    def _on_history_changed(self, path):
        # Re-add to watcher (some editors replace files atomically, which removes them from the watcher)
        if path not in self.watcher.files():
            self.watcher.addPath(path)
        new_uuid = self._load_last_uuid()
        if new_uuid != self.last_desktop_uuid:
            self.last_desktop_uuid = new_uuid
            QTimer.singleShot(0, lambda: self.populate_live(initial=False))

    def check_current_desktop(self):
        if self._is_dragging: return # Don't snap while user is moving it
        try:
            res = subprocess.run(["qdbus-qt6", "org.kde.KWin", "/VirtualDesktopManager", "org.kde.KWin.VirtualDesktopManager.current"], 
                                 capture_output=True, text=True)
            new_uuid = res.stdout.strip()
            if new_uuid and new_uuid != self.current_desktop_uuid:
                self.current_desktop_uuid = new_uuid
                self.last_desktop_uuid = self._load_last_uuid()  # Refresh before redraw
                self.populate_live(initial=False)
                self.update_note_btn()
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
            self.last_desktop_uuid = self._load_last_uuid()  # Refresh before redraw
            self.populate_live(initial=False)
            self.update_note_btn()
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
        physical_desktops = [p for p in self.id_name_pairs if "___" in p[0]]
        active_count = sum(1 for uid, _ in physical_desktops if (int(uid.split("___")[1]) + 1) in self.active_kwin_indices)
        self.status_label.setText(f"A: {active_count} • E: {len(physical_desktops) - active_count}")
        self.tabs.setTabText(0, "Live")
        QTimer.singleShot(1000, lambda: threading.Thread(target=self.fetcher.fetch_windows_bg, daemon=True).start())

    def save_library(self):
        if self._is_populating: return
        data = {"folders": {}, "folder_order": [], "expanded": []}
        root = self.tree.invisibleRootItem()
        if root.childCount() == 0 and self.lib_data.get("folders"):
            print("DEBUG: Blocking save_library because tree is empty but library has data.")
            return # Safety check

        for i in range(root.childCount()):
            f = root.child(i)
            name = f.data(0, Qt.UserRole + 1)
            data["folder_order"].append(name)
            data["folders"][name] = [{"id": f.child(j).data(0, Qt.UserRole), "name": f.child(j).data(0, Qt.UserRole + 1), "script": f.child(j).data(0, Qt.UserRole + 2)} for j in range(f.childCount())]
            if f.isExpanded(): data["expanded"].append(name)
        self.data_manager.save_library(data)

    def save_session(self):
        if self._is_populating: return
        
        # Safety: check if tree is empty but we have known folders
        root = self.live_list.invisibleRootItem()
        session_data = self.data_manager.load_session()
        if root.childCount() == 0 and session_data.get("folders"):
            return

        data = session_data
        data.update({"folders": {}, "folder_order": [], "expanded": [], "pinned": self.pinned_folders, "desktop_notes": self.desktop_notes})
        
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
            self.update_note_btn()

    def update_note_btn(self):
        """Update the note button appearance based on whether current desktop has a note."""
        from helpers.ui_styles import BTN_NOTE_STYLE, BTN_NOTE_ACTIVE_STYLE
        note = self.desktop_notes.get(self.current_desktop_uuid, "")
        if note:
            self.note_btn.setStyleSheet(BTN_NOTE_ACTIVE_STYLE)
            self.note_btn.setToolTip(f"Note: {note[:60]}{'...' if len(note) > 60 else ''}")
        else:
            self.note_btn.setStyleSheet(BTN_NOTE_STYLE)
            self.note_btn.setToolTip("No note for this desktop — click to add one")

    def toggle_note_popup(self):
        """Show the standalone note editor popup."""
        from helpers.ui_components import NoteEditorPopup
        if not self.note_popup:
            self.note_popup = NoteEditorPopup(self)
            
        if self.note_popup.isVisible():
            self.note_popup.hide()
            return
            
        note = self.desktop_notes.get(self.current_desktop_uuid, "")
        desktop_name = next(
            (name for uid, name in self.id_name_pairs if uid.split("___")[0] == self.current_desktop_uuid),
            "Current Desktop"
        )
        
        # Position popup near the note button
        btn_pos = self.note_btn.mapToGlobal(self.note_btn.rect().topLeft())
        self.note_popup.show_note(desktop_name, note, btn_pos)

    def save_note_from_popup(self, note_text):
        """Save the note from the popup."""
        self.desktop_notes[self.current_desktop_uuid] = note_text
        self.save_session()
        self.populate_live(initial=False)
        self.update_note_btn()

    def delete_note_from_popup(self):
        """Clear the note for the current desktop."""
        self.desktop_notes[self.current_desktop_uuid] = ""
        self.save_session()
        self.populate_live(initial=False)
        self.update_note_btn()


    def save_ui_state(self):
        if self.width() > 100: 
            self.data_manager.save_ui_state({
                "width": self.width(), 
                "height": self.height(), 
                "opacity": self.windowOpacity(),
                "x": self.x(),
                "y": self.y(),
                "ball_friction": getattr(self.ball, "_friction", 0.92),
                "slingshot_enabled": getattr(self.ball, "_slingshot_enabled", False),
                "goal_enabled": getattr(self.ball, "_goal_enabled", False)
            })

    def toggle_collapse(self):
        from PyQt5.QtWidgets import QApplication
        
        is_collapsed = not getattr(self, "is_collapsed", False)
        self.is_collapsed = is_collapsed
        
        if is_collapsed:
            self.saved_width = self.width()
            self.saved_height = self.height()
            
            self.container.hide()
            self.ball.show()
            self.size_grip.hide()
            self.layout().setContentsMargins(0, 0, 0, 0)
            
            # Snap to ball size
            geom = self.geometry()
            cx = geom.x() + geom.width() // 2
            cy = geom.y() + geom.height() // 2
            self.setGeometry(cx - 20, cy - 20, 40, 40)
            self.setFixedSize(40, 40)
        else:
            self.ball.hide()
            self.container.show()
            self.size_grip.show()
            self.layout().setContentsMargins(20, 2, 20, 20)
            
            # Snap to full size
            geom = self.geometry()
            cx = geom.x() + geom.width() // 2
            cy = geom.y() + geom.height() // 2
            
            screen_geom = QApplication.primaryScreen().geometry()
            end_x = max(0, min(cx - self.saved_width // 2, screen_geom.width() - self.saved_width))
            end_y = max(0, min(cy - self.saved_height // 2, screen_geom.height() - self.saved_height))
            
            self.setMaximumSize(16777215, 16777215) # Unblock resizing
            self.setGeometry(end_x, end_y, self.saved_width, self.saved_height)
            self.setMinimumSize(320, 300) # Restore constraints
            self.search_entry.setFocus()


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
        if not self._is_populating and not getattr(self, "is_collapsed", False):
            self.hud_width = self.width()
            self.height_current = self.height()
            QTimer.singleShot(500, self.save_ui_state)

    def populate_live(self, initial=False):
        self._is_populating = True
        try:
            if initial: populate_live_tree(self)
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

    def open_scripts_dir(self):
        scripts_dir = os.path.expanduser("~/.local/bin/Scripts/")
        os.makedirs(scripts_dir, exist_ok=True)
        subprocess.Popen(["xdg-open", scripts_dir])

    def add_live_desktop_item(self, parent, uid, name):
        return add_live_desktop_item(self.live_list, parent, uid, name, self.current_desktop_uuid, self.active_kwin_indices, self.desktop_notes, apply_live_styling, self.last_desktop_uuid)

    def update_tree_items_recursive(self, parent):
        for i in range(parent.childCount()):
            item = parent.child(i)
            uid = item.data(0, Qt.UserRole)
            if uid and uid not in ["FOLDER", "ACTION_CHROME"]:
                name = item.text(0).replace("◉ ", "").replace("○ ", "")
                is_active = (int(uid.split("___")[1]) + 1) in self.active_kwin_indices if "___" in uid else False
                is_current = (uid.split("___")[0] == self.current_desktop_uuid)
                is_previous = (uid.split("___")[0] == self.last_desktop_uuid) and not is_current
                item.setText(0, ("◉ " if is_active else "○ ") + name)
                item.setData(0, Qt.UserRole + 6, is_previous)
                apply_live_styling(item, name, is_current, is_active)
            elif uid == "FOLDER": self.update_tree_items_recursive(item)

    def on_tab_changed(self, index):
        self.save_ui_state()
        if index == 1: # Templates tab
            self.lib_data = self.data_manager.load_library()
            populate_library_tree(self.tree, self.lib_data)
            self.cleanup_btn.hide()
            self.note_btn.hide()
            self.open_scripts_btn.show()
            self.sync_btn.show()
        else:
            self.cleanup_btn.show()
            self.note_btn.show()
            self.open_scripts_btn.hide()
            self.sync_btn.hide()
        self.search_entry.setFocus()

    def create_folder_action(self):
        """Unified folder creation for both Live and Library tabs."""
        from helpers.folder_ops import create_folder
        if self.tabs.currentIndex() == 1: # Templates tab
            create_folder(self)
        else: # Live tab
            name, ok = QInputDialog.getText(self, "New Live Group", "Folder name:", text="")
            if ok and name.strip():
                folder_name = name.strip()
                # Use a temporary item to trigger the structure update
                fitem = QTreeWidgetItem()
                fitem.setText(0, folder_name)
                fitem.setData(0, Qt.UserRole, "FOLDER")
                fitem.setData(0, Qt.UserRole + 1, folder_name)
                fitem.setFont(0, QFont("Inter", 10, QFont.DemiBold))
                fitem.setForeground(0, QBrush(QColor("#bb9af7")))
                self.live_list.addTopLevelItem(fitem)
                self.save_session() # This will save the new folder structure
                self.populate_live(initial=True) # Refresh to ensure clean state
    
    def on_search(self, text):
        widget = self.live_list if self.tabs.currentIndex() == 0 else self.tree
        item = filter_tree(widget, text.lower(), self.tabs.currentIndex())
        if item: widget.setCurrentItem(item); item.setSelected(True)
        elif not text: widget.clearSelection()

    def on_live_item_clicked(self, item, col):
        uid = item.data(0, Qt.UserRole)
        if uid == "FOLDER": 
            item.setExpanded(not item.isExpanded())
        elif uid: 
            self.switch_desktop(uid)

    def on_lib_item_clicked(self, item, col):
        uid = item.data(0, Qt.UserRole)
        if uid == "FOLDER":
            item.setExpanded(not item.isExpanded())

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
    def edit_script(self, item): edit_script(self, item)
    def go_to_folder_dir(self, item): go_to_folder_dir(self, item)
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

    def _on_sigusr1(self, signum, frame):
        self.summon_flag = True

    def _check_summon(self):
        from PyQt5.QtGui import QCursor
        from PyQt5.QtCore import QPointF
        
        if getattr(self, 'summon_flag', False):
            self.summon_flag = False
            if self.is_summoning: return
            
            from PyQt5.QtWidgets import QApplication
            cursor_pos = QCursor.pos()
            
            if getattr(self, "is_collapsed", False) and hasattr(self, 'ball'):
                orig_friction = self.ball._friction
                self.ball._friction = 0.5 
                if self.is_collapsed: self.toggle_collapse()
                self.is_summoning = True
                self.ball.summon_to(cursor_pos)
                QTimer.singleShot(1000, lambda: setattr(self.ball, '_friction', orig_friction))
            else:
                self.is_summoning = True
                
        if getattr(self, 'is_summoning', False):
            mouse_pos = QCursor.pos()
            target_x = mouse_pos.x() - self.width() // 2
            target_y = mouse_pos.y() - self.height() // 2
            
            current_x = self.x()
            current_y = self.y()
            
            dx = target_x - current_x
            dy = target_y - current_y
            
            dist = (dx**2 + dy**2)**0.5
            if dist < 5:
                self.move(target_x, target_y)
                self.is_summoning = False
            else:
                # Move 20% of the distance each frame (approx 16ms)
                new_x = int(current_x + dx * 0.2)
                new_y = int(current_y + dy * 0.2)
                self.move(new_x, new_y)

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
