# CodeSeeker

**Advanced code search and transformation for AI assistants**

A comprehensive Model Context Protocol (MCP) server that combines the power of [ugrep](https://github.com/Genivia/ugrep) and [ast-grep](https://github.com/ast-grep/ast-grep) philosophies to deliver intelligent search and replace capabilities for modern development workflows.

## 🚀 Features

CodeSeeker provides AI assistants with complete search AND replace capabilities:

### 🔍 **Core Search Tools**
- **Basic Search**: Standard pattern matching with file type filtering and context
- **Boolean Search**: Google-like search with AND, OR, NOT operators  
- **Fuzzy Search**: Approximate pattern matching allowing character errors
- **Archive Search**: Search inside compressed files and archives (zip, tar, 7z, etc.)
- **Interactive Search**: Launch ugrep's TUI for real-time search
- **Code Structure Search**: Find functions, classes, methods, imports, and variables

### 🔧 **Search & Replace Tools**
- **Search and Replace**: Safe find & replace with dry-run preview and automatic backups
- **Bulk Replace**: Multiple search/replace operations in a single command
- **Code Refactor**: Language-aware refactoring for code structures across multiple languages

### ⚡ **Advanced Features**
- **JSON Output**: Structured results perfect for AI processing
- **File Type Filtering**: Search specific programming languages or document types
- **Context Lines**: Show surrounding lines for better understanding
- **Search Statistics**: Get detailed metrics about search operations
- **Archive Support**: Search nested archives without extraction
- **Safety First**: Dry-run mode by default with automatic backup creation
- **Language Awareness**: Smart patterns for JavaScript, TypeScript, Python, Java, C++

## 📋 Prerequisites

### 1. Install ugrep

**Ubuntu/Debian:**
```bash
sudo apt-get install ugrep
```

**macOS (Homebrew):**
```bash
brew install ugrep
```

**Windows (Chocolatey):**
```bash
choco install ugrep
```

**From source:**
```bash
git clone https://github.com/Genivia/ugrep.git
cd ugrep
./configure
make
sudo make install
```

**Verify installation:**
```bash
ugrep --version
# Should show version 7.4 or higher
```

### 2. Install Node.js
Ensure you have Node.js 18+ installed:
```bash
node --version
# Should show v18.0.0 or higher
```

## 🛠️ Installation

### Clone and Build
```bash
git clone https://github.com/yourusername/codeseeker-mcp.git
cd codeseeker-mcp
npm install
npm run build
```

### Quick Test
```bash
npm test
# Should show all tests passing
```

## ⚙️ Configuration

### Claude Desktop Integration

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "codeseeker": {
      "command": "node",
      "args": ["/absolute/path/to/codeseeker-mcp/build/index.js"]
    }
  }
}
```

**Note**: Replace `/absolute/path/to/codeseeker-mcp` with the actual path to your installation.

## 📖 Usage Examples

### Basic Search
```
Search for "function" in JavaScript files:
- Pattern: function
- File Types: js,ts
- Path: ./src
- Case Sensitive: false
```

### Boolean Search  
```
Find TODO items that are urgent but not marked as later:
- Query: TODO AND urgent -NOT later
- File Types: cpp,h,js,py
```

### Fuzzy Search
```
Find "function" with up to 2 character errors (matches "functoin", "functio", etc.):
- Pattern: function  
- Max Errors: 2
- File Types: js,ts,py
```

### Search and Replace
```
Replace old function names with new ones (safe preview first):
- Pattern: oldFunctionName
- Replacement: newFunctionName
- File Types: js,ts
- Dry Run: true (preview changes)
- Backup: true (create backups)
```

### Bulk Replace
```
Multiple replacements in one operation:
- Replace "var " with "const "
- Replace "== " with "=== " 
- File Types: js,ts
- Dry Run: true
```

### Code Refactor
```
Refactor function names across a codebase:
- Structure Type: function
- Old Pattern: getUserData
- New Pattern: fetchUserData
- Language: typescript
- Dry Run: true
```

## 🔧 Tool Reference

### Search Tools

#### `basic_search`
Standard pattern search with filtering options.

**Parameters:**
- `pattern` (required): Search pattern or regex
- `path` (optional): Directory to search (default: current directory)
- `caseSensitive` (optional): Case-sensitive search (default: false)
- `fileTypes` (optional): Comma-separated file types (e.g., "js,py,cpp")
- `excludeTypes` (optional): File types to exclude
- `contextLines` (optional): Lines of context around matches
- `maxResults` (optional): Maximum results (default: 100)

#### `boolean_search`
Google-like search with boolean operators.

**Parameters:**
- `query` (required): Boolean query (supports AND, OR, NOT, parentheses)
- `path`, `fileTypes`, `maxResults`: Same as basic search

**Example queries:**
- `"error AND (critical OR fatal)"`
- `"TODO AND urgent -NOT completed"`
- `"function OR method -NOT test"`

#### `fuzzy_search`
Approximate pattern matching.

**Parameters:**
- `pattern` (required): Pattern to search for
- `maxErrors` (optional): Character errors allowed 1-9 (default: 2)
- `path`, `fileTypes`, `maxResults`: Same as basic search

#### `archive_search` 
Search compressed files and archives.

**Parameters:**
- `pattern` (required): Search pattern
- `path`, `maxResults`: Same as basic search
- `archiveTypes` (optional): Archive types to search

#### `code_structure_search`
Find specific code structures.

**Parameters:**
- `structureType` (required): Type to search for (function, class, method, import, variable)
- `name` (optional): Specific name to search for
- `language` (required): Programming language (js, ts, py, java, cpp)
- `path`, `maxResults`: Same as basic search

#### `interactive_search`
Launch interactive TUI mode.

**Parameters:**
- `initialPattern` (optional): Starting search pattern
- `path` (optional): Starting directory

### Replace Tools

#### `search_and_replace`
Safe find and replace with preview.

**Parameters:**
- `pattern` (required): Search pattern or regex
- `replacement` (required): Replacement text (supports $1, $2 capture groups)
- `path` (optional): Directory to process (default: current directory)
- `fileTypes` (optional): File types to include
- `caseSensitive` (optional): Case-sensitive search (default: false)
- `dryRun` (optional): Preview mode (default: true)
- `maxFiles` (optional): Maximum files to process (default: 50)
- `backup` (optional): Create backups (default: true)

#### `bulk_replace`
Multiple search/replace operations.

**Parameters:**
- `replacements` (required): Array of {pattern, replacement, description} objects
- `path`, `fileTypes`, `caseSensitive`, `dryRun`, `backup`: Same as search_and_replace

#### `code_refactor`
Language-aware code refactoring.

**Parameters:**
- `structureType` (required): Code structure type (function, class, variable, import)
- `oldPattern` (required): Pattern to find
- `newPattern` (required): Replacement pattern  
- `language` (required): Programming language (js, ts, py, java, cpp)
- `path`, `dryRun`, `backup`: Same as search_and_replace

### Utility Tools

#### `list_file_types`
Get all supported file types for filtering.

#### `get_search_stats`
Get detailed search statistics and performance metrics.

## 🏗️ Development

### Project Structure
```
codeseeker-mcp/
├── src/
│   └── index.ts          # Main server implementation
├── build/                # Compiled JavaScript output
├── package.json          # Node.js dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── test.js              # Test suite
├── README.md            # This file
└── SETUP.md             # Quick setup guide
```

### Building
```bash
npm run build           # Compile TypeScript
npm run dev            # Watch mode for development
npm run inspector      # Debug with MCP inspector
```

### Testing the Server
```bash
# Test basic functionality
npm test

# Use MCP inspector for interactive testing
npm run inspector

# Test with Claude Desktop
# (Add to config and restart Claude Desktop)
```

## 🚨 Safety Features

### Dry Run Mode
All replace operations default to **dry-run mode** for safety:
- Preview changes before applying
- See exactly what will be modified
- No accidental overwrites

### Automatic Backups
When making changes:
- Backup files created automatically with timestamps
- Original files preserved
- Easy rollback if needed

### Error Handling
- Comprehensive error messages
- Graceful failure handling
- File permission checking

## 🐛 Troubleshooting

### Common Issues

**"ugrep not found"**
- Ensure ugrep is installed and in your PATH
- Run `ugrep --version` to verify installation

**"Permission denied"**
- Make sure the build/index.js file is executable
- Run `chmod +x build/index.js` (on Unix systems)

**"Module not found errors"**
- Run `npm install` to install dependencies
- Ensure you're using Node.js 18 or higher

**"Claude Desktop not showing tools"**
- Verify the configuration file path is correct
- Restart Claude Desktop after configuration changes
- Check Claude Desktop logs for connection errors

**"No files found to process"**
- Check that the path exists and contains matching files
- Verify file type filters are correct
- Ensure ugrep can access the specified directories

## ⚡ Performance Notes

- ugrep is extremely fast, often outperforming other grep tools
- JSON output adds minimal overhead
- Archive searching may be slower depending on compression
- Large result sets are limited by `maxResults` parameter
- Replace operations process files efficiently with streaming
- Interactive mode requires a terminal and cannot run through MCP

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

- [ugrep](https://github.com/Genivia/ugrep) - The ultra-fast grep replacement
- [ast-grep](https://github.com/ast-grep/ast-grep) - AST-based code search and rewrite tool  
- [Model Context Protocol](https://modelcontextprotocol.io/) - Open standard for AI-data connections
- [Claude Desktop](https://claude.ai/) - AI assistant with MCP support

## 📊 Tool Summary

| Tool | Purpose | Input | Output |
|------|---------|--------|---------|
| `basic_search` | Standard text search | Pattern + filters | Matches with context |
| `boolean_search` | Logical search queries | Boolean expression | Filtered results |
| `fuzzy_search` | Approximate matching | Pattern + error tolerance | Fuzzy matches |
| `archive_search` | Search compressed files | Pattern + archive types | Archive contents |
| `code_structure_search` | Find code elements | Structure type + language | Code definitions |
| `search_and_replace` | Find and replace text | Pattern + replacement | Preview/changes |
| `bulk_replace` | Multiple replacements | Array of operations | Batch results |
| `code_refactor` | Refactor code structures | Old/new patterns + language | Refactored code |
| `interactive_search` | Launch TUI mode | Initial pattern | Command to run |
| `list_file_types` | Show supported types | None | Available extensions |
| `get_search_stats` | Search metrics | Search parameters | Performance stats |

---

**CodeSeeker - Intelligence in every search, precision in every change.**

**Total Tools Available: 11** (8 search + 3 replace)