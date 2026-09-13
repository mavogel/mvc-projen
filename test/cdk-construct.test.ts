import { synthSnapshot } from 'projen/lib/util/synth';
import { MvcCdkConstructLibrary, MvcCdkConstructLibraryOptions } from '../src';

const minimalMvcCdkConstructLibraryOptions: MvcCdkConstructLibraryOptions = {
  author: 'test',
  authorAddress: 'test@test.com',
  cdkVersion: '2.177.0',
  name: 'test-project',
  defaultReleaseBranch: 'main',
  repositoryUrl: 'https://github.com/MV-Consulting/test-project.git',
  // for tests
  baseAssetsDirectory: `${process.cwd()}/assets`,
};

describe('cdkVersion is >= 2.0.0', () => {
  test('check', () => {
    const project = new MvcCdkConstructLibrary(minimalMvcCdkConstructLibraryOptions);
    synthSnapshot(project);
  });
});


describe('configurations', () => {
  test('default all files written', () => {
    const project = new MvcCdkConstructLibrary(minimalMvcCdkConstructLibraryOptions);
    const snap = synthSnapshot(project);
    // console.log(snap);
    expect(
      snap['.github/ISSUE_TEMPLATE/bug_report.md'].indexOf('## Bug Report'),
    ).not.toEqual(-1);
    expect(
      snap['.github/ISSUE_TEMPLATE/feature_request.md'].indexOf('## Feature Request'),
    ).not.toEqual(-1);
    expect(
      snap['.github/pull_request_template.md'].indexOf('**Please check if the PR fulfills these requirements**'),
    ).not.toEqual(-1);
    expect(
      snap['.github/FUNDING.yaml'].indexOf('github: mavogel'),
    ).not.toEqual(-1);
    expect(
      snap['.commitlintrc.js'].indexOf('module.exports'),
    ).not.toEqual(-1);
    expect(
      snap['README.md'].indexOf('Unlock the Full Potential of Your AWS Cloud Infrastructure'),
    ).not.toEqual(-1);
    expect(snap['package.json'].scripts.prepare).toEqual('husky');
    expect(snap['package.json'].scripts.awslint).toEqual('awslint');
    // pinned so generated projects don't drift onto a ts-node-incompatible
    // TypeScript major (see mvc-projen-toolchain-maintenance.md)
    expect(snap['package.json'].devDependencies.typescript).toEqual('^6.0.2');
  });
});

describe('GitHub Actions security hardening', () => {
  test('pins mutable-tag actions to a commit SHA and skips checkout credential persistence where safe', () => {
    const project = new MvcCdkConstructLibrary({
      ...minimalMvcCdkConstructLibraryOptions,
      // depsUpgrade's own upgrade-main.yml is skipped by default when
      // Dependabot is enabled (mvc-projen's default) - disable it to get
      // upgrade-main.yml in this snapshot too.
      dependabot: false,
      publishToPypi: {
        distName: 'test-project',
        module: 'test_project',
      },
    });
    const snap = synthSnapshot(project);

    for (const workflow of ['build.yml', 'release.yml', 'upgrade-main.yml']) {
      const contents: string = snap[`.github/workflows/${workflow}`];
      expect(contents).not.toMatch(/uses: actions\/setup-node@v\d/);
      expect(contents).not.toMatch(/uses: actions\/setup-python@v\d/);
      expect(contents).not.toMatch(/uses: peter-evans\/create-pull-request@v\d/);
    }

    const buildYml: string = snap['.github/workflows/build.yml'];
    // `self-mutation` needs the persisted checkout credential to push its
    // patch back to the PR branch, so it must keep the default (no override).
    const selfMutationJob = buildYml.split('self-mutation:')[1].split(/^  \S/m)[0];
    expect(selfMutationJob).not.toMatch(/persist-credentials: false/);

    // every other checkout in build.yml never pushes, so it's safe to drop
    // the persisted credential.
    const otherCheckouts = buildYml.split('self-mutation:')[0] + buildYml.split('self-mutation:')[1].split(/^  \S/m).slice(1).join('');
    const checkoutCount = (otherCheckouts.match(/name: Checkout/g) ?? []).length;
    const persistCredentialsFalseCount = (otherCheckouts.match(/persist-credentials: false/g) ?? []).length;
    expect(persistCredentialsFalseCount).toEqual(checkoutCount);

    const releaseYml: string = snap['.github/workflows/release.yml'];
    const releaseCheckoutCount = (releaseYml.match(/name: Checkout/g) ?? []).length;
    const releasePersistCredentialsFalseCount = (releaseYml.match(/persist-credentials: false/g) ?? []).length;
    expect(releasePersistCredentialsFalseCount).toEqual(releaseCheckoutCount);
  });

  test('ignores the safe pull_request_target triggers and sets a dependabot cooldown', () => {
    const project = new MvcCdkConstructLibrary(minimalMvcCdkConstructLibraryOptions);
    const snap = synthSnapshot(project);

    const zizmorConfig: string = snap['.github/zizmor.yml'];
    expect(zizmorConfig).toMatch(/auto-approve\.yml/);
    expect(zizmorConfig).toMatch(/pull-request-lint\.yml/);

    expect(snap['.github/dependabot.yml']).toMatch(/cooldown:\n\s+default-days: 7/);
  });
});

describe('alpha package version capping', () => {
  test('uses cdkVersion when below the last integ-runner version', () => {
    const project = new MvcCdkConstructLibrary({
      ...minimalMvcCdkConstructLibraryOptions,
      cdkVersion: '2.177.0',
    });
    const snap = synthSnapshot(project);
    const devDeps = snap['package.json'].devDependencies;
    // integ-runner uses plain versions (no -alpha.0 suffix)
    expect(devDeps['@aws-cdk/integ-runner']).toEqual('2.177.0');
    // integ-tests-alpha and awslint use -alpha.0 suffix and track cdkVersion
    expect(devDeps['@aws-cdk/integ-tests-alpha']).toEqual('2.177.0-alpha.0');
    expect(devDeps.awslint).toEqual('2.177.0-alpha.0');
  });

  test('caps integ-runner at the last verified version when cdkVersion exceeds it, and normalizes alpha versions to .0 patch', () => {
    // Deliberately far beyond any real LAST_INTEG_RUNNER_VERSION, now or
    // after .github/workflows/upgrade-integ-runner.yml bumps it - this
    // test only needs to know capping happened, not the exact cap value,
    // so it doesn't hardcode (and go stale against) that constant.
    const farFutureCdkVersion = '2.999.0'; // must stay v2.x - AwsCdkDeps rejects other majors
    const project = new MvcCdkConstructLibrary({
      ...minimalMvcCdkConstructLibraryOptions,
      cdkVersion: farFutureCdkVersion,
    });
    const snap = synthSnapshot(project);
    const devDeps = snap['package.json'].devDependencies;
    // integ-runner is capped below the requested cdkVersion (no alpha suffix)
    expect(devDeps['@aws-cdk/integ-runner']).not.toEqual(farFutureCdkVersion);
    // integ-tests-alpha and awslint only publish at .0 patch versions
    expect(devDeps['@aws-cdk/integ-tests-alpha']).toEqual(`${farFutureCdkVersion}-alpha.0`);
    expect(devDeps.awslint).toEqual(`${farFutureCdkVersion}-alpha.0`);
  });
});