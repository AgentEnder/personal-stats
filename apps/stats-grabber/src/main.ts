import {
  getAsanaContext,
  getWeeklyGoalsFromAsana,
  getAsanaTasksCompletedThisWeek,
} from '@personal-stats/asana';
import {
  Changes,
  getGithubIssuesClosedForPeriod,
  getMergedPrsForPeriod,
  getTotalLinesChanged,
  initializeGithubClient,
  isGithubRepo,
  Issue,
  PR,
} from '@personal-stats/github';
import {
  h1,
  h2,
  h3,
  table,
  link,
  h4,
  blockQuote,
  unorderdList,
} from '@personal-stats/markdown';
import { trimString } from '@personal-stats/utils';
import { writeFileSync } from 'fs';
import { join } from 'path';

// octokit uses `fetch`, which logs an annoying warning on first use.
process.removeAllListeners('warning');
process.on('warning', (l) => {
  if (l.name !== 'ExperimentalWarning') {
    console.warn(l);
  }
});

interface Configuration {
  statsPeriod: number;
  targetGithubRepo: `${string}/${string}`;
  targetGithubUser: string;
  githubAccessToken: string;
  asanaAccessToken: string;
  asanaWorkspace: string;
}

function getConfig(): Configuration {
  if (!process.env.ASANA_PERSONAL_ACCESS_TOKEN) {
    throw new Error('ASANA_PERSONAL_ACCESS_TOKEN missing');
  }
  if (!process.env.ASANA_WORKSPACE) {
    throw new Error('ASANA_WORKSPACE missing');
  }
  if (!process.env.GITHUB_ACCESS_TOKEN) {
    throw new Error('GITHUB_ACCESS_TOKEN missing');
  }
  if (!process.env.GITHUB_TARGET_USER) {
    throw new Error('GITHUB_TARGET_USER missing');
  }
  if (
    !process.env.GITHUB_TARGET_REPO ||
    !isGithubRepo(process.env.GITHUB_TARGET_REPO)
  ) {
    throw new Error('GITHUB_TARGET_REPO missing');
  }
  return {
    statsPeriod: process.env.STATS_PERIOD ? +process.env.STATS_PERIOD : 7,
    targetGithubRepo: process.env.GITHUB_TARGET_REPO,
    targetGithubUser: process.env.GITHUB_TARGET_USER,
    githubAccessToken: process.env.GITHUB_ACCESS_TOKEN,
    asanaAccessToken: process.env.ASANA_PERSONAL_ACCESS_TOKEN,
    asanaWorkspace: process.env.ASANA_WORKSPACE
  };
}

(async () => {
  const ora = await import('ora').then((m) => m.default);
  const spinner = ora('Loading Asana Data');
  const cfg = getConfig();
  try {
    const asanaContext = await getAsanaContext(
      cfg.asanaAccessToken,
      cfg.asanaWorkspace,
      cfg.statsPeriod
    );
    const asanaTasks = await getAsanaTasksCompletedThisWeek(asanaContext);
    const goalsTask = await getWeeklyGoalsFromAsana(asanaContext);
    spinner.succeed().start('Loading Github Data');
    initializeGithubClient(cfg.githubAccessToken);
    const githubIssuesClosed = await getGithubIssuesClosedForPeriod(
      cfg.targetGithubUser,
      cfg.targetGithubRepo,
      cfg.statsPeriod
    );
    const githubPRsMerged = await getMergedPrsForPeriod(
      cfg.targetGithubUser,
      cfg.targetGithubRepo,
      cfg.statsPeriod
    );
    const totalChanges = getTotalLinesChanged(githubPRsMerged);
    spinner.succeed();
    const report = buildReport(
      goalsTask,
      asanaTasks,
      githubIssuesClosed,
      githubPRsMerged,
      totalChanges
    );
    writeFileSync(join(__dirname, 'report.md'), report);
  } catch (e) {
    spinner.fail();
    throw e;
  }
})().catch((e) => {
  console.error(e);
  if (e.value?.errors) {
    console.error(e.value?.errors);
  }
});

function buildReport(
  goalsTask,
  asanaTasks,
  githubIssuesClosed: Issue[],
  githubPRsMerged: (PR & Changes)[],
  totalChanges: Changes
) {
  return h1(
    'Weekly Activity Report',
    h2(
      'Asana',
      h3('Stated Goals', blockQuote(goalsTask.notes)),
      h3(
        'Closed Tasks',
        unorderdList(
          ...asanaTasks.map((task) =>
            h4(
              link(task.permalink_url, task.name),
              blockQuote(trimString(task.notes, 255))
            )
          )
        )
      )
    ),
    h2(
      'Github',
      h3(
        'Issues Closed',
        ...githubIssuesClosed.map((issue) =>
          h4(
            link(issue.html_url, issue.title),
            blockQuote(trimString(issue.body, 255))
          )
        )
      ),
      h3(
        'PRs Merged',
        table(
          [
            {
              label: 'PR',
              mapFn: (el) => link(el.html_url, `${el.title} (#${el.number})`),
            },
            {
              label: 'Merged On',
              mapFn: (el) => new Date(el.merged_at).toLocaleString(),
            },
            {
              label: 'Files',
              mapFn: (el) => el.files.size.toString(),
            },
            {
              field: 'additions',
              label: 'Additions',
            },
            {
              field: 'deletions',
              label: 'Deletions',
            },
          ],
          githubPRsMerged
        ),
        h4(
          `Total Changes`,
          `Files Changed: ${totalChanges.files.size}`,
          `\\+ ${totalChanges.additions}`,
          `\\- ${totalChanges.deletions}`,
          table(
            [
              {
                field: 'filePath',
                label: 'File',
              },
              {
                label: 'Additions',
                mapFn: (el) => el.additions.toString(),
              },
              {
                label: 'Deletions',
                mapFn: (el) => el.deletions.toString(),
              },
            ],
            [...totalChanges.files.entries()].map(([filePath, changes]) => ({
              filePath,
              ...changes,
            }))
          )
        )
      )
    )
  );
}
