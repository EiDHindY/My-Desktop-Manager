# ui_styles.py
# This file contains the design system for the Desktop Manager.

MAIN_CONTAINER_STYLE = """
    #container { 
        background-color: rgba(30,32,48,0.92); 
        border-radius: 10px; 
        border: 1.5px solid #3b4261; 
    }
    #container[active="true"] {
        border: 1.5px solid #82aaff;
    }
"""

SEARCH_BOX_STYLE = """
    QLineEdit { 
        background-color: #222436; 
        color: #c8d3f5; 
        border: none; 
        border-radius: 12px; 
        padding: 4px 6px; 
        margin: 4px 4px 4px 8px;
        outline: none;
    } 
    QLineEdit:focus { 
        background-color: #1e2030; 
    }
"""

TABS_STYLE = """
    QTabWidget::pane { 
        border-top: 1px solid #3b4261; 
        background: transparent;
    }
    QTabBar::tab { 
        background: transparent; 
        color: #5c636a; 
        padding: 10px 12px; 
        margin-top: 4px;
        border-bottom: 2px solid transparent;
    }
    QTabBar::tab:selected { 
        color: #82aaff; 
        font-weight: bold; 
        border-bottom: 2px solid #82aaff; 
    }
    QTabBar::tab:hover { 
        color: #c8d3f5;
        background: rgba(130, 170, 255, 0.05);
    }
"""

TREE_WIDGET_STYLE = """
    QTreeWidget { 
        background-color: #1e2030; 
        color: #c8d3f5; 
        border: none; 
        padding: 2px 0px; 
        outline: none; 
        show-decoration-selected: 1; 
    } 
    QTreeWidget::branch { 
        background-color: #1e2030; 
    }
    QTreeWidget::item { 
        padding: 4px 2px; 
        border-radius: 4px; 
        margin: 0px; 
    } 
    QTreeWidget::item:hover { 
        background-color: rgba(47, 51, 77, 0.7); 
    } 
    QTreeWidget::item:selected { 
        background-color: rgba(130, 170, 255, 0.85); 
        color: #1e2030; 
    }
    QScrollBar:vertical { 
        background: transparent; 
        width: 16px;
        border-radius: 8px; 
        margin: 4px 0; 
    }
    QScrollBar::handle:vertical { 
        background: #3b4261; 
        border-radius: 3px; 
        min-height: 30px;
        margin: 0 5px; /* appears ~6px wide by default */
    }
    QScrollBar::handle:vertical:hover { 
        background: #82aaff;
        border-radius: 6px;
        margin: 0 1px; /* fills most of the track on hover */
    }
    QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { 
        height: 0; 
    }
"""

STATUS_LABEL_STYLE = "QLabel { color: #82aaff; font-family: 'Inter'; font-size: 11px; margin-top: 4px; margin-bottom: 2px; }"

SELECTION_DIALOG_STYLE = "QDialog { background-color: #1e2030; color: #c8d3f5; }"
SELECTION_LABEL_STYLE = "color: #82aaff; margin-bottom: 5px;"
SELECTION_LIST_STYLE = """
    QListWidget { background-color: #222436; color: #c8d3f5; border: 1px solid #3b4261; border-radius: 4px; padding: 5px; }
    QListWidget::item { padding: 5px; }
    QListWidget::item:hover { background-color: #2f334d; }
"""
CHECKBOX_STYLE = """
    QCheckBox { color: #c8d3f5; font-size: 10pt; margin-bottom: 5px; }
    QCheckBox::indicator { width: 16px; height: 16px; border: 1px solid #3b4261; border-radius: 3px; background: #222436; }
    QCheckBox::indicator:checked { background: #82aaff; image: url(none); }
"""
BTN_OK_STYLE = "QPushButton { background-color: #82aaff; color: #1e2030; font-weight: bold; padding: 8px; border-radius: 4px; } QPushButton:hover { background-color: #6593f5; }"
BTN_CANCEL_STYLE = "QPushButton { background-color: #3b4261; color: #c8d3f5; padding: 8px; border-radius: 4px; } QPushButton:hover { background-color: #444b6a; }"

CONTEXT_MENU_STYLE = "QMenu { background: #2f334d; color: #c8d3f5; border: 1px solid #3b4261; border-radius: 6px; } QMenu::item { padding: 6px 20px; } QMenu::item:selected { background: #82aaff; color: #1e2030; }"

BTN_REFRESH_STYLE = """
    QPushButton { 
        background-color: transparent; 
        color: #82aaff; 
        border: 1px solid #3b4261; 
        border-radius: 12px; 
        padding: 4px 8px; 
        font-family: 'Inter'; 
        font-size: 10px; 
    } 
    QPushButton:hover { 
        background-color: rgba(130, 170, 255, 0.1); 
        border-color: #82aaff; 
    }
    QPushButton:pressed {
        background-color: rgba(130, 170, 255, 0.2);
    }
"""

BTN_DRAG_STYLE = """
    QPushButton { 
        background-color: transparent; 
        color: #5c636a; 
        border: 1px solid #3b4261; 
        border-radius: 12px; 
        padding: 0px; 
        font-family: 'Inter'; 
        font-size: 14px; 
    } 
    QPushButton:hover { 
        background-color: rgba(130, 170, 255, 0.1); 
        color: #82aaff;
        border-color: #82aaff; 
    }
"""

BALL_STYLE = """
    #ball {
        background-color: #82aaff;
        border-radius: 20px;
        border: 2px solid #1e2030;
    }
    #ball:hover {
        background-color: #6593f5;
    }
"""

BTN_COLLAPSE_STYLE = """
    QPushButton { 
        background-color: transparent; 
        color: #82aaff; 
        border: 1px solid #3b4261; 
        border-radius: 12px; 
        padding: 0px; 
        font-family: 'Inter'; 
        font-size: 16px; 
        margin-right: 8px;
    } 
    QPushButton:hover { 
        background-color: rgba(130, 170, 255, 0.1); 
        border-color: #82aaff; 
    }
"""

BTN_NOTE_STYLE = """
    QPushButton { 
        background-color: transparent; 
        color: #3b4261; 
        border: 1px solid #2f334d; 
        border-radius: 12px; 
        padding: 0px; 
        font-size: 14px; 
    } 
    QPushButton:hover { 
        background-color: rgba(255, 185, 100, 0.08); 
        border-color: #3b4261; 
    }
"""

BTN_NOTE_ACTIVE_STYLE = """
    QPushButton { 
        background-color: rgba(255, 185, 100, 0.12); 
        color: #ffb964; 
        border: 1px solid #ffb964; 
        border-radius: 12px; 
        padding: 0px; 
        font-size: 14px; 
    } 
    QPushButton:hover { 
        background-color: rgba(255, 185, 100, 0.22); 
        border-color: #ffd080; 
    }
"""

NOTE_POPUP_STYLE = """
    #notePopup {
        background-color: #1a1c2e;
        border: 1px solid rgba(255, 185, 100, 0.4);
        border-radius: 8px;
    }
    #notePopupHandle {
        background-color: rgba(255, 185, 100, 0.25);
        border-radius: 2px;
    }
    #notePopupHandle:hover {
        background-color: rgba(255, 185, 100, 0.55);
    }
    #notePopupTitle {
        color: #ffb964;
        font-family: 'Inter';
        font-size: 11px;
        font-weight: bold;
    }
    #notePopupText {
        background-color: #222436;
        color: #c8d3f5;
        border: 1px solid #3b4261;
        border-radius: 6px;
        padding: 8px;
        font-family: 'Inter';
        font-size: 11px;
        selection-background-color: rgba(255, 185, 100, 0.3);
    }
    #notePopupText:focus {
        border-color: #ffb964;
        border-width: 1px;
    }
    #notePopupClose {
        background: transparent;
        color: #5c636a;
        border: none;
        font-size: 18px;
        font-weight: bold;
        padding: 0px;
    }
    #notePopupClose:hover { color: #ff757f; }
    #notePopupSave {
        background-color: rgba(255, 185, 100, 0.15);
        color: #ffb964;
        border: 1px solid #ffb964;
        border-radius: 6px;
        padding: 4px 18px;
        font-family: 'Inter';
        font-size: 10px;
        font-weight: bold;
    }
    #notePopupSave:hover { background-color: rgba(255, 185, 100, 0.3); }
    #notePopupDelete {
        background-color: rgba(255, 117, 127, 0.1);
        color: #ff757f;
        border: 1px solid rgba(255, 117, 127, 0.4);
        border-radius: 6px;
        padding: 4px 12px;
        font-family: 'Inter';
        font-size: 10px;
    }
    #notePopupDelete:hover { background-color: rgba(255, 117, 127, 0.25); }
"""
