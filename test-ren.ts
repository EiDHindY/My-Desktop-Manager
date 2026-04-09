import { execSync } from "child_process";
function runCommand(command: string): string | undefined {
    try {
        return execSync(command).toString().trim();
    } catch (error) {
        console.error("ERROR", error);
        return undefined;
    }
}
console.log("Renamed to:", runCommand(`'/home/dod/projects/Desktop Manager/scripts/rename-box.py' "test"`));
