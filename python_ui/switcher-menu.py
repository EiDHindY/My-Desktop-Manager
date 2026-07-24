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
from PyQt5.QtCore import Qt, QPropertyAnimation, QEasingCurve, QTimer, QPoint, QPointF, QEvent, QFileSystemWatcher

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
                                 populate_library_tree, populate_live_tree, populate_notes_tree, update_live_priorities)
from helpers.event_handler import handle_event
from helpers.ui_factory import build_main_ui, force_window_focus, force_window_position

CONFIG_DIR = Path.home() / ".config" / "desktop-manager"
HISTORY_FILE = CONFIG_DIR / "history.json"
UI_PID_FILE = Path("/tmp/desktop-manager-ui.pid")

class SwitcherMenu(QWidget):
    def __init__(self, title_win, title_label, current_desktop_uuid, id_name_pairs):
        super().__init__()
        # Write our PID so the launcher can signal us directly
        import atexit
        UI_PID_FILE.write_text(str(os.getpid()))
        # BUG-01 FIX: Bind path value at registration time — Python 3.14 GC can
        # null out module-level names before atexit fires if we close over the name.
        _pid_path = str(UI_PID_FILE)
        atexit.register(lambda p=_pid_path: Path(p).unlink(missing_ok=True))
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
        if cursor_pos.x() == 0 and cursor_pos.y() == 0:
            cursor_pos = QPoint(self.screen_geom.width() // 2, self.screen_geom.height() // 2)
            
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
        
        # Initial position
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
        # BUG-02 FIX: If history.json doesn't exist yet, watch the config dir
        # itself so we catch the moment it gets created for the first time.
        history_path = str(HISTORY_FILE)
        if os.path.exists(history_path):
            self.watcher.addPath(history_path)
        else:
            self.watcher.addPath(str(CONFIG_DIR))
        self.watcher.fileChanged.connect(self._on_history_changed)
        self.watcher.directoryChanged.connect(self._on_config_dir_changed)
        
        self.lib_data = self.data_manager.load_library()
        self.notes_data = self.data_manager.load_notes()
        self.populate_live(initial=True)
        self.populate_library()
        self.populate_notes()
        self.update_note_btn()  # Set initial button state
        
        self.tabs.currentChanged.connect(self.on_tab_changed)
        
        self.fetcher = WindowFetcher()
        self.fetcher.finished.connect(self.apply_active_windows)
        self.fetcher.fetch_windows_bg()  # QThread-safe, no threading.Thread needed
        
        self.installEventFilter(self)
        self.search_entry.installEventFilter(self)
        self.live_list.installEventFilter(self)
        self.tree.installEventFilter(self)
        self.tabs.installEventFilter(self)
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
        except (json.JSONDecodeError, KeyError, OSError):
            pass  # BUG-13 FIX: catch specific exceptions so real crashes surface
        return ""

    def _on_history_changed(self, path):
        # Re-add to watcher (some editors replace files atomically, which removes them from the watcher)
        if path not in self.watcher.files():
            self.watcher.addPath(path)
        new_uuid = self._load_last_uuid()
        if new_uuid != self.last_desktop_uuid:
            self.last_desktop_uuid = new_uuid
            QTimer.singleShot(0, lambda: self.populate_live(initial=False))

    def _on_config_dir_changed(self, path):
        """BUG-02 FIX: Pick up history.json the moment it's created."""
        history_path = str(HISTORY_FILE)
        if os.path.exists(history_path) and history_path not in self.watcher.files():
            self.watcher.addPath(history_path)

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
        QTimer.singleShot(1000, self.fetcher.fetch_windows_bg)  # QThread-safe

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
        
        root = self.live_list.invisibleRootItem()
        old_session = self.data_manager.load_session()
        old_folders = old_session.get("folders", {})

        # BUG-03 FIX: Count actual desktop leaf items, not just top-level folder nodes.
        # A tree can have folder headers (childCount > 0) but zero actual desktops inside.
        total_tree_desktops = sum(
            root.child(i).childCount()
            for i in range(root.childCount())
            if root.child(i).data(0, Qt.UserRole) == "FOLDER"
        )
        total_old_desktops = sum(len(v) for v in old_folders.values())
        if total_tree_desktops == 0 and total_old_desktops > 0:
            return

        new_folders = {}
        folder_order = []
        expanded = []

        for i in range(root.childCount()):
            item = root.child(i)
            if item.data(0, Qt.UserRole) == "FOLDER":
                name = item.data(0, Qt.UserRole + 1)
                folder_order.append(name)
                new_folders[name] = [item.child(j).data(0, Qt.UserRole) for j in range(item.childCount())]
                if item.isExpanded(): expanded.append(name)

        # Safety: if a folder had items before but now shows empty,
        # and those items aren't in root either, restore old assignments
        root_uids = set(new_folders.get("root", []))
        for fname, old_uids in old_folders.items():
            if fname in new_folders and len(new_folders[fname]) == 0 and len(old_uids) > 0:
                # Check if old items have migrated to root (user moved them) or just vanished (glitch)
                old_bases = {u.split("___")[0] for u in old_uids}
                root_bases = {u.split("___")[0] for u in root_uids}
                if not old_bases.intersection(root_bases):
                    # Items not in root — restore old folder assignment to avoid data loss
                    new_folders[fname] = old_uids

        data = old_session
        data.update({
            "folders": new_folders,
            "folder_order": folder_order,
            "expanded": expanded,
            "pinned": self.pinned_folders,
            "desktop_notes": self.desktop_notes
        })
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
        is_collapsed = getattr(self, "is_collapsed", False)
        state = {
            "width": self.width() if not is_collapsed else getattr(self, "saved_width", 400), 
            "height": self.height() if not is_collapsed else getattr(self, "saved_height", 420), 
            "opacity": self.windowOpacity(),
            "x": self.x(),
            "y": self.y(),
            "ball_friction": getattr(self.ball, "_friction", 0.92) if hasattr(self, "ball") else 0.92,
            "slingshot_enabled": getattr(self.ball, "_slingshot_enabled", False) if hasattr(self, "ball") else False,
            "goal_enabled": getattr(self.ball, "_goal_enabled", False) if hasattr(self, "ball") else False
        }
        self.data_manager.save_ui_state(state)

    def toggle_collapse(self):
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

    def populate_notes(self):
        self._is_populating = True
        try: populate_notes_tree(self)
        finally: self._is_populating = False

    def save_notes(self):
        if self._is_populating: return
        
        def extract_node(item):
            uid = item.data(0, Qt.UserRole)
            if uid == "FOLDER":
                children = []
                for i in range(item.childCount()):
                    child_data = extract_node(item.child(i))
                    if child_data: children.append(child_data)
                return {
                    "id": item.data(0, Qt.UserRole + 3) or str(uuid.uuid4()),
                    "type": "folder",
                    "name": item.data(0, Qt.UserRole + 1),
                    "expanded": item.isExpanded(),
                    "children": children
                }
            else:
                if not uid: return None # detail item
                return {
                    "id": uid,
                    "type": "task",
                    "text": item.data(0, Qt.UserRole + 1),
                    "checked": item.checkState(0) == Qt.Checked,
                    "details": item.data(0, Qt.UserRole + 2) or ""
                }

        hierarchy = []
        root = self.notes_tree.invisibleRootItem()
        for i in range(root.childCount()):
            node_data = extract_node(root.child(i))
            if node_data:
                hierarchy.append(node_data)
                
        data = {"hierarchy": hierarchy, "version": 2}
        self.data_manager.save_notes(data)
        self.notes_data = data

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
        elif index == 2: # Notes tab
            self.notes_data = self.data_manager.load_notes()
            self.populate_notes()
            self.cleanup_btn.hide()
            self.note_btn.hide()
            self.open_scripts_btn.hide()
            self.sync_btn.hide()
        else: # Live
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
        elif self.tabs.currentIndex() == 2: # Notes tab
            name, ok = QInputDialog.getText(self, "New Notes Folder", "Folder name:", text="")
            if ok and name.strip():
                from PyQt5.QtGui import QIcon, QFont, QBrush, QColor
                new_folder = QTreeWidgetItem()
                new_folder.setText(0, name.strip())
                new_folder.setData(0, Qt.UserRole, "FOLDER")
                new_folder.setData(0, Qt.UserRole + 1, name.strip())
                new_folder.setData(0, Qt.UserRole + 3, str(uuid.uuid4()))
                new_folder.setIcon(0, QIcon.fromTheme("folder"))
                new_folder.setFont(0, QFont("Inter", 10, QFont.DemiBold))
                new_folder.setForeground(0, QBrush(QColor("#bb9af7")))
                new_folder.setFlags(new_folder.flags() | Qt.ItemIsDropEnabled | Qt.ItemIsDragEnabled)
                self.notes_tree.addTopLevelItem(new_folder)
                self.save_notes()
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
    
    def add_note_task(self):
        text = self.note_input.text().strip()
        if not text: return
        self.note_input.clear()
        
        selected = self.notes_tree.currentItem()
        target_item = None
        if selected:
            target_item = selected if selected.data(0, Qt.UserRole) == "FOLDER" else selected.parent()
        
        self.save_notes()
        
        new_task = {
            "id": str(uuid.uuid4()),
            "type": "task",
            "text": text,
            "checked": False,
            "details": ""
        }
        
        if target_item:
            target_id = target_item.data(0, Qt.UserRole + 3)
            def find_and_append(nodes, tid):
                for n in nodes:
                    if n.get("type") == "folder" and n.get("id") == tid:
                        n.setdefault("children", []).append(new_task)
                        return True
                    elif n.get("type") == "folder":
                        if find_and_append(n.get("children", []), tid):
                            return True
                return False
            find_and_append(self.notes_data.get("hierarchy", []), target_id)
        else:
            self.notes_data.setdefault("hierarchy", []).append(new_task)
            
        self.data_manager.save_notes(self.notes_data)
        self.populate_notes()
        
    def on_note_item_clicked(self, item, col):
        uid = item.data(0, Qt.UserRole)
        if uid == "FOLDER":
            item.setExpanded(not item.isExpanded())
            self.save_notes()
            return
            
        was_checked = False
        found = False
        if "hierarchy" in self.notes_data:
            def find_task(nodes, tid):
                for n in nodes:
                    if n.get("type") == "task" and n.get("id") == tid: return n
                    elif n.get("type") == "folder":
                        r = find_task(n.get("children", []), tid)
                        if r: return r
                return None
            task = find_task(self.notes_data.get("hierarchy", []), uid)
            if task: was_checked = task.get("checked", False)
        else:
            for tasks in self.notes_data.get("folders", {}).values():
                for t in tasks:
                    if t.get("id") == uid:
                        was_checked = t.get("checked", False)
                        found = True; break
                if found: break
            
        is_checked = (item.checkState(0) == Qt.Checked)
        
        if is_checked != was_checked:
            self.save_notes()
            self.populate_notes()
        else:
            item.setExpanded(not item.isExpanded())
            self.save_notes()

    def on_note_context_menu(self, pos):
        item = self.notes_tree.itemAt(pos)
        if not item: return
        menu = QMenu(self)
        menu.setStyleSheet("QMenu { background: #2f334d; color: #c8d3f5; border: 1px solid #3b4261; border-radius: 6px; } QMenu::item { padding: 6px 20px; } QMenu::item:selected { background: #82aaff; color: #1e2030; }")
        
        if item.data(0, Qt.UserRole) == "FOLDER":
            rename_action = menu.addAction("Rename Folder")
            add_sub_action = menu.addAction("Add Subfolder")
            delete_action = menu.addAction("Delete Folder")
            action = menu.exec_(self.notes_tree.viewport().mapToGlobal(pos))
            if action == rename_action:
                new_name, ok = QInputDialog.getText(self, "Rename", "New name:", text=item.text(0))
                if ok and new_name.strip():
                    item.setText(0, new_name.strip())
                    item.setData(0, Qt.UserRole + 1, new_name.strip())
                    self.save_notes()
            elif action == add_sub_action:
                depth = 0
                p = item
                while p:
                    depth += 1
                    p = p.parent()
                if depth >= 5:
                    subprocess.run(["notify-send", "Limit Reached", "Cannot nest folders deeper than 5 levels!"])
                    return
                new_name, ok = QInputDialog.getText(self, "New Subfolder", "Folder name:")
                if ok and new_name.strip():
                    from PyQt5.QtGui import QIcon, QFont, QBrush, QColor
                    new_folder = QTreeWidgetItem()
                    new_folder.setText(0, new_name.strip())
                    new_folder.setData(0, Qt.UserRole, "FOLDER")
                    new_folder.setData(0, Qt.UserRole + 1, new_name.strip())
                    new_folder.setData(0, Qt.UserRole + 3, str(uuid.uuid4()))
                    new_folder.setIcon(0, QIcon.fromTheme("folder"))
                    new_folder.setFont(0, QFont("Inter", 10, QFont.DemiBold))
                    new_folder.setForeground(0, QBrush(QColor("#bb9af7")))
                    new_folder.setFlags(new_folder.flags() | Qt.ItemIsDropEnabled | Qt.ItemIsDragEnabled)
                    item.addChild(new_folder)
                    item.setExpanded(True)
                    self.save_notes()
            elif action == delete_action:
                if item.childCount() > 0:
                    subprocess.run(["notify-send", "Cannot Delete", "Folder is not empty!"])
                else:
                    parent = item.parent() or self.notes_tree.invisibleRootItem()
                    parent.removeChild(item)
                    self.save_notes()
        else:
            edit_action = menu.addAction("Edit Task")
            delete_action = menu.addAction("Delete Task")
            action = menu.exec_(self.notes_tree.viewport().mapToGlobal(pos))
            if action == edit_action:
                new_text, ok = QInputDialog.getText(self, "Edit Task", "Task text:", text=item.data(0, Qt.UserRole + 1))
                if ok and new_text.strip():
                    item.setText(0, new_text.strip())
                    item.setData(0, Qt.UserRole + 1, new_text.strip())
                    self.save_notes()
            elif action == delete_action:
                parent = item.parent() or self.notes_tree.invisibleRootItem()
                parent.removeChild(item)
                self.save_notes()
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

    def history_back(self):
        try:
            if not os.path.exists(HISTORY_FILE): return
            with open(HISTORY_FILE, 'r') as f: data = json.load(f)
            index = data.get("index", -1)
            stack = data.get("stack", [])
            if index > 0:
                new_index = index - 1
                target = stack[new_index]
                data["index"] = new_index
                data["lock"] = True
                data["target"] = target
                with open(HISTORY_FILE, 'w') as f: json.dump(data, f)
                self.switch_desktop(target)
            else:
                subprocess.run(["notify-send", "History", "No more backward history"])
        except Exception as e:
            subprocess.run(["notify-send", "History Back Error", str(e)])

    def history_forward(self):
        try:
            if not os.path.exists(HISTORY_FILE): return
            with open(HISTORY_FILE, 'r') as f: data = json.load(f)
            index = data.get("index", -1)
            stack = data.get("stack", [])
            if index >= 0 and index < len(stack) - 1:
                new_index = index + 1
                target = stack[new_index]
                data["index"] = new_index
                data["lock"] = True
                data["target"] = target
                with open(HISTORY_FILE, 'w') as f: json.dump(data, f)
                self.switch_desktop(target)
            else:
                subprocess.run(["notify-send", "History", "No more forward history"])
        except Exception as e:
            subprocess.run(["notify-send", "History Forward Error", str(e)])

    def _on_sigusr1(self, signum, frame):
        print(f"[SIGNAL] SIGUSR1 received. Setting summon_flag = True.", flush=True)
        self.summon_flag = True

    def _check_summon(self):
        if getattr(self, 'summon_flag', False):
            print(f"[SUMMON] _check_summon triggered. is_collapsed={getattr(self, 'is_collapsed', False)}", flush=True)
            self.summon_flag = False
            if self.is_summoning:
                print("[SUMMON] Already summoning, skipping", flush=True)
                return
            
            cursor_pos = QCursor.pos()
            if cursor_pos.x() == 0 and cursor_pos.y() == 0:
                screen = QApplication.primaryScreen().geometry()
                cursor_pos = QPoint(screen.width() // 2, screen.height() // 2)
            
            self._summoning_via_signal = True
            win_w = self.width() if self.width() > 0 else self.hud_width
            win_h = self.height() if self.height() > 0 else self.height_current
            
            if getattr(self, "is_collapsed", False) and hasattr(self, 'ball'):
                print("[SUMMON] Collapsed: centering ball and expanding", flush=True)
                target_x = cursor_pos.x() - 20
                target_y = cursor_pos.y() - 20
                self.move(target_x, target_y)
                force_window_position(self.force_focus_title, target_x, target_y, 40, 40)
                self.toggle_collapse()
            else:
                print(f"[SUMMON] Expanded: centering window at {cursor_pos.x()}, {cursor_pos.y()}", flush=True)
                target_x = cursor_pos.x() - win_w // 2
                target_y = cursor_pos.y() - win_h // 2
                
                # Constrain within screen boundaries
                screen_geom = QApplication.primaryScreen().geometry()
                target_x = max(0, min(target_x, screen_geom.width() - win_w))
                target_y = max(0, min(target_y, screen_geom.height() - win_h))
                
                self.move(target_x, target_y)
                force_window_position(self.force_focus_title, target_x, target_y, win_w, win_h)
            
            self.show()
            self.raise_()
            self.activateWindow()
            force_window_focus(self.force_focus_title)
            self.search_entry.setFocus()
            print("[SUMMON] Summon action completed.", flush=True)
                # is_summoning stays False — no animation needed
                
        if getattr(self, 'is_summoning', False):
            mouse_pos = QCursor.pos()
            if mouse_pos.x() == 0 and mouse_pos.y() == 0:
                screen = QApplication.primaryScreen().geometry()
                mouse_pos = QPoint(screen.width() // 2, screen.height() // 2)
                
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
