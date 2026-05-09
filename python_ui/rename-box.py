#!/usr/bin/env python3
import sys
import os
os.environ["QT_QPA_PLATFORM"] = "xcb"
from PyQt5.QtWidgets import QApplication, QWidget, QVBoxLayout, QLabel, QLineEdit, QGraphicsDropShadowEffect
from PyQt5.QtCore import Qt, QTimer
from PyQt5.QtGui import QFont, QColor
import subprocess

class RenameBox(QWidget):
    def __init__(self, initial_text):
        super().__init__()
        self.setWindowTitle("Rename Desktop")
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Window)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_X11NetWmWindowTypeNotification)
        
        # Geometry setup (Flush Right Edge)
        screen = QApplication.primaryScreen().geometry()
        width = 340 
        height = 220
        self.setFixedSize(width, height)
        x = screen.width() - width + 20
        y = -20
        self.move(x, y)
        
        layout = QVBoxLayout()
        layout.setContentsMargins(20, 20, 20, 20)
        self.setLayout(layout)
        
        # Main container for styling
        self.container = QWidget()
        self.container.setObjectName("container")
        self.container.setStyleSheet("""
            #container {
                background-color: rgba(30, 32, 48, 0.95);
                border-radius: 12px;
                border: 2px solid #5a4a78;
            }
        """)
        
        # Beautiful drop shadow for depth
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(25)
        shadow.setColor(QColor(0, 0, 0, 180))
        shadow.setOffset(0, 8)
        self.container.setGraphicsEffect(shadow)
        
        container_layout = QVBoxLayout()
        container_layout.setContentsMargins(20, 20, 20, 20)
        container_layout.setSpacing(12)
        self.container.setLayout(container_layout)
        
        # Label
        self.label = QLabel("Enter new desktop name:")
        self.label.setFont(QFont("Inter", 11, QFont.Medium))
        self.label.setStyleSheet("color: #a9b1d6;")
        self.label.setAlignment(Qt.AlignCenter)
        container_layout.addWidget(self.label)
        
        # Entry Field
        self.entry = QLineEdit(initial_text)
        self.entry.setFont(QFont("Inter", 12))
        self.entry.setAlignment(Qt.AlignCenter)
        self.entry.setStyleSheet("""
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
        container_layout.addWidget(self.entry)
        
        layout.addWidget(self.container)
        
        # Behaviors
        self.entry.returnPressed.connect(self.on_submit)
        
        # Initial Focus
        self.entry.setFocus()
        self.entry.setCursorPosition(len(initial_text))
        self.entry.deselect()

        # Force Focus after mapping
        QTimer.singleShot(50, self.force_focus)

    def force_focus(self):
        try:
            # Title-based targeting to avoid ID format bugs
            cmd = "kdotool search --name \"^Rename Desktop$\" windowactivate && wmctrl -F -r \"Rename Desktop\" -t -1"
            subprocess.run(["bash", "-c", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except:
            pass

    def on_submit(self):
        print(self.entry.text(), flush=True)
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

    def keyPressEvent(self, event):
        if event.key() == Qt.Key_Escape:
            sys.exit(1)
        super().keyPressEvent(event)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    initial = sys.argv[1] if len(sys.argv) > 1 else ""
    window = RenameBox(initial)
    window.show()
    sys.exit(app.exec_())
