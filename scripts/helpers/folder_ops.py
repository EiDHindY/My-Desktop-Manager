import os
import uuid
from pathlib import Path
from PyQt5.QtWidgets import QInputDialog, QTreeWidgetItem, QFileDialog
from PyQt5.QtGui import QIcon, QFont, QColor, QBrush
from PyQt5.QtCore import Qt

def create_folder(parent):
    name, ok = QInputDialog.getText(parent, "New Folder", "Folder name:", text="")
    if ok and name.strip():
        folder_name = name.strip()
        # Prevent immediate duplicate creation
        existing = [parent.tree.topLevelItem(i).data(0, Qt.UserRole + 1) for i in range(parent.tree.topLevelItemCount())]
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
        parent.tree.addTopLevelItem(folder_item)
        folder_item.setExpanded(True)
        parent.save_library()

def import_folder(parent):
    default_dir = os.path.expanduser("~/.local/bin")
    folder_path = QFileDialog.getExistingDirectory(parent, "Select Folder to Import", default_dir)
    if not folder_path: return
    
    dir_path = Path(folder_path)
    folder_name = dir_path.name
    
    folder_item = QTreeWidgetItem()
    folder_item.setText(0, folder_name)
    folder_item.setIcon(0, QIcon.fromTheme("folder"))
    folder_item.setFont(0, QFont("Inter", 10, QFont.DemiBold))
    folder_item.setForeground(0, QBrush(QColor("#bb9af7")))
    folder_item.setData(0, Qt.UserRole, "FOLDER")
    folder_item.setData(0, Qt.UserRole + 1, folder_name)
    folder_item.setFlags(folder_item.flags() | Qt.ItemIsDropEnabled | Qt.ItemIsDragEnabled)
    parent.tree.addTopLevelItem(folder_item)
    folder_item.setExpanded(True)
    
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
    parent.save_library()

def rename_lib_item(parent, item):
    is_folder = item.data(0, Qt.UserRole) == "FOLDER"
    old_name = item.data(0, Qt.UserRole + 1)
    name, ok = QInputDialog.getText(parent, "Rename", "New name:", text=old_name)
    if ok and name.strip():
        new_name = name.strip()
        item.setData(0, Qt.UserRole + 1, new_name)
        if is_folder:
            item.setText(0, new_name)
        else:
            script = item.data(0, Qt.UserRole + 2)
            item.setText(0, new_name + (" 🔗" if script else ""))
        parent.save_library()

def link_script(parent, item):
    dialog = QFileDialog(parent)
    dialog.setWindowTitle("Select Startup Script")
    dialog.setDirectory(os.path.expanduser("~/.local/bin"))
    dialog.setFileMode(QFileDialog.ExistingFile)
    if dialog.exec_():
        file_path = dialog.selectedFiles()[0]
        cmd = f"bash '{file_path}'" if file_path.endswith('.sh') else f"'{file_path}'"
        item.setData(0, Qt.UserRole + 2, cmd)
def delete_lib_item(parent, item):
    is_folder = item.data(0, Qt.UserRole) == "FOLDER"
    folder_name = item.data(0, Qt.UserRole + 1) if is_folder else None
    
    parent_item = item.parent()
    if parent_item:
        parent_item.removeChild(item)
    else:
        idx = parent.tree.indexOfTopLevelItem(item)
        if idx >= 0: parent.tree.takeTopLevelItem(idx)
    
    parent.save_library()
    if is_folder and folder_name:
        sys.exit(print(f"REMOVE_LIBRARY_FOLDER:{folder_name}", flush=True) or 0)

def add_app_desktop(parent, folder_item):
    name, ok = QInputDialog.getText(parent, "New App Desktop", "Task name:")
    if ok and name.strip():
        titem = QTreeWidgetItem()
        tname = name.strip()
        titem.setText(0, tname)
        titem.setIcon(0, QIcon.fromTheme("text-plain"))
        titem.setForeground(0, QBrush(QColor("#c8d3f5")))
        titem.setData(0, Qt.UserRole, str(uuid.uuid4()))
        titem.setData(0, Qt.UserRole + 1, tname)
        titem.setData(0, Qt.UserRole + 2, "")
        titem.setFlags(titem.flags() | Qt.ItemIsDragEnabled)
        titem.setFlags(titem.flags() & ~Qt.ItemIsDropEnabled)
        folder_item.addChild(titem)
        folder_item.setExpanded(True)
        parent.save_library()

def deploy_selected(parent, folder_item):
    from helpers.ui_components import SelectionDialog
    import sys
    folder_name = folder_item.data(0, Qt.UserRole + 1)
    tasks = [folder_item.child(i).data(0, Qt.UserRole + 1) for i in range(folder_item.childCount())]
    if not tasks: return
    
    dialog = SelectionDialog(f"Deploy {folder_name}", tasks, parent)
    if dialog.exec_():
        selected = dialog.get_selected()
        if selected:
            task_list = "|".join(selected)
            sys.exit(print(f"DEPLOY_SELECTED:{folder_name}:{task_list}") or 0)
