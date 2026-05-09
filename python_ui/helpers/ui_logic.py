from PyQt5.QtCore import Qt

def filter_tree(tree_widget, query, tabs_index):
    """Handles the search filtering for both Live and Template tabs."""
    first_item = None
    root = tree_widget.invisibleRootItem()
    if not root: return None

    for i in range(root.childCount()):
        item = root.child(i)
        if item.data(0, Qt.UserRole) == "FOLDER":
            folder_matches = not query or query in item.text(0).lower()
            any_child_match = False
            for j in range(item.childCount()):
                child = item.child(j)
                text_to_check = child.text(0).lower()
                if tabs_index != 0: # Library tab uses extra role for name
                    text_to_check = str(child.data(0, Qt.UserRole + 1)).lower()
                
                matches = not query or query in text_to_check
                child.setHidden(not (matches or folder_matches))
                if matches or folder_matches: 
                    any_child_match = True
                    if not first_item: first_item = child
            
            item.setHidden(not (folder_matches or any_child_match))
            if (folder_matches or any_child_match) and query: item.setExpanded(True)
        else:
            matches = not query or query in item.text(0).lower()
            item.setHidden(not matches)
            if matches and not first_item: first_item = item
            
    return first_item

def calculate_sort_priority(raw_name, pinned_folders, all_active, has_members):
    """Calculates the sorting string for the hidden column."""
    if raw_name is None: raw_name = "Unknown"
    folder_name = raw_name.lower()
    if folder_name == "root":
        return "08_root"
    
    prio = "00" if raw_name in pinned_folders else "05"
    status_group = "00" if (all_active and has_members) else "01"
    return f"{prio}_{status_group}_{raw_name}"
