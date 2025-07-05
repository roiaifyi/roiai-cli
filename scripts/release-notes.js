#!/usr/bin/env node

/**
 * release-notes.js - Generate release notes from git commits
 * This script analyzes commit messages between tags to generate formatted release notes
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Commit type mappings
const TYPE_MAPPINGS = {
  feat: '✨ Features',
  fix: '🐛 Bug Fixes',
  docs: '📚 Documentation',
  refactor: '♻️ Code Refactoring',
  test: '🧪 Tests',
  chore: '🔧 Maintenance',
  perf: '⚡ Performance',
  style: '💅 Style',
  build: '🏗️ Build System',
  ci: '👷 CI/CD',
};

// Get command line arguments
const args = process.argv.slice(2);
const fromTag = args[0];
const toTag = args[1] || 'HEAD';

if (!fromTag) {
  console.error('Usage: node release-notes.js <from-tag> [to-tag]');
  console.error('Example: node release-notes.js v1.0.0 v1.0.1');
  process.exit(1);
}

/**
 * Execute git command and return output
 */
function git(command) {
  try {
    return execSync(`git ${command}`, { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error(`Git command failed: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Parse commit message into type, scope, and description
 */
function parseCommit(message) {
  // Match conventional commit format: type(scope): description
  const match = message.match(/^(\w+)(?:\(([^)]+)\))?: (.+)$/);
  
  if (match) {
    return {
      type: match[1],
      scope: match[2] || null,
      description: match[3],
    };
  }
  
  // If not conventional format, treat as misc
  return {
    type: 'misc',
    scope: null,
    description: message,
  };
}

/**
 * Get all commits between two refs
 */
function getCommits(from, to) {
  const format = '%H|%s|%an|%ae';
  const log = git(`log --pretty=format:"${format}" ${from}..${to}`);
  
  if (!log) {
    return [];
  }
  
  return log.split('\n').map(line => {
    const [hash, subject, authorName, authorEmail] = line.split('|');
    const parsed = parseCommit(subject);
    
    return {
      hash: hash.substring(0, 7),
      subject,
      authorName,
      authorEmail,
      ...parsed,
    };
  });
}

/**
 * Group commits by type
 */
function groupCommitsByType(commits) {
  const groups = {};
  
  commits.forEach(commit => {
    const type = commit.type;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(commit);
  });
  
  return groups;
}

/**
 * Format commits for a specific type
 */
function formatCommitGroup(commits) {
  return commits
    .map(commit => {
      const scope = commit.scope ? `**${commit.scope}**: ` : '';
      return `- ${scope}${commit.description} ([${commit.hash}])`;
    })
    .join('\n');
}

/**
 * Get contributors for the release
 */
function getContributors(commits) {
  const contributors = new Map();
  
  commits.forEach(commit => {
    const key = commit.authorEmail;
    if (!contributors.has(key)) {
      contributors.set(key, {
        name: commit.authorName,
        email: commit.authorEmail,
        count: 0,
      });
    }
    contributors.get(key).count++;
  });
  
  return Array.from(contributors.values())
    .sort((a, b) => b.count - a.count);
}

/**
 * Generate the release notes
 */
function generateReleaseNotes() {
  console.log(`Generating release notes from ${fromTag} to ${toTag}...`);
  
  // Get commits
  const commits = getCommits(fromTag, toTag);
  
  if (commits.length === 0) {
    console.log('No commits found between the specified tags.');
    return '';
  }
  
  console.log(`Found ${commits.length} commits`);
  
  // Group by type
  const groups = groupCommitsByType(commits);
  
  // Build release notes
  let notes = '';
  
  // Add commit groups
  Object.entries(TYPE_MAPPINGS).forEach(([type, title]) => {
    if (groups[type] && groups[type].length > 0) {
      notes += `## ${title}\n\n`;
      notes += formatCommitGroup(groups[type]);
      notes += '\n\n';
    }
  });
  
  // Add miscellaneous commits if any
  if (groups.misc && groups.misc.length > 0) {
    notes += `## 📝 Other Changes\n\n`;
    notes += formatCommitGroup(groups.misc);
    notes += '\n\n';
  }
  
  // Add contributors
  const contributors = getContributors(commits);
  if (contributors.length > 0) {
    notes += `## 👥 Contributors\n\n`;
    notes += 'Thanks to the following contributors for this release:\n\n';
    contributors.forEach(contributor => {
      notes += `- ${contributor.name} (${contributor.count} commit${contributor.count > 1 ? 's' : ''})\n`;
    });
    notes += '\n';
  }
  
  // Add stats
  notes += `## 📊 Release Stats\n\n`;
  notes += `- Total commits: ${commits.length}\n`;
  notes += `- Contributors: ${contributors.length}\n`;
  
  const typeStats = Object.entries(groups)
    .map(([type, commits]) => `${commits.length} ${type}`)
    .join(', ');
  notes += `- Changes by type: ${typeStats}\n`;
  
  return notes;
}

// Generate and output release notes
const releaseNotes = generateReleaseNotes();

if (releaseNotes) {
  console.log('\n' + '='.repeat(60));
  console.log('RELEASE NOTES');
  console.log('='.repeat(60) + '\n');
  console.log(releaseNotes);
  
  // Optionally save to file
  if (args[2] === '--save') {
    const filename = `release-notes-${toTag.replace(/\//g, '-')}.md`;
    fs.writeFileSync(filename, releaseNotes);
    console.log(`\nRelease notes saved to: ${filename}`);
  }
}