import { translations } from '../lang';

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: readonly string[];
}

export const changelogEntries: readonly ChangelogEntry[] = [
  {
    version: translations.changelog.preRelease,
    date: translations.changelog.placeholderDate,
    changes: [
      translations.changelog.placeholderChange,
    ],
  },
];
