export interface ChangelogEntry {
  version: string;
  date: string;
  changes: readonly string[];
}

export const changelogEntries: readonly ChangelogEntry[] = [
  {
    version: 'Pre-Release',
    date: 'Placeholder',
    changes: [
      'This will have actual information upon full release.',
    ],
  },
];
