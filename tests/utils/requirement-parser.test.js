/**
 * @fileoverview Tests for Requirement Parser
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { RequirementParser } from '../../src/utils/requirement-parser.js';

describe('RequirementParser', () => {
    let parser;

    beforeEach(() => {
        parser = new RequirementParser();
    });

    describe('constructor', () => {
        test('should initialize with default options', () => {
            expect(parser.options.enableNLP).toBe(false);
            expect(parser.options.strictParsing).toBe(false);
            expect(parser.options.includeMetadata).toBe(true);
        });

        test('should accept custom options', () => {
            const customParser = new RequirementParser({
                enableNLP: true,
                strictParsing: true,
                includeMetadata: false
            });

            expect(customParser.options.enableNLP).toBe(true);
            expect(customParser.options.strictParsing).toBe(true);
            expect(customParser.options.includeMetadata).toBe(false);
        });
    });

    describe('parseLinearIssue', () => {
        test('should parse well-structured Linear issue', () => {
            const issueDescription = `# Feature Implementation

## Description
Implement user authentication system with JWT tokens.

## ✅ Acceptance Criteria
- Users can register with email and password
- Users can login and receive JWT token
- Protected routes require valid token

## 📋 Technical Specifications
- Use bcrypt for password hashing
- Implement JWT token generation
- Add middleware for route protection

## 📁 Affected Files
- src/auth/auth.controller.js
- src/auth/auth.service.js
- src/middleware/auth.middleware.js
- tests/auth.test.js

## 🔗 Dependencies
- bcryptjs
- jsonwebtoken
- express-validator`;

            const result = parser.parseLinearIssue(issueDescription);

            expect(result).toContain('# Task: Feature Implementation');
            expect(result).toContain('## Description');
            expect(result).toContain('Implement user authentication system');
            expect(result).toContain('## Acceptance Criteria');
            expect(result).toContain('- Users can register with email and password');
            expect(result).toContain('## Technical Requirements');
            expect(result).toContain('- Use bcrypt for password hashing');
            expect(result).toContain('## Files to Modify/Create');
            expect(result).toContain('- src/auth/auth.controller.js');
            expect(result).toContain('## Dependencies');
            expect(result).toContain('- bcryptjs');
        });

        test('should handle minimal issue description', () => {
            const issueDescription = 'Simple bug fix for login validation';

            const result = parser.parseLinearIssue(issueDescription);

            expect(result).toContain('# Task: Untitled Requirement');
            expect(result).toContain('## Description');
            expect(result).toContain('Simple bug fix for login validation');
        });

        test('should extract title from metadata', () => {
            const issueDescription = 'Some description';
            const metadata = { title: 'Custom Title' };

            const result = parser.parseLinearIssue(issueDescription, metadata);

            expect(result).toContain('# Task: Custom Title');
        });
    });

    describe('extractTitle', () => {
        test('should extract title from metadata', () => {
            const metadata = { title: 'Feature Request' };
            const title = parser.extractTitle('description', metadata);

            expect(title).toBe('Feature Request');
        });

        test('should extract title from first line', () => {
            const description = '# Main Feature\n\nSome description here';
            const title = parser.extractTitle(description);

            expect(title).toBe('Main Feature');
        });

        test('should handle markdown headers', () => {
            const description = '## Secondary Header\n\nContent';
            const title = parser.extractTitle(description);

            expect(title).toBe('Secondary Header');
        });

        test('should return default for empty input', () => {
            const title = parser.extractTitle('');

            expect(title).toBe('Untitled Requirement');
        });
    });

    describe('extractDescription', () => {
        test('should extract description before first section', () => {
            const description = `Main description here.

This is more description.

## First Section
Section content`;

            const result = parser.extractDescription(description);

            expect(result).toBe(`Main description here.

This is more description.`);
        });

        test('should return full text if no sections', () => {
            const description = 'Just a simple description without sections.';
            const result = parser.extractDescription(description);

            expect(result).toBe('Just a simple description without sections.');
        });
    });

    describe('extractSection', () => {
        test('should extract acceptance criteria with emoji header', () => {
            const description = `## ✅ Acceptance Criteria
- User can login
- User receives token
- Token expires after 1 hour

## Other Section
Other content`;

            const criteria = parser.extractSection(description, 'acceptance_criteria');

            expect(criteria).toEqual([
                'User can login',
                'User receives token',
                'Token expires after 1 hour'
            ]);
        });

        test('should extract technical specs', () => {
            const description = `## 📋 Technical Specifications
- Use Node.js
- Implement REST API
- Add database integration

## Next Section
Content`;

            const specs = parser.extractSection(description, 'technical_specs');

            expect(specs).toEqual([
                'Use Node.js',
                'Implement REST API',
                'Add database integration'
            ]);
        });

        test('should try alternative patterns', () => {
            const description = `Acceptance Criteria:
- Must work correctly
- Must be tested
- Must be documented

Other content here`;

            const criteria = parser.extractSection(description, 'acceptance_criteria');

            expect(criteria).toEqual([
                'Must work correctly',
                'Must be tested',
                'Must be documented'
            ]);
        });

        test('should return empty array if section not found', () => {
            const description = 'No sections here';
            const criteria = parser.extractSection(description, 'acceptance_criteria');

            expect(criteria).toEqual([]);
        });
    });

    describe('extractFileList', () => {
        test('should extract files from affected files section', () => {
            const description = `## 📁 Affected Files
- src/components/Login.jsx
- src/services/auth.service.js
- tests/auth.test.js`;

            const files = parser.extractFileList(description);

            expect(files).toContain('src/components/Login.jsx');
            expect(files).toContain('src/services/auth.service.js');
            expect(files).toContain('tests/auth.test.js');
        });

        test('should extract files from code blocks', () => {
            const description = `Update these files:

\`\`\`javascript
// src/utils/helper.js
function helper() {}

// Import from another file
import { config } from './config.js';
\`\`\``;

            const files = parser.extractFileList(description);

            expect(files).toContain('src/utils/helper.js');
            expect(files).toContain('./config.js');
        });

        test('should extract standalone file paths', () => {
            const description = `Please update package.json and modify src/index.js for this feature.`;

            const files = parser.extractFileList(description);

            expect(files).toContain('package.json');
            expect(files).toContain('src/index.js');
        });

        test('should remove duplicates and filter invalid paths', () => {
            const description = `## 📁 Affected Files
- src/test.js
- src/test.js
- invalid file name
- src/another.js`;

            const files = parser.extractFileList(description);

            expect(files).toEqual(['src/test.js', 'src/another.js']);
        });
    });

    describe('extractDependencies', () => {
        test('should extract from dependencies section', () => {
            const description = `## 🔗 Dependencies
- express
- mongoose
- bcryptjs`;

            const deps = parser.extractDependencies(description);

            expect(deps).toEqual(['express', 'mongoose', 'bcryptjs']);
        });

        test('should extract npm install commands', () => {
            const description = `Install packages:

\`\`\`bash
npm install express mongoose
npm install --save-dev jest
\`\`\``;

            const deps = parser.extractDependencies(description);

            expect(deps).toContain('npm: express');
            expect(deps).toContain('npm: mongoose');
            expect(deps).toContain('npm: jest');
        });

        test('should extract yarn commands', () => {
            const description = `\`\`\`
yarn add lodash moment
\`\`\``;

            const deps = parser.extractDependencies(description);

            expect(deps).toContain('yarn: lodash');
            expect(deps).toContain('yarn: moment');
        });

        test('should extract pip commands', () => {
            const description = `\`\`\`
pip install requests flask
\`\`\``;

            const deps = parser.extractDependencies(description);

            expect(deps).toContain('pip: requests');
            expect(deps).toContain('pip: flask');
        });
    });

    describe('extractRepositoryInfo', () => {
        test('should extract repository URL', () => {
            const description = `Repository: https://github.com/user/repo
Branch: feature-branch`;

            const repoInfo = parser.extractRepositoryInfo(description);

            expect(repoInfo.url).toBe('https://github.com/user/repo');
            expect(repoInfo.branch).toBe('feature-branch');
        });

        test('should extract GitHub URLs', () => {
            const description = `Check out https://github.com/example/project for reference.
Also see https://github.com/another/repo`;

            const repoInfo = parser.extractRepositoryInfo(description);

            expect(repoInfo.githubUrls).toEqual([
                'https://github.com/example/project',
                'https://github.com/another/repo'
            ]);
            expect(repoInfo.url).toBe('https://github.com/example/project');
        });
    });

    describe('extractMetadata', () => {
        test('should extract priority indicators', () => {
            const description = 'This is an urgent fix that needs immediate attention';
            const metadata = parser.extractMetadata(description);

            expect(metadata.priority).toBe('high');
        });

        test('should extract complexity indicators', () => {
            const description = 'This is a complex feature requiring significant changes';
            const metadata = parser.extractMetadata(description);

            expect(metadata.complexity).toBe('complex');
        });

        test('should extract effort estimates', () => {
            const description = 'Estimated effort: 3 days to complete this task';
            const metadata = parser.extractMetadata(description);

            expect(metadata.estimatedEffort).toBe('3 days');
        });

        test('should extract hashtags as tags', () => {
            const description = 'Feature request #frontend #react #authentication';
            const metadata = parser.extractMetadata(description);

            expect(metadata.tags).toEqual(['frontend', 'react', 'authentication']);
        });

        test('should merge with additional metadata', () => {
            const description = 'Simple task';
            const additionalMetadata = { author: 'John Doe', priority: 'low' };
            const metadata = parser.extractMetadata(description, additionalMetadata);

            expect(metadata.author).toBe('John Doe');
            expect(metadata.priority).toBe('low'); // Should keep additional metadata
        });
    });

    describe('parseListItems', () => {
        test('should parse bullet points', () => {
            const text = `- First item
- Second item
- Third item`;

            const items = parser.parseListItems(text);

            expect(items).toEqual(['First item', 'Second item', 'Third item']);
        });

        test('should parse numbered lists', () => {
            const text = `1. First step
2. Second step
3. Third step`;

            const items = parser.parseListItems(text);

            expect(items).toEqual(['First step', 'Second step', 'Third step']);
        });

        test('should parse checkboxes', () => {
            const text = `- [x] Completed task
- [ ] Pending task
- [x] Another completed task`;

            const items = parser.parseListItems(text);

            expect(items).toEqual(['Completed task', 'Pending task', 'Another completed task']);
        });

        test('should handle mixed formats', () => {
            const text = `- Bullet point
1. Numbered item
> Blockquote item
Regular line`;

            const items = parser.parseListItems(text);

            expect(items).toEqual(['Bullet point', 'Numbered item', 'Blockquote item', 'Regular line']);
        });

        test('should filter out empty lines and headers', () => {
            const text = `- Valid item

# Header
- Another valid item
## Another header
- Third item`;

            const items = parser.parseListItems(text);

            expect(items).toEqual(['Valid item', 'Another valid item', 'Third item']);
        });
    });

    describe('validateRequirements', () => {
        test('should validate complete requirements', () => {
            const requirements = {
                title: 'Complete Feature',
                description: 'A comprehensive description of the feature requirements',
                acceptanceCriteria: ['Should work', 'Should be tested'],
                technicalSpecs: ['Use React', 'Add tests'],
                affectedFiles: ['src/component.js']
            };

            const validation = parser.validateRequirements(requirements);

            expect(validation.isValid).toBe(true);
            expect(validation.errors).toEqual([]);
            expect(validation.score).toBeGreaterThan(80);
        });

        test('should identify missing title', () => {
            const requirements = {
                description: 'Good description'
            };

            const validation = parser.validateRequirements(requirements);

            expect(validation.isValid).toBe(false);
            expect(validation.errors).toContain('Title is required');
        });

        test('should warn about missing sections', () => {
            const requirements = {
                title: 'Feature',
                description: 'Short'
            };

            const validation = parser.validateRequirements(requirements);

            expect(validation.warnings).toContain('Description is very short or missing');
            expect(validation.warnings).toContain('No acceptance criteria specified');
            expect(validation.warnings).toContain('No technical specifications provided');
            expect(validation.warnings).toContain('No affected files specified');
        });

        test('should calculate score based on issues', () => {
            const requirements = {
                title: 'Feature',
                description: 'Short desc'
            };

            const validation = parser.validateRequirements(requirements);

            // Score should be reduced by warnings (4 warnings * 10 points each)
            expect(validation.score).toBe(60);
        });
    });

    describe('getHealth', () => {
        test('should return health status', () => {
            const health = parser.getHealth();

            expect(health.status).toBe('healthy');
            expect(health.options).toBeDefined();
            expect(health.patterns).toContain('acceptance_criteria');
            expect(health.alternativePatterns).toContain('acceptance_criteria');
            expect(health.version).toBe('1.0.0');
        });
    });
});

