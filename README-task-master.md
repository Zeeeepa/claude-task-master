# Task Master

### by [@eyaltoledano](https://x.com/eyaltoledano)

A simplified task management system for AI-driven development with Claude, designed to work seamlessly with Cursor AI.

**⚠️ MIGRATION NOTICE: This version has been simplified as part of Phase 1.1 architecture restructuring. CLI interface, MCP server, and multiple AI providers have been removed. Only the core Anthropic integration remains.**

## Requirements

- Node.js 14.0.0 or higher
- Anthropic API key (Claude API)
- Anthropic SDK version 0.39.0 or higher

## Configuration

Taskmaster now uses a simplified configuration approach focused on Anthropic/Claude integration:

1.  **`.taskmasterconfig` File (Project Root)**

    - Stores core settings for Anthropic models and parameters
    - **Note: CLI configuration commands are no longer available**

2.  **Environment Variables (`.env` file)**
    - Used **only** for the `ANTHROPIC_API_KEY`
    - Place your Anthropic API key in a `.env` file in your project root

**Important:** This simplified version only supports Anthropic/Claude models. Multiple AI provider support has been removed.

## Installation

```bash
# Install locally within your project
npm install task-master-ai
```

**Note: CLI interface has been removed. Global installation is no longer supported.**
