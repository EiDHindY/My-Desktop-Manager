from PyQt5.QtCore import Qt

def move_up(parent):
    if parent.tabs.currentIndex() == 0:
        current = parent.live_list.currentItem()
        if not current: return
        above = parent.live_list.itemAbove(current)
        if above: parent.live_list.setCurrentItem(above)
    else:
        current = parent.tree.currentItem()
        if not current: return
        above = parent.tree.itemAbove(current)
        while above and above.data(0, Qt.UserRole) == "FOLDER":
            above = parent.tree.itemAbove(above)
        if above: parent.tree.setCurrentItem(above)

def move_down(parent):
    if parent.tabs.currentIndex() == 0:
        current = parent.live_list.currentItem()
        if not current:
            root = parent.live_list.invisibleRootItem()
            if root.childCount() > 0: parent.live_list.setCurrentItem(root.child(0))
            return
        below = parent.live_list.itemBelow(current)
        if below: parent.live_list.setCurrentItem(below)
    else:
        current = parent.tree.currentItem()
        if not current:
            root = parent.tree.invisibleRootItem()
            if root.childCount() > 0:
                folder = root.child(0)
                if folder.childCount() > 0: parent.tree.setCurrentItem(folder.child(0))
            return
        below = parent.tree.itemBelow(current)
        while below and below.data(0, Qt.UserRole) == "FOLDER":
            below = parent.tree.itemBelow(below)
        if below: parent.tree.setCurrentItem(below)

def get_selected_uid(parent):
    if parent.tabs.currentIndex() == 0:
        item = parent.live_list.currentItem()
        if item: return item.data(0, Qt.UserRole)
    else:
        item = parent.tree.currentItem()
        if item and item.data(0, Qt.UserRole) != "FOLDER":
            return item.data(0, Qt.UserRole)
    return None
