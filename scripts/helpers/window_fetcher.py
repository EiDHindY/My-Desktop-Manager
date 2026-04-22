import subprocess
from PyQt5.QtCore import QObject, pyqtSignal

class WindowFetcher(QObject):
    finished = pyqtSignal(set)
    def fetch_windows_bg(self):
        try:
            # This command scans all desktops and finds which ones have windows open
            cmd = "for id in $(kdotool search --class '.*'); do wname=$(kdotool getwindowname $id 2>/dev/null); if [[ \"$wname\" != \"Desktop Manager\" ]] && [[ \"$wname\" != \"Menu\" ]]; then kdotool get_desktop_for_window $id 2>/dev/null; fi; done 2>/dev/null | sort -u"
            result = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True)
            new_indices = set()
            for line in result.stdout.strip().split("\n"):
                if line.strip().isdigit():
                    new_indices.add(int(line.strip()))
            self.finished.emit(new_indices)
        except Exception: 
            pass
