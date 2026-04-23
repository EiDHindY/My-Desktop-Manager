import os
import subprocess
import threading
from PyQt5.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QLineEdit, QTabWidget, QLabel, QAbstractItemView, QPushButton
from PyQt5.QtGui import QIcon, QFont, QColor
from PyQt5.QtCore import Qt, QTimer
from helpers.ui_components import OutlineDelegate, FolderTreeWidget
from helpers.ui_styles import (MAIN_CONTAINER_STYLE, SEARCH_BOX_STYLE, TABS_STYLE, 
                               TREE_WIDGET_STYLE, STATUS_LABEL_STYLE, BTN_REFRESH_STYLE)

def build_main_ui(parent):
    layout = QVBoxLayout(parent)
    layout.setContentsMargins(20, 2, 20, 20)
    
    parent.container = QWidget()
    parent.container.setObjectName("container")
    parent.container.setStyleSheet(MAIN_CONTAINER_STYLE)
    container_layout = QVBoxLayout(parent.container)
    container_layout.setContentsMargins(2, 2, 2, 2)
    
    parent.search_entry = QLineEdit()
    parent.search_entry.setPlaceholderText("Search or Command...")
    parent.search_entry.addAction(QIcon.fromTheme("edit-find"), QLineEdit.LeadingPosition)
    parent.search_entry.setStyleSheet(SEARCH_BOX_STYLE)
    parent.search_entry.textChanged.connect(parent.on_search)
    
    parent.tabs = QTabWidget()
    parent.tabs.setDocumentMode(True)
    parent.tabs.setStyleSheet(TABS_STYLE)
    
    parent.live_list = create_tree_widget(parent, parent.on_live_item_clicked, parent.on_live_context_menu)
    parent.live_list.setItemDelegate(OutlineDelegate(parent.live_list))
    parent.live_list.itemExpanded.connect(lambda item: on_exp(parent, item, True))
    parent.live_list.itemCollapsed.connect(lambda item: on_col(parent, item, True))
    
    parent.tree = create_tree_widget(parent, None, parent.on_lib_context_menu)
    parent.tree.itemExpanded.connect(lambda item: on_exp(parent, item, False))
    parent.tree.itemCollapsed.connect(lambda item: on_col(parent, item, False))
    
    parent.sync_btn = QPushButton("Sync")
    parent.sync_btn.setStyleSheet(BTN_REFRESH_STYLE)
    parent.sync_btn.setToolTip("Sync app state with Dolphin templates")
    
    parent.tabs.addTab(create_tab_page(parent.live_list), "Live")
    
    # Templates page with Sync button at bottom right
    templates_page = QWidget()
    templates_layout = QVBoxLayout(templates_page)
    templates_layout.setContentsMargins(0, 0, 0, 0)
    templates_layout.setSpacing(0)
    templates_layout.addWidget(parent.tree)
    
    btn_row = QWidget()
    btn_row_layout = QHBoxLayout(btn_row)
    btn_row_layout.setContentsMargins(0, 2, 8, 4)
    btn_row_layout.addStretch()
    btn_row_layout.addWidget(parent.sync_btn)
    templates_layout.addWidget(btn_row)
    
    parent.tabs.addTab(templates_page, "Templates")
    parent.tabs.setCornerWidget(parent.search_entry, Qt.TopLeftCorner)
    
    container_layout.addWidget(parent.tabs)
    
    parent.status_row = QWidget()
    status_layout = QHBoxLayout(parent.status_row)
    status_layout.setContentsMargins(15, 0, 15, 8) # More padding at bottom
    
    parent.cleanup_btn = QPushButton("🧹 Clean All")
    parent.cleanup_btn.setStyleSheet(BTN_REFRESH_STYLE)
    parent.cleanup_btn.setToolTip("Rename all empty desktops to 'Empty'")
    status_layout.addWidget(parent.cleanup_btn)
    
    parent.status_label = QLabel("Active: - • Empty: -")
    parent.status_label.setStyleSheet(STATUS_LABEL_STYLE)
    parent.status_label.setAlignment(Qt.AlignCenter)
    status_layout.addWidget(parent.status_label, 1)
    
    # Add a spacer to the right to keep the label roughly centered
    spacer = QWidget()
    spacer.setFixedWidth(parent.cleanup_btn.sizeHint().width())
    status_layout.addWidget(spacer)
    
    container_layout.addWidget(parent.status_row)
    layout.addWidget(parent.container)

def create_tree_widget(parent, click_fn, menu_fn):
    tw = FolderTreeWidget(parent)
    tw.setHeaderHidden(True)
    tw.setColumnCount(2)
    tw.hideColumn(1)
    tw.setFont(QFont("Inter", 10))
    tw.setDragDropMode(QAbstractItemView.InternalMove)
    tw.setStyleSheet(TREE_WIDGET_STYLE)
    tw.setRootIsDecorated(False)
    tw.setIndentation(15)
    tw.setContextMenuPolicy(Qt.CustomContextMenu)
    if click_fn: tw.itemClicked.connect(click_fn)
    if menu_fn: tw.customContextMenuRequested.connect(menu_fn)
    return tw

def create_tab_page(widget):
    page = QWidget()
    l = QVBoxLayout(page)
    l.setContentsMargins(0, 0, 0, 0)
    l.addWidget(widget)
    return page

def on_exp(parent, item, is_live):
    if getattr(parent, "_is_populating", False): return
    if item.data(0, Qt.UserRole) == "FOLDER": item.setIcon(0, QIcon.fromTheme("folder-open"))
    if is_live: parent.save_session()
    else: parent.save_library()

def on_col(parent, item, is_live):
    if getattr(parent, "_is_populating", False): return
    if item.data(0, Qt.UserRole) == "FOLDER": item.setIcon(0, QIcon.fromTheme("folder"))
    if is_live: parent.save_session()
    else: parent.save_library()

def force_window_focus(title):
    try:
        pid = os.getpid()
        cmd = f"kdotool search --pid {pid} windowactivate"
        subprocess.run(["bash", "-c", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except: pass

def force_window_position(title, x, y, win_width, win_height):
    try:
        pid = os.getpid()
        # Native KWin scripting is the most reliable way in Plasma 6 (Wayland/XWayland)
        # It allows setting 'onAllDesktops' and 'keepAbove' directly in the compositor.
        script = (
            f'workspace.windowList().forEach(function(w) {{ '
            f'  if (w.pid == {pid}) {{ '
            f'    w.onAllDesktops = true; '
            f'    w.keepAbove = true; '
            f'    w.skipTaskbar = true; '
            f'    w.frameGeometry = {{x: {x}, y: {y}, width: {win_width}, height: {win_height}}}; '
            f'  }} '
            f'}});'
        )
        # Load the script, run it, and then stop it to clean up the script object
        cmd = (
            f'path=$(qdbus-qt6 org.kde.KWin /Scripting org.kde.kwin.Scripting.loadScript "{script}"); '
            f'qdbus-qt6 org.kde.KWin $path org.kde.kwin.Scripting.run; '
            f'qdbus-qt6 org.kde.KWin $path org.kde.kwin.Scripting.stop;'
        )
        subprocess.run(["bash", "-c", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except: pass
