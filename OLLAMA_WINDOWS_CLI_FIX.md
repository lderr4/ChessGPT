# Fixing Ollama CLI Access on Windows

## Problem
You installed Ollama for Windows but `ollama` command is not recognized in your terminal.

## Solutions (try in order)

### Solution 1: Restart Your Terminal ⚡ (Most Common Fix)

The installer adds Ollama to your PATH, but existing terminals won't see it until restarted.

**Steps:**
1. **Close ALL PowerShell/CMD windows** (including the one in VS Code/Cursor)
2. **Open a NEW PowerShell or CMD window**
3. Try again:
   ```powershell
   ollama --version
   ```

**In VS Code/Cursor:**
- Click the trash icon on your terminal
- Open a new terminal (Ctrl + `)

---

### Solution 2: Check Default Installation Location

Ollama is typically installed here:

```
C:\Users\<YourUsername>\AppData\Local\Programs\Ollama\ollama.exe
```

**Test it directly:**
```powershell
# Replace <YourUsername> with your actual username
C:\Users\lucas\AppData\Local\Programs\Ollama\ollama.exe --version
```

If this works, the CLI is installed but PATH isn't configured correctly.

---

### Solution 3: Manually Add to PATH

If the above works but `ollama` alone doesn't, add it to your PATH:

#### Option A: Using PowerShell (Temporary - current session only)
```powershell
$env:Path += ";C:\Users\lucas\AppData\Local\Programs\Ollama"
ollama --version
```

#### Option B: Using System Settings (Permanent)
1. Press `Win + X` and select "System"
2. Click "Advanced system settings"
3. Click "Environment Variables"
4. Under "User variables", find "Path" and click "Edit"
5. Click "New" and add: `C:\Users\lucas\AppData\Local\Programs\Ollama`
6. Click "OK" on all dialogs
7. **Restart your terminal**
8. Try: `ollama --version`

---

### Solution 4: Check if Ollama is Already Running

Sometimes Ollama installs as a background service:

```powershell
# Check if Ollama is running
Get-Process -Name ollama -ErrorAction SilentlyContinue

# Or check services
Get-Service -Name ollama* -ErrorAction SilentlyContinue
```

**Test the API directly:**
```powershell
# If Ollama is running in background, this should work
curl http://localhost:11434/api/tags
```

If you get a response, Ollama IS running! You just need CLI access.

---

### Solution 5: Reinstall Ollama

If nothing else works, try reinstalling:

1. **Uninstall Ollama:**
   - Open "Add or Remove Programs" (Win + I → Apps)
   - Find "Ollama" and uninstall

2. **Download fresh installer:**
   - Go to https://ollama.com/download/windows
   - Download and run `OllamaSetup.exe`

3. **Restart your computer** (yes, really - ensures PATH is updated)

4. **Open new PowerShell and test:**
   ```powershell
   ollama --version
   ```

---

## Alternative: Use Full Path (Quick Workaround)

If you need to get started immediately, create a PowerShell alias:

```powershell
# Add to your PowerShell profile
Set-Alias -Name ollama -Value "C:\Users\lucas\AppData\Local\Programs\Ollama\ollama.exe"

# Test it
ollama --version
```

To make this permanent:
```powershell
# Open your PowerShell profile
notepad $PROFILE

# Add this line:
Set-Alias -Name ollama -Value "C:\Users\$env:USERNAME\AppData\Local\Programs\Ollama\ollama.exe"

# Save and close

# Reload profile
. $PROFILE
```

---

## Verify Installation Locations

Check these locations to see if Ollama is installed:

```powershell
# Check common installation paths
Test-Path "C:\Users\lucas\AppData\Local\Programs\Ollama\ollama.exe"
Test-Path "C:\Program Files\Ollama\ollama.exe"
Test-Path "C:\Program Files (x86)\Ollama\ollama.exe"

# Or search for it
Get-ChildItem -Path C:\ -Filter ollama.exe -Recurse -ErrorAction SilentlyContinue | Select-Object FullName
```

---

## Check Your PATH

See what's currently in your PATH:

```powershell
# View all PATH entries
$env:Path -split ';'

# Check if Ollama is in PATH
$env:Path -split ';' | Select-String -Pattern 'ollama' -CaseSensitive:$false
```

---

## Once CLI Works, Continue Setup

After getting CLI access:

```powershell
# 1. Pull the model
ollama pull llama3.1

# 2. Start Ollama service
ollama serve

# 3. In another terminal, test it
ollama list

# 4. Start your chess app
docker-compose build backend
docker-compose up -d
```

---

## Still Not Working?

### Check Windows Version
Ollama requires Windows 10/11. Check your version:

```powershell
winver
```

### Check if Installation Completed
Look for Ollama in Start Menu:
- Press `Win` key
- Type "Ollama"
- If you see it, right-click → "Open file location" to find the executable

### Manual Download
If the installer failed, try the manual approach:
1. Download the latest release from GitHub: https://github.com/ollama/ollama/releases
2. Extract to a folder
3. Add that folder to PATH

---

## Quick Test Once Working

```powershell
# Should show version
ollama --version

# Should list models (empty at first)
ollama list

# Should start the server
ollama serve
```

---

## For Your Chess App

Once `ollama` command works, you're ready! Just run:

```powershell
# Terminal 1
ollama serve

# Terminal 2
.\setup-ollama.ps1
```

Or manually:
```powershell
ollama pull llama3.1
# Keep ollama serve running in one terminal
# In another terminal:
docker-compose build backend
docker-compose up -d
```

---

## Common Issues After Getting CLI

### "Error: could not connect to ollama app"
→ Run `ollama serve` first

### "Error: model not found"
→ Run `ollama pull llama3.1`

### "Error: port 11434 already in use"
→ Ollama is already running (that's good!)

---

## Next Steps

Once you have `ollama --version` working:

1. ✅ Pull Llama 3.1: `ollama pull llama3.1`
2. ✅ Start service: `ollama serve` (keep running)
3. ✅ Setup app: `.\setup-ollama.ps1`
4. ✅ Open: http://localhost:5173

Need more help? Check:
- Ollama GitHub: https://github.com/ollama/ollama/issues
- Ollama Discord: https://discord.gg/ollama




