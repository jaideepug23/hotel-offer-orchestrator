import { bundleWorkflowCode } from '@temporalio/worker';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
async function main() {
  const bundle = await bundleWorkflowCode({ workflowsPath: require.resolve('./workflows') });
  await writeFile(path.join(__dirname, 'workflow-bundle.js'), bundle.code);
}
main().catch(error => { console.error(error); process.exit(1); });
