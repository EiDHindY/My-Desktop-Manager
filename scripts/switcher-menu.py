#!/usr/bin/env python3
import sys
import os
os.environ["QT_QPA_PLATFORM"] = "xcb"
import subprocess
import threading
import json
import uuid
import re
from pathlib import Path
from datetime import datetime, timezone
import time
from PyQt5.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout,
                             QLabel, QLineEdit, QTreeWidget, QTreeWidgetItem,
                             QPushButton, QGraphicsDropShadowEffect,
                             QMenu, QInputDialog, QAbstractItemView,
                             QDialog, QListWidget, QListWidgetItem,
                             QFileDialog, QTabWidget)
from PyQt5.QtCore import Qt, QEvent, pyqtSignal, QObject, QTimer, QDir, QPropertyAnimation, QEasingCurve, QPoint, QRect, QSize
from PyQt5.QtGui import QFont, QColor, QBrush, QIcon

CONFIG_DIR = Path.home() / ".config" / "desktop-manager"
LIBRARY_FILE = CONFIG_DIR / "library.json"
HISTORY_FILE = CONFIG_DIR / "history.json"
SESSION_FILE = CONFIG_DIR / "session.json"
CHROME_LOCAL_STATE = Path.home() / ".config/google-chrome/Local State"

class WindowFetcher(QObject):
    finished = pyqtSignal(set)
    def fetch_windows_bg(self):
        try:
            cmd = "for id in $(kdotool search --class '.*'); do wname=$(kdotool getwindowname $id 2>/dev/null); if [[ \"$wname\" != \"Desktop Manager\" ]] && [[ \"$wname\" != \"Menu\" ]]; then kdotool get_desktop_for_window $id 2>/dev/null; fi; done 2>/dev/null | sort -u"
            result = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)
            new_indices = set()
            for line in result.stdout.strip().split("\n"):
                if line.strip().isdigit():
                    new_indices.add(int(line.strip()))
            self.finished.emit(new_indices)
        except Exception: pass

class FolderTreeWidget(QTreeWidget):
    def dropEvent(self, event):
        dragged = self.currentItem()
        if dragged is None: return event.ignore()
        target = self.itemAt(event.pos())
        drop_indicator = self.dropIndicatorPosition()
        is_folder_drag = dragged.data(0, Qt.UserRole) == "FOLDER"
        
        if is_folder_drag:
            if target is None: return event.ignore()
            target_folder = target if target.data(0, Qt.UserRole) == "FOLDER" else target.parent()
            if target_folder and target_folder.data(0, Qt.UserRole) == "FOLDER":
                root = self.invisibleRootItem()
                old_idx = self.indexOfTopLevelItem(dragged)
                new_idx = self.indexOfTopLevelItem(target_folder)
                if old_idx >= 0 and new_idx >= 0 and old_idx != new_idx:
                    root.takeChild(old_idx)
                    if old_idx < new_idx: new_idx -= 1
                    if drop_indicator == QAbstractItemView.BelowItem: new_idx += 1
                    root.insertChild(new_idx, dragged)
                    self.setCurrentItem(dragged)
            event.ignore()
        else:
            if target is None: return event.ignore()
            old_parent = dragged.parent()
            if not old_parent: return event.ignore()
            old_idx = old_parent.indexOfChild(dragged)
            if old_idx < 0: return event.ignore()
            
            if target.data(0, Qt.UserRole) == "FOLDER":
                taken = old_parent.takeChild(old_idx)
                target.insertChild(0, taken)
                target.setExpanded(True)
                self.setCurrentItem(taken)
            else:
                target_parent = target.parent()
                if not target_parent: return event.ignore()
                taken = old_parent.takeChild(old_idx)
                target_idx = target_parent.indexOfChild(target)
                if old_parent == target_parent and old_idx < target_idx: target_idx -= 1
                if drop_indicator == QAbstractItemView.BelowItem: target_idx += 1
                target_parent.insertChild(target_idx, taken)
                target_parent.setExpanded(True)
                self.setCurrentItem(taken)
            event.ignore()
        QTimer.singleShot(50, self._save_after_drop)
    
    def _save_after_drop(self):
        parent = self.parent()
        while parent:
            if hasattr(parent, 'save_library'):
                parent.save_library()
                return
            parent = parent.parent()

class SwitcherMenu(QWidget):
    def __init__(self, title_win, title_label, current_desktop_uuid, id_name_pairs):
        super().__init__()
        self.setWindowTitle(title_win)
        self.id_name_pairs = id_name_pairs
        self.current_desktop_uuid = current_desktop_uuid
        self.active_kwin_indices = set()
        
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        
        self.screen_geom = QApplication.primaryScreen().geometry()
        self.hud_width = 400 
        self.height_expanded = 800
        self.height_collapsed = 600
        
        self.setMinimumSize(320, 400)
        self.resize(self.hud_width, self.height_collapsed)
        
        x_target = self.screen_geom.width() - self.hud_width + 20
        x_start = self.screen_geom.width() + 10 
        self.move(x_start, 0)
        
        self.anim = QPropertyAnimation(self, b"pos")
        self.anim.setDuration(250)
        self.anim.setStartValue(QPoint(x_start, 0))
        self.anim.setEndValue(QPoint(x_target, 0))
        self.anim.setEasingCurve(QEasingCurve.OutCubic)
        self.anim.start()
        
        QTimer.singleShot(300, self.force_position)
        
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(20, 2, 20, 20)
        self.setLayout(main_layout)
        
        self.container = QWidget()
        self.container.setStyleSheet("#container { background-color: rgba(30,32,48,0.95); border-radius: 4px; border: 1px solid #5a4a78; }")
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(10)
        shadow.setColor(QColor(0, 0, 0, 120))
        shadow.setOffset(0, 2)
        self.container.setGraphicsEffect(shadow)
        
        container_layout = QVBoxLayout()
        container_layout.setContentsMargins(6, 6, 6, 6)
        container_layout.setSpacing(6)
        self.container.setLayout(container_layout)
        
        # Search Box
        self.search_entry = QLineEdit()
        self.search_entry.setFont(QFont("Inter", 11))
        self.search_entry.setPlaceholderText("Search...")
        self.search_entry.setMinimumWidth(160)
        self.search_entry.setStyleSheet("QLineEdit { background-color: #2f334d; color: #c8d3f5; border: 2px solid #3b4261; border-radius: 6px; padding: 4px 8px; margin-right: 6px; margin-bottom: 2px; } QLineEdit:focus { border: 2px solid #82aaff; background-color: #222436; }")
        self.search_entry.textChanged.connect(self.on_search)
        # Search box is moved to corner widget of tabs below

        
        # Tabs
        self.tabs = QTabWidget()
        self.tabs.setStyleSheet("""
            QTabWidget::pane { border: 1px solid #3b4261; border-radius: 4px; }
            QTabBar::tab { background: #2f334d; color: #c8d3f5; padding: 8px 16px; border: 1px solid #3b4261; border-bottom: none; border-top-left-radius: 4px; border-top-right-radius: 4px; margin-right: 2px; }
            QTabBar::tab:selected { background: #222436; color: #82aaff; font-weight: bold; border-top: 2px solid #82aaff; }
            QTabBar::tab:hover { background: #3b4261; }
        """)
        # The UI layout has been simplified to remove the bottom button rail entirely.
        
        # Live System Tab
        self.live_tab = QWidget()
        live_layout = QVBoxLayout()
        live_layout.setContentsMargins(0,0,0,0)
        self.live_list = QListWidget()
        self.live_list.setFont(QFont("Inter", 10))
        self.live_list.setStyleSheet("""
            QListWidget { background-color: #222436; color: #c8d3f5; border: none; padding: 4px; outline: none; } 
            QListWidget::item { padding: 8px; border-radius: 4px; } 
            QListWidget::item:hover { background-color: rgba(47, 51, 77, 0.7); } 
            QListWidget::item:selected { background-color: rgba(130, 170, 255, 0.85); color: #1e2030; font-weight: bold; }
            /* Scrollbar */
            QScrollBar:vertical { background: #222436; width: 6px; border-radius: 3px; margin: 4px 0; }
            QScrollBar::handle:vertical { background: #3b4261; border-radius: 3px; min-height: 30px; }
            QScrollBar::handle:vertical:hover { background: #5a4a78; }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }
        """)
        self.live_list.itemClicked.connect(self.on_live_item_clicked)
        self.live_list.setContextMenuPolicy(Qt.CustomContextMenu)
        self.live_list.customContextMenuRequested.connect(self.on_live_context_menu)
        live_layout.addWidget(self.live_list)
        self.live_tab.setLayout(live_layout)
        
        # App Library Tab
        self.lib_tab = QWidget()
        lib_layout = QVBoxLayout()
        lib_layout.setContentsMargins(0,0,0,0)
        self.tree = FolderTreeWidget(self)
        self.tree.setHeaderHidden(True)
        self.tree.setFont(QFont("Inter", 10))
        self.tree.setDragEnabled(True)
        self.tree.setAcceptDrops(True)
        self.tree.setDragDropMode(QAbstractItemView.InternalMove)
        self.tree.setDefaultDropAction(Qt.MoveAction)
        self.tree.setStyleSheet("""
            QTreeWidget { background-color: #222436; color: #c8d3f5; border: none; padding: 2px 0px; outline: none; } 
            QTreeWidget::item { padding: 4px 2px; border-radius: 4px; margin: 0px; } 
            QTreeWidget::item:hover { background-color: rgba(47, 51, 77, 0.7); } 
            QTreeWidget::item:selected { background-color: rgba(130, 170, 255, 0.85); color: #1e2030; }
            QScrollBar:vertical { background: #222436; width: 6px; border-radius: 3px; margin: 4px 0; }
            QScrollBar::handle:vertical { background: #3b4261; border-radius: 3px; min-height: 30px; }
            QScrollBar::handle:vertical:hover { background: #5a4a78; }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }
        """)
        self.tree.setRootIsDecorated(False)
        self.tree.setIndentation(15)
        self.tree.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tree.customContextMenuRequested.connect(self.on_lib_context_menu)
        
        def on_item_expanded(item):
            if item.data(0, Qt.UserRole) == "FOLDER":
                item.setIcon(0, QIcon.fromTheme("folder-open"))
            self.save_library()
            
        def on_item_collapsed(item):
            if item.data(0, Qt.UserRole) == "FOLDER":
                item.setIcon(0, QIcon.fromTheme("folder"))
            self.save_library()
            
        self.tree.itemExpanded.connect(on_item_expanded)
        self.tree.itemCollapsed.connect(on_item_collapsed)
        lib_layout.addWidget(self.tree)
        self.lib_tab.setLayout(lib_layout)
        
        self.tabs.addTab(self.live_tab, "Live")
        self.tabs.addTab(self.lib_tab, "Templates")
        
        # Put the search entry at the start of the tab row
        self.tabs.setCornerWidget(self.search_entry, Qt.TopLeftCorner)
        
        container_layout.addWidget(self.tabs)
        main_layout.addWidget(self.container)
        
        self.lib_data = self.load_library()
        self.populate_live(initial=True)
        self.populate_library()
        
        self.fetcher = WindowFetcher()
        self.fetcher.finished.connect(self.apply_active_windows)
        self.trigger_bg_check()
        
        self.installEventFilter(self)
        self.search_entry.installEventFilter(self)
        self.live_list.installEventFilter(self)
        self.tree.installEventFilter(self)
        
        self.force_focus_title = title_win
        QTimer.singleShot(50, self.force_focus)
        QTimer.singleShot(150, self.force_position)
        
        self.search_entry.setFocus()

    def force_position(self):
        try:
            x = self.screen_geom.width() - self.hud_width + 20
            cmd = f'wmctrl -F -r "{self.force_focus_title}" -e 0,{x},0,{self.hud_width},{self.height()}'
            subprocess.run(["bash", "-c", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except: pass

    def force_focus(self):
        try:
            cmd = f"kdotool search --name \"^{self.force_focus_title}$\" windowactivate && wmctrl -F -r \"{self.force_focus_title}\" -t -1"
            subprocess.run(["bash", "-c", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except: pass

    def trigger_bg_check(self):
        threading.Thread(target=self.fetcher.fetch_windows_bg, daemon=True).start()

    def apply_active_windows(self, new_indices):
        is_initial = not getattr(self, "_initial_sort_done", False)
        changed = False
        
        # ─── AUTO-EMPTY CLEANUP ───
        if not getattr(self, "_has_auto_cleaned", False):
            self._has_auto_cleaned = True
            for i, (uid, name) in enumerate(self.id_name_pairs):
                if uid == "ACTION_CHROME" or uid == self.current_desktop_uuid:
                    continue
                kwin_idx = i + 1
                name_l = name.lower()
                if kwin_idx not in new_indices and "empty" not in name_l:
                    raw_uuid = uid.split("___")[0] if "___" in uid else uid
                    cmd = f'qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "{raw_uuid}" "Empty"'
                    subprocess.run(["bash", "-c", cmd])
                    self.id_name_pairs[i] = (uid, "Empty")
                    changed = True

        if is_initial:
            self._initial_sort_done = True
            self.active_kwin_indices = new_indices
            self.populate_live(initial=True)
        elif self.active_kwin_indices != new_indices or changed:
            self.active_kwin_indices = new_indices
            self.populate_live(initial=False)
            
        QTimer.singleShot(1000, self.trigger_bg_check)

    def load_library(self):
        try:
            if LIBRARY_FILE.exists():
                with open(LIBRARY_FILE, "r") as f:
                    return json.load(f)
        except Exception: pass
        return {"folders": {}, "folder_order": [], "expanded": []}

    def save_library(self):
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            data = {"folders": {}, "folder_order": [], "expanded": []}
            root = self.tree.invisibleRootItem()
            if root is None: return
            
            for i in range(root.childCount()):
                folder_item = root.child(i)
                folder_name = folder_item.data(0, Qt.UserRole + 1)
                if folder_name is None: continue
                
                data["folder_order"].append(folder_name)
                
                tasks = []
                for j in range(folder_item.childCount()):
                    child = folder_item.child(j)
                    tid = child.data(0, Qt.UserRole)
                    tname = child.data(0, Qt.UserRole + 1)
                    script = child.data(0, Qt.UserRole + 2)
                    tasks.append({"id": tid, "name": tname, "script": script})
                
                data["folders"][folder_name] = tasks
                if folder_item.isExpanded():
                    data["expanded"].append(folder_name)
                    
            with open(LIBRARY_FILE, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving: {e}")



    def apply_live_styling(self, item, name, is_current, is_active):
        font = item.font()
        font.setBold(is_current)
        item.setFont(font)
        
        if is_current:
            item.setForeground(QColor("#ffffff"))
            item.setBackground(QColor(130, 170, 255, 30))
        else:
            item.setBackground(QBrush(Qt.NoBrush))
            if is_active:
                item.setForeground(QColor("#7aa2f7"))
            elif "empty" in name.lower() and len(name.strip()) <= 15:
                item.setForeground(QColor("#5c636a"))
            elif "(main)" in name.lower():
                item.setForeground(QColor("#89c4f4"))
            elif "(task)" in name.lower():
                item.setForeground(QColor("#f5b041"))
            else:
                item.setForeground(QColor("#c8d3f5"))

    def populate_live(self, initial=False):
        if initial:
            current_item = self.live_list.currentItem()
            selected_uid = current_item.data(Qt.UserRole) if current_item else None
            
            self.live_list.clear()
            
            def live_sort_key(pair):
                uid, name = pair[0], pair[1].lower()
                if uid == "ACTION_CHROME": return (4, 0)
                
                kidx_str = uid.split("___")[1] if "___" in uid else "0"
                kidx = int(kidx_str) if kidx_str.isdigit() else 0
                
                is_empty = "empty" in name and "desktop" not in name
                is_active = kidx in self.active_kwin_indices
                
                if is_active: weight = 1
                elif not is_empty: weight = 2
                else: weight = 3
                return (weight, kidx)
                
            self._sorted_pairs = sorted(self.id_name_pairs, key=live_sort_key)
            target_item_to_select = None
            
            for p in self._sorted_pairs:
                if p[0] == "ACTION_CHROME":
                    divider = QListWidgetItem("")
                    divider.setFlags(Qt.NoItemFlags)
                    divider.setBackground(QColor("#3b4261"))
                    divider.setSizeHint(QSize(0, 1))
                    self.live_list.addItem(divider)
                    
                uid, name = p[0], p[1]
                raw_uuid = uid.split("___")[0] if "___" in uid else uid
                is_current = (raw_uuid == self.current_desktop_uuid)
                kidx = int(uid.split("___")[1]) if "___" in uid else 0
                is_active = kidx in self.active_kwin_indices
                
                prefix = "▶ " if is_current else ("◉ " if is_active else "○ ")
                display = f"{prefix} {name}"
                
                item = QListWidgetItem(display)
                item.setData(Qt.UserRole, uid)
                self.apply_live_styling(item, name, is_current, is_active)
                self.live_list.addItem(item)
                
                if uid == selected_uid:
                    target_item_to_select = item
                    
            if target_item_to_select:
                self.live_list.setCurrentItem(target_item_to_select)
                
        else:
            # IN-PLACE STEADY UPDATE (No UI Jitter)
            for i in range(self.live_list.count()):
                item = self.live_list.item(i)
                uid = item.data(Qt.UserRole)
                if not uid or uid == "ACTION_CHROME": continue
                
                raw_uuid = uid.split("___")[0] if "___" in uid else uid
                kidx = int(uid.split("___")[1]) if "___" in uid else 0
                is_current = (raw_uuid == self.current_desktop_uuid)
                is_active = kidx in self.active_kwin_indices
                
                name = ""
                for p in self.id_name_pairs:
                    if p[0] == uid:
                        name = p[1]
                        break
                        
                prefix = "▶ " if is_current else ("◉ " if is_active else "○ ")
                display = f"{prefix} {name}"
                
                if item.text() != display:
                    item.setText(display)
                self.apply_live_styling(item, name, is_current, is_active)

    def populate_library(self):
        self.tree.clear()
        for folder_name in self.lib_data.get("folder_order", []):
            folder_item = QTreeWidgetItem()
            folder_item.setText(0, folder_name)
            folder_item.setIcon(0, QIcon.fromTheme("folder"))
            folder_item.setFont(0, QFont("Inter", 10, QFont.DemiBold))
            folder_item.setForeground(0, QBrush(QColor("#bb9af7")))
            folder_item.setData(0, Qt.UserRole, "FOLDER")
            folder_item.setData(0, Qt.UserRole + 1, folder_name)
            folder_item.setFlags(folder_item.flags() | Qt.ItemIsDropEnabled | Qt.ItemIsDragEnabled)
            self.tree.addTopLevelItem(folder_item)
            
            for task in self.lib_data.get("folders", {}).get(folder_name, []):
                titem = QTreeWidgetItem()
                tname = task.get("name", "Task")
                script = task.get("script", "")
                display = tname + (" 🔗" if script else "")
                titem.setText(0, display)
                titem.setIcon(0, QIcon.fromTheme("system-run") if script else QIcon.fromTheme("text-plain"))
                
                if "(main)" in tname.lower(): titem.setForeground(0, QBrush(QColor("#89c4f4")))
                elif "(task)" in tname.lower(): titem.setForeground(0, QBrush(QColor("#f5b041")))
                else: titem.setForeground(0, QBrush(QColor("#c8d3f5")))
                
                titem.setData(0, Qt.UserRole, task.get("id"))
                titem.setData(0, Qt.UserRole + 1, tname)
                titem.setData(0, Qt.UserRole + 2, script)
                titem.setFlags(titem.flags() | Qt.ItemIsDragEnabled)
                titem.setFlags(titem.flags() & ~Qt.ItemIsDropEnabled)
                folder_item.addChild(titem)
                
            if folder_name in self.lib_data.get("expanded", []):
                folder_item.setIcon(0, QIcon.fromTheme("folder-open"))
                folder_item.setExpanded(True)

    def on_search(self, text):
        query = text.lower()
        if self.tabs.currentIndex() == 0:
            for i in range(self.live_list.count()):
                item = self.live_list.item(i)
                item.setHidden(bool(query and query not in item.text().lower()))
        else:
            root = self.tree.invisibleRootItem()
            for i in range(root.childCount()):
                folder = root.child(i)
                any_visible = False
                for j in range(folder.childCount()):
                    child = folder.child(j)
                    tname = child.data(0, Qt.UserRole + 1)
                    matches = not query or query in tname.lower()
                    child.setHidden(not matches)
                    if matches: any_visible = True
                folder.setHidden(not any_visible)
                if any_visible: folder.setExpanded(True)

    def create_folder(self):
        name, ok = QInputDialog.getText(self, "New Folder", "Folder name:", text="")
        if ok and name.strip():
            folder_item = QTreeWidgetItem()
            folder_item.setText(0, name.strip())
            folder_item.setIcon(0, QIcon.fromTheme("folder"))
            folder_item.setFont(0, QFont("Inter", 10, QFont.DemiBold))
            folder_item.setForeground(0, QBrush(QColor("#bb9af7")))
            folder_item.setData(0, Qt.UserRole, "FOLDER")
            folder_item.setData(0, Qt.UserRole + 1, name.strip())
            folder_item.setFlags(folder_item.flags() | Qt.ItemIsDropEnabled | Qt.ItemIsDragEnabled)
            self.tree.addTopLevelItem(folder_item)
            folder_item.setExpanded(True)
            self.save_library()

    def on_live_item_clicked(self, item):
        uid = item.data(Qt.UserRole)
        print(f"SWITCH:{uid}", flush=True)
        sys.exit(0)

    def on_live_context_menu(self, pos):
        item = self.live_list.itemAt(pos)
        if not item: return
        uid = item.data(Qt.UserRole)
        
        menu = QMenu(self)
        menu.setStyleSheet("QMenu { background: #2f334d; color: #c8d3f5; border: 1px solid #3b4261; border-radius: 6px; } QMenu::item { padding: 6px 20px; } QMenu::item:selected { background: #82aaff; color: #1e2030; }")
        
        action_go = menu.addAction("🚀 Go")
        action_go.triggered.connect(lambda: sys.exit(print(f"SWITCH:{uid}") or 0))
        
        action_rename = menu.addAction("✏️ Rename")
        action_rename.triggered.connect(lambda: sys.exit(print(f"RENAME:{uid}") or 0))

        if uid == "ACTION_CHROME":
            return
            
        action_clear = menu.addAction("🧹 Clear to 'Empty' & Close Windows")
        action_clear.triggered.connect(lambda: sys.exit(print(f"CLEAR:{uid}") or 0))

        menu.addSeparator()
        
        menu.exec_(self.live_list.viewport().mapToGlobal(pos))

    def on_lib_context_menu(self, pos):
        item = self.tree.itemAt(pos)
        menu = QMenu(self)
        menu.setStyleSheet("QMenu { background: #2f334d; color: #c8d3f5; border: 1px solid #3b4261; border-radius: 6px; } QMenu::item { padding: 6px 20px; } QMenu::item:selected { background: #82aaff; color: #1e2030; }")
        
        if item is None:
            a = menu.addAction("New Folder")
            a.triggered.connect(self.create_folder)
        elif item.data(0, Qt.UserRole) == "FOLDER":
            fn = item.data(0, Qt.UserRole + 1)
            a_deploy = menu.addAction("🚀 Deploy Folder to Linux")
            a_deploy.triggered.connect(lambda: sys.exit(print(f"DEPLOY:{fn}") or 0))
            menu.addSeparator()
            a_add = menu.addAction("➕ Add App Desktop")
            a_add.triggered.connect(lambda: self.add_app_desktop(item))
            a_rename = menu.addAction("✏️ Rename Folder")
            a_rename.triggered.connect(lambda: self.rename_lib_item(item))
            a_del = menu.addAction("🗑 Delete Folder")
            a_del.triggered.connect(lambda: self.delete_lib_item(item))
        else:
            tid = item.data(0, Qt.UserRole)
            menu.addSeparator()
            a_link = menu.addAction("🔗 Link Startup Script")
            a_link.triggered.connect(lambda: self.link_script(item))
            a_rename = menu.addAction("✏️ Rename App Desktop")
            a_rename.triggered.connect(lambda: self.rename_lib_item(item))
            a_del = menu.addAction("🗑 Delete App Desktop")
            a_del.triggered.connect(lambda: self.delete_lib_item(item))
            
        menu.exec_(self.tree.viewport().mapToGlobal(pos))

    def add_app_desktop(self, folder_item):
        name, ok = QInputDialog.getText(self, "New App Desktop", "Task name:")
        if ok and name.strip():
            titem = QTreeWidgetItem()
            titem.setText(0, name.strip())
            titem.setIcon(0, QIcon.fromTheme("text-plain"))
            titem.setForeground(0, QBrush(QColor("#c8d3f5")))
            titem.setData(0, Qt.UserRole, str(uuid.uuid4()))
            titem.setData(0, Qt.UserRole + 1, name.strip())
            titem.setData(0, Qt.UserRole + 2, "")
            titem.setFlags(titem.flags() | Qt.ItemIsDragEnabled)
            titem.setFlags(titem.flags() & ~Qt.ItemIsDropEnabled)
            folder_item.addChild(titem)
            folder_item.setExpanded(True)
            self.save_library()

    def rename_lib_item(self, item):
        is_folder = item.data(0, Qt.UserRole) == "FOLDER"
        old_name = item.data(0, Qt.UserRole + 1)
        name, ok = QInputDialog.getText(self, "Rename", "New name:", text=old_name)
        if ok and name.strip():
            item.setData(0, Qt.UserRole + 1, name.strip())
            if is_folder:
                item.setText(0, name.strip())
                item.setIcon(0, QIcon.fromTheme("folder"))
            else:
                script = item.data(0, Qt.UserRole + 2)
                display = name.strip() + (" 🔗" if script else "")
                item.setText(0, display)
                item.setIcon(0, QIcon.fromTheme("system-run") if script else QIcon.fromTheme("text-plain"))
            self.save_library()

    def delete_lib_item(self, item):
        parent = item.parent()
        if parent:
            parent.removeChild(item)
        else:
            idx = self.tree.indexOfTopLevelItem(item)
            if idx >= 0: self.tree.takeTopLevelItem(idx)
        self.save_library()

    def link_script(self, item):
        dialog = QFileDialog(self)
        dialog.setWindowTitle("Select Startup Script")
        dialog.setDirectory(os.path.expanduser("~/.local/bin"))
        dialog.setFileMode(QFileDialog.ExistingFile)
        if dialog.exec_():
            file_path = dialog.selectedFiles()[0]
            cmd = f"bash '{file_path}'" if file_path.endswith('.sh') else f"'{file_path}'"
            item.setData(0, Qt.UserRole + 2, cmd)
            tname = item.data(0, Qt.UserRole + 1)
            item.setText(0, f"{tname} 🔗")
            item.setIcon(0, QIcon.fromTheme("system-run"))
            self.save_library()

    def move_up(self):
        if self.tabs.currentIndex() == 0:
            # Live System List
            row = self.live_list.currentRow()
            if row > 0:
                self.live_list.setCurrentRow(row - 1)
        else:
            # App Library Tree
            current = self.tree.currentItem()
            if current is None: return
            above = self.tree.itemAbove(current)
            while above and above.data(0, Qt.UserRole) == "FOLDER":
                above = self.tree.itemAbove(above)
            if above:
                self.tree.setCurrentItem(above)

    def move_down(self):
        if self.tabs.currentIndex() == 0:
            # Live System List
            row = self.live_list.currentRow()
            if row < self.live_list.count() - 1:
                self.live_list.setCurrentRow(row + 1 if row >= 0 else 0)
        else:
            # App Library Tree
            current = self.tree.currentItem()
            if current is None:
                root = self.tree.invisibleRootItem()
                if root.childCount() > 0:
                    folder = root.child(0)
                    if folder.childCount() > 0:
                        self.tree.setCurrentItem(folder.child(0))
                return
            below = self.tree.itemBelow(current)
            while below and below.data(0, Qt.UserRole) == "FOLDER":
                below = self.tree.itemBelow(below)
            if below:
                self.tree.setCurrentItem(below)
                
    def get_selected_uid(self):
        if self.tabs.currentIndex() == 0:
            item = self.live_list.currentItem()
            if item: return item.data(Qt.UserRole)
        else:
            item = self.tree.currentItem()
            if item and item.data(0, Qt.UserRole) != "FOLDER":
                return item.data(0, Qt.UserRole)
        return None

    def on_back(self):
        try:
            with open(HISTORY_FILE, 'r') as f:
                data = json.load(f)
            target_uuid = data.get("last_uuid")
            if not target_uuid or target_uuid == self.current_desktop_uuid:
                stack = data.get("stack", [])
                idx = data.get("index", -1)
                if idx > 0: target_uuid = stack[idx-1]
                elif len(stack) > 1: target_uuid = stack[1] if stack[0] == self.current_desktop_uuid else stack[0]
            
            if not target_uuid or target_uuid == self.current_desktop_uuid:
                for pair in self.id_name_pairs:
                    if pair[0] != self.current_desktop_uuid and "ACTION" not in pair[0]:
                        target_uuid = pair[0]
                        break

            if target_uuid and target_uuid != self.current_desktop_uuid:
                raw_uuid = target_uuid.split("___")[0]
                data["lock"] = True
                data["target"] = raw_uuid
                with open(HISTORY_FILE, 'w') as f: json.dump(data, f, indent=2)
                print(f"SWITCH_UUID:{raw_uuid}", flush=True)
                sys.exit(0)
        except Exception: pass

    def eventFilter(self, obj, event):
        if event.type() == QEvent.KeyPress:
            key = event.key()
            mod = event.modifiers()
            
            if mod == (Qt.ControlModifier | Qt.ShiftModifier):
                if key == Qt.Key_N:
                    if self.tabs.currentIndex() == 1:
                        self.create_folder()
                    return True
                    
            if mod == Qt.ControlModifier:
                if key == Qt.Key_R:
                    self.on_back()
                    return True
                elif key == Qt.Key_J:
                    self.move_down()
                    return True
                elif key == Qt.Key_K:
                    self.move_up()
                    return True
                elif key == Qt.Key_Slash:
                    uid = self.get_selected_uid()
                    if uid and self.tabs.currentIndex() == 0:
                        sys.exit(print(f"RENAME:{uid}") or 0)
                    return True
                elif key == Qt.Key_Y:
                    uid = self.get_selected_uid()
                    if uid and self.tabs.currentIndex() == 0:
                        sys.exit(print(f"CLEAR:{uid}") or 0)
                    return True
                elif key == Qt.Key_Backspace:
                    self.search_entry.clear()
                    return True
            
            if key == Qt.Key_Up:
                self.move_up()
                return True
            elif key == Qt.Key_Down:
                self.move_down()
                return True
            elif key == Qt.Key_Return:
                uid = self.get_selected_uid()
                if uid and self.tabs.currentIndex() == 0:
                    sys.exit(print(f"SWITCH:{uid}") or 0)
                return True
            elif key == Qt.Key_Escape:
                if self.search_entry.text(): self.search_entry.clear()
                else: sys.exit(0)
                return True
                
        return super().eventFilter(obj, event)

def main():
    title_win = "Menu"
    title_label = "Select:"
    current_desktop_uuid = None
    args = []
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--menu": title_label = sys.argv[i+1]; i+=2
        elif sys.argv[i] == "--title": title_win = sys.argv[i+1]; i+=2
        elif sys.argv[i] == "--current": current_desktop_uuid = sys.argv[i+1]; i+=2
        else: args.append(sys.argv[i]); i+=1
            
    id_name_pairs = []
    for i in range(0, len(args), 2):
        if i+1 < len(args): id_name_pairs.append((args[i], args[i+1]))

    app = QApplication(sys.argv)
    window = SwitcherMenu(title_win, title_label, current_desktop_uuid, id_name_pairs)
    window.show()
    window.search_entry.setFocus()
    sys.exit(app.exec_())

if __name__ == '__main__':
    main()
