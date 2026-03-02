# Impartial POS v1.1 - Installer Bundle

This bundle installs:
- Node.js (LTS)
- XAMPP (MySQL)
- Impartial POS application
- Desktop shortcut

## Quick Install (Recommended)
1. Extract this zip to any folder.
2. Open extracted folder `installer/v1.1`.
3. Right-click `Install-Open-POS.cmd` and choose **Run as Administrator**.
4. Wait for setup to complete.
5. Start **XAMPP Control Panel** and run **MySQL**.
6. Use desktop shortcut **Impartial POS**.

## Offline Installers (Optional)
For fully offline setup, place installers in:
- `installer/v1.1/prerequisites/node-lts.msi`
- `installer/v1.1/prerequisites/xampp-installer.exe`

If not provided, setup tries `winget`, then opens official download pages.

## Daily Use (No VS Code Needed)
1. Start MySQL in XAMPP.
2. Double-click desktop shortcut **Impartial POS**.
3. App opens automatically.

## Upgrade to New Version
1. Backup database in phpMyAdmin.
2. Run new installer package.
3. Keep same DB credentials in `config/server.config.js` if needed.

## Troubleshooting
- If app says port already in use: close old server windows and run shortcut again.
- If npm policy error appears in PowerShell: use `npm.cmd` (already handled by installer/launcher).
- If MySQL not connected: verify XAMPP MySQL is running on port 3306.
