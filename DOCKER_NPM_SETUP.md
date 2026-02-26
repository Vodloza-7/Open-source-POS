# Docker npm workflow (no local Node.js install)

## Why this helps

- You do not install Node.js on Windows.
- Your `node_modules` and npm download cache stay in Docker volumes.
- You avoid reinstalling dependencies from scratch every time.

## One-time setup

1. Install Docker Desktop.
2. Open terminal in this project folder.
3. Run:

```powershell
.\dnpm.ps1 install
```

## Daily use

- Install new package:

```powershell
.\dnpm.ps1 install <package-name>
```

- Run npm scripts:

```powershell
.\dnpm.ps1 run dev
.\dnpm.ps1 run start
```

- Start dev server with port mapping (http://localhost:3000):

```powershell
docker compose up app
```

## Stop and cleanup

- Stop app container:

```powershell
docker compose down
```

- Keep cache and `node_modules` (fast future runs): do nothing else.
- Full reset (removes cached dependencies):

```powershell
docker compose down -v
```