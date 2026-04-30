from PyQt5.QtWidgets import QStyledItemDelegate, QTreeWidget, QTreeWidgetItem, QAbstractItemView, QDialog, QVBoxLayout, QLabel, QCheckBox, QListWidget, QListWidgetItem, QHBoxLayout, QPushButton, QSizePolicy
from PyQt5.QtCore import Qt, QTimer, QRect, QSize, QPoint, QPointF
from PyQt5.QtGui import QPainter, QPen, QColor, QIcon, QFont, QBrush
import time
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

class DragAnchor(QPushButton):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._dragging = False
        self._drag_pos = None
        self.setCursor(Qt.SizeAllCursor)
        self.setSizePolicy(QSizePolicy.Fixed, QSizePolicy.Fixed)
        self.setFixedSize(30, 24)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._dragging = True
            window = self.window()
            self._drag_pos = event.globalPos() - window.frameGeometry().topLeft()
            
            # Notify the main window that dragging started to avoid snapping/updates
            if hasattr(window, "_is_dragging"):
                window._is_dragging = True
                
            event.accept()
        else:
            super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._dragging and event.buttons() & Qt.LeftButton:
            window = self.window()
            window.move(event.globalPos() - self._drag_pos)
            event.accept()
        else:
            super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._dragging = False
            window = self.window()
            
            if hasattr(window, "_is_dragging"):
                window._is_dragging = False
                
            if hasattr(window, 'save_ui_state'):
                window.save_ui_state()
            event.accept()
        else:
            super().mouseReleaseEvent(event)

class BallWidget(QPushButton):
    """A draggable ball with momentum physics. Does NOT inherit DragAnchor to avoid
    any inherited mouse behavior that could conflict with hover/focus events."""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("ball")
        self.setFixedSize(40, 40)
        self.setToolTip("Click to expand")
        self.setCursor(Qt.OpenHandCursor)
        
        # Drag state — strictly gated by _ball_dragging
        self._ball_dragging = False
        self._drag_offset = QPoint()
        self._press_pos = QPoint()
        
        # Momentum physics
        self._momentum_timer = QTimer(self)
        self._momentum_timer.timeout.connect(self._tick_momentum)
        self._velocity = QPointF(0, 0)
        self._prev_time = 0.0
        self._prev_pos = QPoint()
        self._friction = 0.92
        self._is_coasting = False  # True only while momentum is active

    # ── Mouse handling ──────────────────────────────────────────────
    def mousePressEvent(self, event):
        if event.button() != Qt.LeftButton:
            return
        # Stop any ongoing momentum coast
        self._momentum_timer.stop()
        self._is_coasting = False
        self._velocity = QPointF(0, 0)
        
        # Begin drag tracking
        self._ball_dragging = True
        self._press_pos = event.globalPos()
        self._drag_offset = event.globalPos() - self.window().frameGeometry().topLeft()
        self._prev_time = time.time()
        self._prev_pos = event.globalPos()
        self.setCursor(Qt.ClosedHandCursor)
        
        # Tell main window we're dragging (prevents heartbeat snapping)
        window = self.window()
        if hasattr(window, "_is_dragging"):
            window._is_dragging = True
        event.accept()

    def mouseMoveEvent(self, event):
        if not self._ball_dragging:
            return  # Completely ignore hover moves
        
        # Move the window
        self.window().move(event.globalPos() - self._drag_offset)
        
        # Track velocity with smoothing
        now = time.time()
        dt = now - self._prev_time
        if dt > 0.001:  # avoid division by near-zero
            dp = event.globalPos() - self._prev_pos
            instant_vel = QPointF(dp.x() / dt, dp.y() / dt)
            self._velocity = self._velocity * 0.3 + instant_vel * 0.7
        
        self._prev_time = now
        self._prev_pos = event.globalPos()
        event.accept()

    def mouseReleaseEvent(self, event):
        if event.button() != Qt.LeftButton:
            return
        
        was_dragging = self._ball_dragging
        self._ball_dragging = False
        self.setCursor(Qt.OpenHandCursor)
        
        window = self.window()
        if hasattr(window, "_is_dragging"):
            window._is_dragging = False
        
        if not was_dragging:
            return
        
        # Click vs flick detection
        dist = (event.globalPos() - self._press_pos).manhattanLength()
        
        if dist < 8:
            # It was a click — expand
            if hasattr(window, 'toggle_collapse'):
                window.toggle_collapse()
            event.accept()
            return
        
        # Check if the release was recent enough to count as a flick
        time_since_last_move = time.time() - self._prev_time
        speed = (self._velocity.x()**2 + self._velocity.y()**2) ** 0.5
        
        if speed > 150 and time_since_last_move < 0.1:
            # Genuine flick — start coasting
            self._is_coasting = True
            self._momentum_timer.start(16)  # ~60fps
        else:
            # Slow release — just save position
            if hasattr(window, 'save_ui_state'):
                window.save_ui_state()
        
        event.accept()

    # ── Momentum physics ────────────────────────────────────────────
    def _tick_momentum(self):
        if not self._is_coasting:
            self._momentum_timer.stop()
            return
            
        window = self.window()
        step = self._velocity * 0.016  # 16ms per frame
        new_pos = window.pos() + step.toPoint()
        
        # Screen boundaries
        from PyQt5.QtWidgets import QApplication
        screen = QApplication.primaryScreen().geometry()
        
        # Bounce off edges
        if new_pos.x() < 0 or new_pos.x() + window.width() > screen.width():
            self._velocity.setX(-self._velocity.x() * 0.3)
            new_pos.setX(max(0, min(new_pos.x(), screen.width() - window.width())))
            
        if new_pos.y() < 0 or new_pos.y() + window.height() > screen.height():
            self._velocity.setY(-self._velocity.y() * 0.3)
            new_pos.setY(max(0, min(new_pos.y(), screen.height() - window.height())))

        window.move(new_pos)
        
        # Friction
        self._velocity *= self._friction
        
        # Stop when slow
        if (self._velocity.x()**2 + self._velocity.y()**2) ** 0.5 < 15:
            self._momentum_timer.stop()
            self._is_coasting = False
            self._velocity = QPointF(0, 0)
            if hasattr(window, 'save_ui_state'):
                window.save_ui_state()
