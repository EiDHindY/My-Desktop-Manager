#!/usr/bin/env python3
import sys
import os
os.environ["QT_QPA_PLATFORM"] = "xcb"
import subprocess
import threading
from PyQt5.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout, 
                             QLabel, QLineEdit, QListWidget, QPushButton, 
                             QGraphicsDropShadowEffect, QListWidgetItem)
from PyQt5.QtCore import Qt, QEvent, pyqtSignal, QObject, QTimer
from PyQt5.QtGui import QFont, QColor

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

class SwitcherMenu(QWidget):
    def __init__(self, title_win, title_label, current_desktop_uuid, id_name_pairs):
        super().__init__()
        self.setWindowTitle(title_win)
        self.id_name_pairs = id_name_pairs
        self.current_pairs = list(id_name_pairs)
        self.current_desktop_uuid = current_desktop_uuid
        self.active_kwin_indices = set()
        
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Window)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_X11NetWmWindowTypeNotification)
        
        # Geometry setup (Flush Right Edge)
        screen = QApplication.primaryScreen().geometry()
        width = 340 
        height = 720
        self.setFixedSize(width, height)
        
        x = screen.width() - width + 20
        y = -20
        self.move(x, y)
        
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(20, 20, 20, 20)
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
        
        # Low profile shadow
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(10)
        shadow.setColor(QColor(0, 0, 0, 120))
        shadow.setOffset(0, 2)
        self.container.setGraphicsEffect(shadow)
        
        container_layout = QVBoxLayout()
        container_layout.setContentsMargins(6, 6, 6, 6)
        container_layout.setSpacing(6)
        self.container.setLayout(container_layout)
        
        self.title_label = QLabel(title_label)
        self.title_label.setFont(QFont("Inter", 11, QFont.Medium))
        self.title_label.setStyleSheet("color: #a9b1d6;")
        container_layout.addWidget(self.title_label)
        
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
        
        self.listbox = QListWidget()
        self.listbox.setFont(QFont("Inter", 10))
        self.listbox.setFocusPolicy(Qt.NoFocus)
        self.listbox.setStyleSheet("""
            QListWidget {
                background-color: #222436;
                color: #c8d3f5;
                border: 1px solid #3b4261;
                border-radius: 8px;
                padding: 5px;
                outline: none;
            }
            QListWidget::item {
                padding: 8px;
                border-radius: 4px;
            }
            QListWidget::item:hover {
                background-color: #2f334d;
            }
            QListWidget::item:selected {
                background-color: #82aaff;
                color: #1e2030;
                font-weight: bold;
            }
        """)
        container_layout.addWidget(self.listbox)
        
        # Buttons Row
        btn_layout = QHBoxLayout()
        btn_layout.setContentsMargins(0, 5, 0, 0)
        
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
        
        # Buttons Layout (Organized Grid)
        btns_container_layout = QVBoxLayout()
        btns_container_layout.setSpacing(6)
        
        row1 = QHBoxLayout(); row1.setSpacing(6)
        row2 = QHBoxLayout(); row2.setSpacing(6)
        row3 = QHBoxLayout(); row3.setSpacing(6)
        
        row1.addWidget(self.rename_btn)
        row1.addWidget(self.close_btn)
        
        row2.addWidget(self.undo_btn)
        row2.addWidget(self.done_btn)
        
        row3.addWidget(self.go_btn)
        
        self.close_app_btn = QPushButton("Close App")
        self.close_app_btn.setStyleSheet(btn_style)
        self.close_app_btn.setToolTip("(Alt+X)")
        self.close_app_btn.clicked.connect(lambda: sys.exit(0))
        row3.addWidget(self.close_app_btn)
        
        btns_container_layout.addLayout(row1)
        btns_container_layout.addLayout(row2)
        btns_container_layout.addLayout(row3)
        
        container_layout.addLayout(btns_container_layout)
        main_layout.addWidget(self.container)
        
        # Behaviors
        self.listbox.itemDoubleClicked.connect(self.on_switch)
        
        # Populate
        self.populate_list(initial_set=True)
        
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
        
        # Immediate focus
        self.search_entry.setFocus()
        self.activateWindow()
        self.raise_()

    def force_focus(self):
        try:
            # We use title-based targeting for both tools to avoid ID mismatch bugs on Wayland.
            # kdotool handles the focus, wmctrl handles the "stickiness" (follow-me).
            cmd = f"kdotool search --name \"^{self.force_focus_title}$\" windowactivate && wmctrl -F -r \"{self.force_focus_title}\" -t -1"
            subprocess.run(["bash", "-c", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except:
            pass

    def trigger_bg_check(self):
        threading.Thread(target=self.fetcher.fetch_windows_bg, daemon=True).start()

    def apply_active_windows(self, new_indices):
        if self.active_kwin_indices != new_indices:
            self.active_kwin_indices = new_indices
            self.refresh_list()
        QTimer.singleShot(1000, self.trigger_bg_check)

    def get_display_name(self, idx, id_val, name_val):
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

    def refresh_list(self):
        for i in range(self.listbox.count()):
            item = self.listbox.item(i)
            cid, cname = self.current_pairs[i]
            item.setText(self.get_display_name(i, cid, cname))

    def populate_list(self, initial_set=False):
        self.listbox.clear()
        found_row = 0
        for idx, (cid, cname) in enumerate(self.current_pairs):
            item = QListWidgetItem(self.get_display_name(idx, cid, cname))
            item.setForeground(self.get_color(cname))
            self.listbox.addItem(item)
            
            if self.current_desktop_uuid and initial_set:
                if self.current_desktop_uuid in cid:
                    found_row = idx
                    
        if self.current_pairs:
            self.listbox.setCurrentRow(found_row)

    def on_search(self, text):
        query = text.lower()
        if not query:
            self.current_pairs = list(self.id_name_pairs)
        else:
            self.current_pairs = [pair for pair in self.id_name_pairs if query in pair[1].lower()]
        self.populate_list()

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
                
        # Mouse double click
        if obj == self.listbox and event.type() == QEvent.KeyPress:
             # handle listbox keys if needed (already handled globally though)
             pass
            
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

    def move_up(self):
        row = self.listbox.currentRow()
        if row > 0:
            self.listbox.setCurrentRow(row - 1)
            
    def move_down(self):
        row = self.listbox.currentRow()
        if row < self.listbox.count() - 1:
            self.listbox.setCurrentRow(row + 1)

    def _get_selected_id(self):
        row = self.listbox.currentRow()
        if 0 <= row < len(self.current_pairs):
            return self.current_pairs[row][0]
        return None

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
