class CleanReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options;
  }

  onRunStart(results, options) {
    console.log('Running tests...\n');
  }

  onTestResult(test, testResult, aggregatedResult) {
    const { numFailingTests, numPassingTests, testFilePath } = testResult;
    const testName = testFilePath.split('/').pop();
    
    if (numFailingTests > 0) {
      console.log(`❌ ${testName}: ${numFailingTests} failed, ${numPassingTests} passed`);
      
      // Show failure details
      testResult.testResults
        .filter(t => t.status === 'failed')
        .forEach(t => {
          console.log(`   └─ ${t.fullName}`);
          if (t.failureMessages.length > 0) {
            console.log(`      ${t.failureMessages[0].split('\n')[0]}`);
          }
        });
    } else {
      console.log(`✅ ${testName}: ${numPassingTests} passed`);
    }
  }

  onRunComplete(contexts, results) {
    const { numTotalTestSuites, numPassedTestSuites, numFailedTestSuites, 
            numTotalTests, numPassedTests, numFailedTests } = results;
    
    console.log('\n' + '─'.repeat(50));
    console.log(`Test Suites: ${numPassedTestSuites} passed, ${numTotalTestSuites} total`);
    console.log(`Tests:       ${numPassedTests} passed, ${numTotalTests} total`);
    console.log(`Time:        ${((Date.now() - results.startTime) / 1000).toFixed(2)}s`);
    
    if (numFailedTests === 0) {
      console.log('\n✨ All tests passed!');
    } else {
      console.log(`\n❌ ${numFailedTests} test(s) failed`);
    }
  }
}

module.exports = CleanReporter;