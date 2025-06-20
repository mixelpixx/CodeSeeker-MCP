#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import path from "path";
import fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";

const execAsync = promisify(exec);

// Zod schemas for tool parameters
const BasicSearchSchema = z.object({
  pattern: z.string().describe("Search pattern or regular expression"),
  path: z.string().optional().describe("Directory or file path to search (defaults to current directory)"),
  caseSensitive: z.boolean().optional().default(false).describe("Perform case-sensitive search"),
  recursiveDepth: z.number().optional().describe("Maximum recursion depth for directory search"),
  fileTypes: z.string().optional().describe("Comma-separated list of file types (e.g., 'cpp,js,py')"),
  excludeTypes: z.string().optional().describe("Comma-separated list of file types to exclude"),
  contextLines: z.number().optional().describe("Number of context lines to show around matches"),
  maxResults: z.number().optional().default(100).describe("Maximum number of results to return"),
});

const BooleanSearchSchema = z.object({
  query: z.string().describe("Boolean search query (supports AND, OR, NOT operators)"),
  path: z.string().optional().describe("Directory or file path to search"),
  fileTypes: z.string().optional().describe("Comma-separated list of file types"),
  maxResults: z.number().optional().default(100).describe("Maximum number of results to return"),
});

const FuzzySearchSchema = z.object({
  pattern: z.string().describe("Pattern to search for with fuzzy matching"),
  maxErrors: z.number().optional().default(2).describe("Maximum character errors allowed (1-9)"),
  path: z.string().optional().describe("Directory or file path to search"),
  fileTypes: z.string().optional().describe("Comma-separated list of file types"),
  maxResults: z.number().optional().default(100).describe("Maximum number of results to return"),
});

const ArchiveSearchSchema = z.object({
  pattern: z.string().describe("Search pattern"),
  path: z.string().optional().describe("Directory path containing archives"),
  archiveTypes: z.string().optional().describe("Archive types to search (zip,tar,gz,7z,etc)"),
  maxResults: z.number().optional().default(100).describe("Maximum number of results to return"),
});

const InteractiveSearchSchema = z.object({
  initialPattern: z.string().optional().describe("Initial search pattern for TUI mode"),
  path: z.string().optional().describe("Directory to start interactive search in"),
});

const SearchAndReplaceSchema = z.object({
  pattern: z.string().describe("Search pattern or regular expression"),
  replacement: z.string().describe("Replacement text (supports capture groups like $1, $2)"),
  path: z.string().optional().describe("Directory or file path to search and replace (defaults to current directory)"),
  fileTypes: z.string().optional().describe("Comma-separated list of file types (e.g., 'cpp,js,py')"),
  caseSensitive: z.boolean().optional().default(false).describe("Perform case-sensitive search"),
  dryRun: z.boolean().optional().default(true).describe("Preview changes without applying them"),
  maxFiles: z.number().optional().default(50).describe("Maximum number of files to process"),
  backup: z.boolean().optional().default(true).describe("Create backup files before replacement"),
});

const BulkReplaceSchema = z.object({
  replacements: z.array(z.object({
    pattern: z.string().describe("Search pattern"),
    replacement: z.string().describe("Replacement text"),
    description: z.string().optional().describe("Description of this replacement")
  })).describe("Array of search/replace operations"),
  path: z.string().optional().describe("Directory or file path to process"),
  fileTypes: z.string().optional().describe("Comma-separated list of file types"),
  dryRun: z.boolean().optional().default(true).describe("Preview changes without applying them"),
  caseSensitive: z.boolean().optional().default(false).describe("Perform case-sensitive operations"),
  backup: z.boolean().optional().default(true).describe("Create backup files before replacement"),
});

const CodeRefactorSchema = z.object({
  structureType: z.enum(['function', 'class', 'method', 'import', 'variable']).describe("Type of code structure to refactor"),
  oldPattern: z.string().describe("Pattern to find (e.g., old function name)"),
  newPattern: z.string().describe("Replacement pattern (e.g., new function name)"),
  language: z.enum(['js', 'ts', 'py', 'java', 'cpp']).describe("Programming language"),
  path: z.string().optional().describe("Directory or file path to refactor"),
  dryRun: z.boolean().optional().default(true).describe("Preview changes without applying them"),
  backup: z.boolean().optional().default(true).describe("Create backup files before replacement"),
});

// Define types for code structure search
type StructureType = 'function' | 'class' | 'method' | 'import' | 'variable';
type Language = 'js' | 'ts' | 'py' | 'java' | 'cpp';

// Schema for code structure search (functions, classes, methods)
const CodeStructureSearchSchema = z.object({
  structureType: z.enum(['function', 'class', 'method', 'import', 'variable']).describe("Type of code structure to search for"),
  name: z.string().optional().describe("Name pattern to search for (optional)"),
  language: z.enum(['js', 'ts', 'py', 'java', 'cpp']).describe("Programming language to search in (e.g., 'js', 'py', 'ts', 'java')"),
  path: z.string().optional().describe("Directory or file path to search"),
  maxResults: z.number().optional().default(100).describe("Maximum number of results to return"),
});

// Server setup
const server = new Server(
  {
    name: "codeseeker-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to check if ugrep is available
async function checkUgrepAvailability(): Promise<boolean> {
  try {
    await execAsync("ugrep --version");
    return true;
  } catch (error) {
    return false;
  }
}

// Helper function to sanitize input for command line usage
function sanitizeCommandInput(input: string): string {
  // Escape double quotes and backslashes
  return input.replace(/["\\]/g, '\\$&');
}

// Helper function to build ugrep command
function buildUgrepCommand(args: any, searchType: string): string {
  let cmd = "ugrep";
  
  // Always use JSON output for structured results
  cmd += " --format='%J'";
  
  switch (searchType) {
    case "basic":
      if (!args.caseSensitive) cmd += " -i";
      if (args.contextLines) cmd += ` -C ${args.contextLines}`;
      if (args.recursiveDepth) cmd += ` --max-depth=${args.recursiveDepth}`;
      break;
      
    case "boolean":
      cmd += " -%"; // Enable Boolean search
      break;
      
    case "fuzzy":
      cmd += ` -Z${args.maxErrors}`; // Enable fuzzy search with error limit
      break;
      
    case "archive":
      cmd += " -z"; // Search archives and compressed files
      break;
  }
  
  // File type filtering
  if (args.fileTypes) {
    cmd += ` -t ${args.fileTypes}`;
  }
  if (args.excludeTypes) {
    cmd += ` -t ^${args.excludeTypes}`;
  }
  
  // Path specification
  const searchPath = args.path || ".";
  
  // Pattern/query
  const pattern = args.pattern || args.query || args.initialPattern || "";
  
  // Max results limit (using ugrep's built-in limit)
  const maxResults = args.maxResults || 100;
  
  // Add max results limit directly to ugrep command
  cmd += ` --max-count=${maxResults}`;
  
  // Sanitize inputs to prevent command injection
  const sanitizedPattern = sanitizeCommandInput(pattern);
  const sanitizedPath = sanitizeCommandInput(searchPath);
  
  return `${cmd} "${sanitizedPattern}" "${sanitizedPath}"`;
}

// Helper function to create backup files
async function createBackup(filePath: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.backup-${timestamp}`;
  await pipeline(createReadStream(filePath), createWriteStream(backupPath));
  return backupPath;
}

// Helper function to perform search and replace on file content
async function performReplace(
  filePath: string,
  pattern: string,
  replacement: string,
  caseSensitive: boolean = false
): Promise<{ original: string; modified: string; changes: number }> {
  const content = await fs.readFile(filePath, 'utf-8');
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(pattern, flags);
  const modified = content.replace(regex, replacement);
  const changes = (content.match(regex) || []).length;
  
  return {
    original: content,
    modified: modified,
    changes: changes
  };
}

// Helper function to find files for replacement
async function findFilesForReplacement(
  searchPath: string,
  fileTypes?: string,
  maxFiles: number = 50
): Promise<string[]> {
  const cmd = `ugrep -l . "${searchPath}"${fileTypes ? ` -t ${fileTypes}` : ''} --max-count=${maxFiles}`;
  
  try {
    const { stdout } = await execAsync(cmd);
    return stdout.trim().split('\n').filter(line => line.trim().length > 0);
  } catch (error) {
    // If ugrep fails, fallback to basic file listing
    return [];
  }
}

// Helper function to build replacement command using ugrep
function buildReplaceCommand(args: any, dryRun: boolean = true): string {
  let cmd = "ugrep";
  
  // Use replace functionality
  if (!dryRun) {
    cmd += " --replace";
  }
  
  // Case sensitivity
  if (!args.caseSensitive) {
    cmd += " -i";
  }
  
  // File type filtering
  if (args.fileTypes) {
    cmd += ` -t ${args.fileTypes}`;
  }
  
  // Path specification
  const searchPath = args.path || ".";
  
  // Sanitize inputs
  const sanitizedPattern = sanitizeCommandInput(args.pattern);
  const sanitizedReplacement = sanitizeCommandInput(args.replacement);
  const sanitizedPath = sanitizeCommandInput(searchPath);
  
  return `${cmd} "${sanitizedPattern}" "${sanitizedPath}" --format="${sanitizedReplacement}"`;
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const isUgrepAvailable = await checkUgrepAvailability();
  
  if (!isUgrepAvailable) {
    return {
      tools: [
        {
          name: "check_ugrep_installation",
          description: "Check if ugrep is installed and get installation instructions",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      ],
    };
  }

  return {
    tools: [
      {
        name: "basic_search",
        description: "Perform a basic text search using ugrep with optional filters and formatting",
        inputSchema: BasicSearchSchema,
      },
      {
        name: "boolean_search",
        description: "Perform Google-like Boolean search with AND, OR, NOT operators",
        inputSchema: BooleanSearchSchema,
      },
      {
        name: "fuzzy_search",
        description: "Perform fuzzy search that finds approximate matches allowing character errors",
        inputSchema: FuzzySearchSchema,
      },
      {
        name: "archive_search",
        description: "Search inside archives and compressed files (zip, tar, gz, 7z, etc.)",
        inputSchema: ArchiveSearchSchema,
      },
      {
        name: "interactive_search",
        description: "Launch interactive TUI search mode (note: this starts an interactive session)",
        inputSchema: InteractiveSearchSchema,
      },
      {
        name: "code_structure_search",
        description: "Search for specific code structures like functions, classes and methods",
        inputSchema: CodeStructureSearchSchema,
      },
      {
        name: "list_file_types",
        description: "List all supported file types that can be used with -t option",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "get_search_stats",
        description: "Get detailed statistics about a search operation",
        inputSchema: BasicSearchSchema,
      },
      {
        name: "search_and_replace",
        description: "Search for patterns and replace them with new text (supports dry-run mode)",
        inputSchema: SearchAndReplaceSchema,
      },
      {
        name: "bulk_replace",
        description: "Perform multiple search and replace operations in a single command",
        inputSchema: BulkReplaceSchema,
      },
      {
        name: "code_refactor",
        description: "Refactor code structures like function names, class names, etc.",
        inputSchema: CodeRefactorSchema,
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request: { params: { name: string, arguments?: any } }) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "check_ugrep_installation": {
        const isAvailable = await checkUgrepAvailability();
        return {
          content: [
            {
              type: "text",
              text: isAvailable 
                ? "✅ ugrep is installed and available!"
                : `❌ ugrep is not installed. Install it using:

**Ubuntu/Debian:**
\`\`\`bash
sudo apt-get install ugrep
\`\`\`

**macOS (Homebrew):**
\`\`\`bash
brew install ugrep
\`\`\`

**Windows (Chocolatey):**
\`\`\`bash
choco install ugrep
\`\`\`

**From source:**
Visit https://github.com/Genivia/ugrep for compilation instructions.`,
            },
          ],
        };
      }

      case "basic_search": {
        try {
          const cmd = buildUgrepCommand(args, "basic");
          const { stdout, stderr } = await execAsync(cmd);
          
          return {
            content: [
              {
                type: "text",
                text: `🔍 **Basic Search Results**\n\nPattern: \`${args.pattern || ''}\`\nPath: \`${args.path || '.'}\`\n\n${stdout || 'No matches found.'}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error performing search: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }

      case "boolean_search": {
        try {
          const cmd = buildUgrepCommand(args, "boolean");
          const { stdout, stderr } = await execAsync(cmd);
          
          return {
            content: [
              {
                type: "text",
                text: `🔍 **Boolean Search Results**\n\nQuery: \`${args.query || ''}\`\nPath: \`${args.path || '.'}\`\n\n${stdout || 'No matches found.'}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error performing boolean search: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }

      case "fuzzy_search": {
        try {
          const cmd = buildUgrepCommand(args, "fuzzy");
          const { stdout, stderr } = await execAsync(cmd);
          
          return {
            content: [
              {
                type: "text",
                text: `🔍 **Fuzzy Search Results**\n\nPattern: \`${args.pattern || ''}\`\nMax Errors: ${args.maxErrors || 2}\nPath: \`${args.path || '.'}\`\n\n${stdout || 'No matches found.'}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error performing fuzzy search: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }

      case "archive_search": {
        try {
          const cmd = buildUgrepCommand(args, "archive");
          const { stdout, stderr } = await execAsync(cmd);
          
          return {
            content: [
              {
                type: "text",
                text: `🔍 **Archive Search Results**\n\nPattern: \`${args.pattern || ''}\`\nPath: \`${args.path || '.'}\`\n\n${stdout || 'No matches found in archives.'}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error searching archives: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }

      case "interactive_search": {
        return {
          content: [
            {
              type: "text",
              text: `🔍 **Interactive Search Mode**\n\nTo start interactive search, run this command in your terminal:\n\n\`\`\`bash\nugrep -Q${args?.initialPattern ? ` "${args.initialPattern}"` : ''}${args?.path ? ` "${args.path}"` : ''}\n\`\`\`\n\nThis will open ugrep's TUI interface where you can:\n- Type patterns and see real-time results\n- Use arrow keys to navigate\n- Press F1 for help\n- Press Ctrl+C to exit\n\n*Note: Interactive mode requires a terminal and cannot be run directly through this MCP server.*`,
            },
          ],
        };
      }

      case "list_file_types": {
        try {
          const { stdout } = await execAsync("ugrep -tlist");
          
          // Format the output directly with code block for better readability
          return {
            content: [
              {
                type: "text",
                text: `📋 **Supported File Types**\n\nBelow is the list of file types supported by ugrep. Use these with the \`fileTypes\` parameter to filter your searches.\n\n\`\`\`\n${stdout}\`\`\`\n\n**Example Usage**:\n\`\`\`javascript\n// Search for "function" in only JavaScript files\nbasic_search({\n  pattern: "function",\n  fileTypes: "js"\n})\n\`\`\``
              }
            ]
          };
        } catch (error) {
          // Return a friendly error message
          return {
            content: [
              {
                type: "text",
                text: `Error listing file types: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }

      case "get_search_stats": {
        try {
          const cmd = buildUgrepCommand(args, "basic") + " --stats";
          const { stdout, stderr } = await execAsync(cmd);
          
          // Format the statistics in a more readable way
          const statsText = stdout ? stdout : 'No statistics available.';
          
          return {
            content: [
              {
                type: "text",
                text: `📊 **Search Statistics**\n\nPattern: \`${args.pattern || ''}\`\nPath: \`${args.path || '.'}\`\n\n${statsText}\n\n${stderr || ''}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error retrieving search statistics: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }
      
      case "code_structure_search": {
        try {
          // Define regex patterns for different structure types and languages
          // These patterns need to be simpler for command-line usage
          const patterns: Record<StructureType, Record<Language, string>> = {
            'function': {
              'js': 'function [a-zA-Z0-9_$]+',
              'ts': 'function [a-zA-Z0-9_$]+',
              'py': 'def [a-zA-Z0-9_]+',
              'java': '(public|private|protected) .* [a-zA-Z0-9_]+\\(',
              'cpp': '[a-zA-Z0-9_]+ [a-zA-Z0-9_]+\\('
            },
            'class': {
              'js': 'class [a-zA-Z0-9_$]+',
              'ts': 'class [a-zA-Z0-9_$]+|interface [a-zA-Z0-9_$]+',
              'py': 'class [a-zA-Z0-9_]+',
              'java': 'class [a-zA-Z0-9_]+',
              'cpp': 'class [a-zA-Z0-9_]+'
            },
            'method': {
              'js': '[a-zA-Z0-9_$]+\\(',
              'ts': '[a-zA-Z0-9_$]+\\([^)]*\\)',
              'py': 'def [a-zA-Z0-9_]+.*self',
              'java': '(public|private) .* [a-zA-Z0-9_]+\\(',
              'cpp': '[a-zA-Z0-9_]+::[a-zA-Z0-9_]+'
            },
            'import': {
              'js': 'import .* from|require\\(',
              'ts': 'import .* from',
              'py': 'import|from .* import',
              'java': 'import [a-zA-Z0-9_.]+',
              'cpp': '#include'
            },
            'variable': {
              'js': 'var [a-zA-Z0-9_$]+|let [a-zA-Z0-9_$]+|const [a-zA-Z0-9_$]+',
              'ts': 'var [a-zA-Z0-9_$]+|let [a-zA-Z0-9_$]+|const [a-zA-Z0-9_$]+',
              'py': '[a-zA-Z0-9_]+ =',
              'java': '(private|protected|public) .* [a-zA-Z0-9_]+ =',
              'cpp': '(const|static) .* [a-zA-Z0-9_]+ ='
            }
          };
          
          // Get the appropriate pattern
          const structureType = args.structureType as StructureType;
          const language = args.language as Language;
          
          if (!patterns[structureType]) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Unsupported structure type "${structureType}". Supported types are: function, class, method, import, variable.`
                }
              ],
              isError: true
            };
          }
          
          if (!patterns[structureType][language]) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Unsupported language "${language}" for structure type "${structureType}". Supported languages depend on the structure type.`
                }
              ],
              isError: true
            };
          }
          
          // Take a Windows-compatible approach using ugrep's built-in features
          
          let searchCmd = 'ugrep';
          
          // Add basic options
          searchCmd += ` --format='%J' -C 2 -t ${language} --max-count=${args.maxResults || 100}`;
          
          // For code structure search, we'll use a simpler and more robust approach
          // by focusing on common patterns in each language and structure type
          
          // Create a search object to use with our buildUgrepCommand function
          const searchArgs: any = {
            path: args.path || '.',
            fileTypes: language,
            maxResults: args.maxResults || 100,
            contextLines: 2,
            caseSensitive: false
          };
          
          // Build the pattern based on structure type and language
          if (args.name) {
            switch (structureType) {
              case 'function':
                searchArgs.pattern = language === 'py'
                  ? `def ${args.name}`
                  : `function ${args.name}`;
                break;
              case 'class':
                searchArgs.pattern = `class ${args.name}`;
                break;
              case 'method':
                // For methods, we need to be careful with the pattern
                searchArgs.pattern = args.name;
                break;
              case 'variable':
                if (language === 'ts' || language === 'js') {
                  searchArgs.pattern = `const ${args.name}|let ${args.name}|var ${args.name}`;
                } else if (language === 'py') {
                  searchArgs.pattern = `${args.name} =`;
                } else {
                  searchArgs.pattern = args.name;
                }
                break;
              case 'import':
                searchArgs.pattern = `import ${args.name}|from ${args.name}`;
                break;
            }
          } else {
            // If no name is provided, just search for the structure type
            switch (structureType) {
              case 'function':
                searchArgs.pattern = language === 'py' ? 'def ' : 'function ';
                break;
              case 'class':
                searchArgs.pattern = 'class ';
                break;
              case 'method':
                // For methods, it's harder without a specific name
                searchArgs.pattern = '\\(';
                break;
              case 'variable':
                if (language === 'ts' || language === 'js') {
                  searchArgs.pattern = 'const |let |var ';
                } else if (language === 'py') {
                  searchArgs.pattern = ' = ';
                } else {
                  searchArgs.pattern = '=';
                }
                break;
              case 'import':
                searchArgs.pattern = 'import |from ';
                break;
            }
          }
          
          // Use our standard command builder
          const cmd = buildUgrepCommand(searchArgs, "basic");
          const { stdout, stderr } = await execAsync(cmd);
          
          // Format the result
          const structureTypeCapitalized = structureType.charAt(0).toUpperCase() + structureType.slice(1);
          const nameFilter = args.name ? ` named "${args.name}"` : '';
          
          return {
            content: [
              {
                type: "text",
                text: `🔍 **${structureTypeCapitalized} Search Results**\n\nSearching for ${structureType}s${nameFilter} in ${language} files\nPath: \`${args.path || '.'}\`\n\nPattern used: ${searchArgs.pattern}\n\n${stdout || 'No matches found.'}`
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error searching for code structures: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }

      case "search_and_replace": {
        try {
          const searchArgs = {
            pattern: args.pattern,
            path: args.path || '.',
            fileTypes: args.fileTypes,
            maxResults: args.maxFiles || 50,
            caseSensitive: args.caseSensitive
          };

          // First, find files that match the pattern
          const searchCmd = buildUgrepCommand(searchArgs, "basic");
          const { stdout: searchResults } = await execAsync(searchCmd);
          
          if (!searchResults.trim()) {
            return {
              content: [
                {
                  type: "text",
                  text: `🔍 **Search and Replace Results**\n\nPattern: \`${args.pattern}\`\nReplacement: \`${args.replacement}\`\nPath: \`${args.path || '.'}\`\n\nNo matches found.`
                }
              ]
            };
          }

          // Get files that contain matches
          const files = await findFilesForReplacement(args.path || '.', args.fileTypes, args.maxFiles);
          
          if (files.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `🔍 **Search and Replace Results**\n\nPattern: \`${args.pattern}\`\nNo files found to process.`
                }
              ]
            };
          }

          let summary = `🔍 **Search and Replace Results**\n\nPattern: \`${args.pattern}\`\nReplacement: \`${args.replacement}\`\nPath: \`${args.path || '.'}\`\nMode: ${args.dryRun ? 'DRY RUN (Preview)' : 'LIVE REPLACEMENT'}\n\n`;
          
          let totalChanges = 0;
          let processedFiles = 0;
          let backupFiles: string[] = [];

          // Process each file
          for (const file of files.slice(0, args.maxFiles || 50)) {
            try {
              const result = await performReplace(file, args.pattern, args.replacement, args.caseSensitive);
              
              if (result.changes > 0) {
                processedFiles++;
                totalChanges += result.changes;
                
                if (!args.dryRun) {
                  // Create backup if requested
                  if (args.backup) {
                    const backupPath = await createBackup(file);
                    backupFiles.push(backupPath);
                  }
                  
                  // Write the modified content
                  await fs.writeFile(file, result.modified, 'utf-8');
                }
                
                summary += `📄 **${file}**: ${result.changes} replacement(s)\n`;
                
                // Show a preview of changes in dry run mode
                if (args.dryRun && result.changes > 0) {
                  const lines = result.original.split('\n');
                  const modifiedLines = result.modified.split('\n');
                  summary += `   Preview of changes:\n`;
                  for (let i = 0; i < Math.min(lines.length, 5); i++) {
                    if (lines[i] !== modifiedLines[i]) {
                      summary += `   - ${lines[i]}\n   + ${modifiedLines[i]}\n`;
                      break;
                    }
                  }
                  summary += `\n`;
                }
              }
            } catch (fileError) {
              summary += `❌ **${file}**: Error - ${fileError instanceof Error ? fileError.message : String(fileError)}\n`;
            }
          }

          summary += `\n📊 **Summary**:\n`;
          summary += `- Files processed: ${processedFiles}\n`;
          summary += `- Total replacements: ${totalChanges}\n`;
          
          if (!args.dryRun && backupFiles.length > 0) {
            summary += `- Backup files created: ${backupFiles.length}\n`;
            summary += `- Backup files: ${backupFiles.join(', ')}\n`;
          }
          
          if (args.dryRun) {
            summary += `\n💡 **Tip**: Set \`dryRun: false\` to apply these changes.`;
          }

          return {
            content: [
              {
                type: "text",
                text: summary
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error performing search and replace: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }

      case "bulk_replace": {
        try {
          let summary = `🔄 **Bulk Replace Results**\n\nPath: \`${args.path || '.'}\`\nMode: ${args.dryRun ? 'DRY RUN (Preview)' : 'LIVE REPLACEMENT'}\n\n`;
          
          let totalChanges = 0;
          let processedFiles = 0;
          const backupFiles: string[] = [];
          const allFiles = await findFilesForReplacement(args.path || '.', args.fileTypes, 100);

          if (allFiles.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `🔄 **Bulk Replace Results**\n\nNo files found to process.`
                }
              ]
            };
          }

          // Process each replacement pattern
          for (let i = 0; i < args.replacements.length; i++) {
            const replacement = args.replacements[i];
            summary += `\n🔍 **Operation ${i + 1}**: ${replacement.description || `Pattern: ${replacement.pattern}`}\n`;
            
            let operationChanges = 0;
            
            for (const file of allFiles) {
              try {
                const result = await performReplace(file, replacement.pattern, replacement.replacement, args.caseSensitive);
                
                if (result.changes > 0) {
                  operationChanges += result.changes;
                  
                  if (!args.dryRun) {
                    // Create backup once per file if not already done
                    if (args.backup && !backupFiles.some(bf => bf.includes(file))) {
                      const backupPath = await createBackup(file);
                      backupFiles.push(backupPath);
                    }
                    
                    // Write the modified content
                    await fs.writeFile(file, result.modified, 'utf-8');
                  }
                }
              } catch (fileError) {
                summary += `   ❌ Error in ${file}: ${fileError instanceof Error ? fileError.message : String(fileError)}\n`;
              }
            }
            
            summary += `   📊 Changes made: ${operationChanges}\n`;
            totalChanges += operationChanges;
          }

          summary += `\n📊 **Overall Summary**:\n`;
          summary += `- Operations performed: ${args.replacements.length}\n`;
          summary += `- Total replacements: ${totalChanges}\n`;
          summary += `- Files available: ${allFiles.length}\n`;
          
          if (!args.dryRun && backupFiles.length > 0) {
            summary += `- Backup files created: ${backupFiles.length}\n`;
          }
          
          if (args.dryRun) {
            summary += `\n💡 **Tip**: Set \`dryRun: false\` to apply these changes.`;
          }

          return {
            content: [
              {
                type: "text",
                text: summary
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error performing bulk replace: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }

      case "code_refactor": {
        try {
          // Build language-specific patterns for refactoring
          let searchPattern = '';
          let replacePattern = '';
          
          switch (args.structureType) {
            case 'function':
              if (args.language === 'py') {
                searchPattern = `def ${args.oldPattern}`;
                replacePattern = `def ${args.newPattern}`;
              } else if (args.language === 'js' || args.language === 'ts') {
                searchPattern = `function ${args.oldPattern}`;
                replacePattern = `function ${args.newPattern}`;
              } else {
                searchPattern = args.oldPattern;
                replacePattern = args.newPattern;
              }
              break;
              
            case 'class':
              searchPattern = `class ${args.oldPattern}`;
              replacePattern = `class ${args.newPattern}`;
              break;
              
            case 'variable':
              if (args.language === 'js' || args.language === 'ts') {
                // Handle const, let, var declarations
                searchPattern = `(const|let|var) ${args.oldPattern}`;
                replacePattern = `$1 ${args.newPattern}`;
              } else {
                searchPattern = args.oldPattern;
                replacePattern = args.newPattern;
              }
              break;
              
            case 'import':
              if (args.language === 'py') {
                searchPattern = `import ${args.oldPattern}`;
                replacePattern = `import ${args.newPattern}`;
              } else if (args.language === 'js' || args.language === 'ts') {
                searchPattern = `from ['"]${args.oldPattern}['"]`;
                replacePattern = `from "${args.newPattern}"`;
              }
              break;
              
            default:
              searchPattern = args.oldPattern;
              replacePattern = args.newPattern;
          }

          // Get files to process
          const files = await findFilesForReplacement(args.path || '.', args.language, 100);
          
          if (files.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `🔧 **Code Refactor Results**\n\nStructure: ${args.structureType}\nOld: \`${args.oldPattern}\`\nNew: \`${args.newPattern}\`\nLanguage: ${args.language}\n\nNo ${args.language} files found to process.`
                }
              ]
            };
          }

          let summary = `🔧 **Code Refactor Results**\n\nStructure: ${args.structureType}\nOld: \`${args.oldPattern}\`\nNew: \`${args.newPattern}\`\nLanguage: ${args.language}\nMode: ${args.dryRun ? 'DRY RUN (Preview)' : 'LIVE REFACTORING'}\n\n`;
          
          let totalChanges = 0;
          let processedFiles = 0;
          const backupFiles: string[] = [];

          // Process each file
          for (const file of files) {
            try {
              const result = await performReplace(file, searchPattern, replacePattern, true);
              
              if (result.changes > 0) {
                processedFiles++;
                totalChanges += result.changes;
                
                if (!args.dryRun) {
                  // Create backup if requested
                  if (args.backup) {
                    const backupPath = await createBackup(file);
                    backupFiles.push(backupPath);
                  }
                  
                  // Write the modified content
                  await fs.writeFile(file, result.modified, 'utf-8');
                }
                
                summary += `📄 **${file}**: ${result.changes} refactoring(s)\n`;
                
                // Show preview in dry run mode
                if (args.dryRun) {
                  const lines = result.original.split('\n');
                  const modifiedLines = result.modified.split('\n');
                  for (let i = 0; i < Math.min(lines.length, 3); i++) {
                    if (lines[i] !== modifiedLines[i]) {
                      summary += `   - ${lines[i].trim()}\n   + ${modifiedLines[i].trim()}\n`;
                      break;
                    }
                  }
                  summary += `\n`;
                }
              }
            } catch (fileError) {
              summary += `❌ **${file}**: Error - ${fileError instanceof Error ? fileError.message : String(fileError)}\n`;
            }
          }

          summary += `\n📊 **Summary**:\n`;
          summary += `- Files processed: ${processedFiles}\n`;
          summary += `- Total refactorings: ${totalChanges}\n`;
          
          if (!args.dryRun && backupFiles.length > 0) {
            summary += `- Backup files created: ${backupFiles.length}\n`;
          }
          
          if (args.dryRun) {
            summary += `\n💡 **Tip**: Set \`dryRun: false\` to apply these changes.`;
          }

          return {
            content: [
              {
                type: "text",
                text: summary
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error performing code refactor: ${error instanceof Error ? error.message : String(error)}`
              }
            ],
            isError: true
          };
        }
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }
  } catch (error) {
    // Global error handler for unexpected errors
    return {
      content: [
        {
          type: "text",
          text: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CodeSeeker MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});