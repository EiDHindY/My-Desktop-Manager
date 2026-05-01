import json

with open('/home/dod/.config/desktop-manager/session.json', 'r') as f:
    session = json.load(f)

# Put everything back into root
all_desktops = []
for f_name, d_list in session.get("folders", {}).items():
    all_desktops.extend(d_list)

# Deduplicate
unique_desktops = []
for d in all_desktops:
    if d not in unique_desktops:
        unique_desktops.append(d)

session["folders"] = {"root": unique_desktops}
session["folder_order"] = ["root"]
if "root" not in session.get("expanded", []):
    session["expanded"].append("root")

with open('/home/dod/.config/desktop-manager/session.json', 'w') as f:
    json.dump(session, f, indent=2)
print("Restored session.json to flat root!")
