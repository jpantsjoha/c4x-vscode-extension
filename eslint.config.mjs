import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

const typescriptSourceFiles = ['src/**/*.ts', 'mcp/**/*.ts'];

export default tseslint.config(
  // Global ignores (replaces ignorePatterns)
  {
    ignores: [
      'out/**',
      'dist/**',
      'node_modules/**',
      '.vscode-test/**',
      '**/*.generated.*',
      '**/*.js',       // Only lint TypeScript files (matches previous --ext ts behavior)
      '**/*.mjs',
      '**/*.cjs',
    ],
  },

  // Base configs — scoped to TypeScript files
  {
    files: typescriptSourceFiles,
    ...eslint.configs.recommended,
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: typescriptSourceFiles,
  })),
  {
    files: typescriptSourceFiles,
    ...security.configs.recommended,
  },

  // TypeScript source files — project-specific rules
  {
    files: typescriptSourceFiles,
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'import',
          format: null,
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE', 'PascalCase'],
        },
        {
          selector: 'objectLiteralProperty',
          format: null,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
        },
      ],
      'curly': 'warn',
      'eqeqeq': 'warn',
      'no-throw-literal': 'warn',
      'semi': 'off',
    },
  },

  // @google/genai and its dependencies are about 1.8 MB of the extension
  // bundle. src/ai/geminiClient.ts loads the SDK with a dynamic import, so it
  // runs on first AI use rather than at activation (#181). A static value
  // import anywhere else would put it back on the activation path unnoticed.
  // Type imports are erased at compile time and stay allowed. Tests are not
  // bundled.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/ai/geminiClient.ts', 'src/__tests__/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [{
          name: '@google/genai',
          allowTypeImports: true,
          message: 'Load the SDK through src/ai/geminiClient.ts, which imports it lazily; import only its types here.',
        }],
        patterns: [{
          group: ['@google/genai/*'],
          allowTypeImports: true,
          message: 'Load the SDK through src/ai/geminiClient.ts, which imports it lazily; import only its types here.',
        }],
      }],
      // The same rule for the forms an import declaration does not cover.
      'no-restricted-syntax': ['error',
        {
          selector: "CallExpression[callee.name='require'] > Literal[value=/^@google\\/genai(\\/|$)/]",
          message: 'Load the SDK through src/ai/geminiClient.ts, which imports it lazily.',
        },
        {
          selector: "ImportExpression > Literal[value=/^@google\\/genai(\\/|$)/]",
          message: 'Load the SDK through src/ai/geminiClient.ts, which imports it lazily.',
        },
      ],
    },
  },

  // A credential change can land between any two requests of a generation
  // (discovery, heal, self-correction, failover, reference images). A client
  // captured before one of those awaits kept sending the old key, and kept
  // sending after a clear (#232 review, three times). So GeminiService sends
  // every request through `this.requests`, which resolves the client at send
  // time; only sendGenerateContent touches this.client, only client() builds
  // one, and this.genAI is touched by three named methods only. The SDK-import
  // selectors above are repeated because a later block replaces the rule.
  {
    files: ['src/ai/GeminiService.ts'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: "CallExpression[callee.name='require'] > Literal[value=/^@google\\/genai(\\/|$)/]",
          message: 'Load the SDK through src/ai/geminiClient.ts, which imports it lazily.',
        },
        {
          selector: "ImportExpression > Literal[value=/^@google\\/genai(\\/|$)/]",
          message: 'Load the SDK through src/ai/geminiClient.ts, which imports it lazily.',
        },
        // Any use of this.client (a call, a bind, a captured reference) outside
        // the one send method.
        {
          selector: "MemberExpression[object.type='ThisExpression'][property.name='client']:not(MethodDefinition[key.name='sendGenerateContent'] *)",
          message: 'Send requests through this.requests, which resolves the client for the key held when each request is sent. A client kept across an await sends a stale key.',
        },
        // The cached client itself: only client() builds and returns it,
        // applyCredentials() drops it, hasCredentials() tests it.
        {
          selector: "MemberExpression[object.type='ThisExpression'][property.name='genAI']:not(MethodDefinition[key.name=/^(client|applyCredentials|hasCredentials)$/] *)",
          message: 'Do not read or keep this.genAI; send requests through this.requests.',
        },
        // A client built anywhere else would escape the credential checks in client().
        {
          selector: "Identifier[name='createGeminiClient']:not(ImportSpecifier > Identifier):not(MethodDefinition[key.name='client'] *)",
          message: 'Only client() builds a Gemini client; send requests through this.requests.',
        },
        // The same three, reached by a route the selectors above do not see:
        // a computed member (this['client']), destructuring (const { genAI } = this)
        // and a renamed import of createGeminiClient.
        {
          selector: "MemberExpression[object.type='ThisExpression'][computed=true][property.value=/^(client|genAI)$/]",
          message: 'Do not reach this.client or this.genAI by a computed name; send requests through this.requests.',
        },
        {
          selector: "VariableDeclarator[init.type='ThisExpression'] > ObjectPattern > Property[key.name=/^(client|genAI)$/]",
          message: 'Do not destructure client or genAI from this; send requests through this.requests.',
        },
        {
          selector: "ImportSpecifier[imported.name='createGeminiClient'][local.name!='createGeminiClient']",
          message: 'Import createGeminiClient under its own name, so the rule that confines it to client() can see it.',
        },
      ],
    },
  },
  // FallbackStrategy and SyntaxValidator get a GenerateContentClient
  // (src/ai/geminiClient.ts), never a GoogleGenAI they could hold on to.
  {
    files: ['src/ai/FallbackStrategy.ts', 'src/ai/SyntaxValidator.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: [{
          name: '@google/genai',
          message: 'Take a GenerateContentClient from src/ai/geminiClient.ts; GeminiService passes one that resolves the current key per request.',
        }],
        patterns: [{
          group: ['@google/genai/*'],
          message: 'Take a GenerateContentClient from src/ai/geminiClient.ts.',
        }],
      }],
    },
  },
);
