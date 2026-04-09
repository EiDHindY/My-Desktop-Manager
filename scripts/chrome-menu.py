#!/usr/bin/env python3
import sys
import os
os.environ["QT_QPA_PLATFORM"] = "xcb"
from PyQt5.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout, 
                             QLabel, QLineEdit, QListWidget, QPushButton, 
                             QGraphicsDropShadowEffect, QListWidgetItem)
from PyQt5.QtCore import Qt, QEvent, QTimer
from PyQt5.QtGui import QFont, QColor
import subprocess

class ChromeMenu(QWidget):
    def __init__(self, id_name_pairs):
        super().__init__()
        self.setWindowTitle("Chrome Launcher")
        self.id_name_pairs = id_name_pairs
        self.current_pairs = list(id_name_pairs)
        
        # Frameless and translucent
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Window)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_X11NetWmWindowTypeNotification)
        
        # Geometry setup (Flush Right Edge)
        screen = QApplication.primaryScreen().geometry()
        width = 340 
        height = 650
        self.setFixedSize(width, height)
        x = screen.width() - width + 20
        y = -20
        self.move(x, y)
        
        main_layout = QVBoxLayout()
        main_layout.setContentsMargins(20, 20, 20, 20)
        self.setLayout(main_layout)
        
        # Main Container
        self.container = QWidget()
        self.container.setObjectName("container")
        self.container.setStyleSheet("""
            #container {
                background-color: rgba(30, 32, 48, 0.95);
                border-radius: 12px;
                border: 2px solid #5a4a78;
            }
        """)
        
        # Drop Shadow
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(25)
        shadow.setColor(QColor(0, 0, 0, 180))
        shadow.setOffset(0, 8)
        self.container.setGraphicsEffect(shadow)
        
        container_layout = QVBoxLayout()
        container_layout.setContentsMargins(20, 20, 20, 20)
        container_layout.setSpacing(12)
        self.container.setLayout(container_layout)
        
        # Title
        self.title_label = QLabel("Select a profile to launch:")
        self.title_label.setFont(QFont("Inter", 11, QFont.Medium))
        self.title_label.setStyleSheet("color: #a9b1d6;")
        container_layout.addWidget(self.title_label)
        
        # Search Box
        self.search_entry = QLineEdit()
        self.search_entry.setFont(QFont("Inter", 11))
        self.search_entry.setPlaceholderText("Search...")
        self.search_entry.setStyleSheet("""
            QLineEdit {
                background-color: #2f334d;
                color: #c8d3f5;
                border: 2px solid #3b4261;
                border-radius: 8px;
                padding: 8px;
            }
            QLineEdit:focus {
                border: 2px solid #82aaff;
            }
        """)
        self.search_entry.textChanged.connect(self.on_search)
        container_layout.addWidget(self.search_entry)
        
        # ListBox
        self.listbox = QListWidget()
        self.listbox.setFont(QFont("Inter", 10))
        self.listbox.setFocusPolicy(Qt.NoFocus)  # Prevent grabbing focus from search
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
        
        # Button Frame
        btn_layout = QHBoxLayout()
        btn_layout.setContentsMargins(0, 5, 0, 0)
        
        btn_style = """
            QPushButton {
                background-color: #2f334d;
                color: #c8d3f5;
                border: 1px solid #3b4261;
                border-radius: 6px;
                padding: 8px 16px;
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
        
        self.cancel_btn = QPushButton("Cancel")
        self.cancel_btn.setStyleSheet(btn_style)
        self.cancel_btn.clicked.connect(self.on_cancel)
        btn_layout.addWidget(self.cancel_btn)
        
        btn_layout.addStretch()
        
        self.launch_btn = QPushButton("Launch Chrome")
        self.launch_btn.setStyleSheet(btn_style)
        self.launch_btn.clicked.connect(self.on_switch)
        btn_layout.addWidget(self.launch_btn)
        
        container_layout.addLayout(btn_layout)
        main_layout.addWidget(self.container)
        
        # Populate
        self.populate_list()
        
        # Global Event Filter for shortcuts
        self.installEventFilter(self)
        self.search_entry.installEventFilter(self)

        # Force Focus after mapping
        QTimer.singleShot(50, self.force_focus)

    def force_focus(self):
        try:
            # Title-based targeting to avoid ID format bugs
            cmd = "kdotool search --name \"^Chrome Launcher$\" windowactivate && wmctrl -F -r \"Chrome Launcher\" -t -1"
            subprocess.run(["bash", "-c", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except:
            pass
        
    def populate_list(self):
        self.listbox.clear()
        for idx, (cid, name) in enumerate(self.current_pairs):
            item = QListWidgetItem(f"   {name}")
            self.listbox.addItem(item)
        if self.current_pairs:
            self.listbox.setCurrentRow(0)

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
            
            # Nav up/down inside the search box globally
            if key == Qt.Key_Up or (key == Qt.Key_K and modifiers == Qt.ControlModifier):
                row = self.listbox.currentRow()
                if row > 0:
                    self.listbox.setCurrentRow(row - 1)
                return True
            elif key == Qt.Key_Down or (key == Qt.Key_J and modifiers == Qt.ControlModifier):
                row = self.listbox.currentRow()
                if row < self.listbox.count() - 1:
                    self.listbox.setCurrentRow(row + 1)
                return True
            elif key == Qt.Key_Return:
                self.on_switch()
                return True
            elif key == Qt.Key_Escape:
                if self.search_entry.text():
                    self.search_entry.clear()
                else:
                    self.on_cancel()
                return True
            elif key == Qt.Key_Backspace and modifiers == Qt.ControlModifier:
                self.search_entry.clear()
                return True
                
        return super().eventFilter(obj, event)

    def on_switch(self):
        row = self.listbox.currentRow()
        if row >= 0 and row < len(self.current_pairs):
            selected_id = self.current_pairs[row][0]
            print(f"{selected_id}", flush=True)
            sys.exit(0)
            
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

    def on_cancel(self):
        sys.exit(1)

def main():
    app = QApplication(sys.argv)
    
    args = sys.argv[1:]
    id_name_pairs = []
    for i in range(0, len(args), 2):
        if i+1 < len(args):
            id_name_pairs.append((args[i], args[i+1]))
            
    window = ChromeMenu(id_name_pairs)
    window.show()
    window.search_entry.setFocus()
    sys.exit(app.exec_())

if __name__ == '__main__':
    main()
