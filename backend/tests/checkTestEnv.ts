export function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Automated tests refuse to run when NODE_ENV=production');
  }
}

// Enforce guard when invoked directly as pre-test step in test scripts
if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: Automated tests refuse to run when NODE_ENV=production');
  process.exit(1);
}
