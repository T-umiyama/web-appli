'use strict';
const { runCommand } = require('../../scripts/verify-agent-completion.cjs');
module.exports = { runCommand: () => runCommand('codex') };
if (require.main === module) module.exports.runCommand();
