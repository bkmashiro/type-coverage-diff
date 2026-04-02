import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as ts from 'typescript';
import { resolveCoverageFiles } from './coverage.js';

export interface AutoFix {
  file: string;
  line: number;
  before: string;
  after: string;
  reason: 'inferred' | 'call-site inference';
}

export interface AutoFixReport {
  fixes: AutoFix[];
}

interface TextEdit {
  start: number;
  end: number;
  text: string;
}

function normalizeProgramFile(cwd: string, file: string): string {
  return path.isAbsolute(file) ? path.relative(cwd, file) : file;
}

function isAnyKeyword(node: ts.TypeNode | undefined): node is ts.KeywordTypeNode {
  return node?.kind === ts.SyntaxKind.AnyKeyword;
}

function inferTypeFromArgument(checker: ts.TypeChecker, expression: ts.Expression): string | undefined {
  const baseType = checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(expression));
  const typeText = checker.typeToString(baseType);

  if (
    typeText === 'string' ||
    typeText === 'number' ||
    typeText === 'boolean' ||
    typeText === 'string[]' ||
    typeText === 'number[]' ||
    typeText === 'boolean[]'
  ) {
    return typeText;
  }

  return undefined;
}

function collectCallSiteTypes(program: ts.Program, sourceFile: ts.SourceFile, checker: ts.TypeChecker): Map<ts.FunctionLikeDeclaration, string> {
  const functionNames = new Map<string, ts.FunctionLikeDeclaration>();
  const inferredTypes = new Map<ts.FunctionLikeDeclaration, string>();
  const conflictingFunctions = new Set<ts.FunctionLikeDeclaration>();

  sourceFile.forEachChild(function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      functionNames.set(node.name.text, node);
    }

    node.forEachChild(visit);
  });

  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile) {
      continue;
    }

    file.forEachChild(function visit(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const fn = functionNames.get(node.expression.text);
        const firstArgument = node.arguments[0];

        if (!fn || !firstArgument) {
          node.forEachChild(visit);
          return;
        }

        const inferredType = inferTypeFromArgument(checker, firstArgument);
        if (!inferredType) {
          node.forEachChild(visit);
          return;
        }

        const currentType = inferredTypes.get(fn);
        if (conflictingFunctions.has(fn)) {
          node.forEachChild(visit);
          return;
        }

        if (currentType === undefined) {
          inferredTypes.set(fn, inferredType);
        } else if (currentType !== inferredType) {
          inferredTypes.delete(fn);
          conflictingFunctions.add(fn);
        }
      }

      node.forEachChild(visit);
    });
  }

  return inferredTypes;
}

function createVariableEdit(declaration: ts.VariableDeclaration): TextEdit | undefined {
  if (!isAnyKeyword(declaration.type) || !declaration.initializer || !ts.isIdentifier(declaration.name)) {
    return undefined;
  }

  if (ts.isIdentifier(declaration.initializer) && declaration.initializer.text === 'undefined') {
    return undefined;
  }

  return {
    start: declaration.name.end,
    end: declaration.type.end,
    text: '',
  };
}

function createFunctionEdits(
  declaration: ts.FunctionDeclaration,
  inferredType: string | undefined,
): TextEdit[] {
  if (!declaration.body || declaration.parameters.length !== 1) {
    return [];
  }

  const [parameter] = declaration.parameters;
  if (!ts.isIdentifier(parameter.name) || !isAnyKeyword(parameter.type) || !isAnyKeyword(declaration.type)) {
    return [];
  }

  if (!inferredType) {
    return [];
  }

  const statements = declaration.body.statements;
  if (statements.length !== 1 || !ts.isReturnStatement(statements[0]) || !statements[0].expression) {
    return [];
  }

  const returned = statements[0].expression;
  if (!ts.isIdentifier(returned) || returned.text !== parameter.name.text) {
    return [];
  }

  return [
    {
      start: parameter.type.pos,
      end: parameter.type.end,
      text: ` ${inferredType}`,
    },
    {
      start: declaration.type.pos,
      end: declaration.type.end,
      text: ` ${inferredType}`,
    },
  ];
}

function applyEdits(sourceText: string, edits: TextEdit[]): string {
  return edits
    .sort((left, right) => right.start - left.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), sourceText);
}

export function formatAutoFixReport(report: AutoFixReport): string {
  const lines = ['Auto-fixing obvious any types...'];

  if (report.fixes.length === 0) {
    lines.push('0 fixes applied.');
    return lines.join('\n');
  }

  for (const fix of report.fixes) {
    lines.push(`  ${fix.file}:${fix.line}  ${fix.before}  → ${fix.after}  (${fix.reason})`);
  }

  lines.push(`${report.fixes.length} fixes applied. Run tsc to verify.`);
  return lines.join('\n');
}

export async function applySimpleFixes(cwd: string, targets: string[] = []): Promise<AutoFixReport> {
  const previousCwd = process.cwd();
  const files = resolveCoverageFiles(cwd, targets);

  try {
    process.chdir(cwd);
    const configPath = ts.findConfigFile('.', ts.sys.fileExists, 'tsconfig.json');
    if (!configPath) {
      throw new Error('Unable to find tsconfig.json');
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
    }

    const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
    const rootNames = files
      ? parsedConfig.fileNames.filter((file) => files.includes(normalizeProgramFile(cwd, file)))
      : parsedConfig.fileNames;
    const program = ts.createProgram(rootNames, parsedConfig.options);
    const checker = program.getTypeChecker();
    const callSiteTypes = new Map(
      program
        .getSourceFiles()
        .filter((file) => !file.isDeclarationFile)
        .flatMap((file) => [...collectCallSiteTypes(program, file, checker).entries()]),
    );
    const fixes: AutoFix[] = [];

    for (const sourceFile of program.getSourceFiles()) {
      if (sourceFile.isDeclarationFile || sourceFile.fileName.includes('node_modules')) {
        continue;
      }

      const file = normalizeProgramFile(cwd, sourceFile.fileName);
      if (files && !files.includes(file)) {
        continue;
      }

      const sourceText = readFileSync(sourceFile.fileName, 'utf8');
      const edits: TextEdit[] = [];

      sourceFile.forEachChild(function visit(node) {
        if (ts.isVariableStatement(node)) {
          for (const declaration of node.declarationList.declarations) {
            const edit = createVariableEdit(declaration);
            if (!edit) {
              continue;
            }

            edits.push(edit);
            fixes.push({
              file,
              line: sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1,
              before: sourceText.slice(declaration.getStart(sourceFile), declaration.end).trim(),
              after: applyEdits(sourceText.slice(declaration.getStart(sourceFile), declaration.end), [
                {
                  start: edit.start - declaration.getStart(sourceFile),
                  end: edit.end - declaration.getStart(sourceFile),
                  text: edit.text,
                },
              ]).trim(),
              reason: 'inferred',
            });
          }
        }

        if (ts.isFunctionDeclaration(node)) {
          const functionEdits = createFunctionEdits(node, callSiteTypes.get(node));
          if (functionEdits.length > 0) {
            edits.push(...functionEdits);
            fixes.push({
              file,
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
              before: sourceText.slice(node.getStart(sourceFile), node.body?.pos ?? node.end).replace(/\s+/g, ' ').trim(),
              after: applyEdits(sourceText.slice(node.getStart(sourceFile), node.body?.pos ?? node.end), functionEdits.map((edit) => ({
                start: edit.start - node.getStart(sourceFile),
                end: edit.end - node.getStart(sourceFile),
                text: edit.text,
              }))).replace(/\s+/g, ' ').trim(),
              reason: 'call-site inference',
            });
          }
        }

        node.forEachChild(visit);
      });

      if (edits.length > 0) {
        writeFileSync(sourceFile.fileName, applyEdits(sourceText, edits));
      }
    }

    return { fixes };
  } finally {
    process.chdir(previousCwd);
  }
}
