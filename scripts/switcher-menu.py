#!/usr/bin/env python3
import sys
import os
os.environ["QT_QPA_PLATFORM"] = "xcb"
import subprocess
import threading
import json
from pathlib import Path
from datetime import datetime, timezone
import time
from PyQt5.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout,
                             QLabel, QLineEdit, QTreeWidget, QTreeWidgetItem,
                             QPushButton, QGraphicsDropShadowEffect,
                             QMenu, QInputDialog, QAbstractItemView,
                             QDialog, QListWidget, QListWidgetItem,
                             QFileDialog)
from PyQt5.QtCore import Qt, QEvent, pyqtSignal, QObject, QTimer, QDir
from PyQt5.QtGui import QFont, QColor, QBrush

# Session persistence
SESSION_DIR = Path.home() / ".config" / "desktop-manager"
SESSION_FILE = SESSION_DIR / "session.json"
TEMPLATES_DIR = SESSION_DIR / "templates"
HISTORY_FILE = SESSION_DIR / "history.json"

UNFILED = "Unfiled"
CHROME_LOCAL_STATE = Path.home() / ".config/google-chrome/Local State"

def get_chrome_profiles():
    """Parse Google Chrome's Local State to get profile names and IDs."""
    try:
        if not CHROME_LOCAL_STATE.exists():
            return []
        with open(CHROME_LOCAL_STATE, 'r') as f:
            data = json.load(f)
        profiles = []
        cache = data.get("profile", {}).get("info_cache", {})
        for key, value in cache.items():
            if key != "System Profile":
                name = value.get("name", "Unknown")
                email = value.get("user_name", "")
                profiles.append((key, f"{name} ({email})" if email else name))
        return sorted(profiles, key=lambda x: x[1].lower())
    except Exception:
        return []

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
        except Exception:
            pass

class FolderTreeWidget(QTreeWidget):
    """Custom tree widget with full drag-drop flexibility:
    - Folders can be reordered at the top level
    - Desktops can be moved between folders AND reordered within folders
    - Drop position (above/below/on) controls exact placement
    """
    def dropEvent(self, event):
        dragged = self.currentItem()
        if dragged is None:
            event.ignore()
            return
        
        target = self.itemAt(event.pos())
        drop_indicator = self.dropIndicatorPosition()
        is_folder_drag = dragged.data(0, Qt.UserRole) == "FOLDER"
        
        if is_folder_drag:
            # ── Folder reordering at root level ──
            if target is None:
                event.ignore()
                return
            
            # If dropped on a desktop, use its parent folder as target
            target_folder = target
            if target.data(0, Qt.UserRole) != "FOLDER":
                target_folder = target.parent()
            
            if target_folder and target_folder.data(0, Qt.UserRole) == "FOLDER":
                root = self.invisibleRootItem()
                old_idx = self.indexOfTopLevelItem(dragged)
                new_idx = self.indexOfTopLevelItem(target_folder)
                
                if old_idx >= 0 and new_idx >= 0 and old_idx != new_idx:
                    root.takeChild(old_idx)
                    if old_idx < new_idx:
                        new_idx -= 1
                    if drop_indicator == QAbstractItemView.BelowItem:
                        new_idx += 1
                    root.insertChild(new_idx, dragged)
                    self.setCurrentItem(dragged)
            event.ignore()
        else:
            # ── Desktop drag: move + reorder anywhere ──
            if target is None:
                event.ignore()
                return
            
            # Remove dragged from its current parent
            old_parent = dragged.parent()
            if not old_parent:
                event.ignore()
                return
            old_idx = old_parent.indexOfChild(dragged)
            if old_idx < 0:
                event.ignore()
                return
            
            target_is_folder = target.data(0, Qt.UserRole) == "FOLDER"
            
            if target_is_folder:
                # Dropped ON a folder → insert at top of that folder
                taken = old_parent.takeChild(old_idx)
                target.insertChild(0, taken)
                target.setExpanded(True)
                self.setCurrentItem(taken)
            else:
                # Dropped on another desktop → insert above or below it
                target_parent = target.parent()
                if not target_parent:
                    event.ignore()
                    return
                
                taken = old_parent.takeChild(old_idx)
                target_idx = target_parent.indexOfChild(target)
                
                # If same parent AND we removed from before the target, adjust
                if old_parent == target_parent and old_idx < target_idx:
                    target_idx -= 1
                
                if drop_indicator == QAbstractItemView.BelowItem:
                    target_idx += 1
                
                target_parent.insertChild(target_idx, taken)
                target_parent.setExpanded(True)
                self.setCurrentItem(taken)
            
            event.ignore()
        
        # Save session after drop
        QTimer.singleShot(50, self._save_after_drop)
    
    def _save_after_drop(self):
        """Find the parent SwitcherMenu and save."""
        parent = self.parent()
        while parent:
            if hasattr(parent, 'save_session'):
                parent.save_session()
                return
            parent = parent.parent()

class SwitcherMenu(QWidget):
    def __init__(self, title_win, title_label, current_desktop_uuid, id_name_pairs):
        super().__init__()
        self.setWindowTitle(title_win)
        self.id_name_pairs = id_name_pairs
        self.current_pairs = list(id_name_pairs)
        self.id_to_index = {pid: i for i, (pid, _) in enumerate(id_name_pairs)}
        self.current_desktop_uuid = current_desktop_uuid
        self.active_kwin_indices = set()
        
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Window)
        self.setAttribute(Qt.WA_TranslucentBackground)
        
        # Geometry setup (Flush Right Edge)
        self.screen_geom = QApplication.primaryScreen().geometry()
        self.hud_width = 340 
        self.height_expanded = 720
        self.height_collapsed = 480
        
        # Start collapsed
        self.setMinimumSize(280, 300)
        self.resize(self.hud_width, self.height_collapsed)
        self.reset_geometry()
        
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(20, 2, 20, 20)
        self.setLayout(main_layout)
        
        # Main UI Box
        self.container = QWidget()
        self.container.setObjectName("container")
        self.container.setStyleSheet("""
            #container {
                background-color: rgba(30, 32, 48, 0.95);
                border-radius: 4px;
                border: 1px solid #5a4a78;
            }
        """)
        
        # Shadow logic
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(10)
        shadow.setColor(QColor(0, 0, 0, 120))
        shadow.setOffset(0, 2)
        self.container.setGraphicsEffect(shadow)
        
        container_layout = QVBoxLayout()
        container_layout.setContentsMargins(6, 6, 6, 6)
        container_layout.setSpacing(6)
        self.container.setLayout(container_layout)
        
        self.search_entry = QLineEdit()
        self.search_entry.setFont(QFont("Inter", 11))
        self.search_entry.setPlaceholderText("Search workspaces...")
        self.search_entry.setStyleSheet("""
            QLineEdit {
                background-color: #2f334d;
                color: #c8d3f5;
                border: 2px solid #3b4261;
                border-radius: 8px;
                padding: 8px;
                selection-background-color: #82aaff;
                selection-color: #222436;
            }
            QLineEdit:focus {
                border: 2px solid #82aaff;
                background-color: #222436;
            }
        """)
        self.search_entry.textChanged.connect(self.on_search)
        container_layout.addWidget(self.search_entry)
        
        # ── Tree Widget ──
        self.tree = FolderTreeWidget(self)
        self.tree.setHeaderHidden(True)
        self.tree.setFont(QFont("Inter", 10))
        self.tree.setFocusPolicy(Qt.NoFocus)
        self.tree.setIndentation(0)
        self.tree.setRootIsDecorated(False)
        
        # Drag-and-drop
        self.tree.setDragEnabled(True)
        self.tree.setAcceptDrops(True)
        self.tree.setDragDropMode(QAbstractItemView.InternalMove)
        self.tree.setDefaultDropAction(Qt.MoveAction)
        
        self.tree.setStyleSheet("""
            QTreeWidget {
                background-color: #222436;
                color: #c8d3f5;
                border: 1px solid #3b4261;
                border-radius: 8px;
                padding: 4px 2px;
                outline: none;
            }
            QTreeWidget::item {
                padding: 4px 6px;
                border-radius: 4px;
                margin: 1px 0px;
            }
            QTreeWidget::item:hover {
                background-color: rgba(47, 51, 77, 0.7);
            }
            QTreeWidget::item:selected {
                background-color: rgba(130, 170, 255, 0.85);
                color: #1e2030;
                font-weight: bold;
            }
            /* Scrollbar */
            QScrollBar:vertical {
                background: #222436;
                width: 6px;
                border-radius: 3px;
                margin: 4px 0;
            }
            QScrollBar::handle:vertical {
                background: #3b4261;
                border-radius: 3px;
                min-height: 30px;
            }
            QScrollBar::handle:vertical:hover {
                background: #5a4a78;
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                height: 0;
            }
        """)
        
        # Right-click context menu
        self.tree.setContextMenuPolicy(Qt.CustomContextMenu)
        self.tree.customContextMenuRequested.connect(self.on_context_menu)
        self.tree.itemExpanded.connect(self._on_folder_expanded)
        self.tree.itemCollapsed.connect(self._on_folder_collapsed)
        
        container_layout.addWidget(self.tree)
        
        # ── Buttons ──
        btn_style = """
            QPushButton {
                background-color: #2f334d;
                color: #c8d3f5;
                border: 1px solid #3b4261;
                border-radius: 6px;
                padding: 6px 10px;
                font-family: Inter;
                font-weight: 500;
            }
            QPushButton:hover {
                background-color: #3b4261;
                border: 1px solid #82aaff;
            }
            QPushButton:pressed {
                background-color: #82aaff;
                color: #1e2030;
            }
        """
        
        self.rename_btn = QPushButton("Rename")
        self.rename_btn.setStyleSheet(btn_style)
        self.rename_btn.clicked.connect(self.on_rename)
        self.rename_btn.setToolTip("(Ctrl+/)")
        
        self.close_btn = QPushButton("Close Win")
        self.close_btn.setStyleSheet(btn_style)
        self.close_btn.clicked.connect(self.on_close_windows)
        self.close_btn.setToolTip("(Ctrl+W)")
        
        self.undo_btn = QPushButton("Undo")
        self.undo_btn.setStyleSheet(btn_style)
        self.undo_btn.clicked.connect(self.on_undo)
        self.undo_btn.setToolTip("(Ctrl+Z)")
        
        self.done_btn = QPushButton("Purge")
        self.done_btn.setStyleSheet(btn_style)
        self.done_btn.clicked.connect(self.on_clear)
        self.done_btn.setToolTip("(Ctrl+Y: Empty name + Close windows)")
        
        self.go_btn = QPushButton("Go")
        self.go_btn.setStyleSheet(btn_style)
        self.go_btn.clicked.connect(self.on_switch)
        self.go_btn.setToolTip("(Enter)")
        
        self.close_app_btn = QPushButton("Close App")
        self.close_app_btn.setStyleSheet(btn_style)
        self.close_app_btn.setToolTip("(Alt+X)")
        self.close_app_btn.clicked.connect(lambda: sys.exit(0))
        
        self.new_folder_btn = QPushButton("+ Folder")
        self.new_folder_btn.setStyleSheet(btn_style)
        self.new_folder_btn.setToolTip("Create a new folder")
        self.new_folder_btn.clicked.connect(self.create_folder)
        
        self.restore_btn = QPushButton("Restore")
        self.restore_btn.setStyleSheet(btn_style)
        self.restore_btn.setToolTip("Restore last saved session")
        self.restore_btn.clicked.connect(self.restore_session)
        
        self.save_tpl_btn = QPushButton("💾 Save Template")
        self.save_tpl_btn.setStyleSheet(btn_style)
        self.save_tpl_btn.setToolTip("Save current layout as a reusable template")
        self.save_tpl_btn.clicked.connect(self.save_template)
        
        self.load_tpl_btn = QPushButton("📂 Load Template")
        self.load_tpl_btn.setStyleSheet(btn_style)
        self.load_tpl_btn.setToolTip("Apply a saved template")
        self.load_tpl_btn.clicked.connect(self.show_load_template_menu)
        
        self.summon_btn = QPushButton("🚀 Summon Workflows")
        self.summon_btn.setStyleSheet(btn_style + "background-color: #3d3b5a;")
        self.summon_btn.setToolTip("Launch all startup apps assigned to desktops")
        self.summon_btn.clicked.connect(self.on_summon)

        self.toggle_last_btn = QPushButton("🔂 Toggle Last")
        self.toggle_last_btn.setStyleSheet(btn_style)
        self.toggle_last_btn.setToolTip("Jump to previous desktop (Ctrl+H)")
        self.toggle_last_btn.clicked.connect(self.on_back)

        self.cleanup_btn = QPushButton("🧹 Cleanup Empties")
        self.cleanup_btn.setStyleSheet(btn_style + "background-color: #3b4261;")
        self.cleanup_btn.setToolTip("Move all 'Empty' desktops to root folder")
        self.cleanup_btn.clicked.connect(self.cleanup_empty_desktops)
        
        # Buttons Layout (Organized Grid)
        btns_container_layout = QVBoxLayout()
        btns_container_layout.setSpacing(6)
        
        row1 = QHBoxLayout(); row1.setSpacing(6)
        row2 = QHBoxLayout(); row2.setSpacing(6)
        row3 = QHBoxLayout(); row3.setSpacing(6)
        row4 = QHBoxLayout(); row4.setSpacing(6)
        row5 = QHBoxLayout(); row5.setSpacing(6)
        row6 = QHBoxLayout(); row6.setSpacing(6)
        row7 = QHBoxLayout(); row7.setSpacing(6)
        row8 = QHBoxLayout(); row8.setSpacing(6)
        
        row1.addWidget(self.rename_btn)
        row1.addWidget(self.close_btn)
        
        row2.addWidget(self.undo_btn)
        row2.addWidget(self.done_btn)
        
        row3.addWidget(self.go_btn)
        row3.addWidget(self.close_app_btn)
        
        row4.addWidget(self.new_folder_btn)
        row4.addWidget(self.restore_btn)
        
        row5.addWidget(self.save_tpl_btn)
        row5.addWidget(self.load_tpl_btn)
        
        row6.addWidget(self.summon_btn)

        row7.addWidget(self.toggle_last_btn)
        row8.addWidget(self.cleanup_btn)
        
        btns_container_layout.addLayout(row1)
        btns_container_layout.addLayout(row2)
        btns_container_layout.addLayout(row3)
        btns_container_layout.addLayout(row4)
        btns_container_layout.addLayout(row5)
        btns_container_layout.addLayout(row6)
        btns_container_layout.addLayout(row7)
        btns_container_layout.addLayout(row8)
        
        # Buttons Widget (Collapsible)
        self.btn_container_widget = QWidget()
        self.btn_container_widget.setLayout(btns_container_layout)
        self.btn_container_widget.setVisible(False) # Start collapsed
        
        # Toggle Button (Tiny Arrow)
        self.toggle_btn = QPushButton("▼")
        self.toggle_btn.setFixedHeight(16)
        self.toggle_btn.setCursor(Qt.PointingHandCursor)
        self.toggle_btn.setStyleSheet("""
            QPushButton {
                background-color: transparent;
                color: #5a4a78;
                font-size: 9px;
                border: none;
                padding: 0px;
                margin: 0px;
            }
            QPushButton:hover {
                color: #82aaff;
            }
        """)
        self.toggle_btn.clicked.connect(self.on_toggle_buttons)
        
        container_layout.addWidget(self.toggle_btn)
        container_layout.addWidget(self.btn_container_widget)
        
        main_layout.addWidget(self.container)
        
        # Behaviors
        self.tree.itemClicked.connect(self._on_tree_click)
        self.tree.itemExpanded.connect(self.save_session)
        self.tree.itemCollapsed.connect(self.save_session)
        
        # Load session and populate
        self.session_data = self.load_session()
        self.default_folder_name = self.session_data.get("default_folder", UNFILED)
        self.sort_mode = self.session_data.get("sort_mode", "priority")
        self.populate_tree(initial_set=True)
        
        # Connect Background Fetcher
        self.fetcher = WindowFetcher()
        self.fetcher.finished.connect(self.apply_active_windows)
        self.trigger_bg_check()
        
        # Global Event Filters
        self.installEventFilter(self)
        self.search_entry.installEventFilter(self)

        # Force Focus after mapping
        self.force_focus_title = title_win
        QTimer.singleShot(50, self.force_focus)
        QTimer.singleShot(150, self.force_position)  # Override KDE strut adjustment
        
        # Immediate focus
        self.search_entry.setFocus()
        self.activateWindow()
        self.raise_()

    # ─── Session Persistence ───

    def load_session(self):
        """Load folder layout from disk."""
        try:
            if SESSION_FILE.exists():
                with open(SESSION_FILE, "r") as f:
                    data = json.load(f)
                    # Validate structure
                    if "folders" in data and "folder_order" in data:
                        # Ensure startup_apps exists in loaded data
                        if "startup_apps" not in data:
                            data["startup_apps"] = {}
                        return data
        except Exception:
            pass
        return {"folders": {}, "folder_order": [], "default_folder": UNFILED, "startup_apps": {}}
    
    def save_session(self):
        """Save current folder layout to disk."""
        try:
            SESSION_DIR.mkdir(parents=True, exist_ok=True)
            data = {"folders": {}, "folder_order": []}
            collapsed = []
            root = self.tree.invisibleRootItem()
            for i in range(root.childCount()):
                folder_item = root.child(i)
                folder_name = folder_item.data(0, Qt.UserRole + 1)  # stored folder name
                if folder_name is None:
                    continue
                data["folder_order"].append(folder_name)
                desktop_ids = []
                for j in range(folder_item.childCount()):
                    child = folder_item.child(j)
                    did = child.data(0, Qt.UserRole)
                    if did:
                        desktop_ids.append(did)
                data["folders"][folder_name] = desktop_ids
                
                # Track collapsed state
                if not folder_item.isExpanded():
                    collapsed.append(folder_name)
            
            # Save which folder is currently the default catch-all
            data["default_folder"] = self.default_folder_name
            data["collapsed_folders"] = collapsed
            
            # Preserve startup apps and sorting mode
            data["startup_apps"] = getattr(self, "session_data", {}).get("startup_apps", {})
            data["sort_mode"] = getattr(self, "sort_mode", "priority")
            
            with open(SESSION_FILE, "w") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass
    
    def restore_session(self):
        """Reload the last saved session from disk."""
        self.session_data = self.load_session()
        self.default_folder_name = self.session_data.get("default_folder", UNFILED)
        self.sort_mode = self.session_data.get("sort_mode", "priority")
        self.populate_tree(initial_set=True)

    # ─── Template Management ───

    def _get_desktop_names_from_kde(self):
        """Query KDE for all desktop names in order, returns list of (uuid, name)."""
        try:
            result = subprocess.run(
                ["bash", "-c", "qdbus-qt6 --literal org.kde.KWin /VirtualDesktopManager org.kde.KWin.VirtualDesktopManager.desktops"],
                capture_output=True, text=True
            )
            import re
            regex = re.compile(r'\[Argument: \(uss\) \d+, "([^"]+)", "([^"]+)"\]')
            matches = regex.findall(result.stdout)
            return [(uuid, name) for uuid, name in matches]
        except Exception:
            return []

    def _list_templates(self):
        """Return list of (filename, display_name) for all saved templates."""
        templates = []
        if TEMPLATES_DIR.exists():
            for f in sorted(TEMPLATES_DIR.glob("*.json")):
                try:
                    with open(f, "r") as fh:
                        data = json.load(fh)
                        display = data.get("name", f.stem)
                        templates.append((f.name, display))
                except Exception:
                    pass
        return templates

    def save_template(self):
        """Save the current folder layout + desktop labels as a named template."""
        name, ok = QInputDialog.getText(self, "Save Template", "Template name:")
        if not ok or not name.strip():
            return
        name = name.strip()
        
        # Get actual desktop names from KDE (ordered by position)
        kde_desktops = self._get_desktop_names_from_kde()
        if not kde_desktops:
            return
        
        desktop_names = [d[1] for d in kde_desktops]
        desktop_uuids = [d[0] for d in kde_desktops]
        
        # Build a uuid -> position index map
        uuid_to_pos = {}
        for idx, uuid in enumerate(desktop_uuids):
            uuid_to_pos[uuid] = idx
        
        # Read folder structure from the tree and convert desktop IDs to position indices
        folders = {}
        folder_order = []
        root = self.tree.invisibleRootItem()
        for i in range(root.childCount()):
            folder_item = root.child(i)
            folder_name = folder_item.data(0, Qt.UserRole + 1)
            if folder_name is None:
                continue
            folder_order.append(folder_name)
            indices = []
            for j in range(folder_item.childCount()):
                child = folder_item.child(j)
                did = child.data(0, Qt.UserRole)
                if did and did != "FOLDER":
                    # Extract raw UUID from the "uuid___kwinIndex" format
                    raw_uuid = did.split("___")[0] if "___" in did else did
                    if raw_uuid in uuid_to_pos:
                        indices.append(uuid_to_pos[raw_uuid])
            folders[folder_name] = indices
        
        template = {
            "name": name,
            "created": datetime.now(timezone.utc).isoformat(),
            "desktop_count": len(desktop_names),
            "desktops": desktop_names,
            "folders": folders,
            "folder_order": folder_order,
            "default_folder": self.default_folder_name,
            "startup_apps": self.session_data.get("startup_apps", {})
        }
        
        # Write template file
        TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
        safe_filename = name.lower().replace(" ", "_") + ".json"
        filepath = TEMPLATES_DIR / safe_filename
        try:
            with open(filepath, "w") as f:
                json.dump(template, f, indent=2)
        except Exception:
            pass

    def show_load_template_menu(self):
        """Show a popup menu to select and load a template."""
        templates = self._list_templates()
        if not templates:
            return
        
        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu {
                background-color: #2f334d;
                color: #c8d3f5;
                border: 1px solid #3b4261;
                border-radius: 6px;
                padding: 4px;
            }
            QMenu::item {
                padding: 6px 20px;
                border-radius: 4px;
            }
            QMenu::item:selected {
                background-color: #82aaff;
                color: #1e2030;
            }
            QMenu::separator {
                height: 1px;
                background: #3b4261;
                margin: 4px 8px;
            }
        """)
        
        # Add template entries
        for filename, display_name in templates:
            action = menu.addAction(f"📋 {display_name}")
            action.triggered.connect(lambda checked, fn=filename: self._apply_template(fn))
        
        # Separator + delete submenu
        menu.addSeparator()
        delete_menu = menu.addMenu("🗑  Delete...")
        delete_menu.setStyleSheet(menu.styleSheet())
        for filename, display_name in templates:
            action = delete_menu.addAction(display_name)
            action.triggered.connect(lambda checked, fn=filename: self._delete_template(fn))
        
        # Show menu near the load button
        btn_pos = self.load_tpl_btn.mapToGlobal(self.load_tpl_btn.rect().topLeft())
        menu.exec_(btn_pos)

    def _apply_template(self, filename):
        """Output LOAD_TEMPLATE action for the TypeScript orchestrator."""
        print(f"LOAD_TEMPLATE:{filename}", flush=True)
        sys.exit(0)
    def _delete_template(self, filename):
        """Output DELETE_TEMPLATE action for the TypeScript orchestrator."""
        print(f"DELETE_TEMPLATE:{filename}", flush=True)
        sys.exit(0)

    # ─── Tree Expand/Collapse Indicators ───

    def _has_active_children(self, folder_item):
        """Check if any desktop in this folder has active windows."""
        for j in range(folder_item.childCount()):
            child = folder_item.child(j)
            did = child.data(0, Qt.UserRole)
            if did and did != "FOLDER" and "___" in did:
                kwin_idx_str = did.split("___")[1]
                if int(kwin_idx_str) in self.active_kwin_indices:
                    return True
        return False

    def _update_folder_text(self, folder_item):
        """Update folder display text with expand arrow and activity dot."""
        name = folder_item.data(0, Qt.UserRole + 1)
        arrow = "▾" if folder_item.isExpanded() else "▸"
        dot = "  •" if self._has_active_children(folder_item) else ""
        folder_item.setText(0, f"{arrow} {name}{dot}")

    def _on_folder_expanded(self, item):
        if item.data(0, Qt.UserRole) == "FOLDER":
            self._update_folder_text(item)
            self.save_session()

    def _on_folder_collapsed(self, item):
        if item.data(0, Qt.UserRole) == "FOLDER":
            self._update_folder_text(item)
            self.save_session()

    # ─── Tree Population ───
    
    def _make_folder_item(self, name):
        """Create a styled folder tree item."""
        item = QTreeWidgetItem()
        item.setText(0, f"▸ {name}")
        item.setFont(0, QFont("Inter", 9, QFont.DemiBold))
        item.setForeground(0, QBrush(QColor("#7a88cf")))
        item.setData(0, Qt.UserRole, "FOLDER")      # type marker
        item.setData(0, Qt.UserRole + 1, name)       # folder name
        item.setFlags(item.flags() | Qt.ItemIsDropEnabled | Qt.ItemIsDragEnabled)
        return item
    
    def _make_desktop_item(self, desktop_id, name_val):
        """Create a styled desktop tree item."""
        item = QTreeWidgetItem()
        display = self.get_display_name(desktop_id, name_val)
        item.setText(0, display)
        item.setForeground(0, QBrush(self.get_color(name_val)))
        item.setFont(0, QFont("Inter", 10))
        item.setData(0, Qt.UserRole, desktop_id)     # desktop ID
        item.setData(0, Qt.UserRole + 1, None)        # not a folder
        item.setFlags(item.flags() | Qt.ItemIsDragEnabled)
        item.setFlags(item.flags() & ~Qt.ItemIsDropEnabled)  # desktops can't accept drops
        return item

    def populate_tree(self, initial_set=False):
        """Build the tree from session data + current desktop list."""
        self.tree.clear()
        
        # Build a lookup: desktop_id -> (id, name)
        id_map = {pair[0]: pair[1] for pair in self.current_pairs}
        placed_ids = set()
        
        # Create folders from session in order (skip duplicates)
        folder_items = {}
        seen_folders = set()
        for folder_name in self.session_data.get("folder_order", []):
            if folder_name in seen_folders:
                continue
            seen_folders.add(folder_name)
            
            folder_item = self._make_folder_item(folder_name)
            self.tree.addTopLevelItem(folder_item)
            folder_items[folder_name] = folder_item
            
            # Add desktops that belong to this folder
            for did in self.session_data.get("folders", {}).get(folder_name, []):
                if did in id_map:
                    desktop_item = self._make_desktop_item(did, id_map[did])
                    folder_item.addChild(desktop_item)
                    placed_ids.add(did)
            
            # Sort after adding all desktops to this folder (if not in activity mode)
            if self.sort_mode != "activity":
                self._sort_folder_children(folder_item)
        
        # Add catch-all for remaining desktops
        unfiled_ids = [did for did in id_map if did not in placed_ids]
        if unfiled_ids:
            # Reuse existing default folder if it was already created
            if self.default_folder_name in folder_items:
                unfiled_item = folder_items[self.default_folder_name]
            else:
                unfiled_item = self._make_folder_item(self.default_folder_name)
                self.tree.addTopLevelItem(unfiled_item)
            for did in unfiled_ids:
                desktop_item = self._make_desktop_item(did, id_map[did])
                unfiled_item.addChild(desktop_item)
            
            # Sort the catch-all folder (if not in activity mode)
            if self.sort_mode != "activity":
                self._sort_folder_children(unfiled_item)
        
        # 4. Apply persistent sorting mode first
        if self.sort_mode == "activity":
            self.sort_by_activity(save=False)
        else:
            self.sort_by_priority(save=False)

        # 5. NOW Restore expand/collapse state (at the very end so sorting doesn't reset it)
        collapsed_folders = set(self.session_data.get("collapsed_folders", []))
        root = self.tree.invisibleRootItem()
        for i in range(root.childCount()):
            folder_item = root.child(i)
            folder_name = folder_item.data(0, Qt.UserRole + 1)
            if folder_name in collapsed_folders:
                folder_item.setExpanded(False)
            else:
                folder_item.setExpanded(True)
        
        # 6. Select current desktop if initial
        if initial_set and self.current_desktop_uuid:
            self._select_desktop_by_uuid(self.current_desktop_uuid)
    
    def _select_desktop_by_uuid(self, uuid):
        """Find and select the tree item matching the given UUID."""
        root = self.tree.invisibleRootItem()
        for i in range(root.childCount()):
            folder = root.child(i)
            for j in range(folder.childCount()):
                child = folder.child(j)
                did = child.data(0, Qt.UserRole)
                if did and uuid in did:
                    self.tree.setCurrentItem(child)
                    return

    def refresh_tree(self):
        """Update display text for active window indicators (desktops + folders)."""
        root = self.tree.invisibleRootItem()
        for i in range(root.childCount()):
            folder = root.child(i)
            for j in range(folder.childCount()):
                child = folder.child(j)
                did = child.data(0, Qt.UserRole)
                if did and did != "FOLDER":
                    # Find the name from id_name_pairs
                    name = None
                    for pair_id, pair_name in self.id_name_pairs:
                        if pair_id == did:
                            name = pair_name
                            break
                    if name:
                        child.setText(0, self.get_display_name(did, name))
            
            # Update folder activity indicator
            self._update_folder_text(folder)

    # ─── Folder Management ───
    
    def create_folder(self):
        """Prompt user for a new folder name."""
        name, ok = QInputDialog.getText(self, "New Folder", "Folder name:", text="")
        if ok and name.strip():
            name = name.strip()[:20]  # 20 char limit
            folder_item = self._make_folder_item(name)
            # Insert before Unfiled (last item)
            root = self.tree.invisibleRootItem()
            unfiled_idx = -1
            for i in range(root.childCount()):
                if root.child(i).data(0, Qt.UserRole + 1) == self.default_folder_name:
                    unfiled_idx = i
                    break
            if unfiled_idx >= 0:
                self.tree.insertTopLevelItem(unfiled_idx, folder_item)
            else:
                self.tree.addTopLevelItem(folder_item)
            folder_item.setExpanded(True)
            self.save_session()
    
    def rename_folder(self, folder_item):
        """Rename an existing folder."""
        old_name = folder_item.data(0, Qt.UserRole + 1)
        name, ok = QInputDialog.getText(self, "Rename Folder", "New name:", text=old_name)
        if ok and name.strip():
            name = name.strip()[:20]
            
            # If we renamed the dynamic default folder, update its reference
            if old_name == self.default_folder_name:
                self.default_folder_name = name
            
            folder_item.setText(0, f"▾ {name}")
            folder_item.setData(0, Qt.UserRole + 1, name)
            self.save_session()
    
    def delete_folder(self, folder_item):
        """Delete a folder and move its desktops to the default bucket."""
        folder_name = folder_item.data(0, Qt.UserRole + 1)
        if folder_name == self.default_folder_name:
            return  # Can't delete the default catch-all folder
        
        # Find or create the default bucket
        root = self.tree.invisibleRootItem()
        unfiled_item = None
        for i in range(root.childCount()):
            if root.child(i).data(0, Qt.UserRole + 1) == self.default_folder_name:
                unfiled_item = root.child(i)
                break
        if unfiled_item is None:
            unfiled_item = self._make_folder_item(self.default_folder_name)
            self.tree.addTopLevelItem(unfiled_item)
        
        # Move children to Unfiled
        while folder_item.childCount() > 0:
            child = folder_item.takeChild(0)
            unfiled_item.addChild(child)
        
        # Remove the empty folder
        idx = self.tree.indexOfTopLevelItem(folder_item)
        if idx >= 0:
            self.tree.takeTopLevelItem(idx)
        
        # Respect natural sorting (Main -> Task -> etc)
        self._sort_folder_children(unfiled_item)
        
        unfiled_item.setExpanded(True)
        self.save_session()
    
    def move_desktop_to_folder(self, desktop_item, target_folder_name):
        """Move a desktop item to a different folder."""
        root = self.tree.invisibleRootItem()
        target_folder = None
        for i in range(root.childCount()):
            if root.child(i).data(0, Qt.UserRole + 1) == target_folder_name:
                target_folder = root.child(i)
                break
        
        if target_folder is None:
            return
        
        # Remove from current parent
        parent = desktop_item.parent()
        if parent:
            idx = parent.indexOfChild(desktop_item)
            if idx >= 0:
                taken = parent.takeChild(idx)
                target_folder.addChild(taken)
                self._sort_folder_children(target_folder)
                target_folder.setExpanded(True)
                self.save_session()

    def _sort_folder_children(self, folder_item):
        """Sort a folder's desktop children prioritizing (Main) and (Task) labels."""
        children = []
        for i in range(folder_item.childCount()):
            children.append(folder_item.takeChild(0))
        
        def sort_key(item):
            # Get the display text to check for priority labels
            text = item.text(0).lower()
            orig_idx = self.id_to_index.get(item.data(0, Qt.UserRole), 999)
            
            # Weighted sorting: (Main) = 0, (Task) = 1, Others = 2
            priority = 2
            if "(main)" in text:
                priority = 0
            elif "(task)" in text:
                priority = 1
                
            return (priority, orig_idx)
        
        children.sort(key=sort_key)
        
        for child in children:
            folder_item.addChild(child)

    def sort_by_priority(self, save=True):
        """Sort desktops within folders by labels (original behavior)."""
        root = self.tree.invisibleRootItem()
        for i in range(root.childCount()):
            self._sort_folder_children(root.child(i))
        
        self.sort_mode = "priority"
        if save:
            self.save_session()

    def sort_by_activity(self, save=True):
        """Sort folders and desktops by activity: active items float to the top."""
        root = self.tree.invisibleRootItem()
        
        # 1. Sort desktops within each folder: active first, then labeled, then empty
        for i in range(root.childCount()):
            folder_item = root.child(i)
            children = []
            for j in range(folder_item.childCount()):
                children.append(folder_item.takeChild(0))
            
            def desktop_sort_key(item):
                did = item.data(0, Qt.UserRole)
                text = item.text(0).lower()
                
                # Is this desktop active (has windows)?
                is_active = False
                if did and "___" in did:
                    kwin_idx_str = did.split("___")[1]
                    is_active = int(kwin_idx_str) in self.active_kwin_indices
                
                # Priority: active=0, labeled=1, empty=2
                if is_active:
                    activity = 0
                elif "empty" not in text and "desktop " not in text:
                    activity = 1
                else:
                    activity = 2
                
                return activity
            
            children.sort(key=desktop_sort_key)
            for child in children:
                folder_item.addChild(child)
        
        # 2. Sort folders: folders with active children float to the top
        folders = []
        for i in range(root.childCount()):
            folders.append(root.takeChild(0))
        
        def folder_sort_key(folder_item):
            has_active = self._has_active_children(folder_item)
            return 0 if has_active else 1
        
        folders.sort(key=folder_sort_key)
        for folder in folders:
            root.addChild(folder)
        
        self.sort_mode = "activity"
        if save:
            self.save_session()

    # ─── Context Menu ───
    
    def on_context_menu(self, pos):
        """Handle right-click on the tree."""
        item = self.tree.itemAt(pos)
        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu {
                background-color: #2f334d;
                color: #c8d3f5;
                border: 1px solid #3b4261;
                border-radius: 6px;
                padding: 4px;
            }
            QMenu::item {
                padding: 6px 20px;
                border-radius: 4px;
            }
            QMenu::item:selected {
                background-color: #82aaff;
                color: #1e2030;
            }
        """)
        
        if item is None:
            # Clicked on empty space
            action_new = menu.addAction("New Folder")
            action_new.triggered.connect(self.create_folder)
        elif item.data(0, Qt.UserRole) == "FOLDER":
            # Clicked on a folder
            folder_name = item.data(0, Qt.UserRole + 1)
            
            # Allow renaming ALL folders
            action_rename = menu.addAction("Rename Folder")
            action_rename.triggered.connect(lambda: self.rename_folder(item))
            
            # Prevent deleting the current catch-all folder
            if folder_name != self.default_folder_name:
                action_delete = menu.addAction("Delete Folder")
                action_delete.triggered.connect(lambda: self.delete_folder(item))
            
            action_new = menu.addAction("New Folder")
            action_new.triggered.connect(self.create_folder)
        else:
            # Clicked on a desktop — select it first so actions target it
            self.tree.setCurrentItem(item)
            
            action_go = menu.addAction("🚀 Go")
            action_go.triggered.connect(self.on_switch)
            
            action_rename = menu.addAction("✏️ Rename")
            action_rename.triggered.connect(self.on_rename)
            
            # Context menu for linking scripts
            action_link = menu.addAction("🔗 Link Startup Script")
            action_link.triggered.connect(lambda: self.link_startup_script(item))
            
            action_summon_one = menu.addAction("🚀 Summon This Desktop")
            action_summon_one.triggered.connect(lambda: self.on_summon_this_desktop(item))
            
            menu.addSeparator()
            move_menu = menu.addMenu("Move to...")
            move_menu.setStyleSheet(menu.styleSheet())
            root = self.tree.invisibleRootItem()
            for i in range(root.childCount()):
                folder = root.child(i)
                fname = folder.data(0, Qt.UserRole + 1)
                # Don't show current parent
                if item.parent() and item.parent().data(0, Qt.UserRole + 1) == fname:
                    continue
                action = move_menu.addAction(fname)
                action.triggered.connect(lambda checked, fi=item, fn=fname: self.move_desktop_to_folder(fi, fn))
            
            menu.addSeparator()
            action_new = menu.addAction("New Folder")
            action_new.triggered.connect(self.create_folder)
        
        # ── Cleanup Options ──
        menu.addSeparator()
        action_cleanup = menu.addAction("🧹 Cleanup Empty Desktops")
        action_cleanup.triggered.connect(self.cleanup_empty_desktops)

        # ── Sort & Template Options (always available) ──
        menu.addSeparator()
        action_sort_act = menu.addAction("⚡ Sort by Activity")
        action_sort_act.setCheckable(True)
        action_sort_act.setChecked(self.sort_mode == "activity")
        action_sort_act.triggered.connect(self.sort_by_activity)

        action_sort_pri = menu.addAction("🔤 Sort by Priority")
        action_sort_pri.setCheckable(True)
        action_sort_pri.setChecked(self.sort_mode == "priority")
        action_sort_pri.triggered.connect(self.sort_by_priority)
        
        menu.addSeparator()
        action_save_tpl = menu.addAction("💾 Save as Template...")
        action_save_tpl.triggered.connect(self.save_template)
        
        templates = self._list_templates()
        if templates:
            load_menu = menu.addMenu("📂 Load Template")
            load_menu.setStyleSheet(menu.styleSheet())
            for filename, display_name in templates:
                action = load_menu.addAction(display_name)
                action.triggered.connect(lambda checked, fn=filename: self._apply_template(fn))
            
            menu.addSeparator()
            delete_menu = menu.addMenu("🗑  Delete Template")
            delete_menu.setStyleSheet(menu.styleSheet())
            for filename, display_name in templates:
                action = delete_menu.addAction(display_name)
                action.triggered.connect(lambda checked, fn=filename: self._delete_template(fn))
        
        menu.exec_(self.tree.viewport().mapToGlobal(pos))

    # (Drag/drop is handled by FolderTreeWidget)

    # ─── Window Management ───

    def force_focus(self):
        try:
            cmd = f"kdotool search --name \"^{self.force_focus_title}$\" windowactivate && wmctrl -F -r \"{self.force_focus_title}\" -t -1"
            subprocess.run(["bash", "-c", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except:
            pass

    def force_position(self):
        """Override KDE panel struts by forcing window to y=0 via wmctrl."""
        try:
            x = self.screen_geom.width() - self.hud_width + 20
            cmd = f'wmctrl -F -r "{self.force_focus_title}" -e 0,{x},0,{self.hud_width},{self.height()}'
            subprocess.run(["bash", "-c", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except:
            pass

    def trigger_bg_check(self):
        threading.Thread(target=self.fetcher.fetch_windows_bg, daemon=True).start()

    def apply_active_windows(self, new_indices):
        if self.active_kwin_indices != new_indices:
            self.active_kwin_indices = new_indices
            self.refresh_tree()
        QTimer.singleShot(1000, self.trigger_bg_check)

    def get_display_name(self, id_val, name_val):
        display_name = name_val
        if "___" in id_val:
            kwin_idx_str = id_val.split("___")[1]
            if int(kwin_idx_str) in self.active_kwin_indices:
                return f" •  {display_name}"
        return f"    {display_name}"

    def get_color(self, name_val):
        lower_name = name_val.lower()
        if "(main)" in lower_name:
            return QColor("#89c4f4")
        elif "(task)" in lower_name:
            return QColor("#f5b041")
        elif "empty" in lower_name and len(lower_name.strip()) <= 15:
            return QColor("#5c636a")
        return QColor("#c8d3f5")

    def reset_geometry(self):
        # Place container at top-right corner
        x = self.screen_geom.width() - self.width() + 20
        y = 0
        self.move(x, y)
        # Also force via wmctrl after a short delay to override KDE struts
        QTimer.singleShot(50, self.force_position)

    def on_toggle_buttons(self):
        is_visible = self.btn_container_widget.isVisible()
        self.btn_container_widget.setVisible(not is_visible)
        # ▼ = collapsed (buttons hidden), ▲ = expanded (buttons showing)
        self.toggle_btn.setText("▲" if not is_visible else "▼")
        new_height = self.height_expanded if not is_visible else self.height_collapsed
        self.resize(self.hud_width, new_height)
        self.reset_geometry()

    def on_search(self, text):
        query = text.lower()
        root = self.tree.invisibleRootItem()
        first_match = None
        
        for i in range(root.childCount()):
            folder = root.child(i)
            any_visible = False
            for j in range(folder.childCount()):
                child = folder.child(j)
                did = child.data(0, Qt.UserRole)
                if did and did != "FOLDER":
                    # Find name
                    name = ""
                    for pair_id, pair_name in self.id_name_pairs:
                        if pair_id == did:
                            name = pair_name
                            break
                    matches = not query or query in name.lower()
                    child.setHidden(not matches)
                    if matches:
                        any_visible = True
                        if not first_match:
                            first_match = child
            folder.setHidden(not any_visible)
            if any_visible:
                folder.setExpanded(True)
        
        # Auto-highlight the first result
        if first_match:
            self.tree.setCurrentItem(first_match)

    def _on_tree_click(self, item, column):
        """Handle single-click: switch desktop if it's a desktop item."""
        if item.data(0, Qt.UserRole) != "FOLDER":
            self.on_switch()

    def link_startup_script(self, item):
        """Directly open file picker to link a script to this desktop."""
        desktop_id = item.data(0, Qt.UserRole)
        desktop_uuid = desktop_id.split("___")[0] if "___" in desktop_id else desktop_id
        
        default_dir = os.path.expanduser("~/.local/bin")
        if not os.path.isdir(default_dir):
            default_dir = os.path.expanduser("~")
            
        dialog = QFileDialog(self)
        dialog.setWindowTitle("Select Startup Script")
        dialog.setDirectory(default_dir)
        dialog.setNameFilter("Scripts (*.sh);;All Files (*)")
        dialog.setFileMode(QFileDialog.ExistingFile)
        # Enable showing hidden files
        dialog.setFilter(dialog.filter() | QDir.Hidden)
        
        if dialog.exec_():
            file_path = dialog.selectedFiles()[0]
            # Ensure dict exists
            if "startup_apps" not in self.session_data:
                self.session_data["startup_apps"] = {}
                
            # Store it as a single-item list for compatibility
            cmd = f"bash '{file_path}'" if file_path.endswith('.sh') else f"'{file_path}'"
            self.session_data["startup_apps"][desktop_uuid] = [cmd]
            self.save_session()

    def on_summon_this_desktop(self, item):
        """Summon windows for a specific desktop selected from the tree."""
        desktop_id = item.data(0, Qt.UserRole)
        desktop_uuid = desktop_id.split("___")[0] if "___" in desktop_id else desktop_id
        self.summon_one_desktop(desktop_uuid)

    def summon_one_desktop(self, uuid):
        """Helper to switch to a desktop and launch its assigned apps."""
        startup_apps = self.session_data.get("startup_apps", {})
        apps = startup_apps.get(uuid, [])
        if not apps:
            return

        # Map uuid to idx
        uuid_to_idx = {}
        for pair in self.current_pairs:
            did = pair[0]
            if "___" in did:
                parts = did.split("___")
                uuid_to_idx[parts[0]] = parts[1]

        if uuid in uuid_to_idx:
            idx = uuid_to_idx[uuid]
            # Switch to desktop
            subprocess.run(["kdotool", "set_desktop", str(idx)])
            time.sleep(0.3)
            
            for cmd in apps:
                subprocess.Popen(["bash", "-c", cmd], 
                                 start_new_session=True,
                                 stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL)
                time.sleep(0.1)

    def on_summon(self):
        """Execute all startup workflows across all desktops."""
        startup_apps = self.session_data.get("startup_apps", {})
        if not startup_apps:
            return
            
        # Get all UUIDs that have apps
        uuids_to_summon = [u for u, apps in startup_apps.items() if apps]
        
        for uuid in uuids_to_summon:
            self.summon_one_desktop(uuid)

    def eventFilter(self, obj, event):
        if event.type() == QEvent.KeyPress:
            key = event.key()
            modifiers = event.modifiers()
            
            # Sub-commands (Ctrl bindings)
            if modifiers == Qt.ControlModifier:
                if key == Qt.Key_Slash:
                    self.on_rename()
                    return True
                elif key == Qt.Key_W:
                    self.on_close_windows()
                    return True
                elif key == Qt.Key_Y:
                    self.on_clear()
                    return True
                elif key == Qt.Key_M:
                    self.on_rename_main()
                    return True
                elif key == Qt.Key_T:
                    self.on_rename_task()
                    return True
                elif key == Qt.Key_Z:
                    self.on_undo()
                    return True
                elif key == Qt.Key_Backspace:
                    self.search_entry.clear()
                    return True
                elif key == Qt.Key_J:
                    self.move_down()
                    return True
                elif key == Qt.Key_K:
                    self.move_up()
                    return True
                elif key == Qt.Key_H:
                    self.on_back()
                    return True
                    
            if key == Qt.Key_Up:
                self.move_up()
                return True
            elif key == Qt.Key_Down:
                self.move_down()
                return True
            elif key == Qt.Key_Return:
                self.on_switch()
                return True
            elif key == Qt.Key_Escape:
                if self.search_entry.text():
                    self.search_entry.clear()
                else:
                    sys.exit(0)
                return True
            elif key == Qt.Key_X and (event.modifiers() & Qt.AltModifier):
                sys.exit(0)
                return True
            elif key == Qt.Key_Q and (event.modifiers() & Qt.ControlModifier):
                sys.exit(0)
                return True
                
        return super().eventFilter(obj, event)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._drag_active = True
            self._drag_start_pos = event.globalPos() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if hasattr(self, '_drag_active') and self._drag_active:
            self.move(event.globalPos() - self._drag_start_pos)
            event.accept()

    def mouseReleaseEvent(self, event):
        self._drag_active = False

    # ─── Tree Navigation ───

    def move_up(self):
        current = self.tree.currentItem()
        if current is None:
            return
        above = self.tree.itemAbove(current)
        while above and above.data(0, Qt.UserRole) == "FOLDER":
            above = self.tree.itemAbove(above)
        if above:
            self.tree.setCurrentItem(above)
            
    def move_down(self):
        current = self.tree.currentItem()
        if current is None:
            # Select first desktop
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

    def _get_selected_id(self):
        item = self.tree.currentItem()
        if item is None:
            return None
        did = item.data(0, Qt.UserRole)
        if did and did != "FOLDER":
            return did
        return None

    # ─── Actions ───

    def on_switch(self):
        sid = self._get_selected_id()
        if sid: print(f"SWITCH:{sid}", flush=True); sys.exit(0)
    def on_rename(self):
        sid = self._get_selected_id()
        if sid: print(f"RENAME:{sid}", flush=True); sys.exit(0)
    def on_clear(self):
        sid = self._get_selected_id()
        if sid: print(f"CLEAR:{sid}", flush=True); sys.exit(0)
    def on_rename_main(self):
        sid = self._get_selected_id()
        if sid: print(f"RENAME_MAIN:{sid}", flush=True); sys.exit(0)
    def on_rename_task(self):
        sid = self._get_selected_id()
        if sid: print(f"RENAME_TASK:{sid}", flush=True); sys.exit(0)
    def on_close_windows(self):
        sid = self._get_selected_id()
        if sid: print(f"CLOSE_WINDOWS:{sid}", flush=True); sys.exit(0)
    def on_undo(self): 
        print("UNDO", flush=True); sys.exit(0)

    def cleanup_empty_desktops(self):
        """Find all desktops labeled 'Empty' across all folders and move them to root."""
        root_item = self.tree.invisibleRootItem()
        target_folder = None
        
        # 1. Find the target 'root' folder (default folder)
        for i in range(root_item.childCount()):
            folder = root_item.child(i)
            if folder.data(0, Qt.UserRole + 1) == self.default_folder_name:
                target_folder = folder
                break
        
        if not target_folder:
            return

        # 2. Iterate through all other folders
        found_any = False
        for i in range(root_item.childCount()):
            folder = root_item.child(i)
            if folder == target_folder:
                continue
            
            # Find empty desktops (desktops with 'empty' in name)
            to_move = []
            for j in range(folder.childCount()):
                child = folder.child(j)
                # Check for "Empty" case-insensitively
                text = child.text(0).lower()
                if "empty" in text and "desktop" not in text:
                    to_move.append(child)
                elif text == "":
                    to_move.append(child)
            
            # Move them
            for item in to_move:
                idx = folder.indexOfChild(item)
                if idx >= 0:
                    item = folder.takeChild(idx)
                    target_folder.addChild(item)
                    found_any = True
        
        if found_any:
            # 3. Sort target folder and save
            self.sort_by_priority(save=True) # Reset sort to ensure priority is saved
            self.save_session()
            self.refresh_tree()
            self.search_entry.clear()
            QApplication.processEvents()

    def on_back(self):
        """Toggle to the last-used desktop (Alt+Tab style)."""
        try:
            with open(HISTORY_FILE, 'r') as f:
                data = json.load(f)
            
            target_uuid = data.get("last_uuid")
            
            # Smart Fallback: If no last_uuid (fresh session), try the history stack
            if not target_uuid or target_uuid == self.current_desktop_uuid:
                stack = data.get("stack", [])
                idx = data.get("index", -1)
                if idx > 0:
                    target_uuid = stack[idx-1]
                elif len(stack) > 1:
                    target_uuid = stack[1] if stack[0] == self.current_desktop_uuid else stack[0]
            
            # Ultra Fallback: Just toggle to the next desktop in the list
            if not target_uuid or target_uuid == self.current_desktop_uuid:
                for pair in self.id_name_pairs:
                    if pair[0] != self.current_desktop_uuid:
                        target_uuid = pair[0]
                        break

            if target_uuid and target_uuid != self.current_desktop_uuid:
                # Strip kwinIndex payload for the history file target (must be raw UUID)
                raw_uuid = target_uuid.split("___")[0]
                
                # Set lock so tracker knows this is intentional
                data["lock"] = True
                data["target"] = raw_uuid
                with open(HISTORY_FILE, 'w') as f:
                    json.dump(data, f, indent=2)
                
                # Switch using the raw UUID
                print(f"SWITCH_UUID:{raw_uuid}", flush=True)
                sys.exit(0)
        except Exception:
            pass

    def on_forward(self):
        """Removed in favor of Ctrl+H Toggle."""
        pass

def main():
    title_win = "Menu"
    title_label = "Select:"
    current_desktop_uuid = None
    
    args = []
    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--menu":
            title_label = sys.argv[i+1]
            i += 2
        elif sys.argv[i] == "--title":
            title_win = sys.argv[i+1]
            i += 2
        elif sys.argv[i] == "--current":
            current_desktop_uuid = sys.argv[i+1]
            i += 2
        else:
            args.append(sys.argv[i])
            i += 1
            
    id_name_pairs = []
    for i in range(0, len(args), 2):
        if i+1 < len(args):
            id_name_pairs.append((args[i], args[i+1]))

    app = QApplication(sys.argv)
    window = SwitcherMenu(title_win, title_label, current_desktop_uuid, id_name_pairs)
    window.show()
    window.search_entry.setFocus()
    sys.exit(app.exec_())

if __name__ == '__main__':
    main()
