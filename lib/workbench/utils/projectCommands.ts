import type { UIMessage as Message } from 'ai';
import { generateId } from './fileUtils';

export interface ProjectCommands {
  type: string;
  setupCommand?: string;
  startCommand?: string;
  followupMessage: string;
}

interface FileContent {
  content: string;
  path: string;
}

// Helper function to make any command non-interactive
function makeNonInteractive(command: string): string {
  // Set environment variables for non-interactive mode
  const envVars = 'export CI=true DEBIAN_FRONTEND=noninteractive FORCE_COLOR=0';

  // Common interactive packages and their non-interactive flags
  const interactivePackages = [
    { pattern: /npx\s+([^@\s]+@?[^\s]*)\s+init/g, replacement: 'echo "y" | npx --yes $1 init --defaults --yes' },
    { pattern: /npx\s+create-([^\s]+)/g, replacement: 'npx --yes create-$1 --template default' },
    { pattern: /npx\s+([^@\s]+@?[^\s]*)\s+add/g, replacement: 'npx --yes $1 add --defaults --yes' },
    { pattern: /npm\s+install(?!\s+--)/g, replacement: 'npm install --yes --no-audit --no-fund --silent' },
    { pattern: /yarn\s+add(?!\s+--)/g, replacement: 'yarn add --non-interactive' },
    { pattern: /pnpm\s+add(?!\s+--)/g, replacement: 'pnpm add --yes' },
  ];

  let processedCommand = command;

  // Apply replacements for known interactive patterns
  interactivePackages.forEach(({ pattern, replacement }) => {
    processedCommand = processedCommand.replace(pattern, replacement);
  });

  return `${envVars} && ${processedCommand}`;
}

export async function detectProjectCommands(files: FileContent[]): Promise<ProjectCommands> {
  const hasFile = (name: string) => files.some((f) => f.path.endsWith(name));
  const hasFileContent = (name: string, content: string) =>
    files.some((f) => f.path.endsWith(name) && f.content.includes(content));

  if (hasFile('package.json')) {
    const packageJsonFile = files.find((f) => f.path.endsWith('package.json'));

    if (!packageJsonFile) {
      return { type: '', setupCommand: '', followupMessage: '' };
    }

    try {
      const packageJson = JSON.parse(packageJsonFile.content);
      const scripts = packageJson?.scripts || {};
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Check if this is a shadcn project
      const isShadcnProject =
        hasFileContent('components.json', 'shadcn') ||
        Object.keys(dependencies).some((dep) => dep.includes('shadcn')) ||
        hasFile('components.json');

      // Check for preferred commands in priority order
      const preferredCommands = ['dev', 'start', 'preview'];
      const availableCommand = preferredCommands.find((cmd) => scripts[cmd]);

      // If package.json exists but has no dev/start/preview script AND there's an
      // index.html, treat as a static site. Without this, model-generated
      // projects that emit package.json without scripts get a "would you like
      // me to inspect" followup prompt instead of a working preview.
      if (!availableCommand && hasFile('index.html')) {
        const staticPkgJson = JSON.stringify({ name: 'static-app', scripts: { start: 'node server.js' } });
        const staticServerJs = [
          "const http=require('http'),fs=require('fs'),path=require('path');",
          "const M={'html':'text/html','css':'text/css','js':'application/javascript','png':'image/png','svg':'image/svg+xml','json':'application/json'};",
          "http.createServer((q,r)=>{let p=path.join('.',q.url==='/'?'index.html':q.url.split('?')[0]);try{let d=fs.readFileSync(p);r.writeHead(200,{'Content-Type':M[path.extname(p).slice(1)]||'text/plain'});r.end(d)}catch(e){r.writeHead(404,{'Content-Type':'text/plain'});r.end('404')}}).listen(5173,()=>console.log('ready'))",
        ].join('');
        return {
          type: 'Static',
          setupCommand: `cat > package.json << 'PKGEOF'\n${staticPkgJson}\nPKGEOF\ncat > server.js << 'SERVEOF'\n${staticServerJs}\nSERVEOF`,
          startCommand: 'node server.js',
          followupMessage: '',
        };
      }

      // Build setup command with non-interactive handling
      let baseSetupCommand = 'npx update-browserslist-db@latest && npm install';

      // Add shadcn init if it's a shadcn project
      if (isShadcnProject) {
        baseSetupCommand += ' && npx shadcn@latest init';
      }

      const setupCommand = makeNonInteractive(baseSetupCommand);

      if (availableCommand) {
        return {
          type: 'Node.js',
          setupCommand,
          startCommand: `npm run ${availableCommand}`,
          followupMessage: `Found "${availableCommand}" script in package.json. Running "npm run ${availableCommand}" after installation.`,
        };
      }

      // Last-resort: if a known dev dependency is present, guess the dev command.
      const knownDevPackages = ['vite', 'next', 'react-scripts'];
      const hasKnownDev = knownDevPackages.some((p) => p in dependencies);
      if (hasKnownDev) {
        const guessed = 'next' in dependencies
          ? 'next dev -p 5173'
          : 'npx --yes vite --port 5173 --strictPort';
        return {
          type: 'Node.js',
          setupCommand,
          startCommand: guessed,
          followupMessage: `No dev/start/preview script in package.json — guessing "${guessed}" from known dev dependency.`,
        };
      }

      return {
        type: 'Node.js',
        setupCommand,
        followupMessage:
          'Would you like me to inspect package.json to determine the available scripts for running this project?',
      };
    } catch (error) {
      console.error('Error parsing package.json:', error);
      return { type: '', setupCommand: '', followupMessage: '' };
    }
  }

  if (hasFile('index.html')) {
    // Static-only project: no package.json, just an index.html.
    // Create a minimal package.json + self-contained Node.js static server
    // so WebContainer can serve it without external dependencies.
    const staticPkgJson = JSON.stringify({ name: 'static-app', scripts: { start: 'node server.js' } });
    const staticServerJs = [
      "const http=require('http'),fs=require('fs'),path=require('path');",
      "const M={'html':'text/html','css':'text/css','js':'application/javascript','png':'image/png','svg':'image/svg+xml','json':'application/json'};",
      "http.createServer((q,r)=>{let p=path.join('.',q.url==='/'?'index.html':q.url.split('?')[0]);try{let d=fs.readFileSync(p);r.writeHead(200,{'Content-Type':M[path.extname(p).slice(1)]||'text/plain'});r.end(d)}catch(e){r.writeHead(404,{'Content-Type':'text/plain'});r.end('404')}}).listen(5173,()=>console.log('ready'))",
    ].join('');
    return {
      type: 'Static',
      setupCommand: `cat > package.json << 'PKGEOF'\n${staticPkgJson}\nPKGEOF\ncat > server.js << 'SERVEOF'\n${staticServerJs}\nSERVEOF`,
      startCommand: 'node server.js',
      followupMessage: '',
    };
  }

  return { type: '', setupCommand: '', followupMessage: '' };
}

export function createCommandsMessage(commands: ProjectCommands): Message | null {
  if (!commands.setupCommand && !commands.startCommand) {
    return null;
  }

  let commandString = '';

  if (commands.setupCommand) {
    commandString += `
<boltAction type="shell">${commands.setupCommand}</boltAction>`;
  }

  if (commands.startCommand) {
    commandString += `
<boltAction type="start">${commands.startCommand}</boltAction>
`;
  }

  // FIX (Bug 2026-07-11): previously emitted a redundant `<boltAction type="shell">...
  // startCommand</boltAction>` after commandString, duplicating the start action as a
  // blocking shell command. Static projects with startCommand='npx --yes serve' would fire
  // `serve` twice (once correctly as a start action, once as a blocking shell). Removed.
  const messageText = `${commands.followupMessage ? `\n\n${commands.followupMessage}` : ''}
<boltArtifact id="project-setup" title="Project Setup">${commandString}</boltArtifact>`;
  return {
    role: 'assistant',
    parts: [{ type: 'text' as const, text: messageText }],
    id: generateId(),
  } as unknown as Message;
}

export function escapeBoltArtifactTags(input: string) {
  // Regular expression to match boltArtifact tags and their content
  const regex = /(<boltArtifact[^>]*>)([\s\S]*?)(<\/boltArtifact>)/g;

  return input.replace(regex, (match, openTag, content, closeTag) => {
    // Escape the opening tag
    const escapedOpenTag = openTag.replace(/</g, '<').replace(/>/g, '>');

    // Escape the closing tag
    const escapedCloseTag = closeTag.replace(/</g, '<').replace(/>/g, '>');

    // Return the escaped version
    return `${escapedOpenTag}${content}${escapedCloseTag}`;
  });
}

export function escapeBoltAActionTags(input: string) {
  // Regular expression to match boltArtifact tags and their content
  const regex = /(<boltAction[^>]*>)([\s\S]*?)(<\/boltAction>)/g;

  return input.replace(regex, (match, openTag, contents, closeTag) => {
    // Escape the opening tag
    const escapedOpenTag = openTag.replace(/</g, '<').replace(/>/g, '>');

    // Escape the closing tag
    const escapedCloseTag = closeTag.replace(/</g, '<').replace(/>/g, '>');

    // Return the escaped version
    return `${escapedOpenTag}${contents}${escapedCloseTag}`;
  });
}

export function escapeBoltTags(input: string) {
  return escapeBoltArtifactTags(escapeBoltAActionTags(input));
}

// We have this seperate function to simplify the restore snapshot process in to one single artifact.
export function createCommandActionsString(commands: ProjectCommands): string {
  if (!commands.setupCommand && !commands.startCommand) {
    // Return empty string if no commands
    return '';
  }

  let commandString = '';

  if (commands.setupCommand) {
    commandString += `
<boltAction type="shell">${commands.setupCommand}</boltAction>`;
  }

  if (commands.startCommand) {
    commandString += `
<boltAction type="start">${commands.startCommand}</boltAction>
`;
  }

  return commandString;
}
