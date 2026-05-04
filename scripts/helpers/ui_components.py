from PyQt5.QtWidgets import (QStyledItemDelegate, QTreeWidget, QTreeWidgetItem, QAbstractItemView,
                             QDialog, QVBoxLayout, QLabel, QCheckBox, QListWidget, QListWidgetItem,
                             QHBoxLayout, QPushButton, QSizePolicy, QWidget, QTextEdit, QGraphicsDropShadowEffect)
from PyQt5.QtCore import Qt, QTimer, QRect, QSize, QPoint, QPointF
from PyQt5.QtGui import QPainter, QPen, QColor, QIcon, QFont, QBrush, QPainterPath, QLinearGradient
import time
from helpers.ui_styles import (SELECTION_DIALOG_STYLE, SELECTION_LABEL_STYLE, CHECKBOX_STYLE,
                               SELECTION_LIST_STYLE, BTN_OK_STYLE, BTN_CANCEL_STYLE, NOTE_POPUP_STYLE)

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

        # Draw "← back" indicator for the previous desktop (where Ctrl+R goes)
        is_previous = index.data(Qt.UserRole + 6)
        if is_previous:
            painter.save()
            painter.setRenderHint(QPainter.Antialiasing)
            
            rect = option.rect
            # Draw a small pill badge on the right edge showing "←"
            font = painter.font()
            font.setPointSize(7)
            font.setBold(True)
            painter.setFont(font)
            
            badge_w, badge_h = 20, 14
            badge_x = rect.right() - badge_w - 4
            badge_y = rect.top() + (rect.height() - badge_h) // 2
            badge_rect = QRect(badge_x, badge_y, badge_w, badge_h)
            
            # Subtle amber/gold pill to distinguish from the blue current-desktop outline
            painter.setPen(Qt.NoPen)
            painter.setBrush(QColor(255, 185, 100, 40))
            painter.drawRoundedRect(badge_rect, 7, 7)
            
            painter.setPen(QColor(255, 185, 100, 200))
            painter.drawText(badge_rect, Qt.AlignCenter, "←")
            
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
        self.btn_ok.setCursor(Qt.PointingHandCursor)
        self.btn_ok.clicked.connect(self.accept)
        
        self.btn_cancel = QPushButton("Cancel")
        self.btn_cancel.setStyleSheet(BTN_CANCEL_STYLE)
        self.btn_cancel.setCursor(Qt.PointingHandCursor)
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
        self._prev_time = time.time()
        self._last_tick_time = time.time()
        self._prev_pos = QPoint()
        self._friction = 0.92
        self._is_coasting = False
        self._physics_timer = None # Use a high-frequency timer for physics
        self._slingshot_enabled = False  # Toggled via right-click menu
        self._is_slingshotting = False   # True while currently pulling
        self._slingshot_anchor = QPoint()
        self._overlay = None
        
        self._goal_enabled = False
        self._goal_window = None
        self._moving_goal_enabled = False
        self._gravity = 0.0  # Pixels per frame^2
        self._shot_multiplier = 18.0

    # ── Mouse handling ──────────────────────────────────────────────
    def mousePressEvent(self, event):
        if event.button() == Qt.RightButton:
            self.show_speed_menu(event.globalPos())
            event.accept()
            return
            
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
        
        self._is_slingshotting = self._slingshot_enabled or bool(event.modifiers() & Qt.AltModifier)
        if self._is_slingshotting:
            self._slingshot_anchor = self.window().pos()
            self.setCursor(Qt.CrossCursor)
            
            if not self._overlay:
                self._overlay = SlingshotOverlay()
            self._overlay.gravity = self._gravity
            self._overlay.multiplier = self._shot_multiplier
            self._overlay.show()
            self._overlay.update_slingshot(self._slingshot_anchor, self.window().pos())
        else:
            self.setCursor(Qt.ClosedHandCursor)
        
        # Tell main window we're dragging (prevents heartbeat snapping)
        window = self.window()
        if hasattr(window, "_is_dragging"):
            window._is_dragging = True
        event.accept()

    def mouseMoveEvent(self, event):
        if not self._ball_dragging:
            return  # Completely ignore hover moves
            
        # Dynamically check Alt key state during drag
        is_alt_held = bool(event.modifiers() & Qt.AltModifier)
        should_be_slingshotting = self._slingshot_enabled or is_alt_held
        
        # Transition into slingshot mode mid-drag
        if should_be_slingshotting and not self._is_slingshotting:
            self._is_slingshotting = True
            self._slingshot_anchor = self.window().pos()
            self._press_pos = event.globalPos() # Reset pull origin
            self.setCursor(Qt.CrossCursor)
            if not self._overlay:
                self._overlay = SlingshotOverlay()
            self._overlay.gravity = self._gravity
            self._overlay.multiplier = self._shot_multiplier
            self._overlay.show()
            self._overlay.update_slingshot(self._slingshot_anchor, self.window().pos())
            
        # Transition out of slingshot mode mid-drag
        elif not should_be_slingshotting and self._is_slingshotting:
            self._is_slingshotting = False
            self.setCursor(Qt.ClosedHandCursor)
            if self._overlay:
                self._overlay.hide_slingshot()
            # Restore window to cursor position smoothly
            self.window().move(self._slingshot_anchor)
            # Re-calculate drag offset so dragging feels seamless from here
            self._drag_offset = event.globalPos() - self.window().frameGeometry().topLeft()
            
        if self._is_slingshotting:
            # Slingshot rubber-band effect
            dp = event.globalPos() - self._press_pos
            dist = (dp.x()**2 + dp.y()**2)**0.5
            max_pull = 120.0
            if dist > 0:
                visual_dist = min(dist, max_pull) * 0.4 # Resistance feeling
                vx = (dp.x() / dist) * visual_dist
                vy = (dp.y() / dist) * visual_dist
                new_pos = self._slingshot_anchor + QPoint(int(vx), int(vy))
                self.window().move(new_pos)
                if self._overlay:
                    self._overlay.update_slingshot(self._slingshot_anchor, new_pos)
            return
        
        # Normal drag: Move the window
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
        
        # Click vs flick/shoot detection
        dist = (event.globalPos() - self._press_pos).manhattanLength()
        
        if dist < 8:
            # It was a click — expand (if slingshot mode, snap back first)
            if self._is_slingshotting:
                self.window().move(self._slingshot_anchor)
            if hasattr(window, 'toggle_collapse'):
                window.toggle_collapse()
            event.accept()
            return
            
        if self._is_slingshotting:
            self._is_slingshotting = False
            if self._overlay:
                self._overlay.hide_slingshot()
                
            # Snap back to original position
            self.window().move(self._slingshot_anchor)
            
            # Shoot in the opposite direction!
            dp = event.globalPos() - self._press_pos
            pull_dist = (dp.x()**2 + dp.y()**2)**0.5
            
            if pull_dist > 15:
                # Multiply the vector heavily
                multiplier = self._shot_multiplier
                self._velocity = QPointF(-dp.x() * multiplier, -dp.y() * multiplier)
                self._is_coasting = True
                self._last_tick_time = time.time()
                self._momentum_timer.start(10) # Higher frequency for smoother feel
            else:
                if hasattr(window, 'save_ui_state'):
                    window.save_ui_state()
            event.accept()
            return
        
        # Check if the release was recent enough to count as a flick (Normal mode)
        time_since_last_move = time.time() - self._prev_time
        speed = (self._velocity.x()**2 + self._velocity.y()**2) ** 0.5
        
        if speed > 150 and time_since_last_move < 0.1:
            # Genuine flick — start coasting
            self._is_coasting = True
            self._last_tick_time = time.time()
            self._momentum_timer.start(10)  # Higher frequency
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
            
        now = time.time()
        dt = now - self._last_tick_time
        self._last_tick_time = now
        
        # Limit dt to avoid huge jumps if the system stutters
        dt = min(dt, 0.05)
        
        window = self.window()
        step = self._velocity * dt
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
            # If we hit the floor, stop gravity from accumulating too much
            if new_pos.y() + window.height() >= screen.height() and self._gravity > 0:
                self._velocity.setY(min(self._velocity.y(), 0))

        window.move(new_pos)
        
        # Apply gravity (integrated over dt)
        if self._gravity > 0:
            self._velocity.setY(self._velocity.y() + self._gravity * dt * 60)
        
        # Goal check
        # Soccer Goal check
        if getattr(self, '_goal_enabled', False) and getattr(self, '_goal_window', None):
            if window.frameGeometry().intersects(self._goal_window.geometry()):
                if not getattr(self._goal_window, '_is_celebrating', False):
                    # We scored!
                    self._goal_window.on_goal()
                    # Stop the ball inside the goal
                    self._velocity = QPointF(0, 0)
                    self._momentum_timer.stop()
                    self._is_coasting = False
                    if hasattr(window, 'save_ui_state'):
                        window.save_ui_state()
                    return
                    

        
        # Friction (normalized to 60fps)
        friction_factor = self._friction ** (dt * 60)
        self._velocity *= friction_factor
        
        # Stop when slow
        if (self._velocity.x()**2 + self._velocity.y()**2) ** 0.5 < 15:
            self._momentum_timer.stop()
            self._is_coasting = False
            self._velocity = QPointF(0, 0)
            if hasattr(window, 'save_ui_state'):
                window.save_ui_state()

    # ── Speed Settings Menu ─────────────────────────────────────────
    def show_speed_menu(self, pos):
        from PyQt5.QtWidgets import QMenu, QActionGroup
        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu {
                background: #1e2030; 
                color: #c8d3f5; 
                border: 1px solid #3b4261; 
                border-radius: 8px; 
                padding: 4px;
                font-family: 'Inter';
            }
            QMenu::item:selected {
                background: #1e2a4a;
                border-radius: 4px;
            }
        """)
        
        group = QActionGroup(menu)
        
        speeds = {
            "Slow (Stops quickly)": 0.85,
            "Normal (Default)": 0.92,
            "Fast (Slides longer)": 0.97,
            "Ice (Very fast)": 0.99,
            "Perpetual (Never stops)": 1.0
        }
        
        for name, value in speeds.items():
            action = menu.addAction(name)
            action.setCheckable(True)
            if abs(self._friction - value) < 0.01:
                action.setChecked(True)
            group.addAction(action)
            action.triggered.connect(lambda checked, v=value: self.set_friction(v))
            
        menu.addSeparator()
        
        slingshot_action = menu.addAction("🎯 Slingshot Mode (Angry Birds)")
        slingshot_action.setCheckable(True)
        slingshot_action.setChecked(self._slingshot_enabled)
        slingshot_action.triggered.connect(self.toggle_slingshot)
        
        goal_action = menu.addAction("🥅 Goal Target Mode")
        goal_action.setCheckable(True)
        goal_action.setChecked(self._goal_enabled)
        goal_action.triggered.connect(self.toggle_goal)
        
        moving_goal_action = menu.addAction("⚽️ Moving Goal Mode")
        moving_goal_action.setCheckable(True)
        moving_goal_action.setChecked(self._moving_goal_enabled)
        moving_goal_action.triggered.connect(self.toggle_moving_goal)
        
        moving_goal_action.triggered.connect(self.toggle_moving_goal)
        
        menu.addSeparator()
        menu.addAction("Hint: Hold Alt to slingshot temporarily").setEnabled(False)
            
        menu.exec_(pos)

    def set_friction(self, value):
        self._friction = value
        self._save_state()
        
    def toggle_slingshot(self, checked):
        self._slingshot_enabled = checked
        self._save_state()
        
    def toggle_goal(self, checked):
        self.set_goal_enabled(checked)
        self._save_state()
        
    def toggle_moving_goal(self, checked):
        self._moving_goal_enabled = checked
        if checked and not self._goal_enabled:
            self.set_goal_enabled(True)
        elif self._goal_window:
            self._goal_window.set_moving(checked)
        self._save_state()
        
    def set_goal_enabled(self, enabled):
        self._goal_enabled = enabled
        if enabled:
            if not getattr(self, '_goal_window', None):
                self._goal_window = GoalWidget()
            self._goal_window.set_moving(self._moving_goal_enabled)
            self._goal_window.spawn_randomly()
        else:
            if getattr(self, '_goal_window', None):
                self._goal_window.hide()
        
    def _save_state(self):
        window = self.window()
        if hasattr(window, 'save_ui_state'):
            window.save_ui_state()

# ── Goal Mini-Game ────────────────────────────────────────────────────────
import random
from PyQt5.QtWidgets import QLabel, QVBoxLayout

class GoalWidget(QWidget):
    def __init__(self):
        super().__init__(None)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool | Qt.WindowDoesNotAcceptFocus | Qt.WindowTransparentForInput)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setFixedSize(30, 120)
        
        self.label = QLabel("G\nO\nA\nL", self)
        self.label.setStyleSheet("color: #bb9af7; font-weight: bold; font-family: 'Inter'; background: rgba(26, 32, 53, 200); border: 2px solid #3b4261; border-radius: 8px;")
        self.label.setAlignment(Qt.AlignCenter)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.label)
        
        self.score = 0
        self._is_celebrating = False
        self._is_moving = False
        self._move_speed = 3
        self._move_dir = 1
        self._edge = "left"
        self._screen_geom = None
        self._curr_x = 0
        self._curr_y = 0
        
        self._move_timer = QTimer(self)
        self._move_timer.timeout.connect(self._do_move)
        
    def set_moving(self, moving):
        self._is_moving = moving
        if moving:
            self._move_timer.start(10) # Faster poll for smoothness
            if self._edge == "top":
                self.label.setText("⚽️ MOVING ⚽️")
            else:
                self.label.setText("M\nO\nV\nI\nN\nG")
        else:
            self._move_timer.stop()
            if self._edge == "top":
                self.label.setText("GOAL")
            else:
                self.label.setText("G\nO\nA\nL")
        
    def _do_move(self):
        if self._is_celebrating: return
        
        if not self._screen_geom:
            from PyQt5.QtWidgets import QApplication
            screen = QApplication.primaryScreen()
            if not screen: return
            self._screen_geom = screen.geometry()
            
        screen = self._screen_geom
        pos = self.pos()
        
        if self._edge == "top":
            self._curr_x += self._move_speed * self._move_dir
            if self._curr_x < 0 or self._curr_x + self.width() > screen.width():
                self._move_dir *= -1
                self._curr_x = max(0, min(self._curr_x, screen.width() - self.width()))
            self.setGeometry(int(self._curr_x), 0, self.width(), self.height())
        else:
            self._curr_y += self._move_speed * self._move_dir
            if self._curr_y < 0 or self._curr_y + self.height() > screen.height():
                self._move_dir *= -1
                self._curr_y = max(0, min(self._curr_y, screen.height() - self.height()))
            self.setGeometry(int(pos.x()), int(self._curr_y), self.width(), self.height())
        
    def spawn_randomly(self):
        from PyQt5.QtWidgets import QApplication
        screen = QApplication.primaryScreen().geometry()
        
        self._edge = random.choice(["left", "right", "top"])
        self._move_dir = random.choice([-1, 1])
        self._move_speed = random.randint(3, 7)
        
        if self._edge == "top":
            self.setFixedSize(120, 30)
            self.label.setText("GOAL")
            x = random.randint(50, screen.width() - 150)
            self._curr_x = x
            self._curr_y = 0
            self.setGeometry(x, 0, 120, 30)
        else:
            self.setFixedSize(30, 120)
            self.label.setText("G\nO\nA\nL")
            y = random.randint(50, screen.height() - 150)
            self._curr_y = y
            if self._edge == "left":
                self._curr_x = 0
                self.setGeometry(0, y, 30, 120)
            else:
                self._curr_x = screen.width() - self.width()
                self.setGeometry(self._curr_x, y, 30, 120)
            
        self.show()
        
    def on_goal(self):
        self._is_celebrating = True
        self.score += 1
        
        if self.width() > self.height():
            self.label.setText(f"★ {self.score} ★")
        else:
            self.label.setText(f"★\n{self.score}\n★")
            
        self.label.setStyleSheet("color: #1a2035; font-weight: bold; background: rgba(195, 232, 141, 230); border: 2px solid #9ece6a; border-radius: 8px;")
        
        # Respawn after 1.5 seconds
        QTimer.singleShot(1500, self._reset_and_respawn)
        
    def _reset_and_respawn(self):
        self._is_celebrating = False
        self.label.setStyleSheet("color: #bb9af7; font-weight: bold; font-family: 'Inter'; background: rgba(26, 32, 53, 200); border: 2px solid #3b4261; border-radius: 8px;")
        self.spawn_randomly()

# ── Slingshot Overlay ─────────────────────────────────────────────────────
from PyQt5.QtGui import QPainter, QPen, QColor

class SlingshotOverlay(QWidget):
    def __init__(self):
        super().__init__(None)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool | Qt.WindowTransparentForInput | Qt.WindowDoesNotAcceptFocus)
        self.setAttribute(Qt.WA_TranslucentBackground)
        
        from PyQt5.QtWidgets import QApplication
        self.setGeometry(QApplication.primaryScreen().geometry())
        
        self.anchor_pos = QPoint()
        self.current_pos = QPoint()
        self.is_active = False
        self.gravity = 0.0
        self.multiplier = 18.0

    def update_slingshot(self, anchor, current):
        self.anchor_pos = anchor
        self.current_pos = current
        self.is_active = True
        self.update()

    def hide_slingshot(self):
        self.is_active = False
        self.update()
        self.hide()

    def paintEvent(self, event):
        if not self.is_active:
            return
            
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        
        # Center of the anchor (the slingshot base)
        ax = self.anchor_pos.x() + 20
        ay = self.anchor_pos.y() + 20
        # Center of the pulled ball
        cx = self.current_pos.x() + 20
        cy = self.current_pos.y() + 20
        
        # Calculate pull vector
        dp_x = cx - ax
        dp_y = cy - ay
        pull_dist = (dp_x**2 + dp_y**2)**0.5
        
        # 1. Draw the "Slingshot" base (Wooden Y-shape)
        base_pen = QPen(QColor(139, 69, 19, 255), 8, Qt.SolidLine, Qt.RoundCap) # Brown wood
        painter.setPen(base_pen)
        painter.drawLine(ax, ay + 15, ax, ay + 45) # Stand (sticking down)
        painter.drawLine(ax, ay + 15, ax - 18, ay - 10) # Left fork
        painter.drawLine(ax, ay + 15, ax + 18, ay - 10) # Right fork
        
        left_fork = QPoint(ax - 18, ay - 10)
        right_fork = QPoint(ax + 18, ay - 10)
        
        # 2. Draw rubber bands with premium styling
        # Use a gradient for the bands to look like stretched rubber
        thickness = max(2, 6 - int(pull_dist / 35))
        band_color = QColor(60, 30, 20)
        
        painter.setPen(QPen(band_color, thickness, Qt.SolidLine, Qt.RoundCap))
        
        # Draw bands with slight glow/shadow
        path = QPainterPath()
        path.moveTo(left_fork)
        path.lineTo(cx, cy)
        path.lineTo(right_fork)
        
        # Draw a subtle "shadow" line first
        painter.save()
        painter.setPen(QPen(QColor(0, 0, 0, 80), thickness + 2, Qt.SolidLine, Qt.RoundCap))
        painter.drawPath(path)
        painter.restore()
        
        # Draw the main band
        grad = QLinearGradient(QPointF(ax, ay), QPointF(cx, cy))
        grad.setColorAt(0, band_color)
        grad.setColorAt(1, QColor(100, 50, 35)) # Lighter where stretched
        painter.setPen(QPen(grad, thickness, Qt.SolidLine, Qt.RoundCap))
        painter.drawPath(path)
        
        # 3. Draw trajectory dots (Glowing and Parabolic)
        if pull_dist > 5:
            painter.setPen(Qt.NoPen)
            
            vx = -dp_x * self.multiplier
            vy = -dp_y * self.multiplier
            
            curr_x = float(ax)
            curr_y = float(ay)
            
            for i in range(1, 18): # More dots for smoothness
                # Simulate path
                for _ in range(4):
                    vy += self.gravity
                    curr_x += vx * 0.016
                    curr_y += vy * 0.016
                
                # Glowing effect: draw a faint large circle then a bright small one
                opacity = max(0, 220 - (i * 12)) # Fade out
                base_color = QColor(255, 255, 255, opacity)
                
                # Glow
                painter.setBrush(QColor(130, 170, 255, opacity // 3))
                glow_size = max(2, 7 - (i * 0.3))
                painter.drawEllipse(QPointF(curr_x, curr_y), glow_size, glow_size)
                
                # Core
                painter.setBrush(base_color)
                radius = max(1.5, 4 - (i * 0.2))
                painter.drawEllipse(QPointF(curr_x, curr_y), radius, radius)
                
        painter.end()


class NoteEditorPopup(QWidget):
    """A floating, draggable popup for editing the desktop note."""
    def __init__(self, main_win):
        super().__init__(None, Qt.Window | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint)
        self.main_win = main_win
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setObjectName("notePopup")
        self.setStyleSheet(NOTE_POPUP_STYLE)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 6, 10, 8)
        layout.setSpacing(6)

        # Header
        header = QWidget()
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(0, 0, 0, 0)
        self.title_label = QLabel("📝 Desktop")
        self.title_label.setObjectName("notePopupTitle")
        
        close_btn = QPushButton("×")
        close_btn.setObjectName("notePopupClose")
        close_btn.setFixedSize(22, 22)
        close_btn.setCursor(Qt.PointingHandCursor)
        close_btn.clicked.connect(self.hide)
        
        header_layout.addWidget(self.title_label)
        header_layout.addStretch()
        header_layout.addWidget(close_btn)
        layout.addWidget(header)

        # Text area
        self.text_edit = QTextEdit()
        self.text_edit.setObjectName("notePopupText")
        self.text_edit.setPlaceholderText("Write a reminder for this desktop...")
        layout.addWidget(self.text_edit)

        # Button row
        btn_row = QWidget()
        btn_row_layout = QHBoxLayout(btn_row)
        btn_row_layout.setContentsMargins(0, 0, 0, 0)
        
        save_btn = QPushButton("💾 Save")
        save_btn.setObjectName("notePopupSave")
        save_btn.setCursor(Qt.PointingHandCursor)
        save_btn.clicked.connect(self.save_note)
        
        del_btn = QPushButton("🗑 Clear")
        del_btn.setObjectName("notePopupDelete")
        del_btn.setCursor(Qt.PointingHandCursor)
        del_btn.clicked.connect(self.clear_note)
        
        btn_row_layout.addWidget(save_btn)
        btn_row_layout.addStretch()
        btn_row_layout.addWidget(del_btn)
        layout.addWidget(btn_row)

        # Add size grip to bottom right corner
        from PyQt5.QtWidgets import QSizeGrip
        grip_layout = QHBoxLayout()
        grip_layout.setContentsMargins(0, 0, 0, 0)
        grip_layout.addStretch()
        grip = QSizeGrip(self)
        grip.setFixedSize(12, 12)
        grip_layout.addWidget(grip)
        layout.addLayout(grip_layout)
        
        # Shadow
        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(20)
        shadow.setOffset(0, 4)
        shadow.setColor(QColor(0, 0, 0, 120))
        self.setGraphicsEffect(shadow)
        
        self.resize(250, 180)

        # Custom dragging logic on header
        self._dragging = False
        self._drag_pos = QPoint()
        header.mousePressEvent = self.header_mousePressEvent
        header.mouseMoveEvent = self.header_mouseMoveEvent
        header.mouseReleaseEvent = self.header_mouseReleaseEvent

    def header_mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._dragging = True
            self._drag_pos = event.globalPos() - self.frameGeometry().topLeft()
            event.accept()

    def header_mouseMoveEvent(self, event):
        if self._dragging:
            self.move(event.globalPos() - self._drag_pos)
            event.accept()

    def header_mouseReleaseEvent(self, event):
        self._dragging = False
        event.accept()

    def show_note(self, title, text, pos):
        self.title_label.setText(f"📝  {title}")
        self.text_edit.setPlainText(text)
        self.move(pos.x(), pos.y() - self.height() - 10)
        self.show()
        self.text_edit.setFocus()
        
    def save_note(self):
        self.main_win.save_note_from_popup(self.text_edit.toPlainText().strip())
        self.hide()
        
    def clear_note(self):
        self.main_win.delete_note_from_popup()
        self.hide()
