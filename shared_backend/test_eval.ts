export function closeWindowsOnDesktop(kwinIdx: string) {
    const cmd = `echo "--- closeWindowsOnDesktop \${kwinIdx} ---" >> /tmp/kdotool.log; ` +
                `kdotool search --class "." 2>/dev/null | while read id; do ` +
                `d=$(kdotool get_desktop_for_window $id 2>/dev/null); ` +
                `echo "Window $id is on desktop $d" >> /tmp/kdotool.log; ` +
                `if [ "$d" = "${kwinIdx}" ]; then ` +
                `name=$(kdotool getwindowname $id 2>/dev/null); ` +
                `echo "  -> matches desktop. name=$name" >> /tmp/kdotool.log; ` +
                `if [[ -n "$name" && "$name" != "Desktop Manager" && "$name" != "Menu" && "$name" != "Rename Desktop" && "$name" != "Chrome Launcher" && "$name" != "plasma-desktop" && "$name" != "Plasma" ]]; then ` +
                `echo "  -> closing $id" >> /tmp/kdotool.log; ` +
                `kdotool windowclose $id 2>/dev/null; ` +
                `fi; fi; done`;
    require('fs').writeFileSync('/tmp/cmd.txt', cmd);
}
closeWindowsOnDesktop("7");
