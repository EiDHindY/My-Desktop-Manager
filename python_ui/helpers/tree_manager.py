import json
from PyQt5.QtWidgets import QTreeWidgetItem, QWidget, QVBoxLayout, QPushButton, QGridLayout, QApplication
from PyQt5.QtGui import QIcon, QFont, QColor, QBrush
from PyQt5.QtCore import Qt, QTimer
import time

def apply_live_styling(item, name, is_current, is_active):
    font = item.font(0)
    font.setBold(is_current)
    item.setFont(0, font)
    item.setBackground(0, QBrush(Qt.NoBrush))
    item.setData(0, Qt.UserRole + 4, is_current)
    
    if is_active: item.setForeground(0, QColor("#7aa2f7"))
    elif "empty" in name.lower() and len(name.strip()) <= 15: item.setForeground(0, QColor("#5c636a"))
    else: item.setForeground(0, QColor("#c8d3f5"))

def add_live_desktop_item(tree_widget, parent, uid, name, current_uuid, active_indices, notes, style_func, last_uuid=""):
    is_active = (int(uid.split("___")[1]) + 1) in active_indices if "___" in uid else False
    is_current = (uid.split("___")[0] == current_uuid)
    
    clean_name = name.replace("(Main) ", "").replace("(Task) ", "")
    display_name = ("◉ " if is_active else "○ ") + clean_name
    
    item = QTreeWidgetItem([display_name])
    item.setData(0, Qt.UserRole, uid)
    item.setData(0, Qt.UserRole + 1, clean_name)
    
    style_func(item, name, is_current, is_active)
    
    raw_uuid = uid.split("___")[0]
    is_previous = (raw_uuid == last_uuid) and not is_current
    item.setData(0, Qt.UserRole + 6, is_previous)
    
    if raw_uuid in notes:
        item.setToolTip(0, f"📝 {notes[raw_uuid]}")
    
    if parent: parent.addChild(item)
    else: tree_widget.addTopLevelItem(item)
    return item

def populate_library_tree(tree_widget, lib_data):
    tree_widget.clear()
    for folder_name in lib_data.get("folder_order", []):
        folder_item = QTreeWidgetItem()
        folder_item.setText(0, folder_name)
        folder_item.setIcon(0, QIcon.fromTheme("folder"))
        folder_item.setFont(0, QFont("Inter", 10, QFont.DemiBold))
        folder_item.setForeground(0, QBrush(QColor("#bb9af7")))
        folder_item.setData(0, Qt.UserRole, "FOLDER")
        folder_item.setData(0, Qt.UserRole + 1, folder_name)
        folder_item.setFlags(folder_item.flags() | Qt.ItemIsDropEnabled | Qt.ItemIsDragEnabled)
        tree_widget.addTopLevelItem(folder_item)
        
        for task in lib_data.get("folders", {}).get(folder_name, []):
            titem = QTreeWidgetItem()
            tname = task.get("name", "Task")
            script = task.get("script", "")
            titem.setText(0, tname + (" 🔗" if script else ""))
            titem.setIcon(0, QIcon.fromTheme("system-run") if script else QIcon.fromTheme("text-plain"))
            titem.setData(0, Qt.UserRole, task.get("id"))
            titem.setData(0, Qt.UserRole + 1, tname)
            titem.setData(0, Qt.UserRole + 2, script)
            titem.setFlags(titem.flags() | Qt.ItemIsDragEnabled)
            titem.setFlags(titem.flags() & ~Qt.ItemIsDropEnabled)
            folder_item.addChild(titem)
        # if folder_name in lib_data.get("expanded", []): folder_item.setExpanded(True)

def populate_live_tree(parent):
    parent.live_list.clear()
    session_data = parent.data_manager.load_session()
    parent.desktop_notes = {k: v for k, v in session_data.get("desktop_notes", {}).items() if v and v.strip()}
    
    live_folders = session_data.get("folders", {})
    folder_order = session_data.get("folder_order", [])
    parent.pinned_folders = session_data.get("pinned", [])
    expanded_folders = session_data.get("expanded", [])
    
    # Use saved manual order, but ensure 'root' is always at the bottom
    reordered = [f for f in folder_order if f.lower() != "root"]
    reordered.append("root")
    
    assigned_uids = set()
    root_folder_item = None
    
    for folder_name in reordered:
        if folder_name not in live_folders: continue
        uids = live_folders[folder_name]
        
        fitem = QTreeWidgetItem()
        fitem.setText(0, folder_name + (" 📌" if folder_name in parent.pinned_folders else ""))
        fitem.setData(0, Qt.UserRole + 1, folder_name)
        is_expanded = folder_name in expanded_folders
        fitem.setIcon(0, QIcon.fromTheme("folder-open" if is_expanded else "folder"))
        fitem.setFont(0, QFont("Inter", 10, QFont.DemiBold))
        fitem.setForeground(0, QBrush(QColor("#bb9af7")))
        fitem.setData(0, Qt.UserRole, "FOLDER")
        parent.live_list.addTopLevelItem(fitem)
        fitem.setExpanded(is_expanded)
        
        if folder_name.lower() == "root": root_folder_item = fitem
        
        for uid in uids:
            if uid == "ACTION_CHROME" or uid in assigned_uids: continue
            uid_base = uid.split("___")[0]
            # Match by UUID prefix — position suffix can change when desktops are added/removed
            match = next(((p[0], p[1]) for p in parent.id_name_pairs if p[0].split("___")[0] == uid_base), None)
            if match:
                current_uid, name = match
                parent.add_live_desktop_item(fitem, current_uid, name)
                assigned_uids.add(current_uid)
                assigned_uids.add(uid)  # also mark old uid to prevent double-add

    # Root items that weren't assigned
    for uid, name in parent.id_name_pairs:
        if uid == "ACTION_CHROME" or uid in assigned_uids: continue
        is_empty = "empty" in name.lower() and len(name.strip()) <= 15
        is_current = (uid.split("___")[0] == parent.current_desktop_uuid)
        is_active = (int(uid.split("___")[1]) + 1) in parent.active_kwin_indices if "___" in uid else False
        # if is_empty and not is_current and not is_active: continue
        
        if not root_folder_item:
            root_folder_item = QTreeWidgetItem()
            root_folder_item.setText(0, "root")
            root_folder_item.setData(0, Qt.UserRole, "FOLDER")
            root_folder_item.setData(0, Qt.UserRole + 1, "root")
            root_folder_item.setFont(0, QFont("Inter", 10, QFont.DemiBold))
            root_folder_item.setForeground(0, QBrush(QColor("#bb9af7")))
            root_folder_item.setExpanded(True)
            parent.live_list.addTopLevelItem(root_folder_item)
        parent.add_live_desktop_item(root_folder_item, uid, name)

    # Chrome
    for uid, name in parent.id_name_pairs:
        if uid == "ACTION_CHROME":
            item = QTreeWidgetItem([f"  🌐 {name}"])
            item.setData(0, Qt.UserRole, uid)
            item.setForeground(0, QColor("#c8d3f5"))
            parent.live_list.addTopLevelItem(item)

def update_live_priorities(parent):
    from helpers.ui_logic import calculate_sort_priority
    root = parent.live_list.invisibleRootItem()
    for i in range(root.childCount()):
        item = root.child(i)
        uid = item.data(0, Qt.UserRole)
        if uid == "FOLDER":
            name = item.data(0, Qt.UserRole + 1)
            all_active = True
            for j in range(item.childCount()):
                cuid = item.child(j).data(0, Qt.UserRole)
                if cuid and "___" in cuid and (int(cuid.split("___")[1]) + 1) not in parent.active_kwin_indices:
                    all_active = False; break
            item.setText(1, calculate_sort_priority(name, parent.pinned_folders, all_active, item.childCount() > 0))
            for j in range(item.childCount()):
                child = item.child(j)
                cuid = child.data(0, Qt.UserRole)
                group = "0" if cuid and "___" in cuid and (int(cuid.split("___")[1]) + 1) in parent.active_kwin_indices else "1"
                child.setText(1, f"I_{group}_{child.text(0)}")
        elif uid == "ACTION_CHROME": item.setText(1, "09_chrome")
        else:
            is_active = uid and "___" in uid and (int(uid.split("___")[1]) + 1) in parent.active_kwin_indices
            item.setText(1, f"{'06' if is_active else '07'}_{item.text(0)}")

def populate_notes_tree(parent):
    from PyQt5.QtWidgets import QTextEdit, QSizePolicy, QPushButton, QApplication
    from PyQt5.QtCore import QTimer, Qt
    from PyQt5.QtGui import QFont, QColor, QBrush, QIcon
    import uuid
    parent.notes_tree.clear()
    notes_data = parent.notes_data
    
    deferred_widgets = []

    def build_task_item(task, parent_item):
        titem = QTreeWidgetItem()
        titem.setText(0, task.get("text", ""))
        titem.setData(0, Qt.UserRole, task.get("id"))
        titem.setData(0, Qt.UserRole + 1, task.get("text"))
        
        titem.setFlags(titem.flags() | Qt.ItemIsUserCheckable | Qt.ItemIsDragEnabled)
        titem.setFlags(titem.flags() & ~Qt.ItemIsDropEnabled)
        titem.setCheckState(0, Qt.Checked if task.get("checked") else Qt.Unchecked)
        
        if task.get("checked"):
            font = titem.font(0)
            font.setStrikeOut(True)
            titem.setFont(0, font)
            titem.setForeground(0, QBrush(QColor("#565f89")))
        else:
            titem.setForeground(0, QBrush(QColor("#c8d3f5")))
        
        detail_item = QTreeWidgetItem()
        detail_item.setFlags(Qt.ItemIsEnabled)
        titem.addChild(detail_item)
        
        text_edit = QTextEdit()
        text_edit.setPlaceholderText("Add details...")
        details_text = task.get("details", "") or ""
        text_edit.setPlainText(details_text)
        titem.setData(0, Qt.UserRole + 2, details_text)
        
        text_edit.setStyleSheet("""
            QTextEdit {
                background-color: #222436;
                color: #a9b1d6;
                border: 1px solid #3b4261;
                border-radius: 6px;
                font-family: 'Inter';
                font-size: 11px;
                padding: 6px 28px 6px 8px;
                margin: 2px 4px 4px 4px;
            }
            QTextEdit:focus {
                border: 1px solid #565f89;
            }
        """)
        text_edit.setFixedHeight(70)
        text_edit.setCursor(Qt.IBeamCursor)
        
        def on_text_changed(t=titem, te=text_edit):
            t.setData(0, Qt.UserRole + 2, te.toPlainText())
            parent.save_notes()
            
        text_edit.textChanged.connect(on_text_changed)
        
        copy_btn = QPushButton(text_edit)
        copy_btn.setIcon(QIcon.fromTheme("edit-copy"))
        copy_btn.setFixedSize(22, 22)
        copy_btn.setCursor(Qt.PointingHandCursor)
        copy_btn.setToolTip("Copy to clipboard")
        copy_btn.setStyleSheet("""
            QPushButton {
                background-color: rgba(59, 66, 97, 180);
                border: none;
                border-radius: 4px;
                padding: 3px;
            }
            QPushButton:hover {
                background-color: #82aaff;
            }
        """)
        
        def update_btn_pos(event, te=text_edit, btn=copy_btn):
            from PyQt5.QtWidgets import QTextEdit
            QTextEdit.resizeEvent(te, event)
            btn.move(te.width() - 30, 6)
        
        text_edit.resizeEvent = update_btn_pos
        
        def do_copy(checked=False, te=text_edit, btn=copy_btn):
            clipboard = QApplication.clipboard()
            clipboard.setText(te.toPlainText())
            btn.setIcon(QIcon.fromTheme("emblem-success"))
            QTimer.singleShot(1000, lambda: btn.setIcon(QIcon.fromTheme("edit-copy")))
        
        copy_btn.clicked.connect(do_copy)
        
        if parent_item: parent_item.addChild(titem)
        else: parent.notes_tree.addTopLevelItem(titem)
        
        deferred_widgets.append((detail_item, text_edit))

    def build_folder_item(folder_data, parent_item):
        fitem = QTreeWidgetItem()
        name = folder_data.get("name", "Folder")
        fitem.setText(0, name)
        fitem.setData(0, Qt.UserRole + 1, name)
        fitem.setData(0, Qt.UserRole + 3, folder_data.get("id", str(uuid.uuid4())))
        is_expanded = folder_data.get("expanded", False)
        fitem.setIcon(0, QIcon.fromTheme("folder-open" if is_expanded else "folder"))
        fitem.setFont(0, QFont("Inter", 10, QFont.DemiBold))
        fitem.setForeground(0, QBrush(QColor("#bb9af7")))
        fitem.setData(0, Qt.UserRole, "FOLDER")
        fitem.setFlags(fitem.flags() | Qt.ItemIsDropEnabled | Qt.ItemIsDragEnabled)
        
        if parent_item: parent_item.addChild(fitem)
        else: parent.notes_tree.addTopLevelItem(fitem)
        
        fitem.setExpanded(is_expanded)
        
        for child in folder_data.get("children", []):
            if child.get("type") == "folder":
                build_folder_item(child, fitem)
            elif child.get("type") == "task":
                build_task_item(child, fitem)

    if "hierarchy" in notes_data:
        for item_data in notes_data["hierarchy"]:
            if item_data.get("type") == "folder":
                build_folder_item(item_data, None)
            elif item_data.get("type") == "task":
                build_task_item(item_data, None)
    else:
        folders = notes_data.get("folders", {})
        if "root" not in folders: folders["root"] = []
        folder_order = notes_data.get("folder_order", [])
        if "root" not in folder_order: folder_order.append("root")
        expanded = notes_data.get("expanded", [])
        if "root" not in expanded: expanded.append("root")
        
        for folder_name in folder_order:
            folder_data = {
                "id": str(uuid.uuid4()),
                "name": folder_name,
                "type": "folder",
                "expanded": folder_name in expanded,
                "children": []
            }
            for task in folders.get(folder_name, []):
                folder_data["children"].append({
                    "id": task.get("id"),
                    "text": task.get("text", ""),
                    "type": "task",
                    "checked": task.get("checked", False),
                    "details": task.get("details", "")
                })
            build_folder_item(folder_data, None)

    def _apply_widgets():
        for di, te in deferred_widgets:
            parent.notes_tree.setItemWidget(di, 0, te)
        parent.save_notes()
    
    QTimer.singleShot(0, _apply_widgets)
