import * as fs from 'fs';
import * as path from 'path';

import { Component, javascript, ReleasableCommits, TextFile, YamlFile } from 'projen';
import { AwsCdkConstructLibrary, AwsCdkConstructLibraryOptions, LambdaRuntime } from 'projen/lib/awscdk';
import { DependabotScheduleInterval } from 'projen/lib/github';
import { JobStep } from 'projen/lib/github/workflows-model';

// Set the minimum node version for AWS CDK and the GitHub actions workflow
const nodeVersion = '24.x';
const lambdaNodeVersion = LambdaRuntime.NODEJS_24_X;

// The last @aws-cdk/integ-runner version verified against npm (checked 2026-07-21).
// integ-runner uses plain versions (no -alpha.0 suffix) and has historically lagged
// or stopped tracking aws-cdk-lib's version for stretches of time.
// @aws-cdk/integ-tests-alpha and awslint continue to publish and track CDK versions.
// SHORTCUT: hardcoded cap requires manual re-verification -- run
// `npm view @aws-cdk/integ-runner versions --json` and bump this if aws-cdk-lib
// has released newer versions than this one.
const LAST_INTEG_RUNNER_VERSION = '2.205.3';

// AwsCdkConstructLibraryOptions.cdkVersion's own upstream `@default`
// (node_modules/projen/lib/awscdk/awscdk-deps.d.ts) - what `projen new`
// fills in when `--cdkVersion` is omitted. jsii forbids a derived options
// interface from re-declaring an inherited member (JSII5015: "results in
// invalid C#"), so we can't override the `@default` doc the CLI reflects
// on to change that. Detecting this exact value below and substituting our
// own default is the only remaining lever.
const UPSTREAM_DEFAULT_CDK_VERSION = '2.189.1';

// Our default `cdkVersion` when the caller (or `projen new`) doesn't pass
// one. Must stay >= 2.257.0: cdk-nag v3 (forced below via addDeps) requires
// it as a peer, and the upstream default above fails `npm install` with an
// ERESOLVE conflict on a fresh scaffold.
// SHORTCUT: both hardcoded versions require manual re-verification -- run
// `npm view aws-cdk-lib version` and re-check awscdk-deps.d.ts's `@default`
// periodically (it may drift on a projen upgrade).
const DEFAULT_CDK_VERSION = '2.269.0';

/**
 * The options for the construct
 */
export interface MvcCdkConstructLibraryOptions extends AwsCdkConstructLibraryOptions {
  /**
   * Base directory for the assets
   *
   * @default ${process.cwd()}/node_modules/mvc-projen/assets
   */
  readonly baseAssetsDirectory?: string;

  /**
   * The regions to run the integ tests in
   *
   * @default eu-west-1 and eu-west-2
   */
  readonly integTestRegions?: string[];
}

/**
 * TypeScript library
 *
 * @pjid mvc-awscdk-construct
 */
export class MvcCdkConstructLibrary extends AwsCdkConstructLibrary {

  constructor(options: MvcCdkConstructLibraryOptions) {
    const baseAssetsDirectory = options.baseAssetsDirectory ?? `${process.cwd()}/node_modules/@mavogel/mvc-projen/assets`;
    const integTestRegions = options.integTestRegions ?? ['eu-west-1', 'eu-west-2'];
    // `options.cdkVersion` is typed as required, but `projen new` always
    // supplies a value via jsii reflection - either a real user override,
    // or (if --cdkVersion was omitted) the upstream `@default` literal
    // itself. Substitute ours only in the latter case, verified below.
    const cdkVersion = (!options.cdkVersion || options.cdkVersion === UPSTREAM_DEFAULT_CDK_VERSION)
      ? DEFAULT_CDK_VERSION
      : options.cdkVersion;

    // AwsCdkConstructLibrary's `super()` call below wires up an AutoDiscover
    // component whose constructor synchronously globs `srcdir` for
    // `*.lambda.ts` entrypoints - it never re-scans later. SampleCode (added
    // at the end of this constructor) writes the sample crd-example.lambda.ts
    // during the project's synthesize() phase, which runs after every
    // component's constructor, including AutoDiscover's - so the file never
    // existed for AutoDiscover to find, no LambdaFunction/Bundler ever got
    // created for it, and the generated crd-example.ts was left importing a
    // './crd-example-function' construct file that no one wrote, breaking
    // eslint on every scaffold. Write just this one file early enough for
    // AutoDiscover to see it; SampleCode still owns everything else.
    // Skip under Jest (NODE_ENV=test, matching projen's own IS_TEST_RUN
    // check): when options.outdir is unset (true for every test in this
    // repo), projen's base Project class - constructed via super() below -
    // redirects the *real* outdir to a fresh temp directory instead of cwd.
    // This early write runs before that redirect exists, so without this
    // guard it would write straight into this repo's own working tree
    // instead of the test's temp dir.
    if ((options.sampleCode ?? true) && process.env.NODE_ENV !== 'test') {
      const outdir = path.resolve(options.outdir ?? '.');
      const lambdaEntrypoint = path.join(outdir, 'src', 'crd-example', 'crd-example.lambda.ts');
      if (!fs.existsSync(lambdaEntrypoint)) {
        fs.mkdirSync(path.dirname(lambdaEntrypoint), { recursive: true });
        fs.writeFileSync(lambdaEntrypoint, fs.readFileSync(`${baseAssetsDirectory}/cdk-construct/src_crd-example.lambda.ts`).toString());
      }
    }

    super({
      authorOrganization: true,
      copyrightOwner: 'MV Consulting GmbH',
      license: 'Apache-2.0',
      jsiiVersion: '~6.0.0',
      typescriptVersion: '^6.0.2',
      minNodeVersion: nodeVersion,
      workflowNodeVersion: nodeVersion,
      stability: 'experimental',
      releaseToNpm: true,
      packageManager: javascript.NodePackageManager.NPM,
      npmAccess: javascript.NpmAccess.PUBLIC,
      lambdaOptions: {
        runtime: lambdaNodeVersion,
        awsSdkConnectionReuse: false, // doesn't exist in AWS SDK JS v3
      },
      autoApproveOptions: {
        // 'mvc-bot' (the PROJEN_GITHUB_TOKEN identity) is deliberately
        // excluded: GitHub rejects a PR review from the same account that
        // authored the PR ("Can not approve your own pull request"), and
        // this token can also author PRs against generated projects (e.g.
        // scaffolder-driven automation). Those PRs are auto-approved via
        // Mergify instead, below, which posts the review as the Mergify
        // app - a different actor. See mavogel/mvc-projen#74.
        allowedUsernames: [
          'dependabot',
          'dependabot[bot]',
          'github-bot',
          'github-actions[bot]',
        ],
        // The name of the secret that has the GitHub PAT for auto-approving PRs with permissions repo, workflow, write:packages
        // Generate a new PAT (https://github.com/settings/tokens/new) and add it to your repo's secrets
        // NOTE: comes from MV-Consulting Org
        secret: 'PROJEN_GITHUB_TOKEN',
      },
      dependabot: true,
      dependabotOptions: {
        scheduleInterval: DependabotScheduleInterval.WEEKLY,
        labels: ['dependencies', 'auto-approve'],
        groups: {
          default: {
            patterns: ['*'],
            excludePatterns: ['aws-cdk*', 'projen'],
          },
        },
        ignore: [{ dependencyName: 'aws-cdk-lib' }, { dependencyName: 'aws-cdk' }],
        // zizmor's dependabot-cooldown audit flags a default cooldown under
        // 7 days as insufficient time to catch a compromised release.
        // https://docs.zizmor.sh/audits/#dependabot-cooldown
        cooldown: {
          defaultDays: 7,
        },
      },
      // // See https://github.com/projen/projen/discussions/4040#discussioncomment-11905628
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
        ignorePatterns: ['**/*-function.ts', 'examples/'],
      },
      // experimentalIntegRunner: true,
      // manual integ test setup
      tsconfigDev: {
        compilerOptions: {
          types: ['node', 'jest'],
        },
        include: ['integ-tests/**/*.ts'],
      },
      pullRequestTemplateContents: [fs.readFileSync(`${baseAssetsDirectory}/common/github_pull_request.md`).toString()],
      // NOTE: issue templates are not supported yet. See https://github.com/projen/projen/pull/3648
      // issueTemplates: {}
      readme: {
        contents: [
          `
![Source](https://img.shields.io/github/stars/MV-Consulting/${options.name}?logo=github&label=GitHub%20Stars)
[![Build Status](https://github.com/MV-Consulting/${options.name}/actions/workflows/build.yml/badge.svg)](https://github.com/MV-Consulting/${options.name}/actions/workflows/build.yml)
[![ESLint Code Formatting](https://img.shields.io/badge/code_style-eslint-brightgreen.svg)](https://eslint.org)
[![Latest release](https://img.shields.io/github/release/MV-Consulting/${options.name}.svg)](https://github.com/MV-Consulting/${options.name}/releases)
![GitHub](https://img.shields.io/github/license/MV-Consulting/${options.name})
[![npm](https://img.shields.io/npm/dt/@mavogel/${options.name}?label=npm&color=orange)](https://www.npmjs.com/package/@mavogel/${options.name})
[![typescript](https://img.shields.io/badge/jsii-typescript-blueviolet.svg)](https://www.npmjs.com/package/@mavogel/${options.name})
          `,
          `# ${options.name}`,
          'My awesome description...',
          `
## Table of Contents

- [Features](#features)
- [Usage](#usage)
- [Solution Design](#solution-design)
- [Inspiration](#inspiration)

## Features

- ⚡ **Quick Setup**: TBD
- 📏 **Best Practice Setup**: TBD
- 🤹‍♂️ **Pre-installed packages**: TBD
- 🏗️ **Extensibility**: TBD

## Usage
The following steps get you started:

1. Create a new \`awscdk-app\` via
\`\`\`bash
npx projen new awscdk-app-ts --cdkVersion=2.261.0 --package-manager=npm
\`\`\`
3. Add \`@mavogel/${options.name}\` as a dependency to your project in the \`.projenrc.ts\` file
4. Run \`npx projen\` to install it
5. Add the following to the \`src/main.ts\` file:
\`\`\`ts
import { App, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Placeholder } from '@mavogel/${options.name}';

export class MyStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    new Placeholder(this, 'placeholder', {
      // and more... 💡
    });
  }
}

const env = {
  account: '123456789912',
  region: 'eu-central-1',
};

const app = new App();
new MyStack(app, 'placeholder', { env });
app.synth();
\`\`\`

and deploy it
\`\`\`bash
npx projen build
npx projen deploy
\`\`\`

with the output
\`\`\`console
TBD
\`\`\`

See the [examples](./examples) folder for more inspiration.

## Solution Design

<details>
  <summary>... if you're curious about click here for the details</summary>

![placeholder](docs/img/placeholder.drawio-min.png)

</details>

## Inspiration

add tools or links which inspired you
          `,
          fs.readFileSync(`${baseAssetsDirectory}/common/github_readme_cta.md`).toString(),
        ].join('\n'),
      },
      // NOTE: keep all the passed in options which can override the existing ones!
      ...options,
      // applied after ...options so the DEFAULT_CDK_VERSION fallback above
      // always wins over an undefined options.cdkVersion
      cdkVersion,
    });

    // TypeScript 6 no longer auto-discovers @types/* packages
    this.tsconfigDev.file.addOverride('compilerOptions.types', ['node', 'jest']);
    this.tsconfig?.file.addOverride('compilerOptions.types', ['node']);

    // projen's AutoMerge component hardcodes `delete_head_branch: {}` in the
    // mergify rule with no option to disable it. Strip it so Mergify does not
    // delete head branches on merge (renovate/dependabot manage their own).
    // see https://github.com/MV-Consulting/cdk-vscode-server/pull/112
    this.tryFindObjectFile('.mergify.yml')?.addDeletionOverride(
      'pull_request_rules.0.actions.delete_head_branch',
    );

    // Auto-approve PRs authored by 'mvc-bot' itself (see the
    // autoApproveOptions comment above for why this can't go through the
    // GitHub Actions auto-approve path) via Mergify instead: it posts the
    // review as the Mergify app, a different actor. See mavogel/mvc-projen#74.
    this.tryFindObjectFile('.mergify.yml')?.addOverride(
      'pull_request_rules.1',
      {
        name: 'Auto-approve self-authored mvc-bot PRs',
        conditions: [
          'author=mvc-bot',
          'label=auto-approve',
        ],
        actions: {
          review: {
            type: 'APPROVE',
            message: 'Automatically approved: self-authored automation PR.',
          },
        },
      },
    );

    // gitignore
    const filesPatternToGitignore = [
      'tmp',
      '.codegpt',
    ];
    for (const file of filesPatternToGitignore) {
      this.gitignore.exclude(file);
    }
    this.addDeps(
      // cdk-nag v3 requires aws-cdk-lib >= 2.257.0 (see cdk-nag MIGRATION.md)
      'cdk-nag@^3.0.1',
    );
    // Cap integ-runner at LAST_INTEG_RUNNER_VERSION since it stopped publishing after that version.
    // integ-runner uses plain versions (no -alpha.0 suffix).
    // integ-tests-alpha and awslint only publish at minor versions (e.g. 2.197.0-alpha.0, not 2.197.4-alpha.0).
    const rawCdkVersion = this.cdkVersion.replace(/[\^~]/, '');
    const integRunnerVersion = rawCdkVersion.localeCompare(LAST_INTEG_RUNNER_VERSION, undefined, { numeric: true, sensitivity: 'base' }) > 0
      ? LAST_INTEG_RUNNER_VERSION
      : rawCdkVersion;
    // Alpha packages only publish at .0 patch versions — normalize to minor version
    const [major, minor] = rawCdkVersion.split('.');
    const alphaVersion = `${major}.${minor}.0`;
    this.addDevDeps(
      `@aws-cdk/integ-runner@${integRunnerVersion}`,
      `@aws-cdk/integ-tests-alpha@${alphaVersion}-alpha.0`,
      '@commitlint/cli@^20.1.0',
      '@commitlint/config-conventional@^20.0.0',
      `awslint@${alphaVersion}-alpha.0`,
      'husky@^9.1.7',
    );

    this.package.setScript('prepare', 'husky');
    new TextFile(this, '.commitlintrc.js', {
      lines: [
        'module.exports = { extends: [\'@commitlint/config-conventional\'] };',
      ],
      marker: true,
    });

    this.package.setScript('awslint', 'awslint');
    // .github/workflows/build.yml
    const buildWorkflow = this.github?.tryFindWorkflow('build');
    if (!buildWorkflow) return;
    const buildJob = buildWorkflow.getJob('build');
    if (!buildJob || !('steps' in buildJob)) return;
    // TODO: figure out why wrong types
    const getBuildSteps = buildJob.steps as unknown as () => JobStep[];
    const buildJobSteps = getBuildSteps();
    buildWorkflow.updateJob('build', {
      ...buildJob,
      steps: [
        ...buildJobSteps.slice(0, 4),
        {
          name: 'Run awslint',
          run: 'npm run awslint',
        },
        ...buildJobSteps.slice(4),
      ],
    });

    // Pin GitHub Actions that projen otherwise references by a mutable tag,
    // and stop checkout steps that never push back with it from persisting a
    // git credential on the runner - per zizmor's unpinned-uses / artipacked
    // audits (https://docs.zizmor.sh/audits/). Centralized here so every
    // project built on MvcCdkConstructLibrary gets a clean `zizmor .` run
    // without reimplementing this in its own .projenrc.ts.
    this.github?.actions.set('actions/setup-node@v7.0.0', 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020'); // v7.0.0
    this.github?.actions.set('actions/setup-python@v7.0.0', 'actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97'); // v7.0.0
    this.github?.actions.set('peter-evans/create-pull-request@v8.1.1', 'peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1'); // v8.1.1

    const disableCheckoutCredentialPersistence = (workflowName: string, jobIds: string[]) => {
      const workflow = this.github?.tryFindWorkflow(workflowName);
      if (!workflow) return;
      for (const jobId of jobIds) {
        const job = workflow.getJob(jobId);
        if (!job || !('steps' in job)) continue;
        // `job.steps` is a bound accessor function until a job's first
        // `updateJob()` call, after which it becomes a plain array (see the
        // "TODO: figure out why wrong types" comment on the build.yml patch
        // above) - so resolve it defensively rather than assuming either shape.
        const rawSteps = job.steps as unknown as JobStep[] | (() => JobStep[]);
        const currentSteps = typeof rawSteps === 'function' ? rawSteps() : rawSteps;
        workflow.updateJob(jobId, {
          ...job,
          steps: currentSteps.map((step) =>
            step.id === 'checkout'
              ? { ...step, with: { ...step.with, 'persist-credentials': false } }
              : step,
          ),
        });
      }
    };
    // Excludes build.yml's `self-mutation` job, which relies on the
    // persisted credential to `git push` its patch back to the PR branch.
    disableCheckoutCredentialPersistence('build', ['build', 'package-js', 'package-python']);
    disableCheckoutCredentialPersistence('upgrade-main', ['upgrade', 'pr']);

    // The release workflow's `release_npm`/`release_pypi` jobs are only
    // added by the `Release` component's own `preSynthesize()`, which runs
    // during `project.synth()` - after this constructor returns. Patch them
    // from a component added afterwards, so its `preSynthesize()` runs later
    // still (component preSynthesize order follows construction order).
    class ReleaseWorkflowCredentialPatch extends Component {
      preSynthesize() {
        disableCheckoutCredentialPersistence('release', ['release', 'release_npm', 'release_pypi']);
      }
    }
    new ReleaseWorkflowCredentialPatch(this);

    this.package.setScript(
      'integ-test',
      `integ-runner --directory ./integ-tests ${integTestRegions?.map(region => `--parallel-regions ${region}`).join(' ')} --update-on-failed`,
    );

    new TextFile(this, '.github/ISSUE_TEMPLATE/bug_report.md', {
      lines: [fs.readFileSync(`${baseAssetsDirectory}/common/github_bug_report.md`).toString()],
    });

    new TextFile(this, '.github/ISSUE_TEMPLATE/feature_request.md', {
      lines: [fs.readFileSync(`${baseAssetsDirectory}/common/github_feature_request.md`).toString()],
    });

    new YamlFile(this, '.github/FUNDING.yaml', {
      obj: {
        github: 'mavogel',
      },
    });

    // zizmor's dangerous-triggers audit flags any pull_request_target
    // trigger. Both workflows below (generated identically for every
    // MvcCdkConstructLibrary consumer via autoApproveOptions /
    // pullRequestLintOptions) are safe: they only inspect PR metadata (label,
    // actor, title) and never check out or execute PR code.
    // https://docs.zizmor.sh/audits/#dangerous-triggers
    new YamlFile(this, '.github/zizmor.yml', {
      obj: {
        rules: {
          'dangerous-triggers': {
            ignore: [
              'auto-approve.yml',
              'pull-request-lint.yml',
            ],
          },
        },
      },
    });

    new TextFile(this, 'CONTRIBUTING.md', {
      lines: [fs.readFileSync(`${baseAssetsDirectory}/common/contributing.md`).toString()],
    });

    new TextFile(this, '.prettierrc', {
      lines: [fs.readFileSync(`${baseAssetsDirectory}/common/prettierrc`).toString()],
    });

    // write sample code to main.ts & to main.test.ts
    if (options.sampleCode ?? true) {
      new SampleCode(this, {
        baseAssetsDirectory,
      });
    }
  }
}

interface SampleCodeOptions {
  readonly baseAssetsDirectory?: string;
}

class SampleCode extends Component {
  private readonly library: AwsCdkConstructLibrary;
  private readonly options: SampleCodeOptions;

  constructor(
    library: AwsCdkConstructLibrary,
    options: SampleCodeOptions,
  ) {
    super(library);
    this.library = library;
    this.options = options;
  }

  public synthesize() {
    const outdir = this.project.outdir;
    const srcdir = path.join(outdir, this.library.srcdir);
    if (
      fs.existsSync(`${srcdir}/index.ts`) &&
      !fs.readFileSync(`${srcdir}/index.ts`).toString().includes('export class Hello') // Note: from parent
    ) {
      return;
    }

    fs.mkdirSync(srcdir, { recursive: true });
    fs.writeFileSync(path.join(srcdir, 'index.ts'), fs.readFileSync(`${this.options.baseAssetsDirectory}/cdk-construct/src_index.ts`).toString());
    fs.writeFileSync(path.join(srcdir, 'placeholder.ts'), fs.readFileSync(`${this.options.baseAssetsDirectory}/cdk-construct/src_placeholder.ts`).toString());
    // crd with lambda generation
    // Note: crd-example.lambda.ts is written earlier, before `super()`, so
    // AutoDiscover's constructor-time glob can find it - see the comment in
    // the constructor above.
    fs.mkdirSync(`${srcdir}/crd-example`, { recursive: true });
    fs.writeFileSync(path.join(`${srcdir}/crd-example`, 'crd-example.ts'), fs.readFileSync(`${this.options.baseAssetsDirectory}/cdk-construct/src_crd-example.ts`).toString());


    const testdir = path.join(outdir, this.library.testdir);
    if (
      fs.existsSync(testdir) &&
      fs.readdirSync(testdir).filter((x) => x.endsWith('.ts')) &&
      !fs.existsSync(`${testdir}/hello.test.ts`) // Note: from parent
    ) {
      return;
    }
    // remove ${testdir}/hello.test.ts file. On the other hand, we override index.ts
    fs.unlinkSync(`${testdir}/hello.test.ts`);
    fs.mkdirSync(testdir, { recursive: true });
    fs.writeFileSync(path.join(testdir, 'index.test.ts'), fs.readFileSync(`${this.options.baseAssetsDirectory}/cdk-construct/test_index.test.ts`).toString());
    // lambda tests with jest stubs
    fs.mkdirSync(`${testdir}/crd-example`, { recursive: true });
    fs.writeFileSync(path.join(`${testdir}/crd-example`, 'crd-example.test.ts'), fs.readFileSync(`${this.options.baseAssetsDirectory}/cdk-construct/test_crd-example.test.ts`).toString());


    const integTestdir = path.join(outdir, 'integ-tests');
    if (
      fs.existsSync(integTestdir) &&
      fs.readdirSync(integTestdir).filter((x) => x.endsWith('.ts'))
    ) {
      return;
    }
    fs.mkdirSync(integTestdir, { recursive: true });
    fs.writeFileSync(path.join(integTestdir, 'integ.placeholder.ts'), fs.readFileSync(`${this.options.baseAssetsDirectory}/cdk-construct/integ_integ.placeholder.ts`).toString());

    const integTestFunctionsdir = path.join(integTestdir, 'functions');
    if (
      fs.existsSync(integTestFunctionsdir) &&
      fs.readdirSync(integTestFunctionsdir).filter((x) => x.endsWith('.ts'))
    ) {
      return;
    }
    fs.mkdirSync(integTestFunctionsdir, { recursive: true });
    fs.writeFileSync(path.join(integTestFunctionsdir, 'test-handler.ts'), fs.readFileSync(`${this.options.baseAssetsDirectory}/cdk-construct/integ_test-handler.ts`).toString());

    const docsdir = path.join(outdir, 'docs');
    if (
      fs.existsSync(docsdir) &&
      fs.readdirSync(docsdir).filter((x) => x.endsWith('.drawio'))
    ) {
      return;
    }
    fs.mkdirSync(docsdir, { recursive: true });
    fs.writeFileSync(path.join(docsdir, 'placeholder.drawio'), fs.readFileSync(`${this.options.baseAssetsDirectory}/common/docs_placeholder.drawio`).toString());

    const examplesdir = path.join(outdir, 'examples', 'simple');
    if (
      fs.existsSync(examplesdir) &&
      fs.readdirSync(examplesdir).filter((x) => x.endsWith('.drawio'))
    ) {
      return;
    }
    fs.mkdirSync(examplesdir, { recursive: true });
    fs.writeFileSync(path.join(examplesdir, 'main.ts'), fs.readFileSync(`${this.options.baseAssetsDirectory}/cdk-construct/examples_simple_main.ts`).toString());
  }
}