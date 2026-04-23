import json
import os
from pathlib import Path

def load_json(path, default=None):
    try:
        if Path(path).exists():
            with open(path, "r") as f:
                return json.load(f)
    except Exception: pass
    return default if default is not None else {}

def save_json(path, data):
    try:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving to {path}: {e}")
        return False

class DataManager:
    def __init__(self, config_dir):
        self.config_dir = Path(config_dir)
        self.library_file = self.config_dir / "library.json"
        self.session_file = self.config_dir / "session.json"
        self.ui_state_file = self.config_dir / "ui_state.json"
        self.history_file = self.config_dir / "history.json"

    def load_library(self):
        templates_dir = self.config_dir / "templates"
        templates_dir.mkdir(parents=True, exist_ok=True)
        
        # Read the order/expanded state
        state = {}
        if self.library_file.exists():
            try:
                with open(self.library_file, "r") as f:
                    state = json.load(f)
            except: pass
        
        folders = {}
        for f in templates_dir.glob("*.json"):
            try:
                with open(f, "r") as file:
                    content = json.load(file)
                    # Use filename or 'name' field inside
                    name = (content.get("name") or f.stem).strip()
                    folders[name] = content.get("tasks", [])
            except: pass
            
        folder_order = [f.strip() for f in state.get("folder_order", list(folders.keys()))]
        # Filter to only existing folders on disk
        folder_order = [f for f in folder_order if f in folders]
        # Add any new folders that weren't in the saved order
        for f in folders.keys():
            if f not in folder_order: folder_order.append(f)
            
        return {
            "folders": folders,
            "folder_order": folder_order,
            "expanded": state.get("expanded", [])
        }

    def save_library(self, data):
        templates_dir = self.config_dir / "templates"
        templates_dir.mkdir(parents=True, exist_ok=True)
        
        # 1. Save individual folder files
        folders = data.get("folders", {})
        active_filenames = []
        for name_orig, tasks in folders.items():
            name = name_orig.strip()
            if not tasks and name != "PM Tasks": # Safety: Don't wipe unless it's intentionally empty
                continue
            filename = name.lower().replace(" ", "_") + ".json"
            active_filenames.append(filename)
            filepath = templates_dir / filename
            try:
                with open(filepath, "w") as f:
                    json.dump({"name": name, "tasks": tasks}, f, indent=2)
            except: pass
            
        # 2. Cleanup deleted folders
        for f in templates_dir.glob("*.json"):
            if f.name not in active_filenames:
                try: f.unlink()
                except: pass

        # 3. Save the metadata (order, expanded)
        meta = {
            "folder_order": [f.strip() for f in data.get("folder_order", [])],
            "expanded": data.get("expanded", [])
        }
        try:
            with open(self.library_file, "w") as f:
                json.dump(meta, f, indent=2)
        except: pass

    def load_session(self):
        return load_json(self.session_file, {"folders": {}, "folder_order": [], "expanded": [], "pinned": []})

    def save_session(self, data):
        return save_json(self.session_file, data)

    def load_ui_state(self):
        return load_json(self.ui_state_file, {"width": 400, "height": 420, "opacity": 0.95})

    def save_ui_state(self, data):
        return save_json(self.ui_state_file, data)

    def load_history(self):
        return load_json(self.history_file, [])
