import sys
import os
from PyQt5.QtWidgets import QApplication, QWidget
from helpers.ui_factory import build_main_ui

class TestWin(QWidget):
    def __init__(self):
        super().__init__()
        build_main_ui(self)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    try:
        w = TestWin()
        print("Initialization successful")
    except Exception as e:
        print(f"Initialization failed: {e}")
        import traceback
        traceback.print_exc()
