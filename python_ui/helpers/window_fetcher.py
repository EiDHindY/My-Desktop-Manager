import subprocess
from PyQt5.QtCore import QObject, pyqtSignal, QThread

# BUG-10 FIX: The original code emitted a PyQt5 signal from a raw threading.Thread,
# which is not thread-safe in PyQt5 and can cause random crashes. Using QThread
# instead guarantees that the signal is emitted safely via Qt's signal/slot mechanism.

class _FetchWorker(QThread):
    """Runs the kdotool window scan in a proper QThread."""
    finished = pyqtSignal(set)

    def run(self):
        try:
            cmd = (
                "for id in $(kdotool search --class '.*' 2>/dev/null); do "
                "wname=$(kdotool getwindowname $id 2>/dev/null); "
                "wclass=$(kdotool getwindowclassname $id 2>/dev/null); "
                "if [[ \"$wname\" != *\"Desktop Manager\"* ]] && "
                "   [[ \"$wname\" != \"\" ]] && "
                "   [[ \"$wclass\" != \"plasmashell\" ]] && "
                "   [[ \"$wclass\" != \"org.kde.plasmashell\" ]] && "
                "   [[ \"$wclass\" != \"krunner\" ]] && "
                "   [[ \"$wclass\" != \"Latte-dock\" ]] && "
                "   [[ \"$wclass\" != \"antigravity\" ]] && "
                "   [[ \"$wclass\" != \"xwaylandvideobridge\" ]] && "
                "   [[ \"$wname\" != \"Menu\" ]]; then "
                "kdotool get_desktop_for_window $id 2>/dev/null; fi; "
                "done 2>/dev/null | sort -u"
            )
            result = subprocess.run(["bash", "-c", cmd], capture_output=True, text=True, timeout=15)
            new_indices = set()
            for line in result.stdout.strip().split("\n"):
                if line.strip().isdigit():
                    new_indices.add(int(line.strip()))
            self.finished.emit(new_indices)
        except Exception:
            self.finished.emit(set())


class WindowFetcher(QObject):
    finished = pyqtSignal(set)

    def __init__(self):
        super().__init__()
        self._worker = None

    def fetch_windows_bg(self):
        # Don't start a new scan if one is already running
        if self._worker and self._worker.isRunning():
            return
        self._worker = _FetchWorker()
        self._worker.finished.connect(self.finished)
        self._worker.start()
