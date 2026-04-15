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
                             QFileDialog, QTabWidget, QStyledItemDelegate,
                             QStyleOptionViewItem, QCheckBox)
from PyQt5.QtCore import Qt, QEvent, pyqtSignal, QObject, QTimer, QDir, QPropertyAnimation, QEasingCurve, QPoint, QRect, QSize, QCoreApplication
from PyQt5.QtGui import QFont, QColor, QBrush, QIcon, QPainter, QPen, QKeyEvent

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

class OutlineDelegate(QStyledItemDelegate):
    def paint(self, painter, option, index):
        # Draw the standard item first
        super().paint(painter, option, index)
        
        # Check if this item is the "Current" desktop
        is_current = index.data(Qt.UserRole + 4)
        if is_current:
            painter.save()
            painter.setRenderHint(QPainter.Antialiasing)
            
            # Use a clean 1px pen for the "outline"
            pen = QPen(QColor("#82aaff"), 1.0)
            painter.setPen(pen)
            
            # Adjust the rectangle to be perfectly inside the item bounds
            rect = option.rect.adjusted(2, 2, -2, -2)
            
            # Draw a rounded rectangle for a premium look
            painter.drawRoundedRect(rect, 4, 4)
            painter.restore()

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
            if hasattr(parent, 'save_tree_state'):
                parent.save_tree_state(self)
                return
            if hasattr(parent, 'save_library'):
                parent.save_library()
                return
            parent = parent.parent()

class SelectionDialog(QDialog):
    def __init__(self, title, items, parent=None):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.setMinimumWidth(300)
        self.setMinimumHeight(400)
        self.setStyleSheet("QDialog { background-color: #1e2030; color: #c8d3f5; }")
        
        layout = QVBoxLayout(self)
        self.label = QLabel("Select tasks to deploy to Life:")
        self.label.setFont(QFont("Inter", 11, QFont.Bold))
        self.label.setStyleSheet("color: #82aaff; margin-bottom: 5px;")
        layout.addWidget(self.label)
        
        self.select_all_cb = QCheckBox("Select All")
        self.select_all_cb.setStyleSheet("""
            QCheckBox { color: #c8d3f5; font-size: 10pt; margin-bottom: 5px; }
            QCheckBox::indicator { width: 16px; height: 16px; border: 1px solid #3b4261; border-radius: 3px; background: #222436; }
            QCheckBox::indicator:checked { background: #82aaff; image: url(none); }
        """)
        self.select_all_cb.stateChanged.connect(self.on_select_all_changed)
        layout.addWidget(self.select_all_cb)
        
        self.list_widget = QListWidget()
        self.list_widget.setStyleSheet("""
            QListWidget { background-color: #222436; color: #c8d3f5; border: 1px solid #3b4261; border-radius: 4px; padding: 5px; }
            QListWidget::item { padding: 5px; }
            QListWidget::item:hover { background-color: #2f334d; }
        """)
        
        for item_text in items:
            list_item = QListWidgetItem(item_text)
            list_item.setFlags(list_item.flags() | Qt.ItemIsUserCheckable)
            list_item.setCheckState(Qt.Unchecked)
            self.list_widget.addItem(list_item)
            
        layout.addWidget(self.list_widget)
        
        btn_layout = QHBoxLayout()
        self.btn_ok = QPushButton("Deploy Selected")
        self.btn_ok.setStyleSheet("QPushButton { background-color: #82aaff; color: #1e2030; font-weight: bold; padding: 8px; border-radius: 4px; } QPushButton:hover { background-color: #6593f5; }")
        self.btn_ok.clicked.connect(self.accept)
        
        self.btn_cancel = QPushButton("Cancel")
        self.btn_cancel.setStyleSheet("QPushButton { background-color: #3b4261; color: #c8d3f5; padding: 8px; border-radius: 4px; } QPushButton:hover { background-color: #444b6a; }")
        self.btn_cancel.clicked.connect(self.reject)
        
        btn_layout.addWidget(self.btn_ok)
        btn_layout.addWidget(self.btn_cancel)
        layout.addLayout(btn_layout)

    def on_select_all_changed(self, state):
        for i in range(self.list_widget.count()):
            item = self.list_widget.item(i)
            item.setCheckState(Qt.Checked if state == Qt.Checked else Qt.Unchecked)

    def get_selected(self):
        selected = []
        for i in range(self.list_widget.count()):
            item = self.list_widget.item(i)
            if item.checkState() == Qt.Checked:
                selected.append(item.text())
        return selected

class SwitcherMenu(QWidget):
    def __init__(self, title_win, title_label, current_desktop_uuid, id_name_pairs):
        super().__init__()
        self.setWindowTitle(title_win)
        self.id_name_pairs = id_name_pairs
        self.current_desktop_uuid = current_desktop_uuid
        self.active_kwin_indices = set()
        self.managed_uids = set()
        self.pinned_folders = []
        self._is_populating = False
        
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        
        self.screen_geom = QApplication.primaryScreen().geometry()
        self.hud_width = 400 
        self.height_expanded = 500
        self.height_collapsed = 420
        
        self.setMinimumSize(320, 300)
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
        self.container.setObjectName("container")
        self.container.setStyleSheet("#container { background-color: rgba(30,32,48,0.92); border-radius: 10px; border: 1px solid #3b4261; }")
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
        self.search_entry.setFixedWidth(140)
        
        # Add Search Icon
        search_icon = QIcon.fromTheme("edit-find")
        self.search_entry.addAction(search_icon, QLineEdit.LeadingPosition)
        
        self.search_entry.setStyleSheet("""
            QLineEdit { 
                background-color: #222436; 
                color: #c8d3f5; 
                border: none; 
                border-radius: 12px; 
                padding: 4px 6px; 
                margin: 4px 4px 4px 8px;
                outline: none;
            } 
            QLineEdit:focus { 
                background-color: #1e2030; 
            }
        """)
        self.search_entry.textChanged.connect(self.on_search)
        # Search box is moved to corner widget of tabs below

        
        # Tabs
        self.tabs = QTabWidget()
        self.tabs.setDocumentMode(True)
        self.tabs.tabBar().setExpanding(True)
        self.tabs.setStyleSheet("""
            QTabWidget::pane { 
                border-top: 1px solid #3b4261; 
                background: transparent;
            }
            QTabBar::tab { 
                background: transparent; 
                color: #5c636a; 
                padding: 10px 12px; 
                margin-top: 4px;
                border-bottom: 2px solid transparent;
            }
            QTabBar::tab:selected { 
                color: #82aaff; 
                font-weight: bold; 
                border-bottom: 2px solid #82aaff; 
            }
            QTabBar::tab:hover { 
                color: #c8d3f5;
                background: rgba(130, 170, 255, 0.05);
            }
        """)
        # The UI layout has been simplified to remove the bottom button rail entirely.
        
        # Live System Tab
        self.live_tab = QWidget()
        live_layout = QVBoxLayout()
        live_layout.setContentsMargins(0,0,0,0)
        self.live_list = FolderTreeWidget(self)
        self.live_list.setHeaderHidden(True)
        self.live_list.setColumnCount(2)
        self.live_list.hideColumn(1)
        self.live_list.setFont(QFont("Inter", 10))
        self.live_list.setItemDelegate(OutlineDelegate(self.live_list))
        self.live_list.setDragEnabled(True)
        self.live_list.setAcceptDrops(True)
        self.live_list.setDragDropMode(QAbstractItemView.InternalMove)
        self.live_list.setDefaultDropAction(Qt.MoveAction)
        self.live_list.setIndentation(15)
        self.live_list.setRootIsDecorated(False)
        self.live_list.setStyleSheet("""
            QTreeWidget { background-color: #1e2030; color: #c8d3f5; border: none; padding: 2px 0px; outline: none; show-decoration-selected: 1; } 
            QTreeWidget::branch { background-color: #1e2030; }
            QTreeWidget::item { padding: 4px 2px; border-radius: 4px; margin: 0px; } 
            QTreeWidget::item:hover { background-color: rgba(47, 51, 77, 0.7); } 
            QTreeWidget::item:selected { background-color: rgba(130, 170, 255, 0.85); color: #1e2030; }
            QScrollBar:vertical { background: transparent; width: 6px; border-radius: 3px; margin: 4px 0; }
            QScrollBar::handle:vertical { background: #3b4261; border-radius: 3px; min-height: 30px; }
            QScrollBar::handle:vertical:hover { background: #5a4a78; }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }
        """)
        self.live_list.itemClicked.connect(self.on_live_item_clicked)
        self.live_list.setContextMenuPolicy(Qt.CustomContextMenu)
        self.live_list.customContextMenuRequested.connect(self.on_live_context_menu)
        
        def on_live_expanded(item):
            if getattr(self, "_is_populating", False): return
            if item.data(0, Qt.UserRole) == "FOLDER":
                item.setIcon(0, QIcon.fromTheme("folder-open"))
            self.save_session()
            
        def on_live_collapsed(item):
            if getattr(self, "_is_populating", False): return
            if item.data(0, Qt.UserRole) == "FOLDER":
                item.setIcon(0, QIcon.fromTheme("folder"))
            self.save_session()
            
        self.live_list.itemExpanded.connect(on_live_expanded)
        self.live_list.itemCollapsed.connect(on_live_collapsed)
        
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
            QTreeWidget { background-color: #1e2030; color: #c8d3f5; border: none; padding: 2px 0px; outline: none; show-decoration-selected: 1; } 
            QTreeWidget::branch { background-color: #1e2030; }
            QTreeWidget::item { padding: 4px 2px; border-radius: 4px; margin: 0px; } 
            QTreeWidget::item:hover { background-color: rgba(47, 51, 77, 0.7); } 
            QTreeWidget::item:selected { background-color: rgba(130, 170, 255, 0.85); color: #1e2030; }
            QScrollBar:vertical { background: transparent; width: 6px; border-radius: 3px; margin: 4px 0; }
            QScrollBar::handle:vertical { background: #3b4261; border-radius: 3px; min-height: 30px; }
            QScrollBar::handle:vertical:hover { background: #5a4a78; }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }
        """)
        self.tree.setRootIsDecorated(False)
        self.tree.setIndentation(15)
        self.tree.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tree.customContextMenuRequested.connect(self.on_lib_context_menu)
        
        def on_item_expanded(item):
            if getattr(self, "_is_populating", False): return
            if item.data(0, Qt.UserRole) == "FOLDER":
                item.setIcon(0, QIcon.fromTheme("folder-open"))
            self.save_library()
            
        def on_item_collapsed(item):
            if getattr(self, "_is_populating", False): return
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
        
        self.status_label = QLabel("Active: - • Empty: -")
        self.status_label.setStyleSheet("QLabel { color: #82aaff; font-family: 'Inter'; font-size: 11px; margin-top: 4px; margin-bottom: 2px; }")
        self.status_label.setAlignment(Qt.AlignCenter)
        main_layout.addWidget(self.status_label)
        
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
        
        if is_initial:
            self._initial_sort_done = True
            self.active_kwin_indices = new_indices
            self.populate_live(initial=True)

            # ─── AUTO-EMPTY CLEANUP (Runs once after initial population) ───
            if not getattr(self, "_has_auto_cleaned", False):
                self._has_auto_cleaned = True
                for uid, name in self.id_name_pairs:
                    if uid == "ACTION_CHROME" or uid == self.current_desktop_uuid:
                        continue
                    
                    # Protect desktops that belong to an organized folder (not root)
                    if uid in self.managed_uids:
                        continue
                        
                    parts = uid.split("___")
                    if len(parts) < 2: continue
                    kwin_idx = int(parts[1]) + 1
                    
                    name_l = name.lower()
                    if kwin_idx not in new_indices and "empty" not in name_l:
                        raw_uuid = parts[0]
                        cmd = f'qdbus-qt6 org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.setDesktopName "{raw_uuid}" "Empty"'
                        subprocess.run(["bash", "-c", cmd])
                        
                        for idx, (ouid, oname) in enumerate(self.id_name_pairs):
                            if ouid == uid:
                                self.id_name_pairs[idx] = (uid, "Empty")
                                break
                        changed = True
        else:
            self.active_kwin_indices = new_indices
            self.populate_live(initial=False)
        
        if not is_initial:
            self.update_live_sort_keys()
            self.live_list.sortItems(1, Qt.AscendingOrder)
            
        # Update Live Activity Indicator
        physical_desktops = [p for p in self.id_name_pairs if "___" in p[0]]
        active_count = 0
        for uid, name in physical_desktops:
            kwin_idx = int(uid.split("___")[1]) + 1
            if kwin_idx in self.active_kwin_indices:
                active_count += 1
        
        empty_count = len(physical_desktops) - active_count
        self.status_label.setText(f"Active: {active_count} • Empty: {empty_count}")
        self.tabs.setTabText(0, f"Live ({active_count})")
            
        QTimer.singleShot(1000, self.trigger_bg_check)

    def load_library(self):
        try:
            if LIBRARY_FILE.exists():
                with open(LIBRARY_FILE, "r") as f:
                    return json.load(f)
        except Exception: pass
        return {"folders": {}, "folder_order": [], "expanded": []}

    def save_library(self):
        if self._is_populating: return
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            data = {"folders": {}, "folder_order": [], "expanded": []}
            root = self.tree.invisibleRootItem()
            if root is None: return
            
            seen_names = set()
            for i in range(root.childCount()):
                folder_item = root.child(i)
                folder_name = folder_item.data(0, Qt.UserRole + 1)
                if folder_name is None: continue
                
                # Enforce Unique Names to prevent key collisions in the JSON
                original_name = folder_name
                count = 1
                while folder_name in seen_names:
                    folder_name = f"{original_name} ({count})"
                    count += 1
                seen_names.add(folder_name)
                
                if folder_name != original_name:
                    folder_item.setData(0, Qt.UserRole + 1, folder_name)
                    folder_item.setText(0, folder_name) # Reflect the change in UI
                
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

    def save_session(self):
        if self._is_populating: return
        try:
            CONFIG_DIR.mkdir(parents=True, exist_ok=True)
            
            # Load existing session data to preserve startup_apps and other fields
            session_data = {}
            if SESSION_FILE.exists():
                with open(SESSION_FILE, "r") as f:
                    try:
                        session_data = json.load(f)
                    except: pass
            
            # Update only the grouping and expansion state
            session_data["folders"] = {}
            session_data["folder_order"] = []
            session_data["expanded"] = []
            session_data["pinned_folders"] = self.pinned_folders
            
            root = self.live_list.invisibleRootItem()
            if root is None: return
            
            for i in range(root.childCount()):
                folder_item = root.child(i)
                if folder_item.data(0, Qt.UserRole) != "FOLDER":
                    continue
                
                folder_name = folder_item.data(0, Qt.UserRole + 1) or folder_item.text(0)
                session_data["folder_order"].append(folder_name)
                
                uids = []
                for j in range(folder_item.childCount()):
                    child = folder_item.child(j)
                    uid = child.data(0, Qt.UserRole)
                    if uid and uid != "FOLDER":
                        uids.append(uid)
                
                session_data["folders"][folder_name] = uids
                if folder_item.isExpanded():
                    session_data["expanded"].append(folder_name)
                    
            with open(SESSION_FILE, "w") as f:
                json.dump(session_data, f, indent=2)
        except Exception as e:
            print(f"Error saving session: {e}")

    def save_tree_state(self, widget):
        if widget == self.tree:
            self.save_library()
        elif widget == self.live_list:
            self.save_session()



    def apply_live_styling(self, item, name, is_current, is_active):
        font = item.font(0)
        font.setBold(is_current)
        item.setFont(0, font)
        
        # Color logic (current desktop now uses standard colors but remains bold)
        item.setBackground(0, QBrush(Qt.NoBrush))
        item.setData(0, Qt.UserRole + 4, is_current) # For OutlineDelegate
        
        if is_active:
            item.setForeground(0, QColor("#7aa2f7"))
        elif "empty" in name.lower() and len(name.strip()) <= 15:
            item.setForeground(0, QColor("#5c636a"))
        else:
            item.setForeground(0, QColor("#c8d3f5"))

    def populate_live(self, initial=False):
        self._is_populating = True
        try:
            if initial:
                self.live_list.clear()
                
                # Load session data for groupings
                session_data = {}
                try:
                    if SESSION_FILE.exists():
                        with open(SESSION_FILE, "r") as f:
                            session_data = json.load(f)
                except: pass
                
                live_folders = session_data.get("folders", {})
                folder_order = session_data.get("folder_order", [])
                self.pinned_folders = session_data.get("pinned_folders", [])
                
                # Re-sort: Pinned first (excluding root), then others, root always last
                others = [f for f in folder_order if f not in self.pinned_folders and f.lower() != "root"]
                top = [f for f in folder_order if f in self.pinned_folders and f.lower() != "root"]
                reordered = top + others
                
                # Find root with original casing
                root_orig = next((f for f in folder_order if f.lower() == "root"), None)
                if root_orig:
                    reordered.append(root_orig)
                
                folder_order = reordered
                    
                expanded_folders = session_data.get("expanded", [])
                
                # Track which desktops are already assigned to a folder (to avoid root duplicates)
                self.managed_uids.clear()
                assigned_uids = set()
                root_folder_item = None
                
                # 1. Create Folders from Session Data
                for folder_name in folder_order:
                    if folder_name not in live_folders: continue
                    member_uids = live_folders[folder_name]
                    if not member_uids: continue
                    
                    fitem = QTreeWidgetItem()
                    display_name = folder_name + (" 📌" if folder_name in self.pinned_folders else "")
                    fitem.setText(0, display_name)
                    fitem.setData(0, Qt.UserRole + 1, folder_name)
                    is_expanded = folder_name in expanded_folders or "expanded" not in session_data
                    fitem.setIcon(0, QIcon.fromTheme("folder-open" if is_expanded else "folder"))
                    fitem.setFont(0, QFont("Inter", 10, QFont.DemiBold))
                    fitem.setForeground(0, QBrush(QColor("#bb9af7")))
                    fitem.setData(0, Qt.UserRole, "FOLDER")
                    self.live_list.addTopLevelItem(fitem)
                    fitem.setExpanded(is_expanded)
                    
                    if folder_name.lower() == "root":
                        root_folder_item = fitem
                    
                    folder_seen = set()
                    for uid in member_uids:
                        if uid == "ACTION_CHROME" or uid in assigned_uids: continue
                        # Find matching physical desktop
                        name = next((p[1] for p in self.id_name_pairs if p[0] == uid), None)
                        if name is not None:
                            self.add_live_desktop_item(fitem, uid, name)
                            assigned_uids.add(uid)
                            folder_seen.add(uid)
                            if folder_name.lower() != "root":
                                self.managed_uids.add(uid)
                
                # 2. Add unfiled desktops at root (Move Empty ones to 'root' folder)
                for uid, name in self.id_name_pairs:
                    if uid == "ACTION_CHROME" or uid in assigned_uids:
                        continue
                    
                    if "empty" in name.lower():
                        if not root_folder_item:
                            root_folder_item = QTreeWidgetItem()
                            root_folder_item.setText(0, "root")
                            is_root_expanded = "root" in expanded_folders or "expanded" not in session_data
                            root_folder_item.setIcon(0, QIcon.fromTheme("folder-open" if is_root_expanded else "folder"))
                            root_folder_item.setFont(0, QFont("Inter", 10, QFont.DemiBold))
                            root_folder_item.setForeground(0, QBrush(QColor("#bb9af7")))
                            root_folder_item.setData(0, Qt.UserRole, "FOLDER")
                            self.live_list.addTopLevelItem(root_folder_item)
                            root_folder_item.setExpanded(is_root_expanded)
                        
                        self.add_live_desktop_item(root_folder_item, uid, name)
                    else:
                        self.add_live_desktop_item(None, uid, name)
                    
                # 3. Add Chrome Profile at bottom
                for uid, name in self.id_name_pairs:
                    if uid == "ACTION_CHROME":
                        display_name = name if "🌐" in name else f"🌐 {name}"
                        item = QTreeWidgetItem([f"  {display_name}"])
                        item.setData(0, Qt.UserRole, uid)
                        item.setForeground(0, QColor("#c8d3f5"))
                        self.live_list.addTopLevelItem(item)
                
                self.update_live_sort_keys()
                self.live_list.sortItems(1, Qt.AscendingOrder)
            else:
                # Steady Update
                root = self.live_list.invisibleRootItem()
                self.update_tree_items_recursive(root)
        finally:
            self._is_populating = False

    def update_live_sort_keys(self):
        root = self.live_list.invisibleRootItem()
        if not root: return
        
        # 1. Update Items Status
        for i in range(root.childCount()):
            item = root.child(i)
            uid = item.data(0, Qt.UserRole)
            
            if uid == "FOLDER":
                raw_name = item.data(0, Qt.UserRole + 1) or item.text(0).strip().replace(" 📌", "")
                folder_name = raw_name.lower()
                all_active = True
                has_members = False
                for j in range(item.childCount()):
                    has_members = True
                    child = item.child(j)
                    cuid = child.data(0, Qt.UserRole)
                    if cuid:
                        kidx = int(cuid.split("___")[1]) if "___" in cuid else 0
                        if (kidx + 1) not in self.active_kwin_indices:
                            all_active = False
                            break
                
                if folder_name == "root":
                    # Rule 4: Root Folder (Sink)
                    item.setText(1, f"08_root")
                else:
                    # New Priority Heirarchy:
                    # 00 = Pinned, 05 = Normal
                    prio = "00" if raw_name in self.pinned_folders else "05"
                    status_group = "00" if (all_active and has_members) else "01"
                    item.setText(1, f"{prio}_{status_group}_{raw_name}")
                
                # Sort children within folder
                for j in range(item.childCount()):
                    child = item.child(j)
                    cuid = child.data(0, Qt.UserRole)
                    if cuid:
                        kidx = int(cuid.split("___")[1]) if "___" in cuid else 0
                        is_active = (kidx + 1) in self.active_kwin_indices
                        group = "0" if is_active else "1"
                        child.setText(1, f"I_{group}_{child.text(0)}")
            elif uid == "ACTION_CHROME":
                # Rule 6: Always at bottom
                item.setText(1, f"09_chrome")
            else:
                # Rule 3rd & 5th: Unfiled desktops
                kidx = int(uid.split("___")[1]) if "___" in uid else 0
                is_active = (kidx + 1) in self.active_kwin_indices
                # Group 06 = Active Unfiled, Group 07 = Inactive Unfiled
                group = "06" if is_active else "07"
                item.setText(1, f"{group}_{item.text(0)}")
    def add_live_desktop_item(self, parent, uid, name):
        raw_uuid = uid.split("___")[0] if "___" in uid else uid
        is_current = (raw_uuid == self.current_desktop_uuid)
        kidx = int(uid.split("___")[1]) if "___" in uid else 0
        is_active = (kidx + 1) in self.active_kwin_indices
        
        # Standard indicators (no more play button prefix)
        prefix = "◉ " if is_active else "○ "
        display = f"{prefix}{name}"
        
        item = QTreeWidgetItem([display])
        item.setData(0, Qt.UserRole, uid)
        self.apply_live_styling(item, name, is_current, is_active)
        
        if parent:
            parent.addChild(item)
        else:
            self.live_list.addTopLevelItem(item)

    def update_tree_items_recursive(self, parent_item):
        for i in range(parent_item.childCount()):
            item = parent_item.child(i)
            uid = item.data(0, Qt.UserRole)
            
            if uid and uid != "FOLDER" and uid != "ACTION_CHROME":
                raw_uuid = uid.split("___")[0] if "___" in uid else uid
                kidx = int(uid.split("___")[1]) if "___" in uid else 0
                is_current = (raw_uuid == self.current_desktop_uuid)
                is_active = (kidx + 1) in self.active_kwin_indices
                
                name = ""
                for p in self.id_name_pairs:
                    if p[0] == uid:
                        name = p[1]
                        break
                        
                prefix = "◉ " if is_current or is_active else "○ "
                display = f"{prefix}{name}"
                
                if item.text(0) != display:
                    item.setText(0, display)
                self.apply_live_styling(item, name, is_current, is_active)
            
            if item.childCount() > 0:
                self.update_tree_items_recursive(item)

    def populate_library(self):
        self._is_populating = True
        try:
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
        finally:
            self._is_populating = False

    def on_search(self, text):
        query = text.lower()
        first_item = None
        if self.tabs.currentIndex() == 0:
            root = self.live_list.invisibleRootItem()
            if not root: return
            for i in range(root.childCount()):
                item = root.child(i)
                if item.data(0, Qt.UserRole) == "FOLDER":
                    folder_matches = not query or query in item.text(0).lower()
                    any_child_match = False
                    for j in range(item.childCount()):
                        child = item.child(j)
                        matches = not query or query in child.text(0).lower()
                        
                        # Show child if either it matches OR its parent folder matches
                        child.setHidden(not (matches or folder_matches))
                        
                        if matches or folder_matches: 
                            any_child_match = True
                            if not first_item: first_item = child
                    
                    item.setHidden(not (folder_matches or any_child_match))
                    if (folder_matches or any_child_match) and query: item.setExpanded(True)
                else:
                    matches = not query or query in item.text(0).lower()
                    item.setHidden(not matches)
                    if matches and not first_item: first_item = item
            
            if first_item:
                self.live_list.setCurrentItem(first_item)
                first_item.setSelected(True)
            elif not query:
                self.live_list.clearSelection()
        else:
            root = self.tree.invisibleRootItem()
            if not root: return
            for i in range(root.childCount()):
                folder = root.child(i)
                folder_matches = not query or query in folder.text(0).lower()
                any_visible = False
                for j in range(folder.childCount()):
                    child = folder.child(j)
                    tname = child.data(0, Qt.UserRole + 1)
                    matches = not query or query in str(tname).lower()
                    
                    # Show child if it matches OR if folder matches
                    child.setHidden(not (matches or folder_matches))
                    
                    if matches or folder_matches: 
                        any_visible = True
                        if not first_item: first_item = child
                
                folder.setHidden(not (folder_matches or any_visible))
                if (folder_matches or any_visible) and query: folder.setExpanded(True)
            
            if first_item:
                self.tree.setCurrentItem(first_item)
                first_item.setSelected(True)
            elif not query:
                self.tree.clearSelection()

    def create_folder(self):
        name, ok = QInputDialog.getText(self, "New Folder", "Folder name:", text="")
        if ok and name.strip():
            folder_name = name.strip()
            
            # Prevent immediate duplicate creation
            existing = [self.tree.topLevelItem(i).data(0, Qt.UserRole + 1) for i in range(self.tree.topLevelItemCount())]
            if folder_name in existing:
                orig = folder_name
                c = 1
                while folder_name in existing:
                    folder_name = f"{orig} ({c})"
                    c += 1

            folder_item = QTreeWidgetItem()
            folder_item.setText(0, folder_name)
            folder_item.setIcon(0, QIcon.fromTheme("folder"))
            folder_item.setFont(0, QFont("Inter", 10, QFont.DemiBold))
            folder_item.setForeground(0, QBrush(QColor("#bb9af7")))
            folder_item.setData(0, Qt.UserRole, "FOLDER")
            folder_item.setData(0, Qt.UserRole + 1, name.strip())
            folder_item.setFlags(folder_item.flags() | Qt.ItemIsDropEnabled | Qt.ItemIsDragEnabled)
            self.tree.addTopLevelItem(folder_item)
            folder_item.setExpanded(True)
            self.save_library()

    def import_folder(self):
        default_dir = os.path.expanduser("~/.local/bin")
        folder_path = QFileDialog.getExistingDirectory(self, "Select Folder to Import", default_dir)
        if not folder_path:
            return
        
        dir_path = Path(folder_path)
        folder_name = dir_path.name
        
        # Prevent immediate duplicate creation
        existing = [self.tree.topLevelItem(i).data(0, Qt.UserRole + 1) for i in range(self.tree.topLevelItemCount())]
        if folder_name in existing:
            orig = folder_name
            c = 1
            while folder_name in existing:
                folder_name = f"{orig} ({c})"
                c += 1

        # Create folder item
        folder_item = QTreeWidgetItem()
        folder_item.setText(0, folder_name)
        folder_item.setIcon(0, QIcon.fromTheme("folder"))
        folder_item.setFont(0, QFont("Inter", 10, QFont.DemiBold))
        folder_item.setForeground(0, QBrush(QColor("#bb9af7")))
        folder_item.setData(0, Qt.UserRole, "FOLDER")
        folder_item.setData(0, Qt.UserRole + 1, folder_name)
        folder_item.setFlags(folder_item.flags() | Qt.ItemIsDropEnabled | Qt.ItemIsDragEnabled)
        self.tree.addTopLevelItem(folder_item)
        folder_item.setExpanded(True)
        
        # Scan for scripts
        files = sorted(list(dir_path.iterdir()))
        for file in files:
            if file.is_file():
                is_script = file.suffix == '.sh'
                is_exec = os.access(file, os.X_OK)
                if is_script or is_exec:
                    titem = QTreeWidgetItem()
                    tname = file.stem if file.suffix == '.sh' else file.name
                    titem.setText(0, tname + " 🔗")
                    titem.setIcon(0, QIcon.fromTheme("system-run"))
                    titem.setForeground(0, QBrush(QColor("#c8d3f5")))
                    titem.setData(0, Qt.UserRole, str(uuid.uuid4()))
                    titem.setData(0, Qt.UserRole + 1, tname)
                    cmd = f"bash '{file.absolute()}'" if is_script else f"'{file.absolute()}'"
                    titem.setData(0, Qt.UserRole + 2, cmd)
                    titem.setFlags(titem.flags() | Qt.ItemIsDragEnabled)
                    titem.setFlags(titem.flags() & ~Qt.ItemIsDropEnabled)
                    folder_item.addChild(titem)
        
        self.save_library()

    def on_live_item_clicked(self, item):
        uid = item.data(0, Qt.UserRole)
        if uid == "FOLDER":
            item.setExpanded(not item.isExpanded())
            return
        if uid:
            print(f"SWITCH:{uid}", flush=True)
            sys.exit(0)

    def on_live_context_menu(self, pos):
        item = self.live_list.itemAt(pos)
        if not item: return
        uid = item.data(0, Qt.UserRole)
        
        menu = QMenu(self)
        menu.installEventFilter(self)
        menu.setStyleSheet("QMenu { background: #2f334d; color: #c8d3f5; border: 1px solid #3b4261; border-radius: 6px; } QMenu::item { padding: 6px 20px; } QMenu::item:selected { background: #82aaff; color: #1e2030; }")
        
        if uid == "FOLDER":
            fn = item.data(0, Qt.UserRole + 1) or item.text(0).strip()
            
            is_pinned = fn in self.pinned_folders
            if is_pinned:
                a_pin = menu.addAction("📍 Unpin Folder")
                a_pin.triggered.connect(lambda: self.toggle_pin(fn))
            else:
                a_pin = menu.addAction("📌 Pin Folder")
                a_pin.triggered.connect(lambda: self.toggle_pin(fn))
            
            menu.addSeparator()
            a_summon = menu.addAction("🚀 Summon Folder")
            a_summon.triggered.connect(lambda: sys.exit(print(f"SUMMON_FOLDER:{fn}", flush=True) or 0))
            
            a_ungroup = menu.addAction("🗑 Remove Folder Grouping")
            a_ungroup.triggered.connect(lambda: sys.exit(print(f"REMOVE_LIVE_FOLDER:{fn}", flush=True) or 0))
            menu.exec_(self.live_list.viewport().mapToGlobal(pos))
            return

        if uid == "ACTION_CHROME":
            action_go = menu.addAction("🚀 Go")
            action_go.triggered.connect(lambda: sys.exit(print(f"SWITCH:{uid}") or 0))
            menu.exec_(self.live_list.viewport().mapToGlobal(pos))
            return
            
        # 1. Rename
        action_rename = menu.addAction("✏️ Rename")
        action_rename.triggered.connect(lambda: sys.exit(print(f"RENAME:{uid}") or 0))

        # 2. Ungroup (if applicable)
        if item.parent() and item.parent().data(0, Qt.UserRole) == "FOLDER":
            folder_name = item.parent().text(0).strip()
            action_ungroup = menu.addAction("🔓 Remove from Group")
            action_ungroup.triggered.connect(lambda: sys.exit(print(f"UNGROUP_DESKTOP:{folder_name}:{uid}") or 0))
        
        # 3. Summon
        action_summon = menu.addAction("🚀 Summon Desktop")
        action_summon.triggered.connect(lambda: sys.exit(print(f"SUMMON:{uid}", flush=True) or 0))
        
        # 4. Close Windows
        action_close = menu.addAction("🧹 Close Windows")
        action_close.triggered.connect(lambda: sys.exit(print(f"CLOSE_WINDOWS:{uid}", flush=True) or 0))

        menu.addSeparator()

        # 5. Go
        action_go = menu.addAction("🚀 Go")
        action_go.triggered.connect(lambda: sys.exit(print(f"SWITCH:{uid}", flush=True) or 0))

        menu.exec_(self.live_list.viewport().mapToGlobal(pos))

    def on_lib_context_menu(self, pos):
        item = self.tree.itemAt(pos)
        menu = QMenu(self)
        menu.installEventFilter(self)
        menu.setStyleSheet("QMenu { background: #2f334d; color: #c8d3f5; border: 1px solid #3b4261; border-radius: 6px; } QMenu::item { padding: 6px 20px; } QMenu::item:selected { background: #82aaff; color: #1e2030; }")
        
        if item is None:
            a = menu.addAction("New Folder")
            a.triggered.connect(self.create_folder)
            a_imp = menu.addAction("📂 Import Folder from Computer")
            a_imp.triggered.connect(self.import_folder)
        elif item.data(0, Qt.UserRole) == "FOLDER":
            fn = item.data(0, Qt.UserRole + 1)
            
            deploy_menu = menu.addMenu("🚀 Deploy to Live")
            deploy_menu.setStyleSheet("QMenu { background: #2f334d; color: #c8d3f5; border: 1px solid #3b4261; border-radius: 6px; } QMenu::item { padding: 6px 20px; } QMenu::item:selected { background: #82aaff; color: #1e2030; }")
            
            a_deploy_all = deploy_menu.addAction("🚀 Deploy All tasks")
            a_deploy_all.triggered.connect(lambda: sys.exit(print(f"DEPLOY_ALL:{fn}") or 0))
            
            a_deploy_sel = deploy_menu.addAction("✅ Select Tasks to Deploy...")
            a_deploy_sel.triggered.connect(lambda: self.deploy_selected(item))
            
            menu.addSeparator()
            a_add = menu.addAction("➕ Add App Desktop")
            a_add.triggered.connect(lambda: self.add_app_desktop(item))
            a_rename = menu.addAction("✏️ Rename Folder")
            a_rename.triggered.connect(lambda: self.rename_lib_item(item))
            a_del = menu.addAction("🗑 Delete Folder")
            a_del.triggered.connect(lambda: self.delete_lib_item(item))
        else:
            tid = item.data(0, Qt.UserRole)
            parent = item.parent()
            folder_name = parent.data(0, Qt.UserRole + 1) if parent else ""
            
            a_deploy = menu.addAction("🚀 Deploy Single Desktop")
            a_deploy.triggered.connect(lambda: sys.exit(print(f"DEPLOY_TASK:{folder_name}:{tid}", flush=True) or 0))
            
            menu.addSeparator()
            a_link = menu.addAction("🔗 Link Startup Script")
            a_link.triggered.connect(lambda: self.link_script(item))
            a_rename = menu.addAction("✏️ Rename App Desktop")
            a_rename.triggered.connect(lambda: self.rename_lib_item(item))
            a_del = menu.addAction("🗑 Delete App Desktop")
            a_del.triggered.connect(lambda: self.delete_lib_item(item))
            
        menu.exec_(self.tree.viewport().mapToGlobal(pos))

    def toggle_pin(self, folder_name):
        if folder_name in self.pinned_folders:
            self.pinned_folders.remove(folder_name)
        else:
            self.pinned_folders.append(folder_name)
        self.save_session()
        self.populate_live(initial=True)

    def deploy_selected(self, folder_item):
        folder_name = folder_item.data(0, Qt.UserRole + 1)
        tasks = []
        for i in range(folder_item.childCount()):
            tasks.append(folder_item.child(i).data(0, Qt.UserRole + 1))
            
        if not tasks:
            return
            
        dialog = SelectionDialog(f"Deploy {folder_name}", tasks, self)
        if dialog.exec_():
            selected = dialog.get_selected()
            if selected:
                # Use a special separator | that won't appear in task names usually
                task_list = "|".join(selected)
                sys.exit(print(f"DEPLOY_SELECTED:{folder_name}:{task_list}") or 0)

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
            current = self.live_list.currentItem()
            if not current: return
            above = self.live_list.itemAbove(current)
            if above: self.live_list.setCurrentItem(above)
        else:
            current = self.tree.currentItem()
            if not current: return
            above = self.tree.itemAbove(current)
            while above and above.data(0, Qt.UserRole) == "FOLDER":
                above = self.tree.itemAbove(above)
            if above: self.tree.setCurrentItem(above)

    def move_down(self):
        if self.tabs.currentIndex() == 0:
            current = self.live_list.currentItem()
            if not current:
                root = self.live_list.invisibleRootItem()
                if root.childCount() > 0: self.live_list.setCurrentItem(root.child(0))
                return
            below = self.live_list.itemBelow(current)
            if below: self.live_list.setCurrentItem(below)
        else:
            current = self.tree.currentItem()
            if not current:
                root = self.tree.invisibleRootItem()
                if root.childCount() > 0:
                    folder = root.child(0)
                    if folder.childCount() > 0: self.tree.setCurrentItem(folder.child(0))
                return
            below = self.tree.itemBelow(current)
            while below and below.data(0, Qt.UserRole) == "FOLDER":
                below = self.tree.itemBelow(below)
            if below: self.tree.setCurrentItem(below)
                
    def get_selected_uid(self):
        if self.tabs.currentIndex() == 0:
            item = self.live_list.currentItem()
            if item: return item.data(0, Qt.UserRole)
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
        if isinstance(obj, QMenu) and event.type() == QEvent.KeyPress:
            key = event.key()
            mod = event.modifiers()
            if mod == Qt.ControlModifier:
                if key == Qt.Key_J:
                    simulate = QKeyEvent(QEvent.KeyPress, Qt.Key_Down, Qt.NoModifier)
                    QCoreApplication.sendEvent(obj, simulate)
                    return True
                elif key == Qt.Key_K:
                    simulate = QKeyEvent(QEvent.KeyPress, Qt.Key_Up, Qt.NoModifier)
                    QCoreApplication.sendEvent(obj, simulate)
                    return True
            # Stop any other KeyPress events from hitting the main window logic below
            return False

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
                    widget = self.live_list if self.tabs.currentIndex() == 0 else self.tree
                    item = widget.currentItem()
                    if item:
                        rect = widget.visualItemRect(item)
                        if self.tabs.currentIndex() == 0:
                            self.on_live_context_menu(rect.center())
                        else:
                            self.on_lib_context_menu(rect.center())
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

    def changeEvent(self, event):
        if event.type() == QEvent.ActivationChange:
            if self.isActiveWindow():
                self.container.setStyleSheet("#container { background-color: rgba(30,32,48,0.95); border-radius: 4px; border: 1.5px solid #82aaff; }")
            else:
                self.container.setStyleSheet("#container { background-color: rgba(30,32,48,0.95); border-radius: 4px; border: 1px solid #5a4a78; }")
        super().changeEvent(event)

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
