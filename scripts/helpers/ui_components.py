from PyQt5.QtWidgets import QStyledItemDelegate, QTreeWidget, QTreeWidgetItem, QAbstractItemView, QDialog, QVBoxLayout, QLabel, QCheckBox, QListWidget, QListWidgetItem, QHBoxLayout, QPushButton
from PyQt5.QtCore import Qt, QTimer, QRect, QSize
from PyQt5.QtGui import QPainter, QPen, QColor, QIcon, QFont, QBrush
from helpers.ui_styles import SELECTION_DIALOG_STYLE, SELECTION_LABEL_STYLE, CHECKBOX_STYLE, SELECTION_LIST_STYLE, BTN_OK_STYLE, BTN_CANCEL_STYLE

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
            
        # Draw Notes Icon if present
        if index.data(Qt.UserRole + 5):
            uid = index.data(Qt.UserRole)
            is_hovered = getattr(option.widget, "_hovered_notes_uid", None) == uid
            
            icon = QIcon.fromTheme("text-plain")
            rect = option.rect
            
            # Pop up a bit when hovered
            icon_size = 14 if not is_hovered else 16
            offset = 18 if not is_hovered else 17
            
            # Draw slightly to the left (padded from right edge)
            icon_rect = QRect(rect.right() - icon_size - offset, rect.top() + (rect.height() - icon_size) // 2, icon_size, icon_size)
            
            # Subtle background badge for the icon
            painter.save()
            painter.setRenderHint(QPainter.Antialiasing)
            painter.setPen(Qt.NoPen)
            
            if is_hovered:
                # Stronger, brighter background and slightly rounder
                painter.setBrush(QColor(130, 170, 255, 100))
                bg_rect = icon_rect.adjusted(-5, -3, 5, 3)
                painter.drawRoundedRect(bg_rect, 6, 6)
            else:
                # Soft premium blue
                painter.setBrush(QColor(130, 170, 255, 35)) 
                bg_rect = icon_rect.adjusted(-6, -4, 6, 4)
                painter.drawRoundedRect(bg_rect, 4, 4)
                
            painter.restore()
            icon.paint(painter, icon_rect)

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
            
            old_parent = dragged.parent() or self.invisibleRootItem()
            old_idx = old_parent.indexOfChild(dragged)
            if old_idx < 0: return event.ignore()
            
            if target.data(0, Qt.UserRole) == "FOLDER":
                taken = old_parent.takeChild(old_idx)
                target.insertChild(0, taken)
                target.setExpanded(True)
                self.setCurrentItem(taken)
            else:
                target_parent = target.parent() or self.invisibleRootItem()
                taken = old_parent.takeChild(old_idx)
                target_idx = target_parent.indexOfChild(target)
                if old_parent == target_parent and old_idx < target_idx: 
                    target_idx -= 1
                if drop_indicator == QAbstractItemView.BelowItem: 
                    target_idx += 1
                target_parent.insertChild(target_idx, taken)
                if target.parent():
                    target_parent.setExpanded(True)
                self.setCurrentItem(taken)
            event.ignore()
        QTimer.singleShot(50, self._save_after_drop)
    
    def _save_after_drop(self):
        parent = self.parent()
        while parent:
            if hasattr(parent, 'save_session'):
                parent.save_session()
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
        self.setStyleSheet(SELECTION_DIALOG_STYLE)
        
        layout = QVBoxLayout(self)
        self.label = QLabel("Select tasks to deploy to Life:")
        self.label.setFont(QFont("Inter", 11, QFont.Bold))
        self.label.setStyleSheet(SELECTION_LABEL_STYLE)
        layout.addWidget(self.label)
        
        self.select_all_cb = QCheckBox("Select All")
        self.select_all_cb.setStyleSheet(CHECKBOX_STYLE)
        self.select_all_cb.stateChanged.connect(self.on_select_all_changed)
        layout.addWidget(self.select_all_cb)
        
        self.list_widget = QListWidget()
        self.list_widget.setStyleSheet(SELECTION_LIST_STYLE)
        
        for item_text in items:
            list_item = QListWidgetItem(item_text)
            list_item.setFlags(list_item.flags() | Qt.ItemIsUserCheckable)
            list_item.setCheckState(Qt.Unchecked)
            self.list_widget.addItem(list_item)
            
        layout.addWidget(self.list_widget)
        
        btn_layout = QHBoxLayout()
        self.btn_ok = QPushButton("Deploy Selected")
        self.btn_ok.setStyleSheet(BTN_OK_STYLE)
        self.btn_ok.clicked.connect(self.accept)
        
        self.btn_cancel = QPushButton("Cancel")
        self.btn_cancel.setStyleSheet(BTN_CANCEL_STYLE)
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
