/**
 * JavaScript code for the webview panel
 */

import { SubmoduleInfo } from '../types';

export function getScripts(submodules: SubmoduleInfo[]): string {
  return `
    const vscode = acquireVsCodeApi();

    // Restore state from previous session
    const previousState = vscode.getState() || {};
    let selectedSubmodules = new Set(previousState.selectedSubmodules || []);
    let rebasingSubmodules = new Set(previousState.rebasingSubmodules || []);
    let submoduleData = previousState.submoduleData || ${JSON.stringify(submodules)};

    // Save state helper
    function saveState() {
      vscode.setState({
        selectedSubmodules: Array.from(selectedSubmodules),
        rebasingSubmodules: Array.from(rebasingSubmodules),
        submoduleData
      });
    }

    function postMessage(type, payload) {
      vscode.postMessage({ type, payload });
    }

    // Action handlers
    const actions = {
      refresh: () => postMessage('refresh'),
      initAll: () => postMessage('initSubmodules'),
      updateAll: () => postMessage('updateSubmodules'),

      selectAll: () => {
        document.querySelectorAll('.submodule-card').forEach(row => {
          selectedSubmodules.add(row.dataset.path);
          const cb = row.querySelector('.row-checkbox');
          if (cb) cb.checked = true;
          row.classList.add('selected');
        });
        saveState();
        updateSelectionUI();
      },

      deselectAll: () => {
        selectedSubmodules.clear();
        document.querySelectorAll('.submodule-card').forEach(row => {
          const cb = row.querySelector('.row-checkbox');
          if (cb) cb.checked = false;
          row.classList.remove('selected');
        });
        saveState();
        updateSelectionUI();
      },

      toggleSelection: (el) => {
        const path = el.dataset.submodule;
        if (!path) return;

        // Toggle selection state
        if (selectedSubmodules.has(path)) {
          selectedSubmodules.delete(path);
        } else {
          selectedSubmodules.add(path);
        }

        // Update checkbox state directly
        const checkbox = el.tagName === 'INPUT' ? el : el.querySelector('.row-checkbox');
        if (checkbox) {
          checkbox.checked = selectedSubmodules.has(path);
        }

        // Update the row's selected class
        const row = el.closest('.submodule-card');
        if (row) {
          row.classList.toggle('selected', selectedSubmodules.has(path));
        }

        saveState();
        updateSelectionUI();
      },

      openCreateBranchModal: () => {
        // Reset form fields
        document.getElementById('ticketId').value = '';
        document.getElementById('taskTitle').value = '';
        document.getElementById('productName').value = '';
        document.getElementById('releaseVersion').value = '';
        document.getElementById('devBranchName').value = '';
        document.getElementById('baseBranch').innerHTML = '<option value="">Loading branches...</option>';
        // Request branches from first submodule (or main repo)
        postMessage('getBaseBranchesForCreate', {});
        document.getElementById('createBranchModal').classList.add('active');
      },

      closeModal: (el) => {
        const modalId = el.dataset.modal;
        document.getElementById(modalId).classList.remove('active');
      },

      createBranch: () => {
        const branchName = document.getElementById('branchName').value.trim();
        const baseBranch = document.getElementById('baseBranch').value.trim() || 'main';

        // Validate branch name
        if (!branchName ||
            branchName.includes('your-branch-name') ||
            branchName.endsWith('-') ||
            branchName.endsWith('_') ||
            branchName.includes('x.x.x')) {
          alert('Please fill in all required fields to generate a valid branch name.');
          return;
        }

        const checkboxes = document.querySelectorAll('.branch-submodule:checked');
        const submodules = Array.from(checkboxes).map(cb => cb.value);
        if (submodules.length === 0) {
          alert('Please select at least one submodule.');
          return;
        }

        // Store pending info for review
        pendingBranchInfo = { submodules, branchName, baseBranch };
        postMessage('createBranchWithReview', { submodules, branchName, baseBranch });
        document.getElementById('createBranchModal').classList.remove('active');
      },

      createBranchForSelected: () => {
        if (selectedSubmodules.size === 0) return;
        // Reset form fields
        document.getElementById('ticketId').value = '';
        document.getElementById('taskTitle').value = '';
        document.getElementById('productName').value = '';
        document.getElementById('releaseVersion').value = '';
        document.getElementById('devBranchName').value = '';
        document.getElementById('baseBranch').innerHTML = '<option value="">Loading branches...</option>';
        // Request branches
        postMessage('getBaseBranchesForCreate', {});
        // Set selected submodules
        document.querySelectorAll('.branch-submodule').forEach(cb => {
          cb.checked = selectedSubmodules.has(cb.value);
        });
        document.getElementById('createBranchModal').classList.add('active');
      },

      confirmAndPush: () => {
        if (!pendingBranchInfo) return;
        const shouldPush = document.getElementById('pushAfterCreate').checked;
        if (shouldPush) {
          postMessage('pushCreatedBranches', {
            submodules: pendingBranchInfo.submodules,
            branchName: pendingBranchInfo.branchName
          });
        }
        pendingBranchInfo = null;
        document.getElementById('reviewBranchModal').classList.remove('active');
      },

      openCheckoutModal: (el) => {
        const submodule = el.dataset.submodule;
        document.getElementById('checkoutSubmodule').value = submodule;
        document.getElementById('branchSelect').innerHTML = '<option value="">Loading branches...</option>';
        document.getElementById('checkoutModal').classList.add('active');
        postMessage('getBranches', { submodule });
      },

      checkoutBranch: () => {
        const submodule = document.getElementById('checkoutSubmodule').value;
        const branch = document.getElementById('branchSelect').value;
        if (!branch) return;
        postMessage('checkoutBranch', { submodule, branch });
        document.getElementById('checkoutModal').classList.remove('active');
      },

      openCommitModal: (el) => {
        const submodule = el.dataset.submodule;
        document.getElementById('commitSubmodule').value = submodule;
        document.getElementById('commitSelect').innerHTML = '<option value="">Loading commits...</option>';
        document.getElementById('commitInput').value = '';
        document.getElementById('commitModal').classList.add('active');
        postMessage('getCommits', { submodule });
        postMessage('getRecordedCommit', { submodule });
      },

      checkoutCommit: () => {
        const submodule = document.getElementById('commitSubmodule').value;
        const commitInput = document.getElementById('commitInput').value.trim();
        const commitSelect = document.getElementById('commitSelect').value;
        const commit = commitInput || commitSelect;
        if (!commit) return;
        postMessage('checkoutCommit', { submodule, commit });
        document.getElementById('commitModal').classList.remove('active');
      },

      useRecorded: () => {
        const submodule = document.getElementById('commitSubmodule').value;
        postMessage('updateToRecorded', { submodule });
        document.getElementById('commitModal').classList.remove('active');
      },

      toggleRebaseStatus: (el) => {
        const submodule = el.dataset.submodule;
        const isCurrentlyRebasing = rebasingSubmodules.has(submodule);
        if (isCurrentlyRebasing) {
          rebasingSubmodules.delete(submodule);
        } else {
          rebasingSubmodules.add(submodule);
        }
        saveState();
        postMessage('setRebaseStatus', { submodule, isRebasing: !isCurrentlyRebasing });
        updateRebaseUI();
      },

      pullChanges: (el) => postMessage('pullChanges', { submodule: el.dataset.submodule }),
      pushChanges: (el) => postMessage('pushChanges', { submodule: el.dataset.submodule }),
      createPR: (el) => postMessage('createPR', { submodule: el.dataset.submodule }),
      openSubmodule: (el) => postMessage('openSubmodule', { submodule: el.dataset.submodule }),
      stageSubmodule: (el) => postMessage('stageSubmodule', { submodule: el.dataset.submodule }),
      syncSelected: () => postMessage('syncVersions', { submodules: Array.from(selectedSubmodules) }),

      toggleBranches: (el) => {
        const submodule = el.dataset.submodule;
        const panelId = 'branches-' + submodule.replace(/[\\\\/.]/g, '-');
        const panel = document.getElementById(panelId);
        if (!panel) return;

        if (panel.style.display === 'none') {
          panel.style.display = 'block';
          panel.innerHTML = '<div class="branches-loading">Loading branches...</div>';
          postMessage('getBranches', { submodule });
        } else {
          panel.style.display = 'none';
        }
      },

      checkoutBranchInline: (el) => {
        const submodule = el.dataset.submodule;
        const branch = el.dataset.branch;
        if (submodule && branch) {
          postMessage('checkoutBranch', { submodule, branch });
        }
      },

      deleteBranchInline: (el) => {
        const submodule = el.dataset.submodule;
        const branch = el.dataset.branch;
        if (!submodule || !branch) return;

        const deleteRemote = confirm('Also delete the remote branch?');
        const confirmMsg = 'Delete branch "' + branch + '"' + (deleteRemote ? ' (local + remote)' : '') + '?';
        if (confirm(confirmMsg)) {
          postMessage('deleteBranch', { submodule, branch, deleteRemote });
        }
      }
    };

    // Event delegation - handle all clicks
    document.body.addEventListener('click', function(e) {
      let el = e.target;

      // Special handling for checkboxes - don't prevent default, just track state
      if (el.tagName === 'INPUT' && el.type === 'checkbox' && el.dataset.action === 'toggleSelection') {
        const path = el.dataset.submodule;
        if (path) {
          // Sync our state with checkbox state (checkbox already toggled)
          if (el.checked) {
            selectedSubmodules.add(path);
          } else {
            selectedSubmodules.delete(path);
          }
          const row = el.closest('.submodule-card');
          if (row) {
            row.classList.toggle('selected', el.checked);
          }
          saveState();
          updateSelectionUI();
        }
        return;
      }

      // Walk up the DOM tree to find element with data-action
      while (el && el !== document.body) {
        if (el.dataset && el.dataset.action) {
          const action = el.dataset.action;
          if (actions[action]) {
            e.preventDefault();
            actions[action](el);
          }
          return;
        }
        el = el.parentElement;
      }
    });

    // Handle search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        const query = (e.target.value || '').toLowerCase();
        document.querySelectorAll('.submodule-card').forEach(function(row) {
          const name = (row.dataset.name || '').toLowerCase();
          const path = (row.dataset.path || '').toLowerCase();
          const visible = name.includes(query) || path.includes(query);
          row.style.display = visible ? 'flex' : 'none';
        });
      });
    }

    function updateSelectionUI() {
      const bar = document.getElementById('selectionBar');
      const count = document.getElementById('selectedCount');

      if (selectedSubmodules.size > 0) {
        bar.classList.add('active');
        count.textContent = selectedSubmodules.size;
      } else {
        bar.classList.remove('active');
      }

      document.querySelectorAll('.submodule-card').forEach(row => {
        const checkbox = row.querySelector('.row-checkbox');
        if (checkbox) {
          checkbox.checked = selectedSubmodules.has(row.dataset.path);
          row.classList.toggle('selected', selectedSubmodules.has(row.dataset.path));
        }
      });
    }

    function updateRebaseUI() {
      document.querySelectorAll('.submodule-card').forEach(row => {
        const path = row.dataset.path;
        const rebaseIndicator = row.querySelector('.rebase-indicator');

        if (rebasingSubmodules.has(path)) {
          if (rebaseIndicator) rebaseIndicator.style.display = 'inline-block';
        } else {
          if (rebaseIndicator) rebaseIndicator.style.display = 'none';
        }
      });
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      if (!message || !message.type) return;

      try {
        switch (message.type) {
          case 'branches': {
            const branchSelect = document.getElementById('branchSelect');
            const branches = (message.payload && message.payload.branches) || [];
            const branchSubmodule = message.payload && message.payload.submodule;

            // Update checkout modal if open - just list all branches
            if (branchSelect) {
              if (branches.length === 0) {
                branchSelect.innerHTML = '<option value="">No branches found</option>';
              } else {
                branchSelect.innerHTML = branches.map(b =>
                  \`<option value="\${b.name}">\${b.name}\${b.isCurrent ? ' (current)' : ''}\${b.isRemote ? ' (remote)' : ''}</option>\`
                ).join('');
              }
            }

            // Update inline branches panel if exists
            if (branchSubmodule) {
              const panelId = 'branches-' + branchSubmodule.replace(/[\\\\/.]/g, '-');
              const panel = document.getElementById(panelId);
              if (panel) {
                if (branches.length === 0) {
                  panel.innerHTML = '<div class="branches-loading">No branches found</div>';
                } else {
                  panel.innerHTML = '<div class="branches-list">' + branches.map(b =>
                    \`<span class="branch-item \${b.isCurrent ? 'current' : ''} \${b.isRemote ? 'remote' : ''}">
                      <span class="branch-icon" data-action="checkoutBranchInline" data-submodule="\${branchSubmodule}" data-branch="\${b.name}" title="Checkout \${b.name}">\${b.isCurrent ? '✓' : (b.isRemote ? '☁' : '⎇')}</span>
                      <span data-action="checkoutBranchInline" data-submodule="\${branchSubmodule}" data-branch="\${b.name}" title="Checkout \${b.name}">\${b.name}\${b.isRemote ? ' (remote)' : ''}</span>
                      \${!b.isCurrent ? \`<span class="branch-delete" data-action="deleteBranchInline" data-submodule="\${branchSubmodule}" data-branch="\${b.name}" title="Delete \${b.name}">✕</span>\` : ''}
                    </span>\`
                  ).join('') + '</div>';
                }
              }
            }
            break;
          }

          case 'commits': {
            const commitSelect = document.getElementById('commitSelect');
            const commits = (message.payload && message.payload.commits) || [];
            if (commitSelect) {
              commitSelect.innerHTML = '<option value="">Select a commit...</option>' +
                commits.map(c =>
                  \`<option value="\${c.hash}">\${c.shortHash} - \${c.message.substring(0, 50)}</option>\`
                ).join('');
            }
            break;
          }

          case 'recordedCommit': {
            const recordedInfo = document.getElementById('recordedCommitInfo');
            if (recordedInfo && message.payload) {
              const { recordedCommit, currentCommit, isMatching } = message.payload;
              const statusClass = isMatching ? 'success' : 'warning';
              const statusIcon = isMatching ? '✓' : '⚠';
              recordedInfo.innerHTML = \`
                <div class="recorded-commit-status \${statusClass}">
                  <span>\${statusIcon} Parent expects: <code>\${recordedCommit ? recordedCommit.substring(0, 8) : 'N/A'}</code></span>
                  <span>Current: <code>\${currentCommit ? currentCommit.substring(0, 8) : 'N/A'}</code></span>
                  \${!isMatching ? '<span class="mismatch-warning">Commits do not match!</span>' : ''}
                </div>
              \`;
            }
            break;
          }

          case 'updateSubmodules': {
            submoduleData = message.payload.submodules;
            saveState();
            updateSubmoduleRows(submoduleData);
            break;
          }

          case 'rebaseStatusUpdated': {
            updateRebaseUI();
            break;
          }

          case 'branchCreationResults': {
            const createdBranch = message.payload.branchName;
            const results = message.payload.results;
            showReviewModal(createdBranch, results);
            break;
          }

          case 'pushResults': {
            const pushResults = message.payload.results || [];
            const pushSuccessCount = pushResults.filter(r => r.success).length;
            if (pushSuccessCount === pushResults.length) {
              alert('Successfully pushed branch to ' + pushSuccessCount + ' remote(s)');
            } else {
              alert('Pushed to ' + pushSuccessCount + '/' + pushResults.length + ' remotes. Some pushes failed.');
            }
            break;
          }

          case 'baseBranchesForCreate': {
            const baseBranchSelect = document.getElementById('baseBranch');
            const availableBranches = (message.payload && message.payload.branches) || [];
            if (baseBranchSelect) {
              if (availableBranches.length === 0) {
                baseBranchSelect.innerHTML = '<option value="main">main</option>';
              } else {
                baseBranchSelect.innerHTML = availableBranches.map(b =>
                  \`<option value="\${b.name}">\${b.name}\${b.isCurrent ? ' (current)' : ''}\${b.isRemote ? ' (remote)' : ''}</option>\`
                ).join('');
              }
              updatePrefixOptions();
            }
            break;
          }
        }
      } catch (err) {
        console.error('Error handling message:', message.type, err);
      }
    });

    function updateSubmoduleRows(submodules) {
      submodules.forEach(s => {
        const row = document.querySelector(\`.submodule-card[data-path="\${s.path}"]\`);
        if (row) {
          const statusEl = row.querySelector('.row-status');
          if (statusEl) {
            statusEl.className = 'row-status status-' + s.status;
            statusEl.innerHTML = getStatusIcon(s.status) + ' ' + s.status.toUpperCase();
          }

          const branchEl = row.querySelector('.branch');
          if (branchEl) branchEl.textContent = s.currentBranch || '(detached)';

          const commitEl = row.querySelector('.commit');
          if (commitEl) commitEl.textContent = s.currentCommit || 'N/A';

          const syncEl = row.querySelector('.row-sync');
          if (syncEl) {
            let syncHtml = '';
            if (s.ahead > 0) syncHtml += \`<span class="ahead">↑\${s.ahead}</span>\`;
            if (s.behind > 0) syncHtml += \`<span class="behind">↓\${s.behind}</span>\`;
            syncEl.innerHTML = syncHtml;
          }
        }
      });
    }

    function getStatusIcon(status) {
      const icons = {
        'clean': '✓',
        'modified': '●',
        'uninitialized': '○',
        'detached': '◎',
        'conflict': '⚠',
        'unknown': '?'
      };
      return icons[status] || '?';
    }

    // Branch naming tool functions
    // Branch hierarchy rules:
    // - main -> bugfix/, release/, dev/
    // - dev -> feature/
    // - feature -> task/
    const branchHierarchy = {
      'main': { prefixes: ['bugfix', 'release', 'dev'], hint: 'From main: Create bugfix, release, or dev branches' },
      'master': { prefixes: ['bugfix', 'release', 'dev'], hint: 'From master: Create bugfix, release, or dev branches' },
      'dev': { prefixes: ['feature'], hint: 'From dev: Create feature branches' },
      'feature': { prefixes: ['task'], hint: 'From feature: Create task branches' }
    };

    // Store created branch info for review
    let pendingBranchInfo = null;

    function toKebabCase(str) {
      return str
        .toLowerCase()
        .replace(/[^a-z0-9\\s-]/g, '') // Remove special characters except spaces and hyphens
        .replace(/\\s+/g, '-')          // Replace spaces with hyphens
        .replace(/-+/g, '-')            // Replace multiple hyphens with single hyphen
        .replace(/^-|-$/g, '');         // Remove leading/trailing hyphens
    }

    function getBaseBranchType(baseBranch) {
      const lower = baseBranch.toLowerCase();
      if (lower === 'main' || lower === 'master') return 'main';
      if (lower === 'dev' || lower.startsWith('dev/') || lower.startsWith('dev-')) return 'dev';
      if (lower.startsWith('feature/') || lower.startsWith('feature-')) return 'feature';
      return 'main'; // Default to main rules
    }

    function updatePrefixOptions() {
      const baseBranch = document.getElementById('baseBranch').value.trim() || 'main';
      const branchType = getBaseBranchType(baseBranch);
      const rules = branchHierarchy[branchType] || branchHierarchy['main'];

      const prefixSelect = document.getElementById('branchPrefix');
      const currentValue = prefixSelect.value;

      // Update options based on rules
      prefixSelect.innerHTML = rules.prefixes.map(p => {
        return \`<option value="\${p}">\${p}/</option>\`;
      }).join('');

      // Try to keep current selection if valid, otherwise use first option
      if (rules.prefixes.includes(currentValue)) {
        prefixSelect.value = currentValue;
      } else {
        prefixSelect.value = rules.prefixes[0];
      }

      // Update hints
      document.getElementById('baseBranchHint').textContent = 'Type: ' + branchType;
      document.getElementById('prefixRuleHint').textContent = rules.hint;

      toggleBranchFormFields();
    }

    function updateBranchPreview() {
      const prefix = document.getElementById('branchPrefix').value;
      const preview = document.getElementById('branchPreview');
      const branchNameInput = document.getElementById('branchName');
      let branchName = '';

      if (prefix === 'release') {
        const productName = document.getElementById('productName').value.trim();
        const version = document.getElementById('releaseVersion').value.trim();
        if (productName && version) {
          branchName = 'release/' + productName + '_' + version;
        } else if (productName) {
          branchName = 'release/' + productName + '_';
        } else {
          branchName = 'release/ProductName_x.x.x';
        }
      } else if (prefix === 'dev') {
        const devName = document.getElementById('devBranchName').value.trim();
        const kebabDevName = toKebabCase(devName);
        if (kebabDevName) {
          branchName = 'dev/' + kebabDevName;
        } else {
          branchName = 'dev/your-branch-name';
        }
      } else {
        const ticketId = document.getElementById('ticketId').value.trim();
        const taskTitle = document.getElementById('taskTitle').value.trim();
        const kebabTitle = toKebabCase(taskTitle);

        const prefixStr = prefix + '/';
        if (ticketId && kebabTitle) {
          branchName = prefixStr + ticketId + '-' + kebabTitle;
        } else if (ticketId) {
          branchName = prefixStr + ticketId + '-';
        } else if (kebabTitle) {
          branchName = prefixStr + kebabTitle;
        } else {
          branchName = prefixStr + 'your-branch-name';
        }
      }

      preview.textContent = branchName;
      preview.style.color = (branchName.includes('your-branch-name') || branchName.endsWith('_') || branchName.endsWith('-') || branchName.endsWith('x.x.x'))
        ? 'var(--text-secondary)'
        : 'var(--text-primary)';
      branchNameInput.value = branchName;
    }

    function toggleBranchFormFields() {
      const prefix = document.getElementById('branchPrefix').value;
      const ticketIdGroup = document.getElementById('ticketIdGroup');
      const taskTitleGroup = document.getElementById('taskTitleGroup');
      const releaseInfoGroup = document.getElementById('releaseInfoGroup');
      const devBranchGroup = document.getElementById('devBranchGroup');

      // Hide all first
      ticketIdGroup.style.display = 'none';
      taskTitleGroup.style.display = 'none';
      releaseInfoGroup.style.display = 'none';
      devBranchGroup.style.display = 'none';

      if (prefix === 'release') {
        releaseInfoGroup.style.display = 'block';
      } else if (prefix === 'dev') {
        devBranchGroup.style.display = 'block';
      } else {
        // feature, task, bugfix
        ticketIdGroup.style.display = 'block';
        taskTitleGroup.style.display = 'block';
      }
      updateBranchPreview();
    }

    function showReviewModal(branchName, results) {
      const resultsDiv = document.getElementById('branchCreationResults');
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      let html = '<div style="margin-bottom: 12px;">';
      if (failCount === 0) {
        html += \`<span style="color: var(--success);">✓ Branch created successfully in \${successCount} submodule(s)</span>\`;
      } else {
        html += \`<span style="color: var(--warning);">⚠ Created in \${successCount}, failed in \${failCount} submodule(s)</span>\`;
      }
      html += '</div>';

      // Show per-submodule results
      html += '<div style="max-height: 150px; overflow-y: auto; font-size: 12px;">';
      results.forEach(r => {
        const icon = r.success ? '✓' : '✗';
        const color = r.success ? 'var(--success)' : 'var(--error)';
        html += \`<div style="padding: 4px 0; color: \${color};">\${icon} \${r.submodule}: \${r.message}</div>\`;
      });
      html += '</div>';

      resultsDiv.innerHTML = html;
      document.getElementById('reviewBranchName').textContent = branchName;
      document.getElementById('reviewBranchModal').classList.add('active');
    }

    // Event listeners for branch naming inputs
    document.getElementById('baseBranch').addEventListener('change', updatePrefixOptions);
    document.getElementById('branchPrefix').addEventListener('change', toggleBranchFormFields);
    document.getElementById('ticketId').addEventListener('input', updateBranchPreview);
    document.getElementById('taskTitle').addEventListener('input', updateBranchPreview);
    document.getElementById('productName').addEventListener('input', updateBranchPreview);
    document.getElementById('releaseVersion').addEventListener('input', updateBranchPreview);
    document.getElementById('devBranchName').addEventListener('input', updateBranchPreview);

    // Initialize UI on load
    updateSelectionUI();
    updateRebaseUI();
  `;
}
