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