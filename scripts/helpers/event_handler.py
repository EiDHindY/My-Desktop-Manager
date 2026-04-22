import sys
import json
import time
import subprocess
from PyQt5.QtCore import Qt, QEvent, QTimer, QCoreApplication
from PyQt5.QtGui import QKeyEvent, QCursor
from PyQt5.QtWidgets import QMenu

def handle_event(parent, obj, event):
    # Window Focus Highlight
    if event.type() == QEvent.WindowActivate:
        parent.container.setProperty("active", "true")
        parent.container.style().unpolish(parent.container)
        parent.container.style().polish(parent.container)
    elif event.type() == QEvent.WindowDeactivate:
        parent.container.setProperty("active", "false")
        parent.container.style().unpolish(parent.container)
        parent.container.style().polish(parent.container)

    if obj == parent.live_list.viewport():
        if event.type() == QEvent.MouseMove:
            item = parent.live_list.itemAt(event.pos())
            tree = parent.live_list
            old_hover = getattr(tree, "_hovered_notes_uid", None)
            new_hover = None
            if item:
                rect = tree.visualItemRect(item)
                if event.pos().x() >= rect.right() - 40:
                    uid = item.data(0, Qt.UserRole)
                    if uid and item.data(0, Qt.UserRole + 5):
                        new_hover = uid
            if old_hover != new_hover:
                tree._hovered_notes_uid = new_hover
                tree.viewport().update()
                parent.setCursor(Qt.PointingHandCursor if new_hover else Qt.ArrowCursor)
                    
        elif event.type() == QEvent.Leave:
            tree = parent.live_list
            if getattr(tree, "_hovered_notes_uid", None) is not None:
                tree._hovered_notes_uid = None
                tree.viewport().update()
                parent.setCursor(Qt.ArrowCursor)
                
        elif event.type() == QEvent.MouseButtonRelease:
            if event.button() == Qt.LeftButton:
                item = parent.live_list.itemAt(event.pos())
                if item:
                    rect = parent.live_list.visualItemRect(item)
                    if event.pos().x() >= rect.right() - 40:
                        uid = item.data(0, Qt.UserRole)
                        if uid and uid != "FOLDER":
                            QTimer.singleShot(0, lambda: parent.edit_desktop_note(uid))
                            return True
                        
    if isinstance(obj, QMenu) and event.type() == QEvent.KeyPress:
        key = event.key()
        if event.modifiers() == Qt.ControlModifier:
            if key == Qt.Key_J:
                QCoreApplication.sendEvent(obj, QKeyEvent(QEvent.KeyPress, Qt.Key_Down, Qt.NoModifier))
                return True
            elif key == Qt.Key_K:
                QCoreApplication.sendEvent(obj, QKeyEvent(QEvent.KeyPress, Qt.Key_Up, Qt.NoModifier))
                return True
        return False

    if event.type() == QEvent.KeyPress:
        key, mod, text = event.key(), event.modifiers(), event.text()
        
        # Alphanumeric keys: Redirect to search if not already focused
        if text and text.isprintable() and not (mod & (Qt.ControlModifier | Qt.AltModifier)):
            if obj != parent.search_entry:
                parent.search_entry.setFocus()
                parent.search_entry.insert(text)
                return True
        
        if mod == (Qt.ControlModifier | Qt.ShiftModifier):
            if key == Qt.Key_N and parent.tabs.currentIndex() == 1:
                parent.create_folder(); return True
                
        if mod == Qt.ControlModifier:
            if key == Qt.Key_R: parent.on_back(); return True
            elif key == Qt.Key_J: parent.move_down(); return True
            elif key == Qt.Key_K: parent.move_up(); return True
            elif key == Qt.Key_Slash:
                widget = parent.live_list if parent.tabs.currentIndex() == 0 else parent.tree
                item = widget.currentItem()
                if item:
                    rect = widget.visualItemRect(item)
                    if parent.tabs.currentIndex() == 0: parent.on_live_context_menu(rect.center())
                    else: parent.on_lib_context_menu(rect.center())
                return True
            elif key == Qt.Key_Y:
                uid = parent.get_selected_uid()
                if uid and parent.tabs.currentIndex() == 0:
                    print(f"CLEAR:{uid}", flush=True)
                    sys.exit(0)
                return True
            elif key == Qt.Key_BracketLeft:
                parent.setWindowOpacity(max(0.1, parent.windowOpacity() - 0.05))
                parent.save_ui_state(); return True
            elif key == Qt.Key_BracketRight:
                parent.setWindowOpacity(min(1.0, parent.windowOpacity() + 0.05))
                parent.save_ui_state(); return True
            elif key == Qt.Key_Backspace:
                parent.search_entry.clear(); return True
            elif key == Qt.Key_Z:
                print("UNDO", flush=True)
                sys.exit(0)
                return True
        
        if key == Qt.Key_Up: parent.move_up(); return True
        elif key == Qt.Key_Down: parent.move_down(); return True
        elif key == Qt.Key_Return:
            uid = parent.get_selected_uid()
            if uid and parent.tabs.currentIndex() == 0:
                parent.switch_desktop(uid)
            return True
        elif key == Qt.Key_Escape:
            if parent.search_entry.text(): parent.search_entry.clear()
            else: sys.exit(0)
            return True
            
    return None
