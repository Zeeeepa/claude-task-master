/**
 * Setup the CLI application
 * @returns {Object} Configured Commander program
 */
function setupCLI() {
	// Create a new program instance
	const programInstance = program
		.name('dev')
		.description('AI-driven development task management')
		.helpOption('-h, --help', 'Display help')
		.addHelpCommand(false); // Disable default help command

	// Add version option with conflict check
	const addVersionOption = (command) => {
		if (!command.options.some(option => option.flags.includes('--version'))) {
			try {
				const packageJsonPath = path.join(process.cwd(), 'package.json');
				if (fs.existsSync(packageJsonPath)) {
					const packageJson = JSON.parse(
						fs.readFileSync(packageJsonPath, 'utf8')
					);
					command.version(packageJson.version, '-V, --version', 'output the current version');
				} else {
					command.version('unknown', '-V, --version', 'output the current version');
				}
			} catch (error) {
				// Silently fall back to 'unknown'
				log(
					'warn',
					'Could not read package.json for version info in .version()'
				);
				command.version('unknown', '-V, --version', 'output the current version');
			}
		}
	};

	// Apply version option
	addVersionOption(programInstance);

	// Modify the help option to use your custom display
	programInstance.helpInformation = () => {
		displayHelp();
		return '';
	};

	// Register commands
	registerCommands(programInstance);

	return programInstance;
}

