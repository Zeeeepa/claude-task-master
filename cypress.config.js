import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'tests/e2e/support/index.js',
    specPattern: 'tests/e2e/**/*.cy.js',
    fixturesFolder: 'tests/fixtures',
    screenshotsFolder: 'tests/e2e/screenshots',
    videosFolder: 'tests/e2e/videos',
    downloadsFolder: 'tests/e2e/downloads',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    pageLoadTimeout: 30000,
    experimentalStudio: true,
    retries: {
      runMode: 2,
      openMode: 0
    },
    env: {
      coverage: true
    },
    setupNodeEvents(on, config) {
      // implement node event listeners here
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
        table(message) {
          console.table(message);
          return null;
        }
      });

      // Code coverage setup
      require('@cypress/code-coverage/task')(on, config);
      
      return config;
    },
  },

  component: {
    devServer: {
      framework: 'create-react-app',
      bundler: 'webpack',
    },
    specPattern: 'tests/e2e/components/**/*.cy.js',
    supportFile: 'tests/e2e/support/component.js'
  },
});

