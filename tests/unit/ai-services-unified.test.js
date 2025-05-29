import { jest } from '@jest/globals';

// Mock config-manager
const mockGetMainProvider = jest.fn();
const mockGetMainModelId = jest.fn();
const mockGetResearchProvider = jest.fn();
const mockGetResearchModelId = jest.fn();
const mockGetFallbackProvider = jest.fn();
const mockGetFallbackModelId = jest.fn();
const mockGetParametersForRole = jest.fn();
const mockGetUserId = jest.fn();
const mockGetDebugFlag = jest.fn();
const mockIsApiKeySet = jest.fn();

// --- Mock MODEL_MAP Data ---
// Provide a simplified structure sufficient for cost calculation tests
const mockModelMap = {
	anthropic: [
		{
			id: 'test-main-model',
			cost_per_1m_tokens: { input: 3, output: 15, currency: 'USD' }
		},
		{
			id: 'test-fallback-model',
			cost_per_1m_tokens: { input: 3, output: 15, currency: 'USD' }
		}
	],
	openai: [
		{
			id: 'test-openai-model',
			cost_per_1m_tokens: { input: 2, output: 6, currency: 'USD' }
		}
	]
	// Add other providers/models if needed for specific tests
};
const mockGetBaseUrlForRole = jest.fn();

jest.unstable_mockModule('../../scripts/modules/config-manager.js', () => ({
	getMainProvider: mockGetMainProvider,
	getMainModelId: mockGetMainModelId,
	getResearchProvider: mockGetResearchProvider,
	getResearchModelId: mockGetResearchModelId,
	getFallbackProvider: mockGetFallbackProvider,
	getFallbackModelId: mockGetFallbackModelId,
	getParametersForRole: mockGetParametersForRole,
	getUserId: mockGetUserId,
	getDebugFlag: mockGetDebugFlag,
	MODEL_MAP: mockModelMap,
	getBaseUrlForRole: mockGetBaseUrlForRole,
	isApiKeySet: mockIsApiKeySet
}));

// Mock AI Provider Modules
const mockGenerateAnthropicText = jest.fn();
const mockStreamAnthropicText = jest.fn();
const mockGenerateAnthropicObject = jest.fn();

const mockGenerateOpenAIText = jest.fn();
const mockStreamOpenAIText = jest.fn();
const mockGenerateOpenAIObject = jest.fn();

jest.unstable_mockModule('../../src/ai-providers/anthropic.js', () => ({
	generateAnthropicText: mockGenerateAnthropicText,
	streamAnthropicText: mockStreamAnthropicText,
	generateAnthropicObject: mockGenerateAnthropicObject
}));

jest.unstable_mockModule('../../src/ai-providers/openai.js', () => ({
	generateOpenAIText: mockGenerateOpenAIText,
	streamOpenAIText: mockStreamOpenAIText,
	generateOpenAIObject: mockGenerateOpenAIObject
}));

// Mock utils logger, API key resolver, AND findProjectRoot
const mockLog = jest.fn();
const mockResolveEnvVariable = jest.fn();
const mockFindProjectRoot = jest.fn();
const mockIsSilentMode = jest.fn();
const mockLogAiUsage = jest.fn();

jest.unstable_mockModule('../../scripts/modules/utils.js', () => ({
	log: mockLog,
	resolveEnvVariable: mockResolveEnvVariable,
	findProjectRoot: mockFindProjectRoot,
	isSilentMode: mockIsSilentMode,
	logAiUsage: mockLogAiUsage
}));

// Import the module to test (AFTER mocks)
const { generateTextService } = await import(
	'../../scripts/modules/ai-services-unified.js'
);

describe('Unified AI Services', () => {
	const fakeProjectRoot = '/fake/project/root'; // Define for reuse

	beforeEach(() => {
		// Clear mocks before each test
		jest.clearAllMocks(); // Clears all mocks

		// Set default mock behaviors
		// Mock default config values
		mockGetMainProvider.mockReturnValue('anthropic');
		mockGetMainModelId.mockReturnValue('test-main-model');
		mockGetResearchProvider.mockReturnValue('openai');
		mockGetResearchModelId.mockReturnValue('test-research-model');
		mockGetFallbackProvider.mockReturnValue('openai');
		mockGetFallbackModelId.mockReturnValue('test-fallback-model');
		mockGetParametersForRole.mockImplementation((role) => {
			if (role === 'main') return { maxTokens: 100, temperature: 0.5 };
			if (role === 'research') return { maxTokens: 200, temperature: 0.3 };
			if (role === 'fallback') return { maxTokens: 150, temperature: 0.7 };
			return {};
		});
		mockResolveEnvVariable.mockImplementation((key) => {
			if (key === 'ANTHROPIC_API_KEY') return 'mock-anthropic-key';
			if (key === 'OPENAI_API_KEY') return 'mock-openai-key';
			return null;
		});

		// Set a default behavior for the new mock
		mockFindProjectRoot.mockReturnValue(fakeProjectRoot);
		mockGetDebugFlag.mockReturnValue(false);
		mockGetUserId.mockReturnValue('test-user-id'); // Add default mock for getUserId
		mockIsApiKeySet.mockReturnValue(true); // Default to true for most tests
	});

	describe('generateTextService', () => {
		test('should use main provider/model and succeed', async () => {
			mockGenerateAnthropicText.mockResolvedValue({
				text: 'Main provider response',
				usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
			});

			const params = {
				role: 'main',
				session: { env: {} },
				systemPrompt: 'System',
				prompt: 'Test'
			};
			const result = await generateTextService(params);

			expect(result.mainResult).toBe('Main provider response');
			expect(result).toHaveProperty('telemetryData');
			expect(mockGetMainProvider).toHaveBeenCalledWith(fakeProjectRoot);
			expect(mockGetMainModelId).toHaveBeenCalledWith(fakeProjectRoot);
			expect(mockGetParametersForRole).toHaveBeenCalledWith(
				'main',
				fakeProjectRoot
			);
			expect(mockResolveEnvVariable).toHaveBeenCalledWith(
				'ANTHROPIC_API_KEY',
				params.session,
				fakeProjectRoot
			);
			expect(mockGenerateAnthropicText).toHaveBeenCalledTimes(1);
			expect(mockGenerateAnthropicText).toHaveBeenCalledWith({
				apiKey: 'mock-anthropic-key',
				modelId: 'test-main-model',
				maxTokens: 100,
				temperature: 0.5,
				messages: [
					{ role: 'system', content: 'System' },
					{ role: 'user', content: 'Test' }
				]
			});
			expect(mockGenerateOpenAIText).not.toHaveBeenCalled();
		});

		test('should fall back to fallback provider if main fails', async () => {
			const mainError = new Error('Main provider failed');
			mockGenerateAnthropicText.mockRejectedValueOnce(mainError);
			
			// Mock fallback provider (openai) to succeed
			mockGenerateOpenAIText.mockResolvedValueOnce({
				text: 'Fallback provider response',
				usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 }
			});

			const params = {
				role: 'main',
				prompt: 'Test fallback',
				session: { env: {} }
			};

			const result = await generateTextService(params);

			expect(result.mainResult).toBe('Fallback provider response');
			expect(mockGenerateAnthropicText).toHaveBeenCalledTimes(1);
			expect(mockGenerateOpenAIText).toHaveBeenCalledTimes(1);
		});

		test('should fall back to research provider if main and fallback fail', async () => {
			const mainError = new Error('Main provider failed');
			const fallbackError = new Error('Fallback provider failed');
			
			mockGenerateAnthropicText.mockRejectedValueOnce(mainError);
			mockGenerateOpenAIText
				.mockRejectedValueOnce(fallbackError) // fallback fails
				.mockResolvedValueOnce({              // research succeeds
					text: 'Research provider response',
					usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 }
				});

			const params = {
				role: 'main',
				prompt: 'Test research fallback',
				session: { env: {} }
			};

			const result = await generateTextService(params);

			expect(result.mainResult).toBe('Research provider response');
			expect(mockGenerateAnthropicText).toHaveBeenCalledTimes(1);
			expect(mockGenerateOpenAIText).toHaveBeenCalledTimes(2); // fallback + research
		});

		test('should throw error if all providers in sequence fail', async () => {
			const mainError = new Error('Main failed');
			const fallbackError = new Error('Fallback failed');
			const researchError = new Error('Research failed');
			
			mockGenerateAnthropicText.mockRejectedValue(mainError);
			mockGenerateOpenAIText
				.mockRejectedValueOnce(fallbackError)  // fallback fails
				.mockRejectedValueOnce(researchError); // research fails

			const params = {
				role: 'main',
				prompt: 'All providers fail test',
				session: { env: {} }
			};

			await expect(generateTextService(params)).rejects.toThrow(
				'Research failed'
			);

			expect(mockGenerateAnthropicText).toHaveBeenCalledTimes(1);
			expect(mockGenerateOpenAIText).toHaveBeenCalledTimes(2); // fallback + research
		});

		test('should handle retryable errors correctly', async () => {
			const retryableError = new Error('Rate limit');
			mockGenerateAnthropicText
				.mockRejectedValueOnce(retryableError) // Fails once
				.mockResolvedValueOnce({
					// Succeeds on retry
					text: 'Success after retry',
					usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 }
				});

			const params = { 
				role: 'main', 
				prompt: 'Retry success test',
				session: { env: {} }
			};
			const result = await generateTextService(params);

			expect(result.mainResult).toBe('Success after retry');
			expect(result).toHaveProperty('telemetryData');
			expect(mockGenerateAnthropicText).toHaveBeenCalledTimes(2); // Initial + 1 retry
		});

		test('should use default project root or handle null if findProjectRoot returns null', async () => {
			mockFindProjectRoot.mockReturnValue(null); // Simulate not finding root
			mockGenerateAnthropicText.mockResolvedValue({
				text: 'Response with no root',
				usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
			});

			const params = { 
				role: 'main', 
				prompt: 'No root test',
				session: { env: {} }
			}; // No explicit root passed
			await generateTextService(params);

			expect(mockGetMainProvider).toHaveBeenCalledWith(null);
			expect(mockGetParametersForRole).toHaveBeenCalledWith('main', null);
			expect(mockResolveEnvVariable).toHaveBeenCalledWith(
				'ANTHROPIC_API_KEY',
				{ env: {} },
				null
			);
			expect(mockGenerateAnthropicText).toHaveBeenCalledTimes(1);
		});

		// New tests for API key checking and fallback sequence
		// These tests verify that:
		// 1. The system checks if API keys are set before trying to use a provider
		// 2. If a provider's API key is missing, it skips to the next provider in the fallback sequence
		// 3. The system throws an appropriate error if all providers' API keys are missing
		// 4. Ollama is a special case where API key is optional and not checked
		// 5. Session context is correctly used for API key checks

		test('should skip provider with missing API key and try next in fallback sequence', async () => {
			// Setup isApiKeySet to return false for anthropic but true for perplexity
			mockIsApiKeySet.mockImplementation((provider, session, root) => {
				if (provider === 'anthropic') return false; // Main provider has no key
				return true; // Other providers have keys
			});

			// Mock openai text response (since we'll skip anthropic)
			mockGenerateOpenAIText.mockResolvedValue({
				text: 'Perplexity response (skipped to research)',
				usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 }
			});

			const params = {
				role: 'main',
				prompt: 'Skip main provider test',
				session: { env: {} }
			};

			const result = await generateTextService(params);

			// Should have gotten the openai response
			expect(result.mainResult).toBe(
				'Perplexity response (skipped to research)'
			);

			// Should check API keys
			expect(mockIsApiKeySet).toHaveBeenCalledWith(
				'anthropic',
				params.session,
				fakeProjectRoot
			);
			expect(mockIsApiKeySet).toHaveBeenCalledWith(
				'openai',
				params.session,
				fakeProjectRoot
			);

			// Should log a warning
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					`Skipping role 'main' (Provider: anthropic): API key not set or invalid.`
				)
			);

			// Should NOT call anthropic provider
			expect(mockGenerateAnthropicText).not.toHaveBeenCalled();

			// Should call openai provider
			expect(mockGenerateOpenAIText).toHaveBeenCalledTimes(1);
		});

		test('should skip multiple providers with missing API keys and use first available', async () => {
			// Setup: Main and fallback providers have no keys, only research has a key
			mockIsApiKeySet.mockImplementation((provider, session, root) => {
				if (provider === 'anthropic') return false; // Main provider has no key
				if (provider === 'openai') return true; // Research and fallback have keys
				return false;
			});

			// Mock openai text response (since we'll skip anthropic and use research)
			mockGenerateOpenAIText.mockResolvedValue({
				text: 'Research response after skipping main',
				usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 }
			});

			const params = {
				role: 'main',
				prompt: 'Test prompt for multiple skips',
				session: { env: {} }
			};

			const result = await generateTextService(params);

			// Should have gotten the research response
			expect(result.mainResult).toBe('Research response after skipping main');

			// Should check API keys for main and research
			expect(mockIsApiKeySet).toHaveBeenCalledWith(
				'anthropic',
				params.session,
				fakeProjectRoot
			);
			expect(mockIsApiKeySet).toHaveBeenCalledWith(
				'openai',
				params.session,
				fakeProjectRoot
			);

			// Should log warning for skipped main provider
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					`Skipping role 'main' (Provider: anthropic): API key not set or invalid.`
				)
			);

			// Should NOT call anthropic provider
			expect(mockGenerateAnthropicText).not.toHaveBeenCalled();

			// Should call openai provider for research
			expect(mockGenerateOpenAIText).toHaveBeenCalledTimes(1);
		});

		test('should throw error if all providers in sequence have missing API keys', async () => {
			// Mock all providers to have missing API keys
			mockIsApiKeySet.mockReturnValue(false);

			const params = {
				role: 'main',
				prompt: 'All API keys missing test',
				session: { env: {} }
			};

			// Should throw error since all providers would be skipped
			await expect(generateTextService(params)).rejects.toThrow(
				'AI service call failed for all configured roles'
			);

			// Should log warnings for all skipped providers
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					`Skipping role 'main' (Provider: anthropic): API key not set or invalid.`
				)
			);
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					`Skipping role 'fallback' (Provider: openai): API key not set or invalid.`
				)
			);
			expect(mockLog).toHaveBeenCalledWith(
				'warn',
				expect.stringContaining(
					`Skipping role 'research' (Provider: openai): API key not set or invalid.`
				)
			);

			// Should log final error
			expect(mockLog).toHaveBeenCalledWith(
				'error',
				expect.stringContaining(
					'All roles in the sequence [main, fallback, research] failed.'
				)
			);

			// Should NOT call any providers
			expect(mockGenerateAnthropicText).not.toHaveBeenCalled();
			expect(mockGenerateOpenAIText).not.toHaveBeenCalled();
		});


		test('should correctly use the provided session for API key check', async () => {
			// Mock custom session object with env vars
			const customSession = { env: { ANTHROPIC_API_KEY: 'session-api-key' } };

			// Setup API key check to verify the session is passed correctly
			mockIsApiKeySet.mockImplementation((provider, session, root) => {
				// Only return true if the correct session was provided
				return session === customSession;
			});

			// Mock the anthropic response
			mockGenerateAnthropicText.mockResolvedValue({
				text: 'Anthropic response with session key',
				usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 }
			});

			const params = {
				role: 'main',
				prompt: 'Session API key test',
				session: customSession
			};

			const result = await generateTextService(params);

			// Should check API key with the custom session
			expect(mockIsApiKeySet).toHaveBeenCalledWith(
				'anthropic',
				customSession,
				fakeProjectRoot
			);

			// Should have gotten the anthropic response
			expect(result.mainResult).toBe('Anthropic response with session key');
		});
	});
});
