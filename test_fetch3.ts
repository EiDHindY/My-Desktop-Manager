import { runCommand } from './shared_backend/helpers/kwin_utils';
const cmd = "kdotool search --class '.*' 2>/dev/null | wc -l";
console.log(runCommand(cmd));
