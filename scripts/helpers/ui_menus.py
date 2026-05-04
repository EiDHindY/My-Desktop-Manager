import sys
from PyQt5.QtWidgets import QMenu, QInputDialog
from PyQt5.QtCore import Qt
from helpers.ui_styles import CONTEXT_MENU_STYLE

def show_live_context_menu(parent, pos):
    item = parent.live_list.itemAt(pos)
    if not item: return
    uid = item.data(0, Qt.UserRole)
    
    menu = QMenu(parent)
    menu.installEventFilter(parent)
    menu.setStyleSheet(CONTEXT_MENU_STYLE)
    
    if uid == "FOLDER":
        fn = item.data(0, Qt.UserRole + 1) or item.text(0).strip()
        is_pinned = fn in parent.pinned_folders
        
        a_pin = menu.addAction("📍 Unpin Folder" if is_pinned else "📌 Pin Folder")
        a_pin.triggered.connect(lambda: parent.toggle_pin(fn))
        
        menu.addSeparator()
        menu.addAction("🚀 Summon Folder").triggered.connect(lambda: sys.exit(print(f"SUMMON_FOLDER:{fn}", flush=True) or 0))
        menu.addAction("➕ Create Desktop").triggered.connect(lambda: sys.exit(print(f"CREATE_LIVE_DESKTOP:{fn}", flush=True) or 0))
        menu.addAction("🗑 Remove Folder Grouping").triggered.connect(lambda: sys.exit(print(f"REMOVE_LIVE_FOLDER:{fn}", flush=True) or 0))
    elif uid == "ACTION_CHROME":
        menu.addAction("🚀 Go").triggered.connect(lambda: sys.exit(print(f"SWITCH:{uid}") or 0))
    else:
        menu.addAction("✏️ Rename").triggered.connect(lambda: sys.exit(print(f"RENAME:{uid}") or 0))
        if item.parent() and item.parent().data(0, Qt.UserRole) == "FOLDER":
            fn = item.parent().text(0).strip()
            menu.addAction("🧹 Empty Desktop").triggered.connect(lambda: sys.exit(print(f"CLEAR:{uid}") or 0))
        
        menu.addAction("🚀 Summon Desktop").triggered.connect(lambda: sys.exit(print(f"SUMMON:{uid}", flush=True) or 0))
        menu.addAction("🧹 Close Windows").triggered.connect(lambda: sys.exit(print(f"CLOSE_WINDOWS:{uid}", flush=True) or 0))
        menu.addAction("📝 Edit Desktop Note").triggered.connect(lambda: parent.edit_desktop_note(uid))
        menu.addSeparator()
        menu.addAction("🚀 Go").triggered.connect(lambda: sys.exit(print(f"SWITCH:{uid}", flush=True) or 0))

    menu.exec_(parent.live_list.viewport().mapToGlobal(pos))

def show_lib_context_menu(parent, pos):
    item = parent.tree.itemAt(pos)
    menu = QMenu(parent)
    menu.installEventFilter(parent)
    menu.setStyleSheet(CONTEXT_MENU_STYLE)
    
    if item is None:
        menu.addAction("New Folder").triggered.connect(parent.create_folder)
        menu.addAction("📂 Import Folder from Computer").triggered.connect(parent.import_folder)
    elif item.data(0, Qt.UserRole) == "FOLDER":
        fn = item.data(0, Qt.UserRole + 1)
        deploy_menu = menu.addMenu("🚀 Deploy to Live")
        deploy_menu.setStyleSheet(CONTEXT_MENU_STYLE)
        deploy_menu.addAction("🚀 Deploy All tasks").triggered.connect(lambda: sys.exit(print(f"DEPLOY_ALL:{fn}") or 0))
        deploy_menu.addAction("✅ Select Tasks to Deploy...").triggered.connect(lambda: parent.deploy_selected(item))
        
        menu.addSeparator()
        menu.addAction("➕ Add App Desktop").triggered.connect(lambda: parent.add_app_desktop(item))
        menu.addAction("✏️ Rename Folder").triggered.connect(lambda: parent.rename_lib_item(item))
        menu.addAction("🗑 Delete Folder").triggered.connect(lambda: parent.delete_lib_item(item))
    else:
        tid = item.data(0, Qt.UserRole)
        p = item.parent()
        fn = p.data(0, Qt.UserRole + 1) if p else ""
        menu.addAction("🚀 Deploy Single Desktop").triggered.connect(lambda: sys.exit(print(f"DEPLOY_TASK:{fn}:{tid}", flush=True) or 0))
        menu.addSeparator()
        menu.addAction("🔗 Link Startup Script").triggered.connect(lambda: parent.link_script(item))
        menu.addAction("📝 Edit Script").triggered.connect(lambda: parent.edit_script(item))
        menu.addAction("✏️ Rename App Desktop").triggered.connect(lambda: parent.rename_lib_item(item))
        menu.addAction("🗑 Delete App Desktop").triggered.connect(lambda: parent.delete_lib_item(item))
            
    menu.exec_(parent.tree.viewport().mapToGlobal(pos))
