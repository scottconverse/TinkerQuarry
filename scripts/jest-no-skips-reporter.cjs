class NoSkipsReporter {
  onRunComplete(_contexts, results) {
    if (results.numPendingTests > 0 || results.numPendingTestSuites > 0) {
      this._error = new Error(
        `No skipped tests allowed: ${results.numPendingTests} skipped tests, ` +
          `${results.numPendingTestSuites} skipped suites.`
      );
    }
  }

  getLastError() {
    return this._error;
  }
}

module.exports = NoSkipsReporter;
