/**
 * Dashboard Workflow E2E Tests
 * 
 * End-to-end tests for dashboard functionality and user interactions
 */

describe('Dashboard Workflow E2E Tests', () => {
  beforeEach(() => {
    // Setup test environment
    cy.visit('/dashboard');
    cy.intercept('GET', '/api/workflows', { fixture: 'workflows.json' }).as('getWorkflows');
    cy.intercept('GET', '/api/tasks', { fixture: 'tasks.json' }).as('getTasks');
    cy.intercept('POST', '/api/workflows', { fixture: 'workflow-created.json' }).as('createWorkflow');
  });

  describe('Dashboard Navigation and Layout', () => {
    it('should display dashboard with all main sections', () => {
      // Verify main dashboard elements
      cy.get('[data-cy=dashboard-header]').should('be.visible');
      cy.get('[data-cy=workflow-overview]').should('be.visible');
      cy.get('[data-cy=active-tasks]').should('be.visible');
      cy.get('[data-cy=recent-activity]').should('be.visible');
      cy.get('[data-cy=system-metrics]').should('be.visible');
    });

    it('should navigate between dashboard sections', () => {
      // Test navigation
      cy.get('[data-cy=nav-workflows]').click();
      cy.url().should('include', '/workflows');
      
      cy.get('[data-cy=nav-tasks]').click();
      cy.url().should('include', '/tasks');
      
      cy.get('[data-cy=nav-dashboard]').click();
      cy.url().should('include', '/dashboard');
    });

    it('should be responsive on different screen sizes', () => {
      // Test mobile view
      cy.viewport('iphone-6');
      cy.get('[data-cy=mobile-menu-toggle]').should('be.visible');
      cy.get('[data-cy=sidebar]').should('not.be.visible');
      
      // Test tablet view
      cy.viewport('ipad-2');
      cy.get('[data-cy=sidebar]').should('be.visible');
      
      // Test desktop view
      cy.viewport(1920, 1080);
      cy.get('[data-cy=sidebar]').should('be.visible');
      cy.get('[data-cy=main-content]').should('have.css', 'margin-left').and('not.equal', '0px');
    });
  });

  describe('Workflow Creation and Management', () => {
    it('should create a new workflow through the UI', () => {
      // Click create workflow button
      cy.get('[data-cy=create-workflow-btn]').click();
      
      // Fill out workflow form
      cy.get('[data-cy=workflow-title]').type('Test Authentication System');
      cy.get('[data-cy=github-repo-url]').type('https://github.com/test/auth-system');
      cy.get('[data-cy=requirements-textarea]').type(
        'Implement JWT-based authentication with login, logout, and password reset functionality'
      );
      cy.get('[data-cy=priority-select]').select('high');
      
      // Submit form
      cy.get('[data-cy=create-workflow-submit]').click();
      
      // Verify workflow creation
      cy.wait('@createWorkflow');
      cy.get('[data-cy=success-notification]').should('be.visible');
      cy.get('[data-cy=success-notification]').should('contain', 'Workflow created successfully');
      
      // Verify redirect to workflow detail page
      cy.url().should('include', '/workflows/');
      cy.get('[data-cy=workflow-title]').should('contain', 'Test Authentication System');
    });

    it('should validate form inputs', () => {
      cy.get('[data-cy=create-workflow-btn]').click();
      
      // Try to submit empty form
      cy.get('[data-cy=create-workflow-submit]').click();
      
      // Verify validation errors
      cy.get('[data-cy=title-error]').should('be.visible');
      cy.get('[data-cy=repo-url-error]').should('be.visible');
      cy.get('[data-cy=requirements-error]').should('be.visible');
      
      // Test invalid GitHub URL
      cy.get('[data-cy=github-repo-url]').type('invalid-url');
      cy.get('[data-cy=create-workflow-submit]').click();
      cy.get('[data-cy=repo-url-error]').should('contain', 'Invalid GitHub repository URL');
    });

    it('should display workflow list with filtering and sorting', () => {
      cy.wait('@getWorkflows');
      
      // Verify workflow list is displayed
      cy.get('[data-cy=workflow-list]').should('be.visible');
      cy.get('[data-cy=workflow-item]').should('have.length.greaterThan', 0);
      
      // Test status filter
      cy.get('[data-cy=status-filter]').select('active');
      cy.get('[data-cy=workflow-item]').each(($el) => {
        cy.wrap($el).find('[data-cy=workflow-status]').should('contain', 'active');
      });
      
      // Test priority filter
      cy.get('[data-cy=priority-filter]').select('high');
      cy.get('[data-cy=workflow-item]').each(($el) => {
        cy.wrap($el).find('[data-cy=workflow-priority]').should('contain', 'high');
      });
      
      // Test sorting
      cy.get('[data-cy=sort-select]').select('created-desc');
      cy.get('[data-cy=workflow-item]').first().should('contain', 'Most Recent');
    });

    it('should show workflow details and progress', () => {
      cy.wait('@getWorkflows');
      
      // Click on first workflow
      cy.get('[data-cy=workflow-item]').first().click();
      
      // Verify workflow details page
      cy.get('[data-cy=workflow-details]').should('be.visible');
      cy.get('[data-cy=workflow-progress-bar]').should('be.visible');
      cy.get('[data-cy=workflow-steps]').should('be.visible');
      cy.get('[data-cy=workflow-tasks]').should('be.visible');
      
      // Verify progress indicators
      cy.get('[data-cy=progress-percentage]').should('be.visible');
      cy.get('[data-cy=estimated-completion]').should('be.visible');
      
      // Test step expansion
      cy.get('[data-cy=step-item]').first().click();
      cy.get('[data-cy=step-details]').should('be.visible');
      cy.get('[data-cy=step-logs]').should('be.visible');
    });
  });

  describe('Real-time Updates and Monitoring', () => {
    it('should display real-time workflow progress updates', () => {
      // Setup WebSocket mock
      cy.window().then((win) => {
        win.mockWebSocket = {
          send: cy.stub(),
          close: cy.stub()
        };
      });
      
      cy.visit('/workflows/test-workflow-123');
      
      // Simulate progress update
      cy.window().then((win) => {
        win.dispatchEvent(new CustomEvent('workflow-progress', {
          detail: {
            workflowId: 'test-workflow-123',
            progress: 75,
            currentStep: 'code_generation',
            estimatedCompletion: new Date(Date.now() + 1800000).toISOString()
          }
        }));
      });
      
      // Verify UI updates
      cy.get('[data-cy=progress-bar]').should('have.attr', 'aria-valuenow', '75');
      cy.get('[data-cy=current-step]').should('contain', 'Code Generation');
      cy.get('[data-cy=estimated-completion]').should('be.visible');
    });

    it('should show live task status updates', () => {
      cy.visit('/workflows/test-workflow-123');
      
      // Simulate task completion
      cy.window().then((win) => {
        win.dispatchEvent(new CustomEvent('task-completed', {
          detail: {
            taskId: 'task-456',
            workflowId: 'test-workflow-123',
            status: 'completed',
            completedAt: new Date().toISOString()
          }
        }));
      });
      
      // Verify task status update
      cy.get('[data-cy=task-456]').should('have.class', 'completed');
      cy.get('[data-cy=task-456] [data-cy=task-status]').should('contain', 'Completed');
      cy.get('[data-cy=task-456] [data-cy=completion-time]').should('be.visible');
    });

    it('should display system metrics and performance data', () => {
      cy.visit('/dashboard');
      
      // Verify metrics dashboard
      cy.get('[data-cy=system-metrics]').should('be.visible');
      cy.get('[data-cy=cpu-usage]').should('be.visible');
      cy.get('[data-cy=memory-usage]').should('be.visible');
      cy.get('[data-cy=active-workflows]').should('be.visible');
      cy.get('[data-cy=success-rate]').should('be.visible');
      
      // Test metrics refresh
      cy.get('[data-cy=refresh-metrics]').click();
      cy.get('[data-cy=metrics-loading]').should('be.visible');
      cy.get('[data-cy=metrics-loading]').should('not.exist');
      
      // Verify charts are rendered
      cy.get('[data-cy=performance-chart]').should('be.visible');
      cy.get('[data-cy=workflow-trends-chart]').should('be.visible');
    });
  });

  describe('Error Handling and User Feedback', () => {
    it('should handle workflow creation errors gracefully', () => {
      // Mock API error
      cy.intercept('POST', '/api/workflows', {
        statusCode: 400,
        body: { error: 'Invalid repository URL' }
      }).as('createWorkflowError');
      
      cy.get('[data-cy=create-workflow-btn]').click();
      cy.get('[data-cy=workflow-title]').type('Test Workflow');
      cy.get('[data-cy=github-repo-url]').type('https://github.com/invalid/repo');
      cy.get('[data-cy=requirements-textarea]').type('Test requirements');
      cy.get('[data-cy=create-workflow-submit]').click();
      
      cy.wait('@createWorkflowError');
      
      // Verify error handling
      cy.get('[data-cy=error-notification]').should('be.visible');
      cy.get('[data-cy=error-notification]').should('contain', 'Invalid repository URL');
      cy.get('[data-cy=create-workflow-submit]').should('not.be.disabled');
    });

    it('should handle network connectivity issues', () => {
      // Simulate network failure
      cy.intercept('GET', '/api/workflows', { forceNetworkError: true }).as('networkError');
      
      cy.visit('/workflows');
      cy.wait('@networkError');
      
      // Verify offline state
      cy.get('[data-cy=offline-indicator]').should('be.visible');
      cy.get('[data-cy=retry-connection]').should('be.visible');
      
      // Test retry functionality
      cy.intercept('GET', '/api/workflows', { fixture: 'workflows.json' }).as('retrySuccess');
      cy.get('[data-cy=retry-connection]').click();
      cy.wait('@retrySuccess');
      
      cy.get('[data-cy=offline-indicator]').should('not.exist');
      cy.get('[data-cy=workflow-list]').should('be.visible');
    });

    it('should provide helpful loading states', () => {
      // Mock slow API response
      cy.intercept('GET', '/api/workflows', (req) => {
        req.reply((res) => {
          res.delay(2000);
          res.send({ fixture: 'workflows.json' });
        });
      }).as('slowWorkflows');
      
      cy.visit('/workflows');
      
      // Verify loading state
      cy.get('[data-cy=workflows-loading]').should('be.visible');
      cy.get('[data-cy=loading-skeleton]').should('be.visible');
      
      cy.wait('@slowWorkflows');
      
      // Verify loading state disappears
      cy.get('[data-cy=workflows-loading]').should('not.exist');
      cy.get('[data-cy=workflow-list]').should('be.visible');
    });
  });

  describe('User Interactions and Workflow Control', () => {
    it('should allow users to pause and resume workflows', () => {
      cy.intercept('POST', '/api/workflows/*/pause', { success: true }).as('pauseWorkflow');
      cy.intercept('POST', '/api/workflows/*/resume', { success: true }).as('resumeWorkflow');
      
      cy.visit('/workflows/active-workflow-123');
      
      // Pause workflow
      cy.get('[data-cy=pause-workflow-btn]').click();
      cy.get('[data-cy=confirm-pause]').click();
      cy.wait('@pauseWorkflow');
      
      // Verify paused state
      cy.get('[data-cy=workflow-status]').should('contain', 'Paused');
      cy.get('[data-cy=resume-workflow-btn]').should('be.visible');
      cy.get('[data-cy=pause-workflow-btn]').should('not.exist');
      
      // Resume workflow
      cy.get('[data-cy=resume-workflow-btn]').click();
      cy.wait('@resumeWorkflow');
      
      // Verify resumed state
      cy.get('[data-cy=workflow-status]').should('contain', 'Active');
      cy.get('[data-cy=pause-workflow-btn]').should('be.visible');
    });

    it('should allow users to stop workflows with confirmation', () => {
      cy.intercept('POST', '/api/workflows/*/stop', { success: true }).as('stopWorkflow');
      
      cy.visit('/workflows/active-workflow-123');
      
      // Attempt to stop workflow
      cy.get('[data-cy=stop-workflow-btn]').click();
      
      // Verify confirmation dialog
      cy.get('[data-cy=stop-confirmation-dialog]').should('be.visible');
      cy.get('[data-cy=stop-warning]').should('contain', 'This action cannot be undone');
      
      // Cancel first
      cy.get('[data-cy=cancel-stop]').click();
      cy.get('[data-cy=stop-confirmation-dialog]').should('not.exist');
      
      // Confirm stop
      cy.get('[data-cy=stop-workflow-btn]').click();
      cy.get('[data-cy=confirm-stop]').click();
      cy.wait('@stopWorkflow');
      
      // Verify stopped state
      cy.get('[data-cy=workflow-status]').should('contain', 'Stopped');
      cy.get('[data-cy=workflow-controls]').should('not.exist');
    });

    it('should provide workflow restart functionality', () => {
      cy.intercept('POST', '/api/workflows/*/restart', { 
        workflowId: 'restarted-workflow-456',
        success: true 
      }).as('restartWorkflow');
      
      cy.visit('/workflows/failed-workflow-123');
      
      // Restart failed workflow
      cy.get('[data-cy=restart-workflow-btn]').click();
      cy.get('[data-cy=restart-options]').should('be.visible');
      
      // Select restart options
      cy.get('[data-cy=restart-from-beginning]').check();
      cy.get('[data-cy=clear-previous-data]').check();
      cy.get('[data-cy=confirm-restart]').click();
      
      cy.wait('@restartWorkflow');
      
      // Verify redirect to new workflow
      cy.url().should('include', '/workflows/restarted-workflow-456');
      cy.get('[data-cy=workflow-status]').should('contain', 'Active');
      cy.get('[data-cy=restart-notification]').should('be.visible');
    });
  });

  describe('Cross-browser Compatibility', () => {
    it('should work correctly in Chrome', () => {
      // Chrome-specific tests
      cy.visit('/dashboard');
      cy.get('[data-cy=dashboard-header]').should('be.visible');
      
      // Test modern JavaScript features
      cy.window().then((win) => {
        expect(win.fetch).to.exist;
        expect(win.Promise).to.exist;
        expect(win.WebSocket).to.exist;
      });
    });

    it('should work correctly in Firefox', () => {
      // Firefox-specific tests would go here
      // Note: Cypress runs in Chrome by default, but we can test for compatibility
      cy.visit('/dashboard');
      cy.get('[data-cy=dashboard-header]').should('be.visible');
    });

    it('should handle different viewport sizes', () => {
      const viewports = [
        { width: 320, height: 568 },   // iPhone SE
        { width: 768, height: 1024 },  // iPad
        { width: 1024, height: 768 },  // iPad Landscape
        { width: 1920, height: 1080 }  // Desktop
      ];

      viewports.forEach(({ width, height }) => {
        cy.viewport(width, height);
        cy.visit('/dashboard');
        
        // Verify responsive layout
        cy.get('[data-cy=dashboard-header]').should('be.visible');
        cy.get('[data-cy=main-content]').should('be.visible');
        
        if (width < 768) {
          cy.get('[data-cy=mobile-menu-toggle]').should('be.visible');
        } else {
          cy.get('[data-cy=sidebar]').should('be.visible');
        }
      });
    });
  });

  describe('Performance and Accessibility', () => {
    it('should meet performance benchmarks', () => {
      cy.visit('/dashboard');
      
      // Measure page load time
      cy.window().then((win) => {
        const loadTime = win.performance.timing.loadEventEnd - win.performance.timing.navigationStart;
        expect(loadTime).to.be.lessThan(3000); // Less than 3 seconds
      });
      
      // Check for performance issues
      cy.get('[data-cy=workflow-list]').should('be.visible');
      cy.get('[data-cy=workflow-item]').should('have.length.greaterThan', 0);
    });

    it('should be accessible to screen readers', () => {
      cy.visit('/dashboard');
      
      // Check for proper ARIA labels
      cy.get('[data-cy=main-navigation]').should('have.attr', 'role', 'navigation');
      cy.get('[data-cy=workflow-list]').should('have.attr', 'role', 'list');
      cy.get('[data-cy=workflow-item]').should('have.attr', 'role', 'listitem');
      
      // Check for proper heading structure
      cy.get('h1').should('exist');
      cy.get('h2').should('exist');
      
      // Check for alt text on images
      cy.get('img').each(($img) => {
        cy.wrap($img).should('have.attr', 'alt');
      });
    });

    it('should support keyboard navigation', () => {
      cy.visit('/dashboard');
      
      // Test tab navigation
      cy.get('body').tab();
      cy.focused().should('have.attr', 'data-cy', 'skip-to-content');
      
      cy.tab();
      cy.focused().should('have.attr', 'data-cy', 'main-navigation');
      
      // Test workflow creation with keyboard
      cy.get('[data-cy=create-workflow-btn]').focus().type('{enter}');
      cy.get('[data-cy=workflow-form]').should('be.visible');
      
      // Navigate form with keyboard
      cy.get('[data-cy=workflow-title]').focus().type('Keyboard Test Workflow');
      cy.tab();
      cy.focused().should('have.attr', 'data-cy', 'github-repo-url');
    });
  });
});

