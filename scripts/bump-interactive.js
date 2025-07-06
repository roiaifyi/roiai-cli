#!/usr/bin/env node

const { execSync } = require('child_process');
const prompts = require('prompts');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

// Get current version
const packagePath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const currentVersion = pkg.version;

// Parse current version
const [major, minor, patch] = currentVersion.split('.').map(Number);
const prerelease = currentVersion.includes('-') ? currentVersion.split('-')[1] : null;

// Calculate potential new versions
const versions = {
  patch: `${major}.${minor}.${patch + 1}`,
  minor: `${major}.${minor + 1}.0`,
  major: `${major + 1}.0.0`,
  prepatch: `${major}.${minor}.${patch + 1}-0`,
  preminor: `${major}.${minor + 1}.0-0`,
  premajor: `${major + 1}.0.0-0`,
  prerelease: prerelease ? `${major}.${minor}.${patch}-${parseInt(prerelease) + 1}` : `${major}.${minor}.${patch}-0`
};

async function main() {
  console.log(chalk.blue('\n🚀 roiai-cli Version Bump Tool\n'));
  console.log(`Current version: ${chalk.yellow(currentVersion)}\n`);

  // Show version options
  const { versionType } = await prompts({
    type: 'select',
    name: 'versionType',
    message: 'Select version bump type:',
    choices: [
      { 
        title: `Patch (${chalk.gray(currentVersion)} → ${chalk.green(versions.patch)}) - Bug fixes`, 
        value: 'patch' 
      },
      { 
        title: `Minor (${chalk.gray(currentVersion)} → ${chalk.green(versions.minor)}) - New features`, 
        value: 'minor' 
      },
      { 
        title: `Major (${chalk.gray(currentVersion)} → ${chalk.green(versions.major)}) - Breaking changes`, 
        value: 'major' 
      },
      { 
        title: `Pre-patch (${chalk.gray(currentVersion)} → ${chalk.green(versions.prepatch)})`, 
        value: 'prepatch' 
      },
      { 
        title: `Pre-minor (${chalk.gray(currentVersion)} → ${chalk.green(versions.preminor)})`, 
        value: 'preminor' 
      },
      { 
        title: `Pre-major (${chalk.gray(currentVersion)} → ${chalk.green(versions.premajor)})`, 
        value: 'premajor' 
      },
      { 
        title: `Pre-release (${chalk.gray(currentVersion)} → ${chalk.green(versions.prerelease)})`, 
        value: 'prerelease' 
      },
      { 
        title: 'Custom version', 
        value: 'custom' 
      }
    ]
  });

  if (!versionType) {
    console.log(chalk.red('\n✗ Version bump cancelled\n'));
    process.exit(0);
  }

  let newVersion = versions[versionType];

  // Handle custom version
  if (versionType === 'custom') {
    const { customVersion } = await prompts({
      type: 'text',
      name: 'customVersion',
      message: 'Enter custom version:',
      validate: value => /^\d+\.\d+\.\d+(-\w+)?$/.test(value) ? true : 'Invalid version format'
    });

    if (!customVersion) {
      console.log(chalk.red('\n✗ Version bump cancelled\n'));
      process.exit(0);
    }

    newVersion = customVersion;
  }

  // Confirm version change
  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: `Bump version from ${chalk.yellow(currentVersion)} to ${chalk.green(newVersion)}?`,
    initial: true
  });

  if (!confirm) {
    console.log(chalk.red('\n✗ Version bump cancelled\n'));
    process.exit(0);
  }

  // Additional options
  const { options } = await prompts({
    type: 'multiselect',
    name: 'options',
    message: 'Select additional options:',
    choices: [
      { title: 'Run tests before bumping', value: 'test', selected: true },
      { title: 'Build project before bumping', value: 'build', selected: true },
      { title: 'Generate Prisma client', value: 'prisma', selected: true },
      { title: 'Create git commit (no tag)', value: 'git', selected: true },
      { title: 'Push to remote after bumping', value: 'push', selected: false }
    ]
  });

  console.log();

  try {
    // Run pre-bump tasks
    if (options.includes('test')) {
      console.log(chalk.blue('Running tests...'));
      execSync('npm run test:quiet', { stdio: 'inherit' });
      console.log(chalk.green('✓ Tests passed\n'));
    }

    if (options.includes('build')) {
      console.log(chalk.blue('Building project...'));
      execSync('npm run build', { stdio: 'pipe' });
      console.log(chalk.green('✓ Build successful\n'));
    }

    if (options.includes('prisma')) {
      console.log(chalk.blue('Generating Prisma client...'));
      execSync('npm run prisma:generate', { stdio: 'pipe' });
      console.log(chalk.green('✓ Prisma client generated\n'));
    }

    // Bump version
    console.log(chalk.blue('Bumping version...'));
    
    // Always use --no-git-tag-version since GitHub Action creates tags
    const customFlag = versionType === 'custom' ? newVersion : versionType;
    execSync(`npm version ${customFlag} --no-git-tag-version`, { stdio: 'pipe' });
    
    // Create git commit if requested
    if (options.includes('git')) {
      execSync('git add package.json package-lock.json 2>/dev/null || git add package.json', { stdio: 'pipe' });
      execSync(`git commit -m "chore: release ${newVersion}"`, { stdio: 'pipe' });
      console.log(chalk.green(`✓ Version bumped to ${newVersion} with commit\n`));
    } else {
      console.log(chalk.green(`✓ Version bumped to ${newVersion} (no commit)\n`));
    }

    // Push if requested
    if (options.includes('push') && options.includes('git')) {
      console.log(chalk.blue('Pushing to remote...'));
      execSync('git push origin main', { stdio: 'pipe' });
      console.log(chalk.green('✓ Pushed to remote (GitHub Action will create tag)\n'));
    }

    // Success message
    console.log(chalk.green.bold('━'.repeat(50)));
    console.log(chalk.green.bold('✅ Version bump complete!'));
    console.log(chalk.green.bold('━'.repeat(50)));
    console.log(`\nVersion changed: ${chalk.yellow(currentVersion)} → ${chalk.green(newVersion)}\n`);

    if (options.includes('git') && !options.includes('push')) {
      console.log('Next steps:');
      console.log('1. Update CHANGELOG.md if needed');
      console.log('2. Push changes: git push origin main');
      console.log('3. The GitHub Action will create the tag and handle the release\n');
    }

  } catch (error) {
    console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error(chalk.red(`\n✗ Unexpected error: ${error.message}\n`));
  process.exit(1);
});