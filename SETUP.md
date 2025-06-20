# Quick Setup Guide

Follow these steps to get your ugrep MCP server running quickly.

## Step 1: Prerequisites

### Install ugrep
Choose your platform:

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ugrep
```

**macOS:**
```bash
brew install ugrep
```

**Windows:**
```bash
# Using Chocolatey
choco install ugrep

# Or using Windows Package Manager
winget install ugrep
```

**Verify installation:**
```bash
ugrep --version
# Should show version 7.4 or higher
```

### Install Node.js
Ensure you have Node.js 18+ installed:
```bash
node --version
# Should show v18.0.0 or higher
```

## Step 2: Project Setup

### Clone the repository:
```bash
git clone https://github.com/yourusername/ugrep-mcp-server.git
cd ugrep-mcp-server
```

### Install dependencies:
```bash
npm install
```

## Step 3: Build and Test

### Build the project:
```bash
npm run build
```

### Test the server:
```bash
# Test basic functionality
node test.js

# Use the MCP inspector for interactive testing (if available)
npm run inspector
```

## Step 4: Claude Desktop Integration

### Find your Claude Desktop config file:

**macOS:**
```bash
~/Library/Application Support/Claude/claude_desktop_config.json
```

**Windows:**
```bash
%APPDATA%/Claude/claude_desktop_config.json
```

### Add the server configuration:
```json
{
  "mcpServers": {
    "ugrep": {
      "command": "node",
      "args": ["/absolute/path/to/ugrep-mcp-server/build/index.js"]
    }
  }
}
```

**Important:** Use the absolute path to your build/index.js file.

### Restart Claude Desktop
Close and reopen Claude Desktop to load the new configuration.

## Step 5: Test with Claude

Try these example prompts in Claude Desktop:

1. **Basic search:**
   ```
   Search for the word "function" in my JavaScript files
   ```

2. **Boolean search:**
   ```
   Find all TODO items that mention "urgent" but not "completed"
   ```

3. **Fuzzy search:**
   ```
   Find "configure" allowing for 2 character errors in my config files
   ```

4. **List file types:**
   ```
   What file types does ugrep support?
   ```

## Troubleshooting

### Server won't start:
- Check that Node.js 18+ is installed
- Verify all dependencies are installed (`npm install`)
- Ensure ugrep is in your PATH

### Claude Desktop doesn't show tools:
- Verify the absolute path in the config file
- Check that build/index.js exists
- Restart Claude Desktop after config changes

### Permission errors (Unix/macOS):
```bash
chmod +x build/index.js
```

### Module not found errors:
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Next Steps

Once you have the basic server working, you can:

1. **Extend functionality**: Add more ugrep features like custom output formats
2. **Add resources**: Expose saved search patterns or configuration files
3. **Improve error handling**: Add more robust command validation
4. **Add caching**: Cache frequently used search results

## Development Workflow

```bash
# Watch mode for development
npm run dev

# Test changes
npm test

# Debug with environment variables
DEBUG=mcp:* npm start
```

You now have a fully functional ugrep MCP server! 🎉