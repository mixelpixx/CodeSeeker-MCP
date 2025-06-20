#!/usr/bin/env node

/**
 * Simple test script for the ugrep MCP server
 * This script tests basic functionality without requiring Claude Desktop
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test configuration
const SERVER_PATH = join(__dirname, 'build', 'index.js');
const TIMEOUT = 10000; // 10 seconds

// ANSI color codes for pretty output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

// Check if build exists
function checkBuildExists() {
  if (!existsSync(SERVER_PATH)) {
    logError('Build file not found. Run "npm run build" first.');
    return false;
  }
  logSuccess('Build file found');
  return true;
}

// Check if ugrep is installed
async function checkUgrepInstalled() {
  return new Promise((resolve) => {
    const proc = spawn('ugrep', ['--version'], { stdio: 'pipe' });
    
    proc.on('close', (code) => {
      if (code === 0) {
        logSuccess('ugrep is installed and accessible');
        resolve(true);
      } else {
        logWarning('ugrep not found in PATH. Some features may not work.');
        resolve(false);
      }
    });
    
    proc.on('error', () => {
      logWarning('ugrep not found in PATH. Some features may not work.');
      resolve(false);
    });
  });
}

// Test MCP server initialization
async function testServerInitialization() {
  return new Promise((resolve) => {
    logInfo('Testing server initialization...');
    
    const server = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let initSuccess = false;
    let output = '';
    
    server.stderr.on('data', (data) => {
      const message = data.toString();
      output += message;
      if (message.includes('ugrep MCP Server running')) {
        initSuccess = true;
        logSuccess('Server initialized successfully');
        server.kill();
        resolve(true);
      }
    });
    
    server.on('close', (code) => {
      if (!initSuccess) {
        logError(`Server failed to initialize. Exit code: ${code}`);
        logError(`Output: ${output}`);
        resolve(false);
      }
    });
    
    server.on('error', (error) => {
      logError(`Server spawn error: ${error.message}`);
      resolve(false);
    });
    
    // Timeout protection
    setTimeout(() => {
      if (!initSuccess) {
        logError('Server initialization timeout');
        server.kill();
        resolve(false);
      }
    }, TIMEOUT);
  });
}

// Test tools list request
async function testToolsList() {
  return new Promise((resolve) => {
    logInfo('Testing tools list request...');
    
    const server = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let responseReceived = false;
    let output = '';
    
    server.stdout.on('data', (data) => {
      const message = data.toString();
      output += message;
      
      try {
        const lines = message.split('\n').filter(line => line.trim());
        for (const line of lines) {
          const response = JSON.parse(line);
          if (response.result && response.result.tools) {
            logSuccess(`Found ${response.result.tools.length} tools`);
            const toolNames = response.result.tools.map(t => t.name);
            logInfo(`Available tools: ${toolNames.join(', ')}`);
            responseReceived = true;
            server.kill();
            resolve(true);
            return;
          }
        }
      } catch (e) {
        // Ignore JSON parse errors for non-JSON output
      }
    });
    
    server.on('close', (code) => {
      if (!responseReceived) {
        logError('No valid tools list response received');
        logError(`Output: ${output}`);
        resolve(false);
      }
    });
    
    server.on('error', (error) => {
      logError(`Server error: ${error.message}`);
      resolve(false);
    });
    
    // Send initialization request
    setTimeout(() => {
      const initRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" }
        }
      };
      
      server.stdin.write(JSON.stringify(initRequest) + '\n');
      
      // Send tools list request after a short delay
      setTimeout(() => {
        const toolsRequest = {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list"
        };
        server.stdin.write(JSON.stringify(toolsRequest) + '\n');
      }, 500);
    }, 1000);
    
    // Timeout protection
    setTimeout(() => {
      if (!responseReceived) {
        logError('Tools list request timeout');
        server.kill();
        resolve(false);
      }
    }, TIMEOUT);
  });
}

// Test code structure search tool
async function testCodeStructureSearch() {
  return new Promise((resolve) => {
    logInfo('Testing code_structure_search tool...');
    
    const server = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let responseReceived = false;
    let output = '';
    
    server.stdout.on('data', (data) => {
      const message = data.toString();
      output += message;
      console.log('STDOUT:', message);
      
      try {
        const lines = message.split('\n').filter(line => line.trim());
        for (const line of lines) {
          const response = JSON.parse(line);
          if (response.id === 3 && response.result) {
            if (response.result.content && response.result.content[0] &&
                response.result.content[0].text &&
                response.result.content[0].text.includes('Variable Search Results')) {
              logSuccess('Code structure search for variables successful');
              console.log('Found valid response:', response.result.content[0].text.substring(0, 100) + '...');
              responseReceived = true;
              server.kill();
              resolve(true);
              return;
            }
          }
        }
      } catch (e) {
        // Ignore JSON parse errors for non-JSON output
      }
    });
    
    server.stderr.on('data', (data) => {
      const message = data.toString();
      output += message;
      console.log('STDERR:', message);
    });
    
    server.on('close', (code) => {
      if (!responseReceived) {
        logError('No valid code structure search response received');
        logError(`Output: ${output}`);
        resolve(false);
      }
    });
    
    server.on('error', (error) => {
      logError(`Server error: ${error.message}`);
      resolve(false);
    });
    
    // Send initialization request
    setTimeout(() => {
      const initRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" }
        }
      };
      
      server.stdin.write(JSON.stringify(initRequest) + '\n');
      
      // Send code structure search request after initialization
      setTimeout(() => {
        const searchRequest = {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "code_structure_search",
            arguments: {
              structureType: "variable",
              language: "ts",
              path: "src",
              maxResults: 10
            }
          }
        };
        server.stdin.write(JSON.stringify(searchRequest) + '\n');
      }, 1000);
    }, 1000);
    
    // Timeout protection
    setTimeout(() => {
      if (!responseReceived) {
        logError('Code structure search request timeout');
        server.kill();
        resolve(false);
      }
    }, TIMEOUT);
  });
}

// Main test runner
async function runTests() {
  log(`${colors.bold}🧪 Running ugrep MCP Server Tests${colors.reset}\n`);
  
  const tests = [
    { name: 'Build file exists', fn: () => Promise.resolve(checkBuildExists()) },
    { name: 'ugrep installation', fn: checkUgrepInstalled },
    { name: 'Server initialization', fn: testServerInitialization },
    { name: 'Tools list request', fn: testToolsList },
    { name: 'Code structure search', fn: testCodeStructureSearch }
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    log(`\n${colors.bold}Testing: ${test.name}${colors.reset}`);
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      }
    } catch (error) {
      logError(`Test "${test.name}" threw an error: ${error.message}`);
    }
  }
  
  // Summary
  log(`\n${colors.bold}📊 Test Summary${colors.reset}`);
  log(`Passed: ${passed}/${total}`);
  
  if (passed === total) {
    logSuccess('All tests passed! 🎉');
    logInfo('Your ugrep MCP server is ready to use.');
    logInfo('Add it to your Claude Desktop configuration to start using it.');
  } else {
    logWarning(`${total - passed} test(s) failed.`);
    logInfo('Check the errors above and refer to SETUP.md for troubleshooting.');
  }
  
  process.exit(passed === total ? 0 : 1);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logError(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

// Run the tests
runTests().catch((error) => {
  logError(`Test runner failed: ${error.message}`);
  process.exit(1);
});