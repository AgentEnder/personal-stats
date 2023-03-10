export function h1(title: string, ...contents: string[]) {
  return lines(`# ${title}`, contents);
}

export function h2(title: string, ...contents: string[]) {
  return lines(`## ${title}`, contents);
}

export function h3(title: string, ...contents: string[]) {
  return lines(`### ${title}`, contents);
}

export function h4(title: string, ...contents: string[]) {
  return lines(`#### ${title}`, contents);
}

export function h5(title: string, ...contents: string[]) {
  return lines(`##### ${title}`, contents);
}

export function h6(title: string, ...contents: string[]) {
  return lines(`###### ${title}`, contents);
}

export function link(ref: string, title?: string) {
  return `[${title ?? ref}](${ref})`;
}

export function italics(contents: string) {
  return `*${contents}*;`;
}

export function bold(contents: string) {
  return `**${contents}**;`;
}

export function strikethrough(contents: string) {
  return `~~${contents}~~`;
}

export function code(contents: string) {
  return `\`${contents}\``;
}

export function codeBlock(contents: string, language: string = null) {
  return `\`\`\`${language}
${contents}
\`\`\``;
}

type SimpleTableField<T> = keyof T;
type MappedTableField<T> = {
  label: string;
  mapFn: (el: T) => string;
};
type RenamedTableField<T> = {
  label: string;
  field: keyof T;
};

export type TableField<T extends Record<string, unknown>> =
  | SimpleTableField<T>
  | MappedTableField<T>
  | RenamedTableField<T>;

function normalizeTableField<T extends Record<string, unknown>>(
  f: TableField<T>
): MappedTableField<T> {
  return {
    label: typeof f === 'object' ? f.label : f.toString(),
    mapFn:
      typeof f === 'object' && 'mapFn' in f
        ? f.mapFn
        : (e) => e[typeof f === 'object' ? f.field : f].toString(),
  };
}

export function table<
  T extends Record<string, unknown> = Record<string, unknown>
>(fields: TableField<T>[], items: T[]): string {
  const paddingMap: Map<keyof T, number> = new Map();
  const normalizedFields = fields.map(normalizeTableField);

  for (const field of normalizedFields) {
    const maxLength = Math.max(
      ...items.map((i) => field.mapFn(i).length),
      field.label.length
    );
    paddingMap.set(field.label, maxLength);
  }
  return [
    `| ${normalizedFields
      .map((x) => x.label.padEnd(paddingMap.get(x.label)))
      .join(' | ')} |`,
    `| ${normalizedFields
      .map((x) => '-'.repeat(paddingMap.get(x.label)))
      .join(' | ')} |`,
    ...items.map(
      (item) =>
        `| ${normalizedFields
          .map((x) => x.mapFn(item).padEnd(paddingMap.get(x.label)))
          .join(' | ')} |`
    ),
  ].join('\n');
}

export function blockQuote(...fragments: string[]) {
  return lines(
    ...fragments.map((fragment) =>
      fragment
        .split('\n')
        .map((line) => '> ' + line)
        .join('\n')
    )
  );
}

export function unorderdList(...items: string[]) {
  return lines(items.map((i) => `- ${i}`));
}

export function lines(...ls: (string[] | string)[]) {
  return ls.flat().join('\n\n');
}
