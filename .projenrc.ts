import { cdk, javascript, ReleasableCommits, TextFile } from 'projen';
import { DependabotScheduleInterval, workflows } from 'projen/lib/github';
import { NpmAccess } from 'projen/lib/javascript';

// Find the latest projen version here: https://www.npmjs.com/package/projen
const projenVersion = '0.103.20';
// jsii is tilde-pinned (patch-only) for compiler compatibility - see
// upgrade-jsii workflow below for why it needs its own bump automation.
const jsiiVersion = '~6.0.0';
const dependencies = [
  `projen@^${projenVersion}`, // DO not move the index 0 to another position!
  'constructs@^10.5.1',
];

const project = new cdk.JsiiProject({
  author: 'Manuel Vogel',
  authorAddress: '8409778+mavogel@users.noreply.github.com',
  defaultReleaseBranch: 'main',
  jsiiVersion: jsiiVersion,
  typescriptVersion: '^6.0.2',
  projenVersion: projenVersion,
  name: 'mvc-projen',
  packageName: '@mavogel/mvc-projen',
  packageManager: javascript.NodePackageManager.NPM,
  projenrcTs: true,
  repositoryUrl: 'https://github.com/mavogel/mvc-projen',
  deps: dependencies,
  peerDeps: dependencies,
  devDeps: [
    '@commitlint/cli',
    '@commitlint/config-conventional',
    'husky',
  ],
  description: 'Base projen module for MV Consulting projects',
  npmAccess:
    NpmAccess.PUBLIC /* The npm access level to use when releasing this module. */,
  npmTrustedPublishing: true /* Publish to npmjs.com via OIDC trusted publishing instead of NPM_TOKEN. */,
  keywords: ['aws', 'cdk', 'construct', 'projen'],
  autoApproveOptions: {
    // 'mvc-bot' (the PROJEN_GITHUB_TOKEN identity) is deliberately excluded:
    // it also opens the upgrade-projen PR (see below), and GitHub rejects a
    // PR review from the same account that authored the PR ("Can not
    // approve your own pull request"). That PR is auto-approved via Mergify
    // instead, which posts the review as the Mergify app, a different actor.
    allowedUsernames: [
      'dependabot',
      'dependabot[bot]',
      'github-bot',
      'github-actions[bot]',
    ],
    /**
     * The name of the secret that has the GitHub PAT for auto-approving PRs with permissions repo, workflow, write:packages
     * Generate a new PAT (https://github.com/settings/tokens/new) and add it to your repo's secrets
     */
    secret: 'PROJEN_GITHUB_TOKEN',
  },
  dependabot: true,
  dependabotOptions: {
    scheduleInterval: DependabotScheduleInterval.WEEKLY,
    labels: ['dependencies', 'auto-approve'],
    groups: {
      default: {
        patterns: ['*'],
        // 'jsii' and 'jsii-rosetta' are excluded alongside 'projen': both
        // are tilde-pinned to the `jsiiVersion` literal above, which the
        // upgrade-jsii workflow (below) bumps directly. A Dependabot PR
        // widening their package.json range would just get reverted by
        // the self-mutation check on the next `npx projen` run, since
        // that literal is the source of truth.
        excludePatterns: ['aws-cdk*', 'projen', 'jsii', 'jsii-rosetta'],
      },
    },
    // 'jsii'/'jsii-rosetta' must be in `ignore` (not just excludePatterns
    // above) to actually stop Dependabot from opening PRs for them -
    // excludePatterns only controls grouping, it doesn't ignore a
    // dependency. 'projen' gets the same full ignore automatically via
    // JsiiProject's default `ignoreProjen: true`.
    ignore: [
      { dependencyName: 'aws-cdk-lib' },
      { dependencyName: 'aws-cdk' },
      { dependencyName: 'jsii' },
      { dependencyName: 'jsii-rosetta' },
    ],
  },
  // See https://github.com/projen/projen/discussions/4040#discussioncomment-11905628
  releasableCommits: ReleasableCommits.ofType([
    'feat',
    'fix',
    'chore',
    'refactor',
    'perf',
  ]),
  githubOptions: {
    pullRequestLintOptions: {
      semanticTitleOptions: {
        // see commit types here: https://www.conventionalcommits.org/en/v1.0.0/#summary
        types: [
          'feat',
          'fix',
          'chore',
          'refactor',
          'perf',
          'docs',
          'style',
          'test',
          'build',
          'ci',
        ],
      },
    },
  },
  versionrcOptions: {
    types: [
      { type: 'feat', section: 'Features' },
      { type: 'fix', section: 'Bug Fixes' },
      { type: 'chore', section: 'Chores' },
      { type: 'docs', section: 'Docs' },
      { type: 'style', hidden: true },
      { type: 'refactor', hidden: true },
      { type: 'perf', section: 'Performance' },
      { type: 'test', hidden: true },
    ],
  },
  eslintOptions: {
    prettier: false,
    dirs: ['src'],
    ignorePatterns: [
      '**/*-function.ts',
      'examples/',
    ],
  },
  gitignore: ['tmp', '.codegpt'],
  // see details for each: https://github.com/cdklabs/publib
  // Go
  publishToGo: {
    moduleName: 'github.com/mavogel/mvc-projen',
    githubTokenSecret: 'PROJEN_GITHUB_TOKEN',
  },
  // see https://github.com/cdklabs/publib/issues/1305
  // Java
  // publishToMaven: {
  //   javaPackage: 'io.github.mv-consulting.cdk.vscode.server',
  //   mavenGroupId: 'io.github.mv-consulting',
  //   mavenArtifactId: 'cdkvscodeserver',
  // },

  // Note: Microsoft Account needed
  // C# and F# for .NET
  // publishToNuget: {
  //   dotNetNamespace: 'MvConsulting',
  //   packageId: 'CdkVscodeServer',
  // },
  // Python
  publishToPypi: {
    distName: 'mvc-projen',
    module: 'mvc_projen',
  },
  pullRequestTemplateContents: [
    `
**Please check if the PR fulfills these requirements**
- [ ] The commit message describes your change
- [ ] Tests for the changes have been added if possible (for bug fixes / features)
- [ ] Docs have been added / updated (for bug fixes / features)

**What kind of change does this PR introduce? (Bug fix, feature, documentation, performance ...)**
> add here...

**What is the current behaviour? (You can also link to an open issue here)**
> add here...

**What is the new behaviour (if this is a feature change)?**
> add here...

**Does this PR introduce a breaking change? (What changes might users need to make in their setup due to this PR?)**
> add here...

**Environment**
- \`node --version\`:
- \`npx projen --version\`:
- version of the jsii lib: \`x.x.x\`
  `,
  ],
});

// projen's AutoMerge component hardcodes `delete_head_branch: {}` in the
// mergify rule with no option to disable it. Strip it from the generated
// .mergify.yml so Mergify does not delete head branches on merge.
// see https://github.com/mavogel/mvc-projen/pull/58
project.tryFindObjectFile('.mergify.yml')?.addDeletionOverride(
  'pull_request_rules.0.actions.delete_head_branch',
);

// The upgrade-projen workflow (below) opens its PR as 'mvc-bot' using
// PROJEN_GITHUB_TOKEN - the same identity auto-approve.yml would otherwise
// use to approve it, which GitHub rejects as a self-approval (see
// autoApproveOptions above). Have Mergify approve these PRs instead: it
// posts the review as the Mergify app, satisfying the queue's
// `#approved-reviews-by>=1` condition without a self-approval.
project.tryFindObjectFile('.mergify.yml')?.addOverride(
  'pull_request_rules.1',
  {
    name: 'Auto-approve self-authored upgrade-projen PRs',
    conditions: [
      'author=mvc-bot',
      'label=auto-approve',
    ],
    actions: {
      review: {
        type: 'APPROVE',
        message: 'Automatically approved: self-authored projen upgrade PR.',
      },
    },
  },
);

// TypeScript 6 no longer auto-discovers @types/* packages
project.tsconfigDev.file.addOverride('compilerOptions.types', ['jest', 'node']);
project.tsconfig?.file.addOverride('compilerOptions.types', ['node']);

// Pin the local dev Node version to one jsii actually supports, so `npx projen`/
// `npm run build` stop warning about untested Node releases (see jsii's supported
// list: ^24.0.0, ^22.0.0, ^20.0.0 [deprecated]).
new TextFile(project, '.nvmrc', { lines: ['24'] });

// Both `projenVersion` and `jsiiVersion` above are hardcoded literals
// excluded from the Dependabot group (see
// `dependabotOptions.groups.default.excludePatterns`/`ignore`): a
// Dependabot-only bump of their package.json entry would just get reverted
// by the self-mutation check in build.yml on the next `npx projen` run,
// since the literal is the source of truth. Each workflow below bumps its
// literal directly, re-synths, verifies the build, and opens a PR.
interface SelfUpgradeWorkflowOptions {
  /** The dependency name, e.g. 'projen' or 'jsii' - drives the workflow/branch/commit names. */
  readonly name: string;
  /** Shell lines that set the `current` and `latest` $GITHUB_OUTPUT values. */
  readonly checkRun: string[];
  /** Overrides the "Check for a newer X version" step name, e.g. to note a version cap. */
  readonly checkName?: string;
  /** `sed` command that bumps the version literal in .projenrc.ts to $NEW_VERSION. */
  readonly bumpSed: string;
}

function addSelfUpgradeWorkflow(opts: SelfUpgradeWorkflowOptions) {
  const workflow = project.github?.addWorkflow(`upgrade-${opts.name}`);
  workflow?.on({
    schedule: [{ cron: '0 6 * * 1' }],
    workflowDispatch: {},
  });
  workflow?.addJob('upgrade', {
    runsOn: ['ubuntu-latest'],
    permissions: {
      contents: workflows.JobPermission.WRITE,
      pullRequests: workflows.JobPermission.WRITE,
    },
    steps: [
      {
        name: 'Checkout',
        uses: 'actions/checkout@v6',
        with: { token: '${{ secrets.PROJEN_GITHUB_TOKEN }}' },
      },
      {
        name: 'Setup Node',
        uses: 'actions/setup-node@v6',
        with: { 'node-version': 'lts/*', 'package-manager-cache': false },
      },
      {
        name: 'Install dependencies',
        run: 'npm ci',
      },
      {
        name: opts.checkName ?? `Check for a newer ${opts.name} version`,
        id: 'check',
        run: opts.checkRun.join('\n'),
      },
      {
        name: `Bump ${opts.name}Version and re-synth`,
        if: '${{ steps.check.outputs.current != steps.check.outputs.latest }}',
        env: {
          NEW_VERSION: '${{ steps.check.outputs.latest }}',
          // projen picks `npm ci` over `npm install` when CI is set, but the
          // lock file is still out of sync with the just-bumped version at
          // this point - only `npm install` can update it.
          CI: 'false',
        },
        run: [opts.bumpSed, 'npx projen'].join('\n'),
      },
      {
        name: 'Build',
        if: '${{ steps.check.outputs.current != steps.check.outputs.latest }}',
        run: 'npm run build',
      },
      {
        name: 'Open pull request',
        if: '${{ steps.check.outputs.current != steps.check.outputs.latest }}',
        env: {
          GH_TOKEN: '${{ secrets.PROJEN_GITHUB_TOKEN }}',
          GH_REPO: '${{ github.repository }}',
          NEW_VERSION: '${{ steps.check.outputs.latest }}',
          OLD_VERSION: '${{ steps.check.outputs.current }}',
        },
        run: [
          'git config user.name "github-actions[bot]"',
          'git config user.email "github-actions[bot]@users.noreply.github.com"',
          `BRANCH="chore/upgrade-${opts.name}-\${NEW_VERSION}"`,
          'git checkout -b "$BRANCH"',
          'git add -A',
          `git commit -m "chore: upgrade ${opts.name} to \${NEW_VERSION}"`,
          'git push origin "$BRANCH" --force',
          `gh pr create --title "chore: upgrade ${opts.name} to \${NEW_VERSION}" --body "Automated ${opts.name} self-upgrade from \${OLD_VERSION} to \${NEW_VERSION}." --label dependencies --label auto-approve --head "$BRANCH" || echo "PR already exists for $BRANCH"`,
        ].join('\n'),
      },
    ],
  });
}

addSelfUpgradeWorkflow({
  name: 'projen',
  checkRun: [
    'current=$(node -p "require(\'./package.json\').devDependencies.projen")',
    'latest=$(npm view projen version)',
    'echo "current=$current" >> "$GITHUB_OUTPUT"',
    'echo "latest=$latest" >> "$GITHUB_OUTPUT"',
  ],
  bumpSed:
    'sed -i "s/const projenVersion = \'.*\';/const projenVersion = \'${NEW_VERSION}\';/" .projenrc.ts',
});

// jsii's version check is capped to the current major (npm view jsii@<major>)
// - crossing to the next major stays a deliberate, human-reviewed bump, same
// as the typescript pin (see mvc-projen-toolchain-maintenance.md).
addSelfUpgradeWorkflow({
  name: 'jsii',
  checkName: 'Check for a newer jsii version (same major)',
  checkRun: [
    'current=$(grep -oP "const jsiiVersion = .~\\K[^\']+" .projenrc.ts)',
    'major=$(echo "$current" | cut -d. -f1)',
    'latest=$(npm view "jsii@${major}" version --json | jq -r ".[-1]")',
    'echo "current=$current" >> "$GITHUB_OUTPUT"',
    'echo "latest=$latest" >> "$GITHUB_OUTPUT"',
  ],
  bumpSed:
    'sed -i "s/const jsiiVersion = \'~.*\';/const jsiiVersion = \'~${NEW_VERSION}\';/" .projenrc.ts',
});

// publishToGo pushes a "chore(release): vX" commit straight to `main` to
// publish the go submodule, which re-triggers this same `on: push` release
// workflow. On that second run, `bump`'s CHANGES_SINCE_LAST_RELEASE guard
// correctly no-ops (HEAD is already a release commit) but never writes
// dist/releasetag.txt, so the hardcoded `cat dist/releasetag.txt` in
// "Check if version has already been tagged" fails the whole job even
// though there is nothing to release. Skip the job outright when the
// triggering commit is itself a release commit.
const releaseWorkflow = project.github?.tryFindWorkflow('release');
const releaseJob = releaseWorkflow?.getJob('release');
if (releaseWorkflow && releaseJob && 'steps' in releaseJob) {
  releaseWorkflow.updateJob('release', {
    ...releaseJob,
    if: "!startsWith(github.event.head_commit.message, 'chore(release):')",
  });
}

project.package.setScript('prepare', 'husky');
project.synth();