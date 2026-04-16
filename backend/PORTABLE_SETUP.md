# Portable Go Backend Setup

This guide covers two things:

- Using a portable Go SDK only inside VS Code (no system-wide PATH changes)
- Running the built backend on target machines without installing Go

## What this supports

- Linux portable binary
- Windows portable `.exe`
- Local image directory usage (privacy-friendly)

## 0. Portable Go setup only for VS Code

Use this when you want Go to work in VS Code for this workspace only.

### 0.1 Download and extract Go into this backend folder

Example folder layout:

```text
backend/
  .tools/
    go/
      bin/go
      src/
      pkg/
  .vscode/
    settings.json
```

Linux example:

```bash
cd /home/thepavansai/Downloads/files/backend
mkdir -p .tools

tar -C .tools -xzf ~/Downloads/go1.22.5.linux-amd64.tar.gz

# Keep the extracted folder name as .tools/go
```

### 0.2 Configure VS Code workspace settings

Create or update `.vscode/settings.json` in this backend folder:

```json
{
  "go.goroot": "${workspaceFolder}/.tools/go",
  "go.toolsEnvVars": {
    "GOROOT": "${workspaceFolder}/.tools/go",
    "PATH": "${workspaceFolder}/.tools/go/bin:${env:PATH}"
  },
  "terminal.integrated.env.linux": {
    "GOROOT": "${workspaceFolder}/.tools/go",
    "PATH": "${workspaceFolder}/.tools/go/bin:${env:PATH}"
  }
}
```

This keeps PATH changes inside VS Code for this workspace only.

### 0.3 Verify inside VS Code terminal

```bash
go version
which go
```

The `which go` result should point to `.tools/go/bin/go` while running in VS Code.

## 1. Build binaries on your dev machine

From the backend folder:

```bash
cd /home/thepavansai/Downloads/files/backend

# Linux binary
go build -o cricket-auction-backend main.go

# Windows binary (64-bit)
GOOS=windows GOARCH=amd64 go build -o cricket-auction-backend.exe main.go
```

## 2. Suggested portable folder layout

### Linux

```text
auction-portable/
  cricket-auction-backend
  images/
  run.sh
```

`run.sh`:

```bash
#!/usr/bin/env bash
cd "$(dirname "$0")"
./cricket-auction-backend
```

Make executable:

```bash
chmod +x run.sh cricket-auction-backend
```

Start:

```bash
./run.sh
```

### Windows

```text
auction-portable/
  cricket-auction-backend.exe
  images/
  run-backend.bat
```

`run-backend.bat`:

```bat
@echo off
cd /d %~dp0
cricket-auction-backend.exe
pause
```

Start:

- Double-click `run-backend.bat` or `cricket-auction-backend.exe`

## 3. Configure the app

In setup screen:

- Image Directory Path must be local absolute path on that machine.

Examples:

- Linux: `/home/user/auction-portable/images`
- Windows: `C:\Auction\images`

## 4. Network usage

- Same machine: use frontend with `http://localhost:8080`
- LAN usage: frontend can call `http://<host-ip>:8080` if firewall and CORS allow it

## 5. Notes and limitations

- No Go install is needed on target machine.
- Images stay local; they are not uploaded to cloud.
- If backend runs in cloud, local image paths will not work.
- On Windows, admin rights are usually not required for port 8080, but corporate security policy may still block unknown executables.

## 6. Quick health check

After start, open:

- `http://localhost:8080/api/teams`

Expected response is JSON (usually empty array before setup).
