/**
 * src/ai-providers/anthropic.js
 *
 * Implementation for interacting with Anthropic models (e.g., Claude)
 * using the direct Anthropic SDK.
 */
import Anthropic from '@anthropic-ai/sdk';
import { log } from '../../scripts/modules/utils.js';

// --- Client Instantiation ---
function getClient(apiKey, baseUrl) {
  if (!apiKey) {
    throw new Error('Anthropic API key is required');
  }
  
  const config = { apiKey };
  if (baseUrl) {
    config.baseURL = baseUrl;
  }
  
  return new Anthropic(config);
}

/**
 * Generates text using an Anthropic model.
 *
 * @param {object} params - Parameters for the text generation.
 * @param {string} params.apiKey - The Anthropic API key.
 * @param {string} params.modelId - The specific Anthropic model ID.
 * @param {Array<object>} params.messages - The messages array.
 * @param {number} [params.maxTokens] - Maximum tokens for the response.
 * @param {number} [params.temperature] - Temperature for generation.
 * @param {string} [params.baseUrl] - The base URL for the Anthropic API.
 * @returns {Promise<object>} The generated text content and usage.
 */
export async function generateAnthropicText({
  apiKey,
  modelId,
  messages,
  maxTokens,
  temperature,
  baseUrl
}) {
  log('debug', `Generating Anthropic text with model: ${modelId}`);
  try {
    const client = getClient(apiKey, baseUrl);
    
    const result = await client.messages.create({
      model: modelId,
      max_tokens: maxTokens || 4096,
      temperature: temperature || 0.7,
      messages: messages
    });

    log('debug', `Anthropic generateText result received. Tokens: ${result.usage.output_tokens}/${result.usage.input_tokens}`);
    
    return {
      text: result.content[0].text,
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens
      }
    };
  } catch (error) {
    log('error', `Anthropic generateText failed: ${error.message}`);
    throw error;
  }
}

/**
 * Streams text using an Anthropic model.
 *
 * @param {object} params - Parameters for the text streaming.
 * @param {string} params.apiKey - The Anthropic API key.
 * @param {string} params.modelId - The specific Anthropic model ID.
 * @param {Array<object>} params.messages - The messages array.
 * @param {number} [params.maxTokens] - Maximum tokens for the response.
 * @param {number} [params.temperature] - Temperature for generation.
 * @param {string} [params.baseUrl] - The base URL for the Anthropic API.
 * @returns {Promise<object>} The stream object.
 */
export async function streamAnthropicText({
  apiKey,
  modelId,
  messages,
  maxTokens,
  temperature,
  baseUrl
}) {
  log('debug', `Streaming Anthropic text with model: ${modelId}`);
  try {
    const client = getClient(apiKey, baseUrl);
    
    const stream = await client.messages.create({
      model: modelId,
      max_tokens: maxTokens || 4096,
      temperature: temperature || 0.7,
      messages: messages,
      stream: true
    });

    return stream;
  } catch (error) {
    log('error', `Anthropic streamText failed: ${error.message}`);
    throw error;
  }
}

/**
 * Generates a structured object using an Anthropic model.
 *
 * @param {object} params - Parameters for object generation.
 * @param {string} params.apiKey - The Anthropic API key.
 * @param {string} params.modelId - The specific Anthropic model ID.
 * @param {Array<object>} params.messages - The messages array.
 * @param {import('zod').ZodSchema} params.schema - The Zod schema for the object.
 * @param {string} params.objectName - A name for the object/tool.
 * @param {number} [params.maxTokens] - Maximum tokens for the response.
 * @param {number} [params.temperature] - Temperature for generation.
 * @param {string} [params.baseUrl] - The base URL for the Anthropic API.
 * @returns {Promise<object>} The generated object matching the schema and usage.
 */
export async function generateAnthropicObject({
  apiKey,
  modelId,
  messages,
  schema,
  objectName = 'generated_object',
  maxTokens,
  temperature,
  baseUrl
}) {
  log('debug', `Generating Anthropic object ('${objectName}') with model: ${modelId}`);
  try {
    const client = getClient(apiKey, baseUrl);
    
    // Convert Zod schema to JSON schema for Anthropic tools
    const jsonSchema = schema._def ? {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(schema._def.shape()).map(([key, value]) => [
          key,
          { type: 'string', description: `${key} field` }
        ])
      )
    } : schema;
    
    const result = await client.messages.create({
      model: modelId,
      max_tokens: maxTokens || 4096,
      temperature: temperature || 0.7,
      messages: messages,
      tools: [{
        name: objectName,
        description: `Generate a ${objectName} based on the prompt.`,
        input_schema: jsonSchema
      }],
      tool_choice: { type: 'tool', name: objectName }
    });

    log('debug', `Anthropic generateObject result received. Tokens: ${result.usage.output_tokens}/${result.usage.input_tokens}`);
    
    // Extract the tool use result
    const toolUse = result.content.find(content => content.type === 'tool_use');
    
    return {
      object: toolUse ? toolUse.input : {},
      usage: {
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens
      }
    };
  } catch (error) {
    log('error', `Anthropic generateObject ('${objectName}') failed: ${error.message}`);
    throw error;
  }
}
